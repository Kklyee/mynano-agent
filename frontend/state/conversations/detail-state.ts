import type { AgentBackgroundTask, AgentMessage, AgentTask, AgentTool } from "@/types/agent-state";
import type { ConversationDetailPayload } from "@/api/conversations/api";
import { createEmptyAgentViewState, type AgentViewState } from "@/state/agent/view-state";

const HIDDEN_TOOL_NAMES = new Set(["task_create", "task_update", "task_list", "task_get"]);

export const hydrateDetail = (detail: ConversationDetailPayload): AgentViewState => {
	const messages = detail.messages
		.filter(
			(
				message
			): message is ConversationDetailPayload["messages"][number] & {
				role: "user" | "assistant";
			} => message.role === "user" || message.role === "assistant"
		)
		.map(toMessage);
	const tools = detail.tools.filter((tool) => shouldShowTool(tool.name)).map(toTool);
	const taskSequenceMap = new Map(detail.taskEvents.map((event) => [event.taskId, event.sequence]));
	const backgroundSequenceMap = new Map(detail.backgroundEvents.map((event) => [event.taskId, event.sequence]));
	const tasks = detail.tasks.map((task) => toTask(task, taskSequenceMap.get(task.taskId)));
	const backgroundTasks = detail.backgroundTasks.map((task) =>
		toBackgroundTask(task, backgroundSequenceMap.get(task.taskId))
	);
	const nextSequence =
		Math.max(
			-1,
			...messages.map((message) => message.sequence ?? -1),
			...tools.map((tool) => tool.sequence ?? -1),
			...detail.taskEvents.map((event) => event.sequence ?? -1),
			...detail.backgroundEvents.map((event) => event.sequence ?? -1)
		) + 1;

	return {
		...createEmptyAgentViewState(),
		messages,
		tools,
		tasks,
		backgroundTasks,
		session: {
			...createEmptyAgentViewState().session,
			threadId: detail.conversation.id,
			status: "idle"
		},
		nextSequence
	};
};

function shouldShowTool(name: string) {
	return !HIDDEN_TOOL_NAMES.has(name);
}

function toMessage(message: ConversationDetailPayload["messages"][number]): AgentMessage {
	return {
		id: message.id,
		role: message.role as "user" | "assistant",
		text: message.content,
		createdAt: message.createdAt,
		status: (message.status === "complete"
			? "complete"
			: message.status === "streaming"
				? "running"
				: "incomplete") as "complete" | "running" | "incomplete",
		sequence: message.sequence
	};
}

function toTool(tool: ConversationDetailPayload["tools"][number]): AgentTool {
	return {
		id: tool.id,
		name: tool.name,
		status: tool.status,
		args: tool.argsJson ? JSON.parse(tool.argsJson) : undefined,
		result: tool.resultText ?? undefined,
		startedAt: tool.startedAt,
		completedAt: tool.completedAt ?? undefined,
		sequence: tool.sequence
	};
}

function toTask(task: ConversationDetailPayload["tasks"][number], sequence?: number): AgentTask {
	return {
		taskId: task.taskId,
		subject: task.subject ?? undefined,
		description: task.description ?? undefined,
		owner: task.owner ?? undefined,
		blockedBy: task.blockedBy,
		status: task.status,
		updatedAt: task.updatedAt,
		sequence
	};
}

function toBackgroundTask(
	task: ConversationDetailPayload["backgroundTasks"][number],
	sequence?: number
): AgentBackgroundTask {
	return {
		taskId: task.taskId,
		command: task.command ?? undefined,
		summary: task.summary ?? undefined,
		status: task.status,
		startedAt: task.startedAt,
		completedAt: task.completedAt ?? undefined,
		exitCode: task.exitCode,
		updatedAt: task.completedAt ?? task.startedAt,
		sequence
	};
}
