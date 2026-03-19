import OpenAI from "openai";
import { subagentPrompt } from "../agent/prompts";
import type { ToolsType } from "../tools/types";

type ToolRunner = (name: ToolsType, args: any) => Promise<any>;
type ToolDef = OpenAI.Chat.Completions.ChatCompletionTool;

interface SubagentOptions {
  client: OpenAI;
  model: string;
  tools: ToolDef[];
  runTool: ToolRunner;
  prompt: string;
}


export async function runSubagent(options: SubagentOptions): Promise<string> {
  const { client,model, tools, runTool, prompt } = options;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: subagentPrompt,
    },
    {
      role: "user",
      content: prompt,
    },
  ];
  for (let i = 0; i < 12; i++) {
    const response = await client.chat.completions.create({
      model,
      tools,
      messages,
    });

    const msg = response.choices[0]?.message;
    if (!msg) {
      throw new Error("模型没有返回内容");
    }
    messages.push(msg);

    const toolCalls = msg.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return msg.content ?? "";
    }

    for (const call of toolCalls) {
      if (call.type !== "function") {
        continue;
      }
      const toolName = call.function.name as ToolsType;
      const args = JSON.parse(call.function.arguments || "{}");
      const result = await runTool(toolName, args);

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }
    console.log("\n--- 子代理返回 ---");
    console.log(msg);
  }
  return "子代理达到最大循环次数，强制结束";
}
