import path from "node:path";
import type { CreateAgentOptions } from "./types";

export interface AgentConfigParams {
	model?: string;
	apiKey?: string;
	baseURL?: string;
	workDir?: string;
	skillsDir?: string;
	tasksDir?: string;
	transcriptDir?: string;
	maxSteps?: number;
}

export function createAgentConfig(input: AgentConfigParams = {}): CreateAgentOptions {
	const workDir = input.workDir ?? process.cwd();
	return {
		llmConfig: {
			provider: "openai-compatible",
			model: input.model ?? process.env.ZHIPU_MODEL ?? "GLM-4.7",
			apiKey: input.apiKey ?? process.env.ZHIPU_API_KEY,
			baseURL: input.baseURL ?? process.env.ZHIPU_BASE_URL,
			temperature: 0.2
		},
		runtime: {
			workDir,
			skillsDir: input.skillsDir ?? path.join(workDir, "skills"),
			tasksDir: input.tasksDir ?? path.join(workDir, ".tasks"),
			transcriptDir: input.transcriptDir ?? path.join(workDir, ".transcript"),
			maxSteps: input.maxSteps ?? 20,
			enableCompact: true,
			enableBackground: true
		}
	};
}
