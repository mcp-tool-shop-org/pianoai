// ─── Generic SFT formatter ───────────────────────────────────────────────────
//
// Any record that carries the common envelope: id, split, kind, song_id,
// and a session of turns. Acoustic-specific guards (clair-de-lune, held-out
// phrase) stay in the acoustic wrapper.

import type { Turn } from "../schema.js";

export const DEFAULT_SYSTEM_TEXT =
  "You are operating AI Jam Sessions, a music education platform.";

export interface SftMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  name?: string;
}

export interface SftLine {
  id: string;
  song_id: string;
  split: "train" | "test";
  kind: string;
  messages: SftMessage[];
}

export interface SftSource {
  id: string;
  split: "train" | "test";
  kind: string;
  song_id: string;
  session: Turn[];
}

export function toSftLine(
  r: SftSource,
  systemText: string = DEFAULT_SYSTEM_TEXT,
): SftLine {
  const messages: SftMessage[] = [{ role: "system", content: systemText }];
  for (const turn of r.session) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content });
    } else if (turn.role === "assistant") {
      const msg: SftMessage = { role: "assistant", content: turn.content ?? "" };
      if (turn.tool_calls && turn.tool_calls.length > 0) {
        msg.tool_calls = turn.tool_calls.map((tc) => ({
          name: tc.tool,
          arguments: tc.arguments,
        }));
      }
      messages.push(msg);
    } else {
      messages.push({
        role: "tool",
        name: turn.tool,
        content: JSON.stringify(turn.content),
      });
    }
  }
  return {
    id: r.id,
    song_id: r.song_id,
    split: r.split,
    kind: r.kind,
    messages,
  };
}

export function formatRecords(records: SftSource[]): { train: SftLine[]; test: SftLine[] } {
  const train: SftLine[] = [];
  const test: SftLine[] = [];
  for (const r of records) {
    const line = toSftLine(r);
    (r.split === "test" ? test : train).push(line);
  }
  return { train, test };
}
