import { describe, it, expect } from "vitest";
import { panelProgressNotification } from "./panel-progress.js";

describe("panelProgressNotification — P9-004 wiring", () => {
  const base = {
    songId: "fur-elise",
    judgeFamily: "mistral",
    judgeModel: "mistral-small:24b",
    step: 2,
    total: 4,
    dropped: false,
  };

  it("emits notifications/progress with token, step/total, and song × judge", () => {
    const n = panelProgressNotification("tok-1", base);
    expect(n.method).toBe("notifications/progress");
    expect(n.params).toEqual({
      progressToken: "tok-1",
      progress: 2,
      total: 4,
      message: "fur-elise × mistral",
    });
  });

  it("marks a dropped (unparseable) vote in the message", () => {
    const n = panelProgressNotification(7, { ...base, dropped: true });
    expect(n.params.progressToken).toBe(7);
    expect(n.params.message).toBe("fur-elise × mistral: unparseable vote dropped");
  });

  it("a judge start event says judging — the cold-start timeout shield (P9-004)", () => {
    const n = panelProgressNotification("tok-1", { ...base, step: 1, phase: "start" });
    expect(n.params.message).toBe("fur-elise × mistral: judging…");
    expect(n.params.progress).toBe(1);
  });

  it("a realization start event names the song, not a judge", () => {
    const n = panelProgressNotification("tok-1", {
      ...base,
      judgeFamily: "realize",
      step: 0,
      phase: "start",
    });
    expect(n.params.message).toBe("fur-elise: realizing the systems…");
  });
});
