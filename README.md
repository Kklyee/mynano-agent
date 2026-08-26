# mynano-agent

一个使用 TypeScript 实现的轻量级 AI Agent Runtime，主要用于探索和实践 AI Agent 的核心工程机制。

项目没有直接依赖 LangChain / LangGraph 等 Agent Framework，而是自行实现 Agent Loop、Tool Calling、Context Management、Sub-agent 等核心能力。

## Features

* **Agent Loop**
  支持 `LLM → Tool Call → Tool Result → LLM` 的持续执行流程。

* **Tool Calling**
  通过统一的 Tool Registry 管理 Shell、文件操作、Web Search、Task 等工具。

* **Sub-agent**
  支持将独立任务委托给 Sub-agent 执行。

* **Context Management**
  支持 Tool Result 裁剪、Conversation Summary 和 Context Compaction。

* **Task System**
  支持任务状态管理以及任务依赖关系。

* **Background Task**
  支持耗时命令后台执行，并将完成结果重新注入 Agent Context。

* **Skills**
  支持按需加载 Skill，减少 System Prompt 和 Context 占用。

* **Session / Event**
  Agent Runtime 与上层应用解耦，可接入 CLI、HTTP Server 和 Web UI。

* **Web Search**
  集成 Tavily，为 Agent 提供实时外部信息检索能力。

## Agent Loop

```text
User → LLM → Tool → LLM → Tool → ... → Final Answer
```

## Tech Stack

```text
TypeScript
Bun / Node.js
OpenAI-compatible API
Hono
PostgreSQL
Drizzle ORM
Next.js
React
Tavily
Vitest
```

## About

这个项目主要用于实践 AI Agent Runtime 的工程实现，包括 Agent 执行循环、工具调用、上下文管理、任务拆分以及异步任务处理等能力。
