import type { ConversationService } from "../services/conversation-service.js";
import type {
	BackgroundManagerContract,
	BackgroundNotification,
	BackgroundTask
} from "../types/index.js";
import { BackgroundManager } from "./background-manager.js";

export class ConversationBackgroundManager implements BackgroundManagerContract {
	private readonly core: BackgroundManager;

	constructor(
		private readonly conversationService: ConversationService,
		private readonly conversationId: string
	) {
		this.core = new BackgroundManager();
	}

	async run(command: string, cwd: string): Promise<BackgroundTask> {
		const task = await this.core.run(command, cwd);
		// 同步 DB：创建任务记录
		await this.conversationService.upsertBackgroundTask({
			conversationId: this.conversationId,
			taskId: task.id,
			command: task.command,
			status: "running"
		});
		await this.conversationService.recordBackgroundEvent({
			conversationId: this.conversationId,
			taskId: task.id,
			command: task.command,
			status: "running"
		});
		return task;
	}

	check(taskId: string): BackgroundTask | null {
		return this.core.check(taskId);
	}

	list(): BackgroundTask[] {
		return this.core.list();
	}

	async cancel(taskId: string): Promise<boolean> {
		const task = this.core.check(taskId);
		if (!task || task.status !== "running") {
			return false;
		}
		const cancelled = await this.core.cancel(taskId);
		if (cancelled) {
			// 同步 DB：更新为取消状态
			await this.conversationService.upsertBackgroundTask({
				conversationId: this.conversationId,
				taskId,
				status: "failed",
				completedAt: new Date().toISOString(),
				exitCode: null
			});
			await this.conversationService.recordBackgroundEvent({
				conversationId: this.conversationId,
				taskId,
				command: task.command,
				status: "failed"
			});
		}
		return cancelled;
	}

	drainNotifications(): BackgroundNotification[] {
		// 从 core 获取通知
		const notifications = this.core.drainNotifications();
		// 将每个完成/失败的通知同步到 DB
		for (const n of notifications) {
			void this.syncNotificationToDb(n);
		}
		return notifications;
	}

	// 同步通知到 DB
	private async syncNotificationToDb(n: BackgroundNotification): Promise<void> {
		await this.conversationService.upsertBackgroundTask({
			conversationId: this.conversationId,
			taskId: n.taskId,
			status: n.status,
			completedAt: new Date().toISOString()
		});
		await this.conversationService.recordBackgroundEvent({
			conversationId: this.conversationId,
			taskId: n.taskId,
			command: n.command,
			status: n.status
		});
	}
}
