/**
 * OneNote 文档加载器
 * 通过 Microsoft Graph API 获取 OneNote 笔记内容
 */

import * as cheerio from 'cheerio';
import { Document } from 'langchain/document';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { GraphAuthenticator, getGraphClient } from '../auth/index.js';
import { settings } from '../config/index.js';

const GRAPH_ENDPOINT = 'https://graph.microsoft.com/v1.0';

export interface OneNotePage {
  id: string;
  title: string;
  contentHtml: string;
  contentText: string;
  notebookName: string;
  sectionName: string;
  createdTime?: Date;
  lastModifiedTime?: Date;
  webUrl?: string;
}

export interface Notebook {
  id: string;
  displayName: string;
}

export interface Section {
  id: string;
  displayName: string;
}

export interface PageInfo {
  id: string;
  title: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  links?: {
    oneNoteWebUrl?: {
      href?: string;
    };
  };
}

export class OneNoteLoader {
  private auth: GraphAuthenticator;
  private textSplitter: RecursiveCharacterTextSplitter;

  constructor(
    authenticator?: GraphAuthenticator,
    chunkSize?: number,
    chunkOverlap?: number
  ) {
    this.auth = authenticator || getGraphClient();
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: chunkSize || settings.app.chunkSize,
      chunkOverlap: chunkOverlap || settings.app.chunkOverlap,
      separators: ['\n\n', '\n', '。', '！', '？', '.', '!', '?', ' ', ''],
    });
  }

  /**
   * 发送 Graph API 请求
   */
  private async request<T>(endpoint: string): Promise<T> {
    const headers = await this.auth.getHeaders();
    const url = `${GRAPH_ENDPOINT}${endpoint}`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new OneNoteAPIError(`API 请求失败: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * 获取所有笔记本列表
   */
  async listNotebooks(): Promise<Notebook[]> {
    const result = await this.request<{ value: Notebook[] }>('/me/onenote/notebooks');
    return result.value || [];
  }

  /**
   * 获取指定笔记本的所有分区
   */
  async listSections(notebookId: string): Promise<Section[]> {
    const result = await this.request<{ value: Section[] }>(
      `/me/onenote/notebooks/${notebookId}/sections`
    );
    return result.value || [];
  }

  /**
   * 获取指定分区的所有页面
   */
  async listPages(sectionId: string): Promise<PageInfo[]> {
    const result = await this.request<{ value: PageInfo[] }>(
      `/me/onenote/sections/${sectionId}/pages`
    );
    return result.value || [];
  }

  /**
   * 获取页面的 HTML 内容
   */
  async getPageContent(pageId: string): Promise<string> {
    const headers = await this.auth.getHeaders();
    const url = `${GRAPH_ENDPOINT}/me/onenote/pages/${pageId}/content`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new OneNoteAPIError(`获取页面内容失败: ${response.status}`);
    }

    return response.text();
  }

  /**
   * 将 HTML 内容转换为纯文本
   */
  private htmlToText(htmlContent: string): string {
    const $ = cheerio.load(htmlContent);

    // 移除脚本和样式
    $('script, style, meta, link').remove();

    // 获取文本
    let text = $('body').text() || $.root().text();

    // 清理多余空白
    text = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line)
      .join('\n');

    // 清理多余换行
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
  }

  /**
   * 解析日期时间字符串
   */
  private parseDateTime(dtStr?: string): Date | undefined {
    if (!dtStr) return undefined;
    try {
      return new Date(dtStr);
    } catch {
      return undefined;
    }
  }

  /**
   * 加载单个页面
   */
  async loadPage(
    pageInfo: PageInfo,
    notebookName: string,
    sectionName: string
  ): Promise<OneNotePage> {
    const htmlContent = await this.getPageContent(pageInfo.id);
    const textContent = this.htmlToText(htmlContent);

    return {
      id: pageInfo.id,
      title: pageInfo.title || '无标题',
      contentHtml: htmlContent,
      contentText: textContent,
      notebookName,
      sectionName,
      createdTime: this.parseDateTime(pageInfo.createdDateTime),
      lastModifiedTime: this.parseDateTime(pageInfo.lastModifiedDateTime),
      webUrl: pageInfo.links?.oneNoteWebUrl?.href,
    };
  }

  /**
   * 将 OneNotePage 转换为 LangChain Document
   */
  private pageToDocument(page: OneNotePage): Document {
    return new Document({
      pageContent: page.contentText,
      metadata: {
        source: 'onenote',
        pageId: page.id,
        title: page.title,
        notebook: page.notebookName,
        section: page.sectionName,
        createdTime: page.createdTime?.toISOString(),
        lastModifiedTime: page.lastModifiedTime?.toISOString(),
        webUrl: page.webUrl,
      },
    });
  }

  /**
   * 迭代获取 OneNote 页面
   */
  async *iterPages(
    notebookName?: string,
    sectionName?: string
  ): AsyncGenerator<OneNotePage> {
    const notebooks = await this.listNotebooks();

    for (const notebook of notebooks) {
      const nbName = notebook.displayName || '';

      // 筛选笔记本
      if (notebookName && nbName !== notebookName) {
        continue;
      }

      console.log(`📓 处理笔记本: ${nbName}`);

      const sections = await this.listSections(notebook.id);

      for (const section of sections) {
        const secName = section.displayName || '';

        // 筛选分区
        if (sectionName && secName !== sectionName) {
          continue;
        }

        console.log(`  📑 处理分区: ${secName}`);

        const pages = await this.listPages(section.id);

        for (const pageInfo of pages) {
          try {
            const page = await this.loadPage(pageInfo, nbName, secName);
            console.log(`    📄 加载页面: ${page.title}`);
            yield page;
          } catch (error) {
            console.error(
              `    ❌ 加载页面失败: ${pageInfo.title || 'unknown'} - ${error}`
            );
          }
        }
      }
    }
  }

  /**
   * 加载 OneNote 文档
   */
  async load(
    notebookName?: string,
    sectionName?: string,
    splitDocuments: boolean = true
  ): Promise<Document[]> {
    const documents: Document[] = [];

    for await (const page of this.iterPages(notebookName, sectionName)) {
      const doc = this.pageToDocument(page);

      if (splitDocuments) {
        // 分割文档
        const splits = await this.textSplitter.splitDocuments([doc]);
        documents.push(...splits);
      } else {
        documents.push(doc);
      }
    }

    console.log(`\n✅ 共加载 ${documents.length} 个文档片段`);
    return documents;
  }

  /**
   * 懒加载 OneNote 文档（节省内存）
   */
  async *loadLazy(
    notebookName?: string,
    sectionName?: string
  ): AsyncGenerator<Document> {
    for await (const page of this.iterPages(notebookName, sectionName)) {
      const doc = this.pageToDocument(page);
      const splits = await this.textSplitter.splitDocuments([doc]);
      for (const split of splits) {
        yield split;
      }
    }
  }
}

export class OneNoteAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OneNoteAPIError';
  }
}

