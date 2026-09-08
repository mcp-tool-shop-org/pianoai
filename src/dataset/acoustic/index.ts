export {
  ACOUSTIC_SCHEMA_VERSION,
  PERTURBATION_KINDS,
  GOLD_VERDICTS,
  DEFAULT_ACOUSTIC_THRESHOLDS,
  DRAW_BANDS,
  AcousticRecordSchema,
  parseAcousticRecord,
  type PerturbationKind,
  type GoldVerdict,
  type AcousticThresholds,
  type PhraseNote,
  type AcousticRecipe,
  type AcousticRender,
  type AcousticGold,
  type AcousticObservation,
  type AcousticRecord,
} from "./schema.js";

export {
  RENDER_ENGINE,
  buildRecipe,
  buildRecord,
  buildKindSet,
  renderTake,
  sha256Samples,
  smallestSeedForIndex,
  fixturePhrase,
  type PhraseSpec,
  type BuildOptions,
} from "./builder.js";

export {
  PHRASE_SPECS,
  TRAIN_SONG_IDS,
  TEST_SONG_ID,
  assertNoClairDeLune,
} from "./phrases.js";

export {
  buildAllRecords,
  targetIndexSeeds,
  generateAcousticCorpus,
} from "./generate-corpus.js";

export {
  NO_ENRICHMENT_SPLIT_DECLARATION,
  toReleaseGateInput,
  evaluateAcousticReleaseGate,
  type AcousticAssessment,
} from "./release-adapter.js";
