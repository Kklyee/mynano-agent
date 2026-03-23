import type { AgentEvent } from "../core/events";
import type { Task, BackgroundTask } from "../../types";

export function buildTaskEvents(
	sessionId: string,
	previousTasks: Task[],
	nextTasks: Task[],
): AgentEvent[] {
	const previousById = new Map<number, Task>(previousTasks.map((task) => [task.id, task]));
	const events: AgentEvent[] = [];

	for (const task of nextTasks) {
		const previous = previousById.get(task.id);
		if (!previous) {
			events.push({
				type: "task.created",
				sessionId,
				taskId: task.id,
				subject: task.subject,
			});
			continue;
		}

		if (previous.status !== task.status) {
			events.push({
				type: "task.updated",
				sessionId,
				taskId: task.id,
				status: task.status,
			});
		}
	}

	return events;
}

export function buildBackgroundEvents(
	sessionId: string,
	previousTasks: BackgroundTask[],
	nextTasks: BackgroundTask[],
): AgentEvent[] {
	const previousById = new Map<string, BackgroundTask>(
		previousTasks.map((task) => [task.id, task]),
	);
	const events: AgentEvent[] = [];

	for (const task of nextTasks) {
		const previous = previousById.get(task.id);
		if (!previous) {
			events.push({
				type: "background.started",
				sessionId,
				taskId: task.id,
				status: task.status,
			});
			continue;
		}

		if (previous.status !== task.status) {
			events.push({
				type: "background.updated",
				sessionId,
				taskId: task.id,
				status: task.status,
			});
		}
	}

	return events;
}
