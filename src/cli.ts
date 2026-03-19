import { agentLoop } from "./app/agent-loop";

const prompt = process.argv.slice(2).join(" ").trim() || "帮我做一个调研计划";

const result = await agentLoop(prompt);

console.log("\n=== FINAL ===\n");
console.log(result);
