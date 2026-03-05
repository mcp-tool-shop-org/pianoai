import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'AI Jam Sessions',
  description: 'An MCP server that teaches AI to play piano and guitar — and sing. 120 songs across 12 genres, six sound engines, browser cockpit, and practice journal.',
  logoBadge: 'JS',
  brandName: 'AI Jam Sessions',
  repoUrl: 'https://github.com/mcp-tool-shop-org/ai-jam-sessions',
  npmUrl: 'https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions',
  footerText: 'MIT Licensed — built by <a href="https://github.com/mcp-tool-shop-org" style="color:var(--color-muted);text-decoration:underline">mcp-tool-shop-org</a>',

  hero: {
    badge: 'MCP Server',
    headline: 'AI Jam Sessions.',
    headlineAccent: 'Machine learning the old fashioned way.',
    description: 'An MCP server that teaches AI to play piano and guitar — and sing. 120 songs across 12 genres. Six sound engines. Interactive guitar tablature. A browser cockpit with vocal synthesizer. A practice journal that remembers everything.',
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
          title: '31 MCP Tools',
          desc: 'Learn, play, sing, build — browse songs, play at any speed, render piano rolls, write annotations, and journal reflections.',
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
        ['Sample Piano', 'WAV playback', 'Salamander Grand Piano — 480 samples, 16 velocity layers, 88 keys'],
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
      subtitle: '31 tools across four categories: Learn, Play, Sing, and Build.',
      columns: ['Tool', 'Category', 'Description'],
      rows: [
        ['`list_songs`', 'Learn', 'Browse by genre, difficulty, or keyword'],
        ['`song_info`', 'Learn', 'Full musical analysis — structure, key moments, teaching goals'],
        ['`suggest_song`', 'Learn', 'Recommendation based on genre, difficulty, and play history'],
        ['`practice_setup`', 'Learn', 'Recommended speed, mode, voice settings for a song'],
        ['`play_song`', 'Play', 'Play through speakers — any engine, speed, mode, measure range'],
        ['`view_piano_roll`', 'Play', 'Render as SVG (hand color or pitch-class chromatic rainbow)'],
        ['`sing_along`', 'Sing', 'Singable text — note-names, solfege, contour, or syllables'],
        ['`view_guitar_tab`', 'Guitar', 'Render interactive guitar tablature as HTML'],
        ['`tune_guitar`', 'Guitar', 'Adjust any parameter of any guitar voice'],
        ['`annotate_song`', 'Build', 'Write musical language for a raw song and promote it'],
        ['`save_practice_note`', 'Build', 'Journal entry with auto-captured session data'],
        ['`tune_keyboard`', 'Build', 'Adjust any parameter of any keyboard voice'],
      ],
    },
  ],
};
