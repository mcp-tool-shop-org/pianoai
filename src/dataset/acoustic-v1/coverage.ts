import { COVERAGE_FLOORS, V1_SCHEMA_VERSION, type CoverageReport, type V1Record } from "./schema.js";
import { toolSequenceOf } from "./builder.js";

export function coverageReport(records: V1Record[]): CoverageReport {
  const tools = new Set<string>();
  const songs = new Set<string>();
  const genres = new Set<string>();
  const keys = new Set<string>();
  const shapes = new Map<string, number>();
  const families = new Map<string, number>();

  for (const r of records) {
    for (const turn of r.target_trace.session) {
      if (turn.role === "assistant" && turn.tool_calls) {
        for (const tc of turn.tool_calls) tools.add(tc.tool);
      }
    }
    if (r.family !== "compare") songs.add(r.scope.song_id);
    if (r.family === "compare") {
      for (const id of r.scope.song_id.split("|")) songs.add(id);
    }
    genres.add(r.provenance.verdict_reason.includes("folk") ? "folk" : r.scope.key);
    keys.add(r.scope.key);
    const shape = toolSequenceOf(r);
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
    families.set(r.family, (families.get(r.family) ?? 0) + 1);
  }

  // genres from records: better from library via song_id is messy; count unique
  // keys already. Recompute genres from song ids in the loader at generate time
  // if needed. Here we keep keys; generate-corpus overwrites genres properly.

  const shapeObj = Object.fromEntries([...shapes.entries()].sort((a, b) => b[1] - a[1]));
  const majority_shape = Object.keys(shapeObj)[0] ?? "";
  const majority_n = shapeObj[majority_shape] ?? 0;
  const majority_shape_share = records.length === 0 ? 0 : majority_n / records.length;

  const toolList = [...tools].sort();
  const songList = [...songs].sort();
  const report: CoverageReport = {
    schema_version: V1_SCHEMA_VERSION,
    n: records.length,
    tools: toolList,
    tool_count: toolList.length,
    songs: songList,
    song_count: songList.length,
    genres: [...genres].sort(),
    genre_count: 0,
    keys: [...keys].sort(),
    key_count: keys.size,
    shapes: shapeObj,
    shape_count: shapes.size,
    majority_shape,
    majority_shape_share,
    families: Object.fromEntries(families),
    floors: COVERAGE_FLOORS,
    floors_met: false,
  };
  report.floors_met =
    report.tool_count > COVERAGE_FLOORS.tools &&
    report.song_count > COVERAGE_FLOORS.songs &&
    report.shape_count > COVERAGE_FLOORS.shapes &&
    report.majority_shape_share <= 0.5;
  return report;
}

export function assertCoverageFloors(report: CoverageReport): void {
  const fails: string[] = [];
  if (!(report.tool_count > COVERAGE_FLOORS.tools)) {
    fails.push(`tools ${report.tool_count} (need > ${COVERAGE_FLOORS.tools})`);
  }
  if (!(report.song_count > COVERAGE_FLOORS.songs)) {
    fails.push(`songs ${report.song_count} (need > ${COVERAGE_FLOORS.songs})`);
  }
  if (!(report.shape_count > COVERAGE_FLOORS.shapes)) {
    fails.push(`shapes ${report.shape_count} (need > ${COVERAGE_FLOORS.shapes})`);
  }
  if (report.majority_shape_share > 0.5) {
    fails.push(`majority shape ${report.majority_shape} at ${(report.majority_shape_share * 100).toFixed(1)}%`);
  }
  if (fails.length) {
    throw new Error(`coverage floors not met: ${fails.join("; ")}`);
  }
}
