import { describe, expect, it, vi } from "vitest";
import { ConversationRunRecorder } from "./conversation-run-recorder";

describe("ConversationRunRecorder", () => {
	it("projects assistant and tool events into conversation persistence calls", async () => {
		const service = {
			recordAssistantMessage: vi.fn().mockResolvedValue({ id: "msg_1" }),
			recordToolCallStarted: vi.fn().mockResolvedValue(undefined),
			recordToolCallCompleted: vi.fn().mockResolvedValue(undefined),
			upsertTask: vi.fn().mockResolvedValue(undefined),
			recordTaskEvent: vi.fn().mockResolvedValue(undefined),
			upsertBackgroundTask: vi.fn().mockResolvedValue(undefined),
			recordBackgroundEvent: vi.fn().mockResolvedValue(undefined)
		};

		const recorder = new ConversationRunRecorder(service as any, "conv_1", () => ({
			backgroundTasks: [
				{
					id: "bg_1",
					command: "npm run dev",
					cwd: "/tmp",
					status: "running",
					startedAt: Date.now(),
					completedAt: undefined,
					exitCode: undefined
				}
			],
			messages: [],
			tasks: [],
			toolLogs: [],
			sessionId: "session_1",
			status: "running",
			step: 0,
			model: "test-model"
		}));

		await recorder.apply({
			type: "message.appended",
			sessionId: "session_1",
			role: "assistant",
			content: "hello"
		});
		await recorder.apply({
			type: "tool.called",
			sessionId: "session_1",
			name: "read_file",
			args: { path: "a.txt" }
		});
		await recorder.apply({
			type: "background.started",
			sessionId: "session_1",
			taskId: "bg_1",
			status: "running"
		});
		await recorder.apply({
			type: "session.cancelled",
			sessionId: "session_1",
			reason: "stop"
		});

		expect(service.recordAssistantMessage).toHaveBeenCalledTimes(1);
		expect(service.recordToolCallStarted).toHaveBeenCalledWith({
			conversationId: "conv_1",
			messageId: "msg_1",
			name: "read_file",
			args: { path: "a.txt" }
		});
		expect(service.upsertBackgroundTask).toHaveBeenCalledTimes(1);
		expect(recorder.getTerminalStatus()).toBe("cancelled");
	});
});
