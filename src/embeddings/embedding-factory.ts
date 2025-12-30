/**
 * Embedding 模型工厂
 * 支持 Gemini、OpenAI Embeddings
 */

import { Embeddings } from '@langchain/core/embeddings';
import { OpenAIEmbeddings } from '@langchain/openai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { settings } from '../config/index.js';

export type EmbeddingProvider = 'gemini' | 'openai';

export class EmbeddingFactory {
  /**
   * 创建 Embedding 模型实例
   */
  static create(provider?: EmbeddingProvider): Embeddings {
    // 默认使用 Gemini，如果没有 Gemini Key 则尝试 OpenAI
    const selectedProvider = provider || EmbeddingFactory.detectProvider();

    if (selectedProvider === 'gemini') {
      return EmbeddingFactory.createGemini();
    } else {
      return EmbeddingFactory.createOpenAI();
    }
  }

  /**
   * 自动检测可用的 Provider
   */
  private static detectProvider(): EmbeddingProvider {
    if (settings.gemini.apiKey) {
      return 'gemini';
    }
    if (settings.openai.apiKey) {
      return 'openai';
    }
    throw new Error('请配置 GEMINI_API_KEY 或 OPENAI_API_KEY');
  }

  /**
   * 创建 Gemini Embedding 模型
   */
  static createGemini(apiKey?: string, model?: string): GoogleGenerativeAIEmbeddings {
    const key = apiKey || settings.gemini.apiKey;
    const modelName = model || settings.gemini.embeddingModel;

    if (!key) {
      throw new Error('缺少 GEMINI_API_KEY 配置');
    }

    console.log(`🔄 使用 Gemini Embedding: ${modelName}`);

    return new GoogleGenerativeAIEmbeddings({
      apiKey: key,
      modelName: modelName,
    });
  }

  /**
   * 创建 OpenAI Embedding 模型
   */
  static createOpenAI(apiKey?: string, model?: string): OpenAIEmbeddings {
    const key = apiKey || settings.openai.apiKey;
    const modelName = model || settings.openai.embeddingModel;

    if (!key) {
      throw new Error('缺少 OPENAI_API_KEY 配置');
    }

    console.log(`🔄 使用 OpenAI Embedding: ${modelName}`);

    return new OpenAIEmbeddings({
      openAIApiKey: key,
      modelName: modelName,
    });
  }
}

/**
 * 获取 Embedding 模型的便捷函数
 */
export function getEmbeddings(provider?: EmbeddingProvider): Embeddings {
  return EmbeddingFactory.create(provider);
}
