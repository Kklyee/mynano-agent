import type { TaskStatus } from "../types";

export function resolveTaskStatus(
	currentStatus: TaskStatus,
	requestedStatus: TaskStatus | undefined,
	blockedBy: number[],
): TaskStatus {
	if (blockedBy.length > 0) {
		return "blocked";
	}
	if (requestedStatus && requestedStatus !== "blocked") {
		return requestedStatus;
	}
	return currentStatus === "blocked" ? "pending" : currentStatus;
}

export function diffTaskDependencies(previous: number[], next: number[]) {
	const prevSet = new Set(previous);
	const nextSet = new Set(next);
	return {
		added: [...nextSet.difference(prevSet)],
		removed: [...prevSet.difference(nextSet)],
	};
}

console.log(diffTaskDependencies([1, 2, 3], [2, 3, 4]));
