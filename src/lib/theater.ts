"use client";
// 剧场状态机：把 SSE 事件流折叠为可渲染的卡片序列与预览状态。
// workspace/new（实时生成）与 workspace/[id]（历史回放+迭代）共用。
// 用户消息也是卡片（agent="user"），与各角色卡片共用同一条时间线，
// 保证历史与迭代消息严格按时间顺序渲染。
import { useCallback, useState } from "react";
import type { Agent, MessageDTO, SSEEvent } from "./types";

export interface TheaterCard {
  key: string;
  agent: Agent | "user";
  status: "running" | "done";
  lines: string[]; // 人工提示行（delta status:true）
  text?: string; // user 卡片的消息文本
  artifact?: any; // stage_done 产物
  note?: string; // 'repair' | 'iterate'
  chars: number; // 模型原始输出累计字数（delta 缺省 status）
}

export interface TheaterState {
  cards: TheaterCard[];
  previewHtml: string | null;
  codeText: string; // 工程师流式代码（右栏代码态）
  phase: "idle" | "running" | "done" | "error";
  credits: number | null;
  errorMessage?: string;
  errorCode?: string;
  projectId: number | null;
}

export const INITIAL_STATE: TheaterState = {
  cards: [],
  previewHtml: null,
  codeText: "",
  phase: "idle",
  credits: null,
  projectId: null,
};

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

/** 纯事件归约：由 feed 调用（setState(prev => applyEvent(prev, ev))） */
export function applyEvent(prev: TheaterState, ev: SSEEvent): TheaterState {
  switch (ev.type) {
    case "stage_start": {
      return {
        ...prev,
        phase: "running",
        cards: [
          ...prev.cards,
          {
            key: nextKey(),
            agent: ev.agent,
            status: "running",
            lines: [],
            note: ev.note,
            chars: 0,
          },
        ],
      };
    }
    case "delta": {
      const cards = prev.cards.map((c) => {
        if (c.agent !== ev.agent || c.status !== "running") return c;
        // 提示行进对话文本；模型原始输出（JSON/HTML）只计数
        if (ev.status) return { ...c, lines: [...c.lines, ev.text] };
        return { ...c, chars: c.chars + ev.text.length };
      });
      return {
        ...prev,
        cards,
        codeText:
          ev.agent === "engineer" && !ev.status
            ? prev.codeText + ev.text
            : prev.codeText,
      };
    }
    case "preview":
      return { ...prev, previewHtml: ev.html };
    case "stage_done": {
      return {
        ...prev,
        cards: prev.cards.map((c) =>
          c.agent === ev.agent && c.status === "running"
            ? { ...c, status: "done", artifact: ev.artifact ?? c.artifact }
            : c
        ),
      };
    }
    case "done":
      return { ...prev, phase: "done", credits: ev.credits, projectId: ev.projectId };
    case "error":
      return {
        ...prev,
        phase: "error",
        errorMessage: ev.message,
        errorCode: ev.code,
      };
    default:
      return prev;
  }
}

/** 用户消息气泡追加到时间线末尾 */
export function applyUserPush(prev: TheaterState, text: string): TheaterState {
  return {
    ...prev,
    cards: [
      ...prev.cards,
      { key: nextKey(), agent: "user", status: "done", lines: [], text, chars: 0 },
    ],
  };
}

/** 历史消息 → 完成态时间线（user 与各角色按存储顺序内联） */
export function cardsFromHistory(messages: MessageDTO[]): {
  cards: TheaterCard[];
  codeText: string;
} {
  const cards: TheaterCard[] = [];
  let codeText = "";
  for (const m of messages) {
    if (m.role === "user") {
      cards.push({
        key: `h${cards.length}`,
        agent: "user",
        status: "done",
        lines: [],
        text: m.content,
        chars: 0,
      });
      continue;
    }
    let artifact: any;
    try {
      artifact = JSON.parse(m.content);
    } catch {
      artifact = { text: m.content };
    }
    if (m.role === "engineer") {
      codeText = m.content;
      artifact = { size: m.content.length };
    }
    cards.push({
      key: `h${cards.length}`,
      agent: m.role,
      status: "done",
      lines: [],
      artifact,
      chars: m.content.length,
    });
  }
  return { cards, codeText };
}

export function useTheater() {
  const [state, setState] = useState<TheaterState>(INITIAL_STATE);

  const feed = useCallback((ev: SSEEvent) => {
    setState((prev) => applyEvent(prev, ev));
  }, []);

  const pushUser = useCallback((text: string) => {
    setState((prev) => applyUserPush(prev, text));
  }, []);

  /** 从历史消息构建完成态剧场 */
  const loadHistory = useCallback((messages: MessageDTO[], html: string | null) => {
    const { cards, codeText } = cardsFromHistory(messages);
    setState({
      ...INITIAL_STATE,
      cards,
      previewHtml: html,
      codeText,
      phase: "done",
    });
  }, []);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return { state, feed, pushUser, loadHistory, reset };
}
