// SSE 帧封装（协议见 spec §3.4）
import type { SSEEvent } from "./types";

export function sseFrame(ev: SSEEvent): string {
  return `event: message\ndata: ${JSON.stringify(ev)}\n\n`;
}

export const SSE_PING = `: ping\n\n`;
