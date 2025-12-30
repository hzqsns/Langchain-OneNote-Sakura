/**
 * 问答链模块
 * 基于检索的问答系统
 */

import { Document } from 'langchain/document';
import { PromptTemplate } from '@langchain/core/prompts';
import { RetrievalQAChain } from 'langchain/chains';
import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { settings } from '../config/index.js';
import { HNSWLibStore } from '../vectorstore/index.js';

// 默认提示词模板
const DEFAULT_QA_TEMPLATE = `你是一个基于 OneNote 笔记的智能助手。请根据以下检索到的笔记内容回答用户的问题。

如果检索到的内容无法回答问题，请诚实地说"根据我的笔记，我无法找到相关信息"。

检索到的笔记内容：
{context}

用户问题：{question}

请用中文回答：`;

export interface QAResult {
  question: string;
  answer: string;
  sources?: Array<{
    content: string;
    metadata: Record<string, any>;
  }>;
}

export class QAChain {
  private vectorstore: HNSWLibStore;
  private llm: BaseChatModel;
  private prompt: PromptTemplate;
  private chain: RetrievalQAChain | null = null;

  constructor(
    vectorstore: HNSWLibStore,
    llmType: 'openai' | 'ollama' = 'openai',
    modelName?: string,
    temperature: number = 0,
    promptTemplate?: string
  ) {
    this.vectorstore = vectorstore;
    this.llm = this.createLLM(llmType, modelName, temperature);
    this.prompt = PromptTemplate.fromTemplate(promptTemplate || DEFAULT_QA_TEMPLATE);
  }

  /**
   * 创建 LLM 实例
   */
  private createLLM(
    llmType: 'openai' | 'ollama',
    modelName?: string,
    temperature: number = 0
  ): BaseChatModel {
    if (llmType === 'openai') {
      const apiKey = settings.openai.apiKey;
      if (!apiKey) {
        throw new Error('缺少 OPENAI_API_KEY 配置');
      }

      return new ChatOpenAI({
        openAIApiKey: apiKey,
        modelName: modelName || settings.openai.modelName,
        temperature,
      });
    }

    if (llmType === 'ollama') {
      // Ollama 支持需要额外配置
      // 这里先抛出错误，后续可以添加 Ollama 支持
      throw new Error(
        'Ollama 支持即将推出。目前请使用 OpenAI。\n' +
        '如需使用 Ollama，可以安装 @langchain/community 并配置 ChatOllama'
      );
    }

    throw new Error(`不支持的 LLM 类型: ${llmType}`);
  }

  /**
   * 初始化问答链
   */
  async initialize(): Promise<void> {
    const retriever = this.vectorstore.asRetriever();

    this.chain = RetrievalQAChain.fromLLM(this.llm, retriever, {
      returnSourceDocuments: true,
      inputKey: 'question',
    });
  }

  /**
   * 确保链已初始化
   */
  private async ensureInitialized(): Promise<RetrievalQAChain> {
    if (!this.chain) {
      await this.initialize();
    }
    return this.chain!;
  }

  /**
   * 提问
   */
  async ask(question: string, returnSources: boolean = false): Promise<QAResult> {
    const chain = await this.ensureInitialized();

    const result = await chain.invoke({ question });

    const response: QAResult = {
      question,
      answer: result.text || '',
    };

    if (returnSources && result.sourceDocuments) {
      response.sources = (result.sourceDocuments as Document[]).map((doc) => ({
        content:
          doc.pageContent.length > 200
            ? doc.pageContent.slice(0, 200) + '...'
            : doc.pageContent,
        metadata: doc.metadata,
      }));
    }

    return response;
  }

  /**
   * 简单问答接口
   */
  async chat(question: string): Promise<string> {
    const result = await this.ask(question);
    return result.answer;
  }

  /**
   * 仅检索相似文档（不生成答案）
   */
  async searchSimilar(query: string, k: number = 5): Promise<Document[]> {
    return this.vectorstore.search(query, k);
  }
}

/**
 * 获取问答链的便捷函数
 */
export async function getQAChain(
  vectorstore: HNSWLibStore,
  llmType: 'openai' | 'ollama' = 'openai'
): Promise<QAChain> {
  const chain = new QAChain(vectorstore, llmType);
  await chain.initialize();
  return chain;
}

