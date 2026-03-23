import type { SkillLoader } from "../skills/skill-loader";

const defaultSystemPrompt = `你是一个面向调研和分析场景的 Agent。

你应该：
1. 先理解目标
2. 对复杂工作拆分任务
3. 在需要时调用工具
4. 最终输出结构化结论`;

export async function buildSystemPrompt(skillLoader: SkillLoader, basePrompt?: string): Promise<string> {
	const skillList = await skillLoader.renderList();
	return `${basePrompt ?? defaultSystemPrompt}\n${skillList}`;
}
