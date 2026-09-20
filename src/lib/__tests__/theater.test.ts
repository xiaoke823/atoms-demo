// theater 纯函数:时间线统一(user 卡片内联)+ 原始流只计数不进对话文本
import { describe, expect, it } from "vitest";
import {
  applyEvent,
  applyUserPush,
  cardsFromHistory,
  INITIAL_STATE,
} from "../theater";
import type { MessageDTO } from "../types";

const mkMsg = (role: MessageDTO["role"], content: string, id: number): MessageDTO => ({
  id,
  project_id: 1,
  role,
  content,
  createdAt: "",
});

describe("cardsFromHistory（bug2：迭代消息顺序）", () => {
  it("用户消息内联为 user 卡片，与 agent 卡片保持原始时间顺序", () => {
    const { cards } = cardsFromHistory([
      mkMsg("user", "做一个番茄钟", 1),
      mkMsg("pm", '{"name":"番茄钟"}', 2),
      mkMsg("user", "加个暂停按钮", 3),
      mkMsg("engineer", "<html></html>", 4),
    ]);
    expect(cards.map((c) => c.agent)).toEqual(["user", "pm", "user", "engineer"]);
    expect(cards[0].text).toBe("做一个番茄钟");
    expect(cards[2].text).toBe("加个暂停按钮");
  });

  it("最后一条 engineer 消息进 codeText，user 卡片不参与", () => {
    const { codeText } = cardsFromHistory([
      mkMsg("user", "想法", 1),
      mkMsg("engineer", "<html>v1</html>", 2),
      mkMsg("user", "改需求", 3),
      mkMsg("engineer", "<html>v2</html>", 4),
    ]);
    expect(codeText).toBe("<html>v2</html>");
  });
});

describe("applyEvent delta 过滤（bug1：原始 JSON 不进对话文本）", () => {
  it("无 status 的原始流只累计 chars，不进 lines", () => {
    let s = applyEvent(INITIAL_STATE, { type: "stage_start", agent: "pm" });
    s = applyEvent(s, { type: "delta", agent: "pm", text: '{"name":' });
    s = applyEvent(s, { type: "delta", agent: "pm", text: '"番茄钟"}' });
    const card = s.cards[0];
    expect(card.lines).toEqual([]);
    expect(card.chars).toBe('{"name":"番茄钟"}'.length);
  });

  it("status 提示行进 lines", () => {
    let s = applyEvent(INITIAL_STATE, { type: "stage_start", agent: "pm" });
    s = applyEvent(s, { type: "delta", agent: "pm", text: "正在分析需求…", status: true });
    expect(s.cards[0].lines).toEqual(["正在分析需求…"]);
  });

  it("engineer 原始代码累计 chars 并流式进 codeText", () => {
    let s = applyEvent(INITIAL_STATE, { type: "stage_start", agent: "engineer" });
    s = applyEvent(s, { type: "delta", agent: "engineer", text: "<html>" });
    s = applyEvent(s, { type: "delta", agent: "engineer", text: "</html>" });
    expect(s.cards[0].lines).toEqual([]);
    expect(s.cards[0].chars).toBe("<html></html>".length);
    expect(s.codeText).toBe("<html></html>");
  });
});

describe("applyUserPush（bug2：新消息追加在时间线末尾）", () => {
  it("用户卡片追加在已有卡片之后", () => {
    let s = applyUserPush(INITIAL_STATE, "初始想法");
    s = applyEvent(s, { type: "stage_start", agent: "pm" });
    s = applyEvent(s, { type: "stage_done", agent: "pm", artifact: {} });
    s = applyUserPush(s, "加个暂停按钮");
    expect(s.cards.map((c) => c.agent)).toEqual(["user", "pm", "user"]);
    expect(s.cards.at(-1)?.text).toBe("加个暂停按钮");
  });
});
