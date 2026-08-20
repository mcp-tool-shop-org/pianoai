// Pure mapping from a panel vote-step to an MCP progress notification (P9-004).
// compose_panel sends this when the client provided a progressToken; the
// SDK client then resets its request timeout on each notification.
//
// Cadence matters as much as wiring: a completion-only stream leaves the
// FIRST notification until after realization plus one whole judgment — on a
// cold model that exceeds the SDK's 60s default window and the client times
// out before any reset. "start" events (realization begins; each judgment
// begins) keep notifications flowing from the first second, so no gap is
// ever longer than a single judgment.

export interface PanelVoteStep {
  songId: string;
  judgeFamily: string;
  judgeModel?: string;
  step: number;
  total: number;
  dropped: boolean;
  /** "start" = the step is beginning (realization or a judgment); absent/"done" = completed. */
  phase?: "start" | "done";
}

/** The judgeFamily used for the per-song realization start event. */
export const REALIZE_STEP_FAMILY = "realize";

export function panelProgressNotification(
  progressToken: string | number,
  step: PanelVoteStep,
): {
  method: "notifications/progress";
  params: { progressToken: string | number; progress: number; total: number; message: string };
} {
  const pair = `${step.songId} × ${step.judgeFamily}`;
  let message: string;
  if (step.phase === "start") {
    message =
      step.judgeFamily === REALIZE_STEP_FAMILY
        ? `${step.songId}: realizing the systems…`
        : `${pair}: judging…`;
  } else {
    message = step.dropped ? `${pair}: unparseable vote dropped` : pair;
  }
  return {
    method: "notifications/progress",
    params: {
      progressToken,
      progress: step.step,
      total: step.total,
      message,
    },
  };
}
