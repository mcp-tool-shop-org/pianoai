<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="logo-banner.png" alt="AI Jam Sessions" width="520" />
</p>

<p align="center">
  <em>Machine Learning the Old Fashioned Way</em>
</p>

<p align="center">
  An MCP server that teaches AI to play piano and guitar — and sing.<br/>
  120 songs across 12 genres. Six sound engines. Interactive guitar tablature.<br/>
  A browser cockpit with vocal synthesizer. A practice journal that remembers everything.
</p>

[![CI](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/mcp-tool-shop-org/ai-jam-sessions/branch/main/graph/badge.svg)](https://codecov.io/gh/mcp-tool-shop-org/ai-jam-sessions)
[![npm](https://img.shields.io/npm/v/@mcptoolshop/ai-jam-sessions)](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions)
[![Songs](https://img.shields.io/badge/songs-120_across_12_genres-blue)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)
[![Ready](https://img.shields.io/badge/annotated-24-green)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)

---

## Cos'è questo?

Un pianoforte e una chitarra che un'intelligenza artificiale impara a suonare. Non un sintetizzatore, né una libreria MIDI, ma uno strumento didattico.

Un modello linguistico (LLM) può leggere e scrivere testi, ma non può sperimentare la musica come noi. Non ha orecchie, dita o memoria muscolare. AI Jam Sessions colma questa lacuna fornendo al modello dei "sensi" che può effettivamente utilizzare:

- **Lettura** — spartiti MIDI reali con annotazioni musicali dettagliate. Non approssimazioni scritte a mano, ma partiture analizzate, spiegate e interpretate.
- **Ascolto** — sei motori audio (pianoforte a oscillatore, pianoforte a campioni, campioni vocali, tratto vocale fisico, sintetizzatore vocale additivo, chitarra modellata fisicamente) che riproducono l'audio attraverso i tuoi altoparlanti, in modo che le persone nella stanza diventino le "orecchie" dell'IA.
- **Visione** — una rappresentazione grafica della musica (piano roll) che visualizza ciò che è stato suonato in formato SVG, un formato che il modello può leggere e verificare. Un editor interattivo di tablature per chitarra. Un'interfaccia web con una tastiera visiva, un editor di note in modalità duale e un laboratorio di accordatura.
- **Memoria** — un diario di pratica che viene salvato tra le sessioni, in modo che l'apprendimento si accumuli nel tempo.
- **Canto** — sintesi del tratto vocale con 20 preset vocali, dall' soprano operistico a un coro elettronico. Modalità di accompagnamento con solfeggio, contorno e narrazione delle sillabe.

Ogni uno dei 12 generi musicali ha un esempio ricco di annotazioni: un brano di riferimento che l'IA studia per prima, con contesto storico, analisi strutturale battuta per battuta, momenti chiave, obiettivi didattici e suggerimenti per l'esecuzione. Gli altri 96 brani sono file MIDI grezzi, in attesa che l'IA ne assimili i modelli, suoni la musica e scriva le proprie annotazioni.

## La rappresentazione grafica della musica (Piano Roll)

La rappresentazione grafica della musica (piano roll) è il modo in cui l'IA "vede" la musica. Visualizza qualsiasi brano in formato SVG: blu per la mano destra, corallo per la mano sinistra, con griglie di battito, dinamiche e confini delle misure:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Due modalità di colore: **mano** (blu/corallo) o **altezza** (arcobaleno cromatico: ogni Do è rosso, ogni Fa# è ciano). Il formato SVG consente al modello di vedere l'immagine e di leggere il codice sorgente per verificare l'intonazione, il ritmo e l'indipendenza delle mani.

## L'interfaccia

Un'interfaccia web per strumenti e studio vocale che si apre insieme al server MCP. Nessun plugin, nessuna DAW, solo una pagina web con un pianoforte.

- **Roll di pianoforte a doppia modalità** — passa tra la modalità Strumento (colori cromatici delle note) e la modalità Voce (note colorate in base alla forma della vocale: /a/ /e/ /i/ /o/ /u/).
- **Tastiera visiva** — due ottave dal Do4, mappate alla tastiera QWERTY. Clicca o digita.
- **20 preset vocali** — 15 voci mappate a Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, più coro e voce sintetizzata), 4 voci mappate a tracce e una sezione di coro sintetico.
- **10 preset di strumenti** — i 6 suoni di pianoforte lato server, più synth-pad, organo, campane e archi.
- **Ispettore delle note** — clicca su qualsiasi nota per modificare la velocità, la vocale e la brillantezza.
- **7 sistemi di accordatura** — Temperamento equabile, intonazione giusta (maggiore/minore), pitagorico, meantone a quarto di comma, Werckmeister III, o offset personalizzati in centesimi. Riferimento A4 regolabile (392–494 Hz).
- **Controllo dell'accordatura** — tabella delle frequenze, tester degli intervalli con analisi della frequenza di battuta e importazione/esportazione dell'accordatura.
- **Importazione/esportazione dello spartito** — serializza l'intero spartito come JSON e ricaricalo.
- **API per LLM** — `window.__cockit` espone `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` e `getScore()` in modo che un LLM possa comporre, arrangiare e riprodurre programmi.

## Il ciclo di apprendimento

```
 Read                 Play                See                 Reflect
┌──────────┐     ┌───────────┐     ┌────────────┐     ┌──────────────┐
│ Study the │     │ Play the  │     │ View the   │     │ Write what   │
│ exemplar  │ ──▶ │ song at   │ ──▶ │ piano roll │ ──▶ │ you learned  │
│ analysis  │     │ any speed │     │ to verify  │     │ in journal   │
└──────────┘     └───────────┘     └────────────┘     └──────┬───────┘
                                                             │
                                                             ▼
                                                    ┌──────────────┐
                                                    │ Next session  │
                                                    │ picks up here │
                                                    └──────────────┘
```

## La libreria di canzoni

120 canzoni in 12 generi, create da file MIDI reali. Ogni genere ha un esempio dettagliatamente annotato, con contesto storico, analisi armonica riga per riga, momenti chiave, obiettivi didattici e suggerimenti per l'esecuzione (inclusi suggerimenti vocali). Questi esempi fungono da modelli: l'IA ne studia uno, quindi annota gli altri.

| Genere | Esempio | Tonalità | Cosa insegna |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | Mi minore | Forma blues minore, risposta e richiamo, suonare dietro il tempo. |
| Classica | Für Elise (Beethoven) | La minore | Forma rondò, differenziazione del tocco, disciplina del pedale. |
| Colonna sonora | Comptine d'un autre été (Tiersen) | Mi minore | Texture arpeggiate, architettura dinamica senza cambiamento armonico. |
| Folk | Greensleeves | Mi minore | 3/4, valzer, mescolanza modale, stile vocale rinascimentale. |
| Jazz | Autumn Leaves (Kosma) | Si minore | Progressioni ii-V-I, note guida, ottavi swing, voicing senza fondamentale. |
| Latina | The Girl from Ipanema (Jobim) | Do maggiore | Ritmo bossa nova, modulazione cromatica, restrizione vocale. |
| New-Age | River Flows in You (Yiruma) | Do maggiore | Riconoscimento I-V-vi-IV, arpeggi fluidi, rubato. |
| Pop | Imagine (Lennon) | Do maggiore | Accompagnamento arpeggiato, restrizione, sincerità vocale. |
| Ragtime | The Entertainer (Joplin) | Do maggiore | Basso "oom-pah", sincopazione, forma a più sezioni, disciplina del tempo. |
| R&B | Superstition (Stevie Wonder) | Si minore | Funk a sedicesimi, tastiera percussiva, note fantasma. |
| Rock | Your Song (Elton John) | Do maggiore | Voic leading di pianoforte, inversioni, canto conversazionale. |
| Soul | Lean on Me (Bill Withers) | Do maggiore | Melodia diatonica, accompagnamento gospel, risposta e richiamo. |

Le canzoni progrediscono da **grezza** (solo MIDI) → **annotata** → **pronta** (completamente riproducibile con linguaggio musicale). L'IA promuove le canzoni studiandole e scrivendo annotazioni con `annotate_song`.

## Motori Sonori

Sei motori, più un combinatore a strati che ne fa funzionare due contemporaneamente:

| Motore | Tipo | Descrizione del suono |
|--------|------|---------------------|
| **Oscillator Piano** | Sintesi additiva | Pianoforte multi-armonico con rumore delle martellette, inarmonia, polifonia a 48 voci, imaging stereo. Nessuna dipendenza. |
| **Sample Piano** | Riproduzione di file WAV | Pianoforte a coda Salamander — 480 campioni, 16 livelli di velocity, 88 tasti. La versione reale. |
| **Vocal (Sample)** | Campioni con variazione di altezza | Timbri vocalici prolungati con portamento e modalità legato. |
| **Vocal Tract** | Modello fisico | Trombone "Pink" — Forma d'onda glottale a bassa frequenza attraverso un waveguide digitale a 44 celle. Quattro preset: soprano, contralto, tenore, basso. |
| **Vocal Synth** | Sintesi additiva | 15 preset di voci "Kokoro" con modellazione delle formanti, respiro, vibrato. Deterministic (generatore di numeri casuali con seme). |
| **Guitar** | Sintesi additiva | Corda pizzicata modellata fisicamente — 4 preset (chitarra dreadnought in acciaio, classica in nylon, jazz archtop, a 12 corde), 8 accordature, 17 parametri regolabili. |
| **Layered** | Combinatore | Combina due motori e invia ogni evento MIDI a entrambi: pianoforte+sintetizzatore, voce+sintetizzatore, ecc. |

### Voci per tastiera

Sei voci di pianoforte regolabili, ognuna con parametri modificabili (brillantezza, decadimento, durezza delle martellette, disaccordatura, ampiezza stereo e altro):

| Voce | Caratteristica |
|-------|-----------|
| Pianoforte a coda da concerto | Ricco, pieno, classico |
| Pianoforte verticale | Caldo, intimo, folk |
| Pianoforte elettrico | Suono vellutato, jazz, tipico di un Fender Rhodes |
| Pianoforte "Honky-Tonk" | Stonato, ragtime, saloon |
| Scatola musicale | Cristallino, etereo |
| Pianoforte brillante | Brillante, contemporaneo, pop |

### Voci di chitarra

Quattro preset di voci di chitarra con sintesi di corde modellata fisicamente, ognuno con 17 parametri regolabili (brillantezza, risonanza del corpo, posizione della pizzicata, smorzamento delle corde e altro):

| Voce | Caratteristica |
|-------|-----------|
| Chitarra dreadnought in acciaio | Brillante, equilibrato, suono acustico classico |
| Chitarra classica in nylon | Caldo, morbido, rotondo |
| Chitarra jazz archtop | Suono dolce, legnoso, pulito |
| Chitarra a 12 corde | Brillante, doppia, simile a un chorus |

## Il Diario di Pratica

Dopo ogni sessione, il server registra ciò che è successo: quale canzone, a che velocità, quante battute, per quanto tempo. L'intelligenza artificiale aggiunge le proprie riflessioni: cosa ha notato, quali schemi ha riconosciuto, cosa provare successivamente.

```markdown
---
### 14:32 — Autumn Leaves
**jazz** | intermediate | G minor | 69 BPM × 0.7 | 32/32 measures | 45s

The ii-V-I in bars 5-8 (Cm7-F7-BbMaj7) is the same gravity as the V-i
in The Thrill Is Gone, just in major. Blues and jazz share more than the
genre labels suggest.

Next: try at full speed. Compare the Ipanema bridge modulation with this.
---
```

Un file Markdown al giorno, salvato in `~/.ai-jam-sessions/journal/`. Leggibile dagli umani, solo in scrittura (append-only). Nella sessione successiva, l'intelligenza artificiale legge il suo diario e riprende da dove aveva lasciato.

## Installazione

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

Richiede **Node.js 18+**. Nessun driver MIDI, nessuna porta virtuale, nessun software esterno.

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "ai_jam_sessions": {
      "command": "npx",
      "args": ["-y", "-p", "@mcptoolshop/ai-jam-sessions", "ai-jam-sessions-mcp"]
    }
  }
}
```

## MCP Tools

31 strumenti suddivisi in quattro categorie:

### Apprendimento

| Strumento | Cosa fa |
|------|--------------|
| `list_songs` | Navigazione per genere, difficoltà o parola chiave |
| `song_info` | Analisi musicale completa: struttura, momenti chiave, obiettivi didattici, suggerimenti sullo stile |
| `registry_stats` | Statistiche a livello di libreria: numero totale di canzoni, generi, difficoltà |
| `library_progress` | Stato di annotazione per tutti i generi |
| `list_measures` | Note, dinamiche e note didattiche per ogni battuta |
| `teaching_note` | Analisi approfondita di una singola battuta: diteggiatura, dinamiche, contesto |
| `suggest_song` | Raccomandazione basata su genere, difficoltà e ciò che hai già suonato |
| `practice_setup` | Velocità, modalità, impostazioni della voce e comando CLI raccomandati per una canzone |

### Riproduzione

| Strumento | Cosa fa |
|------|--------------|
| `play_song` | Riproduzione tramite altoparlanti: canzoni della libreria o file .mid grezzi. Qualsiasi motore, velocità, modalità, intervallo di battute. |
| `stop_playback` | Stop |
| `pause_playback` | Pausa o riprendi. |
| `set_speed` | Modifica la velocità durante la riproduzione (da 0.1x a 4.0x). |
| `playback_status` | Scatto istantaneo: misura corrente, tempo, velocità, timbro della tastiera, stato. |
| `view_piano_roll` | Rendering in formato SVG (colorazione manuale o arcobaleno cromatico basato sull'altezza). |

### Canta

| Strumento | Cosa fa |
|------|--------------|
| `sing_along` | Testo cantabile: nomi delle note, solfeggio, contorno o sillabe. Con o senza accompagnamento di pianoforte. |
| `ai_jam_sessions` | Genera una bozza per improvvisare: progressione di accordi, schema melodico e suggerimenti di stile per la reinterpretazione. |

### Chitarra

| Strumento | Cosa fa |
|------|--------------|
| `view_guitar_tab` | Rendering di tablature interattive per chitarra in formato HTML: modifica con un clic, cursore di riproduzione, scorciatoie da tastiera. |
| `list_guitar_voices` | Preset di timbri per chitarra disponibili. |
| `list_guitar_tunings` | Sistemi di accordatura per chitarra disponibili (standard, drop-D, open G, DADGAD, ecc.). |
| `tune_guitar` | Regola qualsiasi parametro di qualsiasi timbro per chitarra. Le impostazioni vengono salvate tra le sessioni. |
| `get_guitar_config` | Configurazione corrente del timbro della chitarra rispetto alle impostazioni predefinite. |
| `reset_guitar` | Ripristina le impostazioni predefinite di un timbro per chitarra. |

### Compila

| Strumento | Cosa fa |
|------|--------------|
| `add_song` | Aggiungi una nuova canzone in formato JSON. |
| `import_midi` | Importa un file .mid con metadati. |
| `annotate_song` | Scrivi il linguaggio musicale per una canzone e trasformala in una versione completa. |
| `save_practice_note` | Voce del diario con dati della sessione acquisiti automaticamente. |
| `read_practice_journal` | Carica le voci recenti per avere un contesto. |
| `list_keyboards` | Timbri per tastiera disponibili. |
| `tune_keyboard` | Regola qualsiasi parametro di qualsiasi timbro per tastiera. Le impostazioni vengono salvate tra le sessioni. |
| `get_keyboard_config` | Configurazione corrente rispetto alle impostazioni predefinite. |
| `reset_keyboard` | Ripristina le impostazioni predefinite di un timbro per tastiera. |

## Interfaccia a riga di comando (CLI)

```
ai-jam-sessions list [--genre <genre>] [--difficulty <level>]
ai-jam-sessions play <song-id> [--speed <mult>] [--mode <mode>] [--engine <piano|vocal|tract|synth|guitar|piano+synth|guitar+synth>]
ai-jam-sessions sing <song-id> [--with-piano] [--engine <engine>]
ai-jam-sessions view <song-id> [--measures <start-end>] [--out <file.svg>]
ai-jam-sessions view-guitar <song-id> [--measures <start-end>] [--tuning <tuning>]
ai-jam-sessions info <song-id>
ai-jam-sessions stats
ai-jam-sessions library
ai-jam-sessions ports
```

## Stato

Versione 0.3.0. Sei motori audio, 31 strumenti MCP, 120 canzoni in 12 generi con esempi dettagliatamente annotati. Editor interattivo di tablature per chitarra. Interfaccia web con 20 preset vocali, 10 timbri per strumenti, 7 sistemi di accordatura e un'API per partiture compatibile con modelli linguistici di grandi dimensioni (LLM). Visualizzazione del piano roll in due modalità di colore. Diario di pratica per l'apprendimento continuo. Tutti i file MIDI sono presenti: la libreria cresce man mano che l'intelligenza artificiale impara.

## Sicurezza e privacy

**Dati accessibili:** libreria di canzoni (JSON + MIDI), directory delle canzoni dell'utente (`~/.ai-jam-sessions/songs/`), configurazioni di accordatura per chitarra, voci del diario di pratica, dispositivo di output audio locale.

**Dati NON accessibili:** nessuna API cloud, nessuna credenziale utente, nessun dato di navigazione, nessun file di sistema al di fuori della directory delle canzoni dell'utente. Non vengono raccolti o trasmessi dati di telemetria.

**Autorizzazioni:** Il server MCP utilizza solo il trasporto stdio (nessun HTTP). L'interfaccia a riga di comando accede al file system locale e ai dispositivi audio. Consulta [SECURITY.md](SECURITY.md) per la politica completa.

## Licenza

MIT.
