/**
 * LanceDB 向量存储模块
 * 纯本地运行，无需启动独立服务，预编译二进制文件
 */

import { Document } from 'langchain/document';
import { Embeddings } from '@langchain/core/embeddings';
import * as lancedb from '@lancedb/lancedb';
import * as fs from 'fs';
import * as path from 'path';
import { settings } from '../config/index.js';
import { getEmbeddings } from '../embeddings/index.js';

export interface CollectionStats {
  collectionName: string;
  documentCount: number;
  persistDirectory: string;
}

export interface VectorRecord {
  id: string;
  text: string;
  vector: number[];
  metadata: Record<string, any>;
}

export class LanceDBStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private embeddings: Embeddings;
  private persistDirectory: string;
  private tableName: string;

  constructor(
    persistDirectory?: string,
    tableName?: string,
    embeddings?: Embeddings
  ) {
    this.persistDirectory = persistDirectory || settings.vectorstore.persistDirectory;
    this.tableName = tableName || settings.vectorstore.collectionName;
    this.embeddings = embeddings || getEmbeddings();

    // 确保目录存在
    if (!fs.existsSync(this.persistDirectory)) {
      fs.mkdirSync(this.persistDirectory, { recursive: true });
    }
  }

  /**
   * 初始化数据库连接
   */
  async initialize(): Promise<void> {
    // 连接到 LanceDB（本地目录）
    this.db = await lancedb.connect(this.persistDirectory);
    
    // 检查表是否存在
    const tableNames = await this.db.tableNames();
    
    if (tableNames.includes(this.tableName)) {
      this.table = await this.db.openTable(this.tableName);
      const count = await this.table.countRows();
      console.log(`📚 已加载向量库: ${this.tableName} (${count} 条记录)`);
    } else {
      console.log(`📚 向量库不存在，将在添加文档时创建: ${this.tableName}`);
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 添加文档到向量库
   */
  async addDocuments(documents: Document[], batchSize: number = 50): Promise<void> {
    if (!documents.length) {
      console.log('⚠️ 没有文档需要添加');
      return;
    }

    if (!this.db) {
      await this.initialize();
    }

    console.log(`🔄 正在向量化并存储 ${documents.length} 个文档...`);

    const records: VectorRecord[] = [];

    // 分批处理向量化
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const texts = batch.map((doc) => doc.pageContent);
      
      // 批量生成向量
      const vectors = await this.embeddings.embedDocuments(texts);

      // 构建记录
      for (let j = 0; j < batch.length; j++) {
        records.push({
          id: this.generateId(),
          text: batch[j].pageContent,
          vector: vectors[j],
          metadata: batch[j].metadata || {},
        });
      }

      console.log(`   已向量化: ${Math.min(i + batchSize, documents.length)}/${documents.length}`);
    }

    // 写入 LanceDB
    if (!this.table) {
      // 首次创建表
      this.table = await this.db!.createTable(this.tableName, records);
      console.log(`   创建新表: ${this.tableName}`);
    } else {
      // 追加到已有表
      await this.table.add(records);
    }

    console.log(`✅ 成功添加 ${documents.length} 个文档到向量库`);
  }

  /**
   * 相似度搜索
   */
  async search(query: string, k?: number): Promise<Document[]> {
    if (!this.table) {
      throw new Error('向量库未初始化或为空，请先添加文档');
    }

    const numResults = k || settings.app.retrievalK;

    // 生成查询向量
    const queryVector = await this.embeddings.embedQuery(query);

    // 执行向量搜索
    const results = await this.table
      .vectorSearch(queryVector)
      .limit(numResults)
      .toArray();

    // 转换为 Document
    return results.map((row: any) => new Document({
      pageContent: row.text,
      metadata: typeof row.metadata === 'string' 
        ? JSON.parse(row.metadata) 
        : row.metadata,
    }));
  }

  /**
   * 带相似度分数的搜索
   */
  async searchWithScores(
    query: string,
    k?: number
  ): Promise<[Document, number][]> {
    if (!this.table) {
      throw new Error('向量库未初始化或为空');
    }

    const numResults = k || settings.app.retrievalK;
    const queryVector = await this.embeddings.embedQuery(query);

    const results = await this.table
      .vectorSearch(queryVector)
      .limit(numResults)
      .toArray();

    return results.map((row: any) => [
      new Document({
        pageContent: row.text,
        metadata: typeof row.metadata === 'string' 
          ? JSON.parse(row.metadata) 
          : row.metadata,
      }),
      row._distance || 0,
    ]);
  }

  /**
   * 转换为 LangChain 兼容的 Retriever
   */
  asRetriever(k?: number) {
    const store = this;
    const numResults = k || settings.app.retrievalK;

    return {
      async getRelevantDocuments(query: string): Promise<Document[]> {
        return store.search(query, numResults);
      },
      // LangChain Retriever 接口兼容
      async invoke(query: string): Promise<Document[]> {
        return store.search(query, numResults);
      },
    };
  }

  /**
   * 获取集合统计信息
   */
  async getCollectionStats(): Promise<CollectionStats> {
    let documentCount = 0;

    if (this.table) {
      documentCount = await this.table.countRows();
    }

    return {
      collectionName: this.tableName,
      documentCount,
      persistDirectory: this.persistDirectory,
    };
  }

  /**
   * 删除向量库
   */
  async deleteCollection(): Promise<void> {
    if (this.db) {
      await this.db.dropTable(this.tableName);
      this.table = null;
      console.log(`🗑️ 已删除向量库: ${this.tableName}`);
    }
  }

  /**
   * 检查向量库是否就绪
   */
  isReady(): boolean {
    return this.table !== null;
  }
}

/**
 * 获取向量存储的便捷函数
 */
export async function getVectorStore(
  persistDirectory?: string,
  tableName?: string
): Promise<LanceDBStore> {
  const store = new LanceDBStore(persistDirectory, tableName);
  await store.initialize();
  return store;
}

