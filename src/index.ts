/**
 * OneNote 知识库检索系统 - 主程序入口
 */

import { Command } from 'commander';
import * as readline from 'readline';
import { OneNoteLoader } from './loaders/index.js';
import { HNSWLibStore } from './vectorstore/index.js';
import { QAChain } from './chains/index.js';
import { Document } from 'langchain/document';

class OneNoteKnowledgeBase {
  private vectorstore: HNSWLibStore | null = null;
  private qaChain: QAChain | null = null;
  private initialized = false;

  /**
   * 初始化向量存储
   */
  async initialize(): Promise<void> {
    console.log('🚀 初始化 OneNote 知识库...');
    this.vectorstore = new HNSWLibStore();
    await this.vectorstore.initialize();
    this.initialized = true;
    console.log('✅ 初始化完成');
  }

  /**
   * 从 OneNote 加载文档
   */
  async loadFromOneNote(notebookName?: string, sectionName?: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log('\n📖 开始从 OneNote 加载文档...');

    const loader = new OneNoteLoader();
    const documents = await loader.load(notebookName, sectionName);

    if (documents.length > 0) {
      await this.vectorstore!.addDocuments(documents);
      console.log(`✅ 成功加载 ${documents.length} 个文档片段到知识库`);
    } else {
      console.log('⚠️ 没有找到任何文档');
    }
  }

  /**
   * 设置问答链
   */
  async setupQA(llmType: 'openai' | 'ollama' = 'openai'): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log(`\n🤖 初始化问答系统 (LLM: ${llmType})...`);
    this.qaChain = new QAChain(this.vectorstore!, llmType);
    await this.qaChain.initialize();
    console.log('✅ 问答系统就绪');
  }

  /**
   * 提问
   */
  async ask(question: string, showSources: boolean = false): Promise<string> {
    if (!this.qaChain) {
      throw new Error('请先调用 setupQA() 初始化问答系统');
    }

    const result = await this.qaChain.ask(question, showSources);

    let answer = result.answer;

    if (showSources && result.sources) {
      answer += '\n\n📝 来源：';
      result.sources.forEach((source, i) => {
        const meta = source.metadata;
        answer += `\n  ${i + 1}. ${meta.notebook || ''} / ${meta.section || ''} / ${meta.title || ''}`;
      });
    }

    return answer;
  }

  /**
   * 搜索相关文档
   */
  async search(query: string, k: number = 5): Promise<Document[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const results = await this.vectorstore!.search(query, k);

    console.log(`\n🔍 搜索结果 (共 ${results.length} 条):\n`);

    results.forEach((doc, i) => {
      const meta = doc.metadata;
      console.log(`--- 结果 ${i + 1} ---`);
      console.log(`📓 笔记本: ${meta.notebook || 'N/A'}`);
      console.log(`📑 分区: ${meta.section || 'N/A'}`);
      console.log(`📄 标题: ${meta.title || 'N/A'}`);
      console.log(`内容预览: ${doc.pageContent.slice(0, 200)}...`);
      console.log();
    });

    return results;
  }

  /**
   * 交互式问答模式
   */
  async interactiveMode(): Promise<void> {
    if (!this.qaChain) {
      await this.setupQA();
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎯 进入交互式问答模式');
    console.log("   输入问题进行提问，输入 'quit' 或 'exit' 退出");
    console.log("   输入 'search:关键词' 进行搜索");
    console.log('='.repeat(60) + '\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const prompt = (): void => {
      rl.question('❓ 你的问题: ', async (input) => {
        const userInput = input.trim();

        if (!userInput) {
          prompt();
          return;
        }

        if (['quit', 'exit', 'q'].includes(userInput.toLowerCase())) {
          console.log('👋 再见！');
          rl.close();
          return;
        }

        try {
          if (userInput.startsWith('search:')) {
            const query = userInput.slice(7).trim();
            await this.search(query);
          } else {
            console.log('\n🤔 思考中...\n');
            const answer = await this.ask(userInput, true);
            console.log(`💡 回答:\n${answer}\n`);
          }
        } catch (error) {
          console.error(`❌ 错误: ${error}\n`);
        }

        prompt();
      });
    };

    prompt();
  }

  /**
   * 获取知识库统计信息
   */
  async getStats(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const stats = this.vectorstore!.getCollectionStats();

    console.log('\n📊 知识库统计:');
    console.log(`   集合名称: ${stats.collectionName}`);
    console.log(`   文档数量: ${stats.documentCount}`);
    console.log(`   存储路径: ${stats.persistDirectory}`);
  }
}

// CLI 命令行接口
const program = new Command();

program
  .name('onenote-kb')
  .description('OneNote 知识库检索系统')
  .version('1.0.0');

program
  .command('load')
  .description('从 OneNote 加载文档')
  .option('-n, --notebook <name>', '指定笔记本名称')
  .option('-s, --section <name>', '指定分区名称')
  .action(async (options) => {
    const kb = new OneNoteKnowledgeBase();
    await kb.loadFromOneNote(options.notebook, options.section);
  });

program
  .command('ask <question>')
  .description('提问')
  .option('-s, --sources', '显示来源')
  .option('--llm <type>', 'LLM 类型 (openai/ollama)', 'openai')
  .action(async (question, options) => {
    const kb = new OneNoteKnowledgeBase();
    await kb.initialize();
    await kb.setupQA(options.llm);
    const answer = await kb.ask(question, options.sources);
    console.log(`\n💡 回答:\n${answer}`);
  });

program
  .command('search <query>')
  .description('搜索文档')
  .option('-k <number>', '返回数量', '5')
  .action(async (query, options) => {
    const kb = new OneNoteKnowledgeBase();
    await kb.search(query, parseInt(options.k, 10));
  });

program
  .command('interactive')
  .description('交互式问答模式')
  .option('--llm <type>', 'LLM 类型 (openai/ollama)', 'openai')
  .action(async (options) => {
    const kb = new OneNoteKnowledgeBase();
    await kb.initialize();
    await kb.setupQA(options.llm);
    await kb.interactiveMode();
  });

program
  .command('stats')
  .description('查看知识库统计')
  .action(async () => {
    const kb = new OneNoteKnowledgeBase();
    await kb.getStats();
  });

program.parse();

export { OneNoteKnowledgeBase };

