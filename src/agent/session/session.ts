import { AsyncEventQueue } from "../../utils/async-event-queue";
import { SessionContext } from "../context/context-manager";
import type { AgentEvent } from "../core/events";
import type { AgentRuntime } from "../core/runtime";
import type {
	AgentRunResult,
	AgentSeedMessage,
	AgentSession as AgentSessionContract,
	AgentSessionServices,
	AgentState
} from "../core/types";
import { AgentModelClient } from "../model/model-client";
import { AgentRunner } from "../orchestration/runner";
import { AgentToolExecutor } from "../tools/tool-executor";
import { AgentEventBus } from "./event-bus";
import { MessageStore } from "./message-store";
import { SessionRuntimeStateStore } from "./runtime-state";

export class AgentSession implements AgentSessionContract {
	readonly id: string;
	private readonly eventBus = new AgentEventBus();
	private readonly messages: MessageStore;
	private readonly runtimeState: SessionRuntimeStateStore;
	private readonly runner: AgentRunner;

	constructor(
		runtime: AgentRuntime,
		sessionId: string,
		sessionServices: AgentSessionServices,
		seedMessages: AgentSeedMessage[] = []
	) {
		this.id = sessionId;
		this.messages = new MessageStore(seedMessages);
		this.runtimeState = new SessionRuntimeStateStore(sessionId, runtime.openai.model);

		const contextManager = new SessionContext(runtime, sessionServices, sessionId, this.emit.bind(this));
		const modelClient = new AgentModelClient(runtime, sessionServices, sessionId, this.emit.bind(this));
		const toolExecutor = new AgentToolExecutor(
			sessionServices,
			sessionId,
			this.runtimeState,
			this.emit.bind(this),
			contextManager
		);

		this.runner = new AgentRunner(
			runtime,
			sessionId,
			this.messages,
			this.runtimeState,
			contextManager,
			modelClient,
			toolExecutor,
			this.emit.bind(this)
		);
	}

	onEvent(listener: (event: AgentEvent) => void): () => void {
		return this.eventBus.subscribe(listener);
	}

	getState(): AgentState {
		return this.runtimeState.getSnapshot(this.messages.toSimpleMessages());
	}

	async run(input: string): Promise<AgentRunResult> {
		return this.runner.run(input);
	}

	runStream(input: string): AsyncIterable<AgentEvent> {
		const queue = new AsyncEventQueue<AgentEvent>();
		const unsubscribe = this.onEvent((event) => queue.push(event));

		void this.run(input)
			.catch(() => {})
			.finally(() => {
				unsubscribe();
				queue.close();
			});

		return queue;
	}

	private emit(event: AgentEvent): void {
		this.eventBus.emit(event);
		if (event.type === "session.failed") {
			console.error(`[${this.id}] Session failed`, event.error);
		}
	}

	async cancel(reason?: string): Promise<boolean> {
		return this.runtimeState.requestCancellation(reason);
	}
}
