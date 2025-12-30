/**
 * Embedding 模型工厂
 * 支持 OpenAI Embeddings 和本地模型
 */

import { Embeddings } from '@langchain/core/embeddings';
import { OpenAIEmbeddings } from '@langchain/openai';
import { settings } from '../config/index.js';

export class EmbeddingFactory {
  /**
   * 创建 Embedding 模型实例
   */
  static create(useLocal?: boolean): Embeddings {
    const shouldUseLocal = useLocal ?? settings.app.useLocalModel;

    if (shouldUseLocal) {
      return EmbeddingFactory.createLocal();
    } else {
      return EmbeddingFactory.createOpenAI();
    }
  }

  /**
   * 创建 OpenAI Embedding 模型
   */
  static createOpenAI(apiKey?: string, model?: string): OpenAIEmbeddings {
    const key = apiKey || settings.openai.apiKey;
    const modelName = model || settings.openai.embeddingModel;

    if (!key) {
      throw new Error(
        '缺少 OpenAI API Key，请设置环境变量 OPENAI_API_KEY 或在配置中指定'
      );
    }

    return new OpenAIEmbeddings({
      openAIApiKey: key,
      modelName: modelName,
    });
  }

  /**
   * 创建本地 Embedding 模型
   * 注意：LangChain.js 的本地 Embedding 支持有限，这里提供一个占位实现
   * 实际使用时可以接入 HuggingFace Transformers.js 或其他本地方案
   */
  static createLocal(): Embeddings {
    // LangChain.js 目前对本地 Embedding 的支持不如 Python 版
    // 这里先使用 OpenAI 作为 fallback，你可以后续替换为其他方案
    console.warn(
      '⚠️ LangChain.js 的本地 Embedding 支持有限，将使用 OpenAI Embedding'
    );
    console.warn('   如需真正的本地 Embedding，可以考虑：');
    console.warn('   1. 使用 @xenova/transformers 库');
    console.warn('   2. 调用本地 Ollama 的 Embedding API');
    
    return EmbeddingFactory.createOpenAI();
  }
}

/**
 * 获取 Embedding 模型的便捷函数
 */
export function getEmbeddings(useLocal?: boolean): Embeddings {
  return EmbeddingFactory.create(useLocal);
}

