// 全局共享类型：SSE 事件协议（spec §3.4）、数据传输对象
export type Role = "user" | "pm" | "architect" | "engineer" | "qa";
export type Agent = "pm" | "architect" | "engineer" | "qa";

export type SSEEvent =
  | { type: "stage_start"; agent: Agent; note?: string }
  // status:true = 人工提示行（前端展示）；缺省 = 模型原始输出（前端只计数，
  // 避免把 PM/架构师的 JSON、工程师的 HTML 原文铺进对话流）
  | { type: "delta"; agent: Agent; text: string; status?: boolean }
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
