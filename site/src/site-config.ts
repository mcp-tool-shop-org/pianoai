import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'AI Jam Sessions',
  description: 'An MCP server that teaches AI to play piano and guitar — and sing. 120 songs across 12 genres, six sound engines, browser cockpit, practice journal — and jam-actions-v0, a public 115-record tool-use dataset.',
  logoBadge: 'JS',
  brandName: 'AI Jam Sessions',
  repoUrl: 'https://github.com/mcp-tool-shop-org/ai-jam-sessions',
  npmUrl: 'https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions',
  footerText: 'MIT Licensed — built by <a href="https://github.com/mcp-tool-shop-org" style="color:var(--color-muted);text-decoration:underline">mcp-tool-shop-org</a>',

  hero: {
    badge: 'MCP Server',
    headline: 'AI Jam Sessions.',
    headlineAccent: 'Machine learning the old fashioned way.',
    description: 'An MCP server that teaches AI to play piano and guitar — and sing. 120 songs across 12 genres. Six sound engines. Interactive guitar tablature. A browser cockpit with vocal synthesizer. A practice journal that remembers everything. Plus jam-actions-v0, a 115-record public dataset of multi-turn MCP tool-use traces over classical piano.',
    primaryCta: { href: '#quick-start', label: 'Get started' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Install', code: 'npm install -g @mcptoolshop/ai-jam-sessions' },
      { label: 'Play', code: 'ai-jam-sessions play fur-elise --engine piano --speed 0.7' },
      { label: 'Sing', code: 'ai-jam-sessions sing imagine --with-piano' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'What makes it tick',
      subtitle: 'Five senses for a model that has none.',
      features: [
        {
          title: 'Reading',
          desc: 'Real MIDI sheet music with deep musical annotations — parsed, analyzed, and explained. Not hand-written approximations.',
        },
        {
          title: 'Hearing',
          desc: 'Six audio engines play through your speakers so the humans in the room become the AI\'s ears.',
        },
        {
          title: 'Seeing',
          desc: 'Piano roll renders as SVG the model can read back. Interactive guitar tablature. Browser cockpit with visual keyboard.',
        },
        {
          title: 'Remembering',
          desc: 'Practice journal persists across sessions. Next time, the AI reads its journal and picks up where it left off.',
        },
        {
          title: 'Singing',
          desc: 'Vocal tract synthesis with 20 voice presets. Sing-along mode with solfege, contour, and syllable narration.',
        },
        {
          title: '42 MCP Tools + 3 Prompts',
          desc: 'Learn, play, sing, build, score — browse songs, transpose keys, mute hands, preview teaching cues, render piano rolls, write annotations, and journal reflections.',
        },
        {
          title: 'A Training Dataset to Match',
          desc: 'jam-actions-v0 — a public corpus of 115 multi-turn MCP tool-use traces over classical piano, with a 7-axis release gate and cold-start reproducibility. CC-BY-SA-3.0-DE.',
        },
      ],
    },
    {
      kind: 'features',
      id: 'training-dataset',
      title: 'jam-actions-v0 — a public training dataset',
      subtitle: 'Multi-turn MCP tool-use traces over real classical piano. Grounded tool-use over symbolic music — not just text generation.',
      features: [
        {
          title: '115 records · 8 piano pieces',
          desc: 'Public subset of the full corpus: 8 classical-piano arrangements from piano-midi.de across 6 composers (Bach, Beethoven, Chopin, Debussy, Mozart, Schumann). 16-record canonical post-repair baseline.',
        },
        {
          title: '7-axis release gate',
          desc: 'Absolute floor, margin compound, tool-use rate, correct-after-tool, misinterpretation count, stratum floor (all blocking); enriched-vs-non reporting (informational). Admits a ceiling-saturated bucket so trivial wins do not dilute harder strata.',
        },
        {
          title: 'Reproducible in under a minute',
          desc: 'pnpm install, run the checksum verifier, run the release-gate CLI against the canonical baseline. .gitattributes pins LF for sha256 + dataset tree so it works on Windows native, macOS, Linux, and WSL.',
        },
        {
          title: 'Slice 22 baseline PASSES',
          desc: 'The revised gate (axes 2 + 6 with ceiling_saturated_pass) admits the canonical baseline cleanly. The Slice 19 baseline still FAILS — kept as a regression diagnostic so the gate has teeth.',
        },
        {
          title: 'Cited and licensed end-to-end',
          desc: 'CITATION.cff, Zenodo deposition metadata (13 fields, ISO 639-3 language code), CC-BY-SA-3.0-DE preserved across the MIDI arrangements (Krueger) and the annotations + traces + evals (mcp-tool-shop-org).',
        },
        {
          title: 'Honest about provenance',
          desc: 'Two songs in the source corpus (Satie, Debussy) are NOT in the public subset because their piano-midi.de provenance could not be verified during URL audit. Excluded rather than included on faith.',
        },
      ],
    },
    {
      kind: 'code-cards',
      id: 'dataset-quick-start',
      title: 'Use the dataset',
      cards: [
        {
          title: 'Verify the package',
          code: `git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions && pnpm install

# 274 checksum entries; ~2 seconds.
pnpm exec tsx scripts/verify-public-package-checksums.ts`,
        },
        {
          title: 'Reproduce the canonical PASS',
          code: `pnpm exec tsx scripts/check-release-gate.ts \\
  datasets/jam-actions-v0-public/evals/\\
slice21-fair-e3-baseline-results.json
# → "Aggregate: PASS" (exit 0)`,
        },
        {
          title: 'Read the dataset card',
          code: `# Full HF-format dataset card + YAML frontmatter
open datasets/jam-actions-v0-public/README.md

# Zenodo deposition metadata (13 fields)
cat datasets/jam-actions-v0-public/zenodo-metadata.json`,
        },
        {
          title: 'Cite it',
          code: `# Citation File Format (CFF)
cat datasets/jam-actions-v0-public/CITATION.cff

# Bernd Krueger (piano-midi.de) for the MIDI arrangements.
# mcp-tool-shop-org for the annotations, traces, and evals.
# Both under CC-BY-SA-3.0-DE.`,
        },
      ],
    },
    {
      kind: 'code-cards',
      id: 'quick-start',
      title: 'Quick start',
      cards: [
        {
          title: 'Install globally',
          code: `npm install -g @mcptoolshop/ai-jam-sessions`,
        },
        {
          title: 'Claude Desktop config',
          code: `{
  "mcpServers": {
    "ai_jam_sessions": {
      "command": "npx",
      "args": [
        "-y", "-p",
        "@mcptoolshop/ai-jam-sessions",
        "ai-jam-sessions-mcp"
      ]
    }
  }
}`,
        },
        {
          title: 'Play a song',
          code: `# Play Fur Elise at 70% speed
ai-jam-sessions play fur-elise --speed 0.7

# View piano roll as SVG
ai-jam-sessions view autumn-leaves --measures 1-16

# Sing along with piano
ai-jam-sessions sing imagine --with-piano`,
        },
        {
          title: 'Guitar tablature',
          code: `# View interactive guitar tab
ai-jam-sessions view-guitar greensleeves

# List tunings and voices
ai-jam-sessions list --genre folk`,
        },
      ],
    },
    {
      kind: 'data-table',
      id: 'sound-engines',
      title: 'Sound engines',
      subtitle: 'Six engines plus a layered combinator that runs any two simultaneously.',
      columns: ['Engine', 'Type', 'Character'],
      rows: [
        ['Oscillator Piano', 'Additive synthesis', 'Multi-harmonic piano with hammer noise, 48-voice polyphony, stereo imaging'],
        ['Sample Piano', 'WAV playback', 'Salamander Grand Piano — 480 samples, 16 velocity layers, 88 keys (programmatic API; samples user-supplied)'],
        ['Vocal (Sample)', 'Pitch-shifted samples', 'Sustained vowel tones with portamento and legato mode'],
        ['Vocal Tract', 'Physical model', 'LF glottal waveform through 44-cell digital waveguide. Soprano, alto, tenor, bass'],
        ['Vocal Synth', 'Additive synthesis', '15 Kokoro voice presets with formant shaping, breathiness, vibrato'],
        ['Guitar', 'Additive synthesis', 'Physically-modeled plucked string — 4 presets, 8 tunings, 17 tunable parameters'],
        ['Layered', 'Combinator', 'Wraps two engines, dispatches every MIDI event to both'],
      ],
    },
    {
      kind: 'data-table',
      id: 'genres',
      title: 'Song library',
      subtitle: '120 songs across 12 genres. Each genre has a deeply annotated exemplar.',
      columns: ['Genre', 'Exemplar', 'Key', 'Teaches'],
      rows: [
        ['Blues', 'The Thrill Is Gone', 'B minor', 'Minor blues form, call-and-response'],
        ['Classical', 'Fur Elise', 'A minor', 'Rondo form, touch differentiation'],
        ['Film', 'Comptine d\'un autre ete', 'E minor', 'Arpeggiated textures, dynamic architecture'],
        ['Folk', 'Greensleeves', 'E minor', '3/4 waltz feel, modal mixture'],
        ['Jazz', 'Autumn Leaves', 'G minor', 'ii-V-I progressions, swing eighths'],
        ['Latin', 'The Girl from Ipanema', 'F major', 'Bossa nova rhythm, chromatic modulation'],
        ['New-Age', 'River Flows in You', 'A major', 'I-V-vi-IV recognition, flowing arpeggios'],
        ['Pop', 'Imagine', 'C major', 'Arpeggiated accompaniment, restraint'],
        ['Ragtime', 'The Entertainer', 'C major', 'Oom-pah bass, syncopation'],
        ['R&B', 'Superstition', 'Eb minor', '16th-note funk, percussive keyboard'],
        ['Rock', 'Your Song', 'Eb major', 'Piano ballad voice-leading'],
        ['Soul', 'Lean on Me', 'C major', 'Diatonic melody, gospel accompaniment'],
      ],
    },
    {
      kind: 'data-table',
      id: 'tools',
      title: 'MCP tools',
      subtitle: '42 tools and 3 prompt templates across six categories: Learn, Play, Sing, Guitar, Build, and Score.',
      columns: ['Tool', 'Category', 'Description'],
      rows: [
        ['`list_songs`', 'Learn', 'Browse by genre, difficulty, or keyword'],
        ['`song_info`', 'Learn', 'Full musical analysis — structure, key moments, teaching goals'],
        ['`suggest_song`', 'Learn', 'Recommendation based on genre, difficulty, and play history'],
        ['`practice_setup`', 'Learn', 'Recommended speed, mode, voice settings for a song'],
        ['`compare_songs`', 'Learn', 'Cross-genre pattern recognition — key relationships, shared forms, teaching connections'],
        ['`play_song`', 'Play', 'Play through speakers — any engine, speed, mode, measure range'],
        ['`view_piano_roll`', 'Play', 'Render as SVG (hand color or pitch-class chromatic rainbow)'],
        ['`sing_along`', 'Sing', 'Singable text — note-names, solfege, contour, or syllables'],
        ['`view_guitar_tab`', 'Guitar', 'Render interactive guitar tablature as HTML'],
        ['`tune_guitar`', 'Guitar', 'Adjust any parameter of any guitar voice'],
        ['`annotate_song`', 'Build', 'Write musical language for a raw song and promote it'],
        ['`save_practice_note`', 'Build', 'Journal entry with auto-captured session data'],
        ['`tune_keyboard`', 'Build', 'Adjust any parameter of any keyboard voice'],
        ['`score_performance`', 'Score', 'Score a MIDI play-along — pitch accuracy, timing, graded feedback'],
        ['`score_annotation`', 'Score', 'Score annotation quality across 5 dimensions'],
        ['`annotation_progress`', 'Score', 'Track annotation quality across the library'],
      ],
    },
  ],
};
