// 全局共享类型：SSE 事件协议（spec §3.4）、数据传输对象
export type Role = "user" | "pm" | "architect" | "engineer" | "qa";
export type Agent = "pm" | "architect" | "engineer" | "qa";

export type SSEEvent =
  | { type: "stage_start"; agent: Agent; note?: string }
  | { type: "delta"; agent: Agent; text: string }
  | { type: "preview"; html: string }
  | { type: "stage_done"; agent: Agent; artifact?: unknown }
  | { type: "done"; projectId: number; credits: number }
  | { type: "error"; message: string; code?: string };

export interface UserDTO {
  id: number;
  email: string;
  credits: number;
}

export interface ProjectDTO {
  id: number;
  user_id: number;
  title: string;
  prompt: string;
  html: string | null;
  icon: string | null;
  tagline: string | null;
  status: "draft" | "published";
  slug: string | null;
  remix_of: number | null;
  remixTitle?: string | null;
  remix_count: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessageDTO {
  id: number;
  project_id: number;
  role: Role;
  content: string;
  createdAt: string;
}

export interface ExploreItemDTO {
  id: number;
  title: string;
  icon: string | null;
  tagline: string | null;
  slug: string;
  remix_count: number;
  author: string; // 脱敏邮箱
  createdAt: string;
}

export interface TxDTO {
  id: number;
  amount: number;
  reason: string;
  createdAt: string;
}
