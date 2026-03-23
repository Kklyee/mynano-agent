import { describe, expect, it, vi } from "vitest";
import { MessageStore } from "../session/message-store";
import { SessionRuntimeStateStore } from "../session/runtime-state";
import { AgentRunner } from "./runner";

describe("AgentRunner", () => {
	it("completes when the model returns a final assistant message", async () => {
		const messages = new MessageStore([]);
		const runtimeState = new SessionRuntimeStateStore("session_1", "test-model");
		const events: string[] = [];

		const runner = new AgentRunner(
			createRuntimeStub(),
			"session_1",
			messages,
			runtimeState,
			{ prepare: vi.fn().mockResolvedValue(undefined) } as any,
			{
				generate: vi.fn().mockResolvedValue({
					role: "assistant",
					content: "done"
				})
			} as any,
			{ executeToolCalls: vi.fn().mockResolvedValue(undefined) } as any,
			(event) => events.push(event.type)
		);

		const result = await runner.run("hello");

		expect(result.status).toBe("completed");
		expect(result.output).toBe("done");
		expect(events).toContain("session.started");
		expect(events).toContain("session.completed");
	});

	it("cancels before the first turn when cancellation is already requested", async () => {
		const messages = new MessageStore([]);
		const runtimeState = new SessionRuntimeStateStore("session_2", "test-model");
		runtimeState.requestCancellation("stop");

		const generate = vi.fn();
		const events: string[] = [];
		const runner = new AgentRunner(
			createRuntimeStub(),
			"session_2",
			messages,
			runtimeState,
			{ prepare: vi.fn().mockResolvedValue(undefined) } as any,
			{ generate } as any,
			{ executeToolCalls: vi.fn().mockResolvedValue(undefined) } as any,
			(event) => events.push(event.type)
		);

		const result = await runner.run("hello");

		expect(result.status).toBe("cancelled");
		expect(generate).not.toHaveBeenCalled();
		expect(events).toContain("session.cancelled");
	});
});

function createRuntimeStub() {
	return {
		skillLoader: {
			renderList: vi.fn().mockResolvedValue("")
		},
		options: {
			behavior: {}
		},
		getMaxSteps: () => 3
	} as any;
}
