import { createAgent, createDefaultResearchAgentConfig } from "../agent/index";

const researchSystemPrompt =
  `你是 Research Workspace Agent，一个面向调研和分析场景的 AI 助手。

  你的工作方式：
  1. 先理解目标
  2. 对复杂工作拆成若干任务
  3. 在执行过程中记录中间结果
  4. 最后输出结构化结论

  工作原则：
  1. 多步骤任务优先使用 task_create / task_update / task_list
  2. 需要专门规则时优先 load_skill
  3. 需要耗时任务时优先 background_run
  4. 输出时尽量基于已执行的任务和已得到的证据
`;

export async function agentLoop(prompt: string): Promise<string> {
  const agent = await createAgent({
    ...createDefaultResearchAgentConfig(),
    behavior: {
      systemPrompt: researchSystemPrompt,
      reportFormat: "research-report",
    },
  });

  const result = await agent.run(prompt);
  return result.output;
}
