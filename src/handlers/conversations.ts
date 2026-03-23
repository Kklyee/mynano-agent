import { Hono, type MiddlewareHandler } from "hono";
import { streamSSE } from "hono/streaming";
import { ActiveSessionStore } from "../agent/application/active-session-store";
import { ConversationRunRecorder } from "../agent/application/conversation-run-recorder";
import { auth } from "../lib/auth";
import type { ConversationService } from "../services/conversation-service.js";

type SessionPayload = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
type AppEnv = {
	Variables: {
		session: SessionPayload["session"];
		user: SessionPayload["user"];
	};
};

const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) {
		return c.json({ error: "Authentication required" }, 401);
	}
	c.set("session", session.session);
	c.set("user", session.user);
	await next();
};

export function createConversationsHandler(
	conversationService: ConversationService,
	agent: Awaited<ReturnType<typeof import("../agent/index.js").createAgent>>
) {
	const app = new Hono<AppEnv>();
	const activeSessions = new ActiveSessionStore();

	app.get("/api/conversations", requireAuth, async (c) => {
		const user = c.get("user");
		const conversations = await conversationService.listConversations(user.id);
		return c.json({ conversations });
	});

	app.post("/api/conversations", requireAuth, async (c) => {
		const user = c.get("user");
		const body = await c.req.json<{ title?: string }>().catch(() => ({}) as { title?: string });
		const conversation = await conversationService.createConversation({
			userId: user.id,
			title: body.title
		});
		return c.json({ conversation });
	});

	app.get("/api/conversations/:id", requireAuth, async (c) => {
		const user = c.get("user");
		const conversationId = c.req.param("id");
		try {
			const detail = await conversationService.getConversationDetail({
				userId: user.id,
				conversationId
			});
			return c.json(detail);
		} catch {
			return c.json({ error: "Conversation not found" }, 404);
		}
	});

	app.delete("/api/conversations/:id", requireAuth, async (c) => {
		const user = c.get("user");
		const conversationId = c.req.param("id");
		try {
			await conversationService.deleteConversation({ userId: user.id, conversationId });
			return c.json({ success: true });
		} catch {
			return c.json({ error: "Conversation not found" }, 404);
		}
	});

	app.post("/api/conversations/:id/cancel", requireAuth, async (c) => {
		const user = c.get("user");
		const conversationId = c.req.param("id");

		try {
			await conversationService.getConversationDetail({
				userId: user.id,
				conversationId
			});
		} catch {
			return c.json({ error: "Conversation not found" }, 404);
		}

		const session = activeSessions.get(conversationId);
		if (!session) {
			return c.json({ cancelled: false, reason: "No active session" }, 409);
		}

		const cancelled = await session.cancel("Cancelled by user");
		if (!cancelled) {
			return c.json({ cancelled: false, reason: "Session cannot be cancelled" }, 409);
		}

		return c.json({ cancelled: true });
	});

	app.post("/api/conversations/:id/messages", requireAuth, async (c) => {
		const { prompt } = await c.req.json<{ prompt?: string }>();
		if (!prompt?.trim()) {
			return c.json({ error: "Missing prompt" }, 400);
		}

		const user = c.get("user");
		const conversationId = c.req.param("id");
		let preparedRun;

		try {
			preparedRun = await conversationService.prepareRun({
				userId: user.id,
				conversationId,
				prompt
			});
		} catch {
			return c.json({ error: "Conversation not found" }, 404);
		}

		return streamSSE(c, async (stream) => {
			await conversationService.updateConversationStatus(conversationId, "running");
			await conversationService.recordUserMessage({
				conversationId,
				content: prompt.trim()
			});

			const session = await agent.createSession({
				conversationId,
				messages: preparedRun.history
			});
			activeSessions.set(conversationId, session);
			const recorder = new ConversationRunRecorder(conversationService, conversationId, () => session.getState());
			let clientDisconnected = false;

			stream.onAbort(() => {
				clientDisconnected = true;
				console.log(`[${session.id}] Client disconnected (${user.email})`);
				void session.cancel("Client disconnected");
			});

			try {
				console.log(
					`[${session.id}] Starting conversation ${conversationId} for ${user.email}: ${prompt.slice(0, 50).trim()}...`
				);

				const eventStream = session.runStream(prompt);

				for await (const event of eventStream) {
					await recorder.apply(event);

					if (!clientDisconnected) {
						await stream.writeSSE({
							event: event.type,
							data: JSON.stringify(event)
						});
					}

					if (event.type === "session.failed") {
						throw new Error(event.error);
					}
				}

				const finalState = session.getState();
				const terminalStatus = recorder.getTerminalStatus() ?? finalState.status;
				await conversationService.updateConversationStatus(conversationId, terminalStatus);

				console.log(
					`[${session.id}] Conversation ${conversationId} ${terminalStatus} for ${user.email} (${finalState.step} steps)`
				);
			} catch (error) {
				const terminalStatus = recorder.getTerminalStatus();
				const nextStatus = clientDisconnected || terminalStatus === "cancelled" ? "cancelled" : "failed";
				await conversationService.updateConversationStatus(conversationId, nextStatus);
				const errorMessage = error instanceof Error ? error.message : "Unknown error";
				if (nextStatus === "failed") {
					console.error(`[${session.id}] Error for ${user.email}:`, errorMessage);
				} else {
					console.log(`[${session.id}] Conversation ${conversationId} cancelled for ${user.email}`);
				}
			} finally {
				activeSessions.delete(conversationId);
			}
		});
	});

	return app;
}
