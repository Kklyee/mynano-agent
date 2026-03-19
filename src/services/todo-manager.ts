import type { TodoItem } from "./types";


export class TodoManager {
  private items: TodoItem[] = [];

  update(items: TodoItem[]) {
    const progressCounter = this.items.filter(
      (item) => item.status === "in_progress",
    ).length;
    if (progressCounter > 1) {
      throw new Error("同一时间只能有一个 in_progress 执行");
    }
    this.items = items;
    return this.render();
  }
  list(): TodoItem[] {
    return this.items;
  }
  render() {
    const todoLength = this.items.length;
    if (todoLength === 0) {
      return "暂无待办事项";
    }
    return this.items
      .map((item) => {
        const marker =
          item.status === "completed"
            ? "[x]"
            : item.status === "in_progress"
              ? "[>]"
              : "[ ]";

        return `${marker} ${item.desc} (${item.status})`;
      })
      .join("\n");
  }
}
