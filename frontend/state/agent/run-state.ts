import type { AgentBackendEvent, AgentBackgroundTask, AgentMessage, AgentTask, AgentTool } from "@/types/agent-state";
import type { AgentEventLog, AgentViewState } from "./view-state";

const HIDDEN_TOOL_NAMES = new Set(["task_create", "task_update", "task_list", "task_get"]);
const MAX_EVENT_LOGS = 20;

export const beginRun = (state: AgentViewState, prompt: string): AgentViewState => {
	const userMessage = createUserMessage(prompt, state.nextSequence);

	return {
		...state,
		messages: [...state.messages, userMessage],
		session: {
			...state.session,
			threadId: state.session.threadId ?? crypto.randomUUID(),
			status: "connecting",
			lastEventType: "command.accepted",
			error: null,
			steps: 0
		},
		eventLog: [
			...state.eventLog,
			{
				id: `command-${crypto.randomUUID()}`,
				type: "command.accepted",
				summary: "Prompt accepted and SSE connection requested",
				createdAt: new Date().toISOString()
			}
		].slice(-MAX_EVENT_LOGS),
		nextSequence: state.nextSequence + 1
	};
};

export const failRun = (state: AgentViewState, message: string): AgentViewState => ({
	...state,
	session: {
		...state.session,
		status: "failed",
		error: message
	},
	eventLog: [
		...state.eventLog,
		{
			id: `failure-${crypto.randomUUID()}`,
			type: "session.failed",
			summary: message,
			createdAt: new Date().toISOString()
		}
	].slice(-MAX_EVENT_LOGS)
});

export const cancelRun = (state: AgentViewState): AgentViewState => ({
	...state,
	session: {
		...state.session,
		status: "cancelled",
		error: null
	},
	eventLog: [
		...state.eventLog,
		{
			id: `cancel-${crypto.randomUUID()}`,
			type: "session.cancelled",
			summary: "Run cancelled",
			createdAt: new Date().toISOString()
		}
	].slice(-MAX_EVENT_LOGS)
});

export const applyRunEvent = (prevState: AgentViewState, event: AgentBackendEvent): AgentViewState => {
	const state: AgentViewState = {
		...prevState,
		messages: [...prevState.messages],
		tools: [...prevState.tools],
		tasks: [...prevState.tasks],
		backgroundTasks: [...prevState.backgroundTasks],
		session: { ...prevState.session },
		eventLog: appendEventLog(prevState.eventLog, event),
		nextSequence: prevState.nextSequence
	};

	state.session.lastEventType = event.type;

	switch (event.type) {
		case "session.started":
			state.session.sessionId = event.sessionId;
			state.session.status = "running";
			return state;
		case "message.appended":
			if (event.role !== "assistant") return state;
			return applyAssistantMessage(state, event.content);
		case "assistant.stream.started":
			state.session.status = "running";
			ensureStreamingMessage(state);
			return state;
		case "assistant.stream.delta": {
			state.session.status = "running";
			const index = ensureStreamingMessage(state);
			const current = state.messages[index];
			state.messages[index] = { ...current, text: current.text + event.delta, status: "running" };
			return state;
		}
		case "assistant.stream.completed":
			return applyAssistantMessage(state, event.content);
		case "tool.called":
			if (!shouldShowTool(event.name)) return state;
			state.tools = startTool(state.tools, event.name, event.args, state.nextSequence);
			state.nextSequence += 1;
			return state;
		case "tool.completed":
			if (!shouldShowTool(event.name)) return state;
			state.tools = finishTool(state.tools, event.name, event.result);
			return state;
		case "task.created":
			state.tasks = upsertTask(state.tasks, {
				taskId: event.taskId,
				subject: event.subject,
				status: "pending",
				updatedAt: new Date().toISOString(),
				sequence: state.nextSequence
			});
			state.nextSequence += 1;
			return state;
		case "task.updated":
			state.tasks = upsertTask(state.tasks, {
				taskId: event.taskId,
				status: normalizeStatus(event.status),
				updatedAt: new Date().toISOString()
			});
			return state;
		case "background.updated":
			state.backgroundTasks = upsertBackgroundTask(state.backgroundTasks, {
				taskId: event.taskId,
				status: normalizeStatus(event.status),
				updatedAt: new Date().toISOString(),
				sequence: state.backgroundTasks.find((task) => task.taskId === event.taskId)?.sequence ?? state.nextSequence
			});
			if (!state.backgroundTasks.find((task) => task.taskId === event.taskId)) {
				state.nextSequence += 1;
			}
			return state;
		case "session.completed":
			state.session.status = "completed";
			state.session.steps = event.steps ?? state.session.steps;
			return state;
		case "session.cancelled":
			state.session.status = "cancelled";
			state.session.error = null;
			return state;
		case "session.failed":
			state.session.status = "failed";
			state.session.error = event.error;
			return state;
		default:
			return state;
	}
};

function appendEventLog(logs: AgentEventLog[], event: AgentBackendEvent): AgentEventLog[] {
	return [
		...logs,
		{
			id: crypto.randomUUID(),
			type: event.type,
			summary: summarizeEvent(event),
			createdAt: new Date().toISOString()
		}
	].slice(-MAX_EVENT_LOGS);
}

function summarizeEvent(event: AgentBackendEvent) {
	switch (event.type) {
		case "assistant.stream.delta":
			return "Streaming assistant response";
		case "message.appended":
			return `${event.role} message appended`;
		case "tool.called":
			return `Tool called: ${event.name}`;
		case "tool.completed":
			return `Tool completed: ${event.name}`;
		case "session.failed":
			return event.error;
		case "session.cancelled":
			return event.reason ?? "Run cancelled";
		default:
			return event.type;
	}
}

function shouldShowTool(name: string) {
	return !HIDDEN_TOOL_NAMES.has(name);
}

function createUserMessage(text: string, sequence: number): AgentMessage {
	return {
		id: `user-${crypto.randomUUID()}`,
		role: "user",
		text,
		createdAt: new Date().toISOString(),
		sequence
	};
}

function createAssistantMessage(sequence: number): AgentMessage {
	return {
		id: `assistant-${crypto.randomUUID()}`,
		role: "assistant",
		text: "",
		createdAt: new Date().toISOString(),
		status: "running",
		sequence
	};
}

function applyAssistantMessage(state: AgentViewState, content: string): AgentViewState {
	const tailIndex = getWritableAssistantIndex(state);
	if (tailIndex === -1) {
		state.messages.push({
			id: `assistant-${crypto.randomUUID()}`,
			role: "assistant",
			text: content,
			createdAt: new Date().toISOString(),
			status: "complete",
			sequence: state.nextSequence
		});
		state.nextSequence += 1;
		return state;
	}

	state.messages[tailIndex] = {
		...state.messages[tailIndex],
		text: content,
		status: "complete"
	};
	return state;
}

function ensureStreamingMessage(state: AgentViewState) {
	const tailIndex = getWritableAssistantIndex(state);
	if (tailIndex !== -1 && state.messages[tailIndex]?.status === "running") {
		return tailIndex;
	}

	state.messages.push(createAssistantMessage(state.nextSequence));
	state.nextSequence += 1;
	return state.messages.length - 1;
}

function getWritableAssistantIndex(state: AgentViewState) {
	const tailIndex = getTailAssistantIndex(state.messages);
	if (tailIndex === -1) return -1;

	const tailAssistant = state.messages[tailIndex];
	const tailSequence = tailAssistant.sequence ?? -1;
	if (tailAssistant.status === "running") return tailIndex;
	if ((state.tools.at(-1)?.sequence ?? -1) > tailSequence) return -1;
	return tailIndex;
}

function getTailAssistantIndex(messages: AgentMessage[]) {
	const lastMessage = messages.at(-1);
	return lastMessage?.role === "assistant" ? messages.length - 1 : -1;
}

function upsertTask(tasks: AgentTask[], nextTask: AgentTask): AgentTask[] {
	const index = tasks.findIndex((task) => task.taskId === nextTask.taskId);
	if (index === -1) return [...tasks, nextTask];

	const updated = [...tasks];
	updated[index] = { ...updated[index], ...nextTask, sequence: nextTask.sequence ?? updated[index]?.sequence };
	return updated;
}

function upsertBackgroundTask(tasks: AgentBackgroundTask[], nextTask: AgentBackgroundTask): AgentBackgroundTask[] {
	const index = tasks.findIndex((task) => task.taskId === nextTask.taskId);
	if (index === -1) return [...tasks, nextTask];

	const updated = [...tasks];
	updated[index] = { ...updated[index], ...nextTask, sequence: nextTask.sequence ?? updated[index]?.sequence };
	return updated;
}

function startTool(tools: AgentTool[], name: string, args: unknown, sequence: number): AgentTool[] {
	return [
		...tools,
		{
			id: `${name}-${tools.length + 1}`,
			name,
			args,
			status: "running",
			startedAt: new Date().toISOString(),
			sequence
		}
	];
}

function finishTool(tools: AgentTool[], name: string, result: string): AgentTool[] {
	const reverseIndex = [...tools].reverse().findIndex((tool) => tool.name === name && tool.status === "running");
	if (reverseIndex === -1) return tools;

	const index = tools.length - 1 - reverseIndex;
	const updated = [...tools];
	updated[index] = { ...updated[index], status: "completed", result, completedAt: new Date().toISOString() };
	return updated;
}

function normalizeStatus(status: string) {
	switch (status) {
		case "in_progress":
			return "running";
		case "completed":
			return "completed";
		case "failed":
			return "failed";
		default:
			return status;
	}
}
