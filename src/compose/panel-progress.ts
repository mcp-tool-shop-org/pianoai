// Pure mapping from a panel vote-step to an MCP progress notification (P9-004).
// compose_panel sends this when the client provided a progressToken; the
// SDK client then resets its request timeout on each notification.

export interface PanelVoteStep {
  songId: string;
  judgeFamily: string;
  judgeModel?: string;
  step: number;
  total: number;
  dropped: boolean;
}

export function panelProgressNotification(
  progressToken: string | number,
  step: PanelVoteStep,
): {
  method: "notifications/progress";
  params: { progressToken: string | number; progress: number; total: number; message: string };
} {
  const pair = `${step.songId} × ${step.judgeFamily}`;
  return {
    method: "notifications/progress",
    params: {
      progressToken,
      progress: step.step,
      total: step.total,
      message: step.dropped ? `${pair}: unparseable vote dropped` : pair,
    },
  };
}
