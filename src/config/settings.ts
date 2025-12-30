/**
 * 配置管理模块
 * 所有配置项都可以通过环境变量覆盖
 */

import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

export interface AzureConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  authority: string;
  graphEndpoint: string;
  scopes: string[];
}

export interface OpenAIConfig {
  apiKey: string;
  apiBase: string;
  modelName: string;
  embeddingModel: string;
}

export interface VectorStoreConfig {
  persistDirectory: string;
  collectionName: string;
}

export interface AppConfig {
  logLevel: string;
  chunkSize: number;
  chunkOverlap: number;
  retrievalK: number;
  useLocalModel: boolean;
}

export interface Settings {
  azure: AzureConfig;
  openai: OpenAIConfig;
  vectorstore: VectorStoreConfig;
  app: AppConfig;
}

const settings: Settings = {
  azure: {
    clientId: process.env.AZURE_CLIENT_ID || '',
    clientSecret: process.env.AZURE_CLIENT_SECRET || '',
    tenantId: process.env.AZURE_TENANT_ID || 'common',
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || 'common'}`,
    graphEndpoint: 'https://graph.microsoft.com/v1.0',
    scopes: [
      'https://graph.microsoft.com/Notes.Read',
      'https://graph.microsoft.com/Notes.Read.All',
      'https://graph.microsoft.com/User.Read',
    ],
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    apiBase: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
    modelName: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002',
  },

  vectorstore: {
    persistDirectory: process.env.CHROMA_PERSIST_DIRECTORY || './data/chroma_db',
    collectionName: process.env.CHROMA_COLLECTION_NAME || 'onenote_collection',
  },

  app: {
    logLevel: process.env.LOG_LEVEL || 'INFO',
    chunkSize: parseInt(process.env.CHUNK_SIZE || '1000', 10),
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '200', 10),
    retrievalK: parseInt(process.env.RETRIEVAL_K || '4', 10),
    useLocalModel: process.env.USE_LOCAL_MODEL === 'true',
  },
};

export default settings;

