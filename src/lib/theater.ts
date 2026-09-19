"use client";
// 剧场状态机：把 SSE 事件流折叠为可渲染的卡片序列与预览状态。
// workspace/new（实时生成）与 workspace/[id]（历史回放+迭代）共用。
import { useCallback, useRef, useState } from "react";
import type { Agent, MessageDTO, SSEEvent } from "./types";

export interface TheaterCard {
  key: string;
  agent: Agent;
  status: "running" | "done";
  lines: string[]; // delta 文本（pm/architect 打字内容、engineer 状态行）
  artifact?: any; // stage_done 产物
  note?: string; // 'repair' | 'iterate'
  chars: number; // engineer 累计字符数
}

export interface TheaterState {
  cards: TheaterCard[];
  userLines: string[]; // 用户消息气泡
  previewHtml: string | null;
  codeText: string; // 工程师流式代码（右栏代码态）
  phase: "idle" | "running" | "done" | "error";
  credits: number | null;
  errorMessage?: string;
  errorCode?: string;
  projectId: number | null;
}

const INITIAL: TheaterState = {
  cards: [],
  userLines: [],
  previewHtml: null,
  codeText: "",
  phase: "idle",
  credits: null,
  projectId: null,
};

let keySeq = 0;

export function useTheater() {
  const [state, setState] = useState<TheaterState>(INITIAL);
  // 当前处于 running 的 engineer 卡片是否为 repair（其 delta 不进代码视图）
  const repairMode = useRef(false);

  const feed = useCallback((ev: SSEEvent) => {
    setState((prev) => {
      switch (ev.type) {
        case "stage_start": {
          if (ev.agent === "engineer") repairMode.current = ev.note === "repair";
          const key = `k${++keySeq}`;
          return {
            ...prev,
            phase: "running",
            cards: [
              ...prev.cards,
              {
                key,
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
            if (c.agent === "engineer" && !c.note) {
              // 首次生成的流式代码：计入字符数，不进 lines
              return { ...c, chars: c.chars + ev.text.length };
            }
            return { ...c, lines: [...c.lines, ev.text] };
          });
          const isRepair = ev.agent === "engineer" && repairMode.current;
          return {
            ...prev,
            cards,
            codeText:
              ev.agent === "engineer" && !isRepair
                ? prev.codeText + ev.text
                : prev.codeText,
          };
        }
        case "preview":
          return { ...prev, previewHtml: ev.html };
        case "stage_done": {
          if (ev.agent === "engineer") repairMode.current = false;
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
    });
  }, []);

  const pushUser = useCallback((text: string) => {
    setState((prev) => ({ ...prev, userLines: [...prev.userLines, text] }));
  }, []);

  /** 从历史消息构建完成态剧场 */
  const loadHistory = useCallback((messages: MessageDTO[], html: string | null) => {
    const cards: TheaterCard[] = [];
    const userLines: string[] = [];
    let codeText = "";
    for (const m of messages) {
      if (m.role === "user") {
        userLines.push(m.content);
        continue;
      }
      let artifact: any = undefined;
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
        agent: m.role as Agent,
        status: "done",
        lines: [],
        artifact,
        chars: m.content.length,
      });
    }
    setState({
      ...INITIAL,
      cards,
      userLines,
      previewHtml: html,
      codeText,
      phase: "done",
    });
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  return { state, feed, pushUser, loadHistory, reset };
}
