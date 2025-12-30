# OneNote 知识库检索系统 (TypeScript)

基于 LangChain.js 和 Microsoft Graph API 的 OneNote 智能检索问答系统。

## ✨ 功能特性

- 📖 **自动获取 OneNote**：通过 Microsoft Graph API 自动获取你的 OneNote 笔记
- 🔍 **语义搜索**：基于向量相似度的智能搜索，不仅仅是关键词匹配
- 💬 **智能问答**：基于你的笔记内容回答问题
- 💾 **本地存储**：LanceDB 向量数据库，纯本地运行，预编译二进制，无需额外服务
- 🔷 **TypeScript**：完整的类型支持

## 📦 技术栈

| 组件 | 技术选型 | 说明 |
|------|----------|------|
| **框架** | LangChain.js | 核心 RAG 框架 |
| **向量数据库** | LanceDB | 纯本地，预编译，功能丰富 |
| **Embedding** | OpenAI Ada | text-embedding-ada-002 |
| **LLM** | OpenAI GPT | gpt-3.5-turbo |
| **数据来源** | Microsoft Graph API | 自动同步 OneNote |

## 📁 项目结构

```
├── src/
│   ├── auth/
│   │   └── graph-auth.ts      # Microsoft Graph 认证
│   ├── loaders/
│   │   └── onenote-loader.ts  # OneNote 文档加载器
│   ├── embeddings/
│   │   └── embedding-factory.ts # Embedding 模型工厂
│   ├── vectorstore/
│   │   └── lancedb-store.ts   # LanceDB 向量存储
│   ├── chains/
│   │   └── qa-chain.ts        # 问答链
│   ├── config/
│   │   └── settings.ts        # 配置管理
│   └── index.ts               # 主程序入口
├── package.json
├── tsconfig.json
└── README.md
```

## 🚀 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 注册 Azure 应用（获取 Microsoft Graph API 权限）

1. 访问 [Azure Portal](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)

2. 点击 **"新注册"**：
   - 名称：`OneNote Knowledge Base`（自定义）
   - 支持的账户类型：选择 **"任何组织目录中的帐户和个人 Microsoft 帐户"**
   - 重定向 URI：选择 **"公共客户端/本机"**，填入 `http://localhost`

3. 注册后，记录以下信息：
   - **应用程序(客户端) ID** → `AZURE_CLIENT_ID`
   - **目录(租户) ID** → `AZURE_TENANT_ID`

4. 配置 API 权限：
   - 左侧菜单 → **"API 权限"**
   - 点击 **"添加权限"** → **"Microsoft Graph"** → **"委托的权限"**
   - 搜索并添加：`Notes.Read`, `Notes.Read.All`, `User.Read`
   - 点击 **"授予管理员同意"**

5. 启用公共客户端流：
   - 左侧菜单 → **"身份验证"**
   - **"允许公共客户端流"** → **"是"**

### 3. 配置环境变量

创建 `.env` 文件：

```bash
# Microsoft Graph API
AZURE_CLIENT_ID=你的客户端ID
AZURE_TENANT_ID=你的租户ID

# OpenAI
OPENAI_API_KEY=你的OpenAI密钥
```

### 4. 使用

#### 命令行方式

```bash
# 从 OneNote 加载文档到知识库
pnpm load

# 加载指定笔记本
pnpm load --notebook "工作笔记"

# 提问
pnpm ask "什么是机器学习？"

# 搜索相关内容
pnpm search "Python 教程"

# 交互式问答
pnpm interactive

# 查看知识库统计
pnpm stats
```

#### 代码方式

```typescript
import { OneNoteKnowledgeBase } from './src/index.js';

const kb = new OneNoteKnowledgeBase();

// 加载 OneNote
await kb.loadFromOneNote();

// 设置问答
await kb.setupQA('openai');

// 提问
const answer = await kb.ask('我的笔记中有哪些关于 Python 的内容？');
console.log(answer);
```

## ⚙️ 配置说明

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `AZURE_CLIENT_ID` | Azure 应用客户端 ID | 必填 |
| `AZURE_TENANT_ID` | Azure 租户 ID | common |
| `OPENAI_API_KEY` | OpenAI API 密钥 | 必填 |
| `OPENAI_MODEL` | OpenAI 模型 | gpt-3.5-turbo |
| `CHROMA_PERSIST_DIRECTORY` | 向量库存储目录 | ./data/chroma_db |
| `CHUNK_SIZE` | 文本分块大小 | 1000 |
| `CHUNK_OVERLAP` | 文本分块重叠 | 200 |
| `RETRIEVAL_K` | 检索返回数量 | 4 |

## 🔄 首次登录流程

首次运行时，系统会显示设备代码登录提示：

```
============================================================
📱 请完成 Microsoft 登录:
   1. 打开浏览器访问: https://microsoft.com/devicelogin
   2. 输入代码: XXXXXXXX
============================================================
```

## 🎯 为什么选择 LanceDB？

| 特性 | LanceDB | ChromaDB | HNSWLib |
|------|---------|----------|---------|
| **运行方式** | ✅ 纯内嵌 | ❌ JS 版需 Docker | ✅ 纯内嵌 |
| **安装** | ✅ 预编译，直接用 | ❌ 需启动服务 | ❌ 需本地编译 |
| **增删改查** | ✅ 全支持 | ✅ | ❌ 不支持删除 |
| **性能** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

LanceDB 预编译二进制文件，无需本地编译，功能丰富，适合个人使用！

## 🐛 常见问题

**Q: 登录时提示权限不足？**
A: 请确保已在 Azure Portal 中添加了正确的 API 权限。

**Q: Token 过期了怎么办？**
A: 删除 `.token_cache.json` 文件后重新登录。

**Q: 向量库数据存在哪里？**
A: 默认存储在 `./data/chroma_db/onenote_collection/` 目录下。

## 📄 License

MIT License
