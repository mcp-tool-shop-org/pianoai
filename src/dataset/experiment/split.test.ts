import { describe, it, expect } from "vitest";
import { assertNoStraddle } from "./split.js";
import { acousticTask, acousticCases } from "../acoustic/task.js";
import { TEST_SONG_ID, TRAIN_SONG_IDS } from "../acoustic/phrases.js";

describe("assertNoStraddle", () => {
  it("throws when two records sharing a splitKey land on both sides", () => {
    const items = [
      { key: "phrase-a", split: "train" as const },
      { key: "phrase-a", split: "test" as const },
    ];
    expect(() =>
      assertNoStraddle(
        items,
        (c) => c.key,
        (c) => c.split,
      ),
    ).toThrow(/straddles/);
  });

  it("allows many records of one key on one side", () => {
    expect(() =>
      assertNoStraddle(
        [
          { key: "a", split: "train" as const },
          { key: "a", split: "train" as const },
          { key: "b", split: "test" as const },
        ],
        (c) => c.key,
        (c) => c.split,
      ),
    ).not.toThrow();
  });
});

describe("acoustic task split", () => {
  it("never lets a phrase straddle train/test", () => {
    const cases = acousticCases();
    assertNoStraddle(
      cases,
      (c) => acousticTask.splitKey(c),
      (c) => (c.phrase.song_id === TEST_SONG_ID ? "test" : "train"),
    );
    expect(TRAIN_SONG_IDS.every((id) => id !== TEST_SONG_ID)).toBe(true);
  });
});
