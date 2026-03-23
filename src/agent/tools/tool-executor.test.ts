import { describe, expect, it, vi } from "vitest";
import { SessionRuntimeStateStore } from "../session/runtime-state";
import { AgentToolExecutor } from "./tool-executor";

describe("AgentToolExecutor", () => {
	it("stops starting new tools after cancellation is requested", async () => {
		const runtimeState = new SessionRuntimeStateStore("session_1", "test-model");
		const execute = vi
			.fn()
			.mockImplementationOnce(async () => {
				runtimeState.requestCancellation("stop");
				return "first";
			})
			.mockResolvedValue("second");

		const executor = new AgentToolExecutor(
			{
				toolRegistry: { execute },
				taskManager: { listAll: vi.fn().mockResolvedValue([]) },
				backgroundManager: { list: vi.fn().mockReturnValue([]) }
			} as any,
			"session_1",
			runtimeState,
			vi.fn(),
			{ compact: vi.fn().mockResolvedValue(undefined) } as any
		);

		await executor.executeToolCalls(
			[
				{
					type: "function",
					id: "call_1",
					function: { name: "read_file", arguments: "{}" }
				},
				{
					type: "function",
					id: "call_2",
					function: { name: "read_file", arguments: "{}" }
				}
			] as any,
			[]
		);

		expect(execute).toHaveBeenCalledTimes(1);
	});
});
