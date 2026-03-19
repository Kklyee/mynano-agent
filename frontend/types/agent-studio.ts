import type { LucideIcon } from "lucide-react";
import type {
  AgentBackgroundTask,
  AgentTask,
  AgentTransportMessage,
  AgentTransportTool,
} from "@/types/agent-state";

export type ToolGroup = {
  key: string;
  label: string;
  icon: LucideIcon;
  iconClassName: string;
  latestTool: AgentTransportTool;
  tools: AgentTransportTool[];
};

export type TimelineItem =
  | {
      id: string;
      kind: "message";
      timestamp: string;
      sequence: number;
      message: AgentTransportMessage;
    }
  | {
      id: string;
      kind: "tool";
      timestamp: string;
      sequence: number;
      tool: AgentTransportTool;
      toolGroup: ToolGroup;
    }
  | {
      id: string;
      kind: "task";
      timestamp: string;
      sequence: number;
      task: AgentTask;
    }
  | {
      id: string;
      kind: "background";
      timestamp: string;
      sequence: number;
      backgroundTask: AgentBackgroundTask;
    };
