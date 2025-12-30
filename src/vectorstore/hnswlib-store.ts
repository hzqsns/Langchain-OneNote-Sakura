/**
 * HNSWLib 向量存储模块
 * 纯本地运行，无需启动独立服务
 */

import { Document } from 'langchain/document';
import { Embeddings } from '@langchain/core/embeddings';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { VectorStoreRetriever } from '@langchain/core/vectorstores';
import * as fs from 'fs';
import * as path from 'path';
import { settings } from '../config/index.js';
import { getEmbeddings } from '../embeddings/index.js';

export interface CollectionStats {
  collectionName: string;
  documentCount: number;
  persistDirectory: string;
}

export class HNSWLibStore {
  private vectorstore: HNSWLib | null = null;
  private embeddings: Embeddings;
  private persistDirectory: string;
  private collectionName: string;

  constructor(
    persistDirectory?: string,
    collectionName?: string,
    embeddings?: Embeddings
  ) {
    this.persistDirectory = persistDirectory || settings.vectorstore.persistDirectory;
    this.collectionName = collectionName || settings.vectorstore.collectionName;
    this.embeddings = embeddings || getEmbeddings();

    // 确保目录存在
    if (!fs.existsSync(this.persistDirectory)) {
      fs.mkdirSync(this.persistDirectory, { recursive: true });
    }
  }

  /**
   * 获取存储路径
   */
  private getStorePath(): string {
    return path.join(this.persistDirectory, this.collectionName);
  }

  /**
   * 检查是否存在已保存的向量库
   */
  private storeExists(): boolean {
    const storePath = this.getStorePath();
    return fs.existsSync(storePath) && fs.existsSync(path.join(storePath, 'args.json'));
  }

  /**
   * 初始化或加载向量库
   */
  async initialize(): Promise<void> {
    const storePath = this.getStorePath();

    if (this.storeExists()) {
      try {
        // 加载已有的向量库
        this.vectorstore = await HNSWLib.load(storePath, this.embeddings);
        console.log(`📚 已加载向量库: ${this.collectionName}`);
      } catch (error) {
        console.warn(`⚠️ 加载向量库失败，将创建新的: ${error}`);
        this.vectorstore = null;
      }
    } else {
      console.log(`📚 向量库不存在，将在添加文档时创建: ${this.collectionName}`);
    }
  }

  /**
   * 保存向量库到磁盘
   */
  private async save(): Promise<void> {
    if (this.vectorstore) {
      const storePath = this.getStorePath();
      await this.vectorstore.save(storePath);
      console.log(`💾 向量库已保存到: ${storePath}`);
    }
  }

  /**
   * 添加文档到向量库
   */
  async addDocuments(documents: Document[], batchSize: number = 100): Promise<void> {
    if (!documents.length) {
      console.log('⚠️ 没有文档需要添加');
      return;
    }

    console.log(`🔄 正在向量化并存储 ${documents.length} 个文档...`);

    if (!this.vectorstore) {
      // 首次添加，使用 fromDocuments 创建
      console.log('   创建新的向量库...');
      this.vectorstore = await HNSWLib.fromDocuments(documents, this.embeddings);
    } else {
      // 已有向量库，分批添加
      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        await this.vectorstore.addDocuments(batch);
        console.log(`   已处理: ${Math.min(i + batchSize, documents.length)}/${documents.length}`);
      }
    }

    // 保存到磁盘
    await this.save();

    console.log(`✅ 成功添加 ${documents.length} 个文档到向量库`);
  }

  /**
   * 相似度搜索
   */
  async search(query: string, k?: number): Promise<Document[]> {
    if (!this.vectorstore) {
      throw new Error('向量库未初始化，请先调用 initialize() 或 addDocuments()');
    }

    const numResults = k || settings.app.retrievalK;
    const results = await this.vectorstore.similaritySearch(query, numResults);
    return results;
  }

  /**
   * 带相似度分数的搜索
   */
  async searchWithScores(
    query: string,
    k?: number
  ): Promise<[Document, number][]> {
    if (!this.vectorstore) {
      throw new Error('向量库未初始化');
    }

    const numResults = k || settings.app.retrievalK;
    const results = await this.vectorstore.similaritySearchWithScore(query, numResults);
    return results;
  }

  /**
   * 转换为 LangChain Retriever
   */
  asRetriever(k?: number): VectorStoreRetriever<HNSWLib> {
    if (!this.vectorstore) {
      throw new Error('向量库未初始化');
    }

    return this.vectorstore.asRetriever({
      k: k || settings.app.retrievalK,
    });
  }

  /**
   * 获取集合统计信息
   */
  getCollectionStats(): CollectionStats {
    const storePath = this.getStorePath();
    let documentCount = 0;

    // 尝试读取文档数量
    if (this.vectorstore) {
      // HNSWLib 没有直接获取数量的方法，这里用估算
      documentCount = -1; // 表示未知
    }

    return {
      collectionName: this.collectionName,
      documentCount,
      persistDirectory: this.persistDirectory,
    };
  }

  /**
   * 删除向量库（删除本地文件）
   */
  deleteCollection(): void {
    const storePath = this.getStorePath();
    if (fs.existsSync(storePath)) {
      fs.rmSync(storePath, { recursive: true, force: true });
      console.log(`🗑️ 已删除向量库: ${this.collectionName}`);
    }
    this.vectorstore = null;
  }

  /**
   * 获取底层 HNSWLib 实例
   */
  getVectorStore(): HNSWLib | null {
    return this.vectorstore;
  }

  /**
   * 检查向量库是否就绪
   */
  isReady(): boolean {
    return this.vectorstore !== null;
  }
}

/**
 * 获取向量存储的便捷函数
 */
export async function getVectorStore(
  persistDirectory?: string,
  collectionName?: string
): Promise<HNSWLibStore> {
  const store = new HNSWLibStore(persistDirectory, collectionName);
  await store.initialize();
  return store;
}

