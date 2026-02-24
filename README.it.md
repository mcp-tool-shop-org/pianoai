<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <strong>Italiano</strong> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo-banner.png" alt="AI Jam Sessions" width="520" />
</p>

<p align="center">
  <em>Machine Learning alla vecchia maniera</em>
</p>

<p align="center">
  Un server MCP che insegna all'IA a suonare il pianoforte — e a cantare.<br/>
  120 brani in 12 generi. Cinque motori sonori. Un cockpit nel browser con sintetizzatore vocale.<br/>
  Un diario di pratica che ricorda tutto.
</p>

[![CI](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@mcptoolshop/ai-jam-sessions)](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions)
[![Songs](https://img.shields.io/badge/songs-120_across_12_genres-blue)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)
[![Ready](https://img.shields.io/badge/annotated-24-green)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)

---

## Cos'è?

Un pianoforte che l'IA impara a suonare. Non un sintetizzatore, non una libreria MIDI — uno strumento didattico.

Un LLM può leggere e scrivere testo, ma non può vivere la musica come noi. Niente orecchie, niente dita, niente memoria muscolare. AI Jam Sessions colma questa lacuna dando al modello sensi che può effettivamente usare:

- **Leggere** — spartiti MIDI reali con annotazioni musicali profonde. Non approssimazioni scritte a mano — analizzate, scomposte e spiegate.
- **Ascoltare** — cinque motori audio (pianoforte oscillatore, pianoforte campionato, campioni vocali, tratto vocale fisico, sintesi additiva vocale) che suonano attraverso gli altoparlanti. Gli umani nella stanza diventano le orecchie dell'IA.
- **Vedere** — un piano roll che renderizza il suonato come SVG che il modello può rileggere e verificare. Un cockpit nel browser con tastiera visiva, editor note duale e laboratorio di accordatura.
- **Ricordare** — un diario di pratica che persiste tra le sessioni. L'apprendimento si accumula.
- **Cantare** — sintesi del tratto vocale con 20 preset vocali, dal soprano lirico al coro elettronico. Modalità canta-insieme con solfeggio, contorno e narrazione sillabica.

Ognuno dei 12 generi ha un esemplare riccamente annotato — un brano di riferimento con contesto storico, analisi strutturale battuta per battuta, momenti chiave, obiettivi didattici e suggerimenti per l'esecuzione. Gli altri 96 brani sono MIDI grezzi, in attesa che l'IA assorba i pattern, suoni la musica e scriva le proprie annotazioni.

## Il Piano Roll

Il piano roll è il modo in cui l'IA vede la musica. Renderizza qualsiasi brano come SVG — blu per la mano destra, corallo per la sinistra, con griglie di beat, dinamiche e limiti di battuta:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll di Per Elisa battute 1-8" width="100%" />
</p>

<p align="center"><em>Per Elisa, battute 1–8 — il trillo E5-D#5 in blu, accompagnamento al basso in corallo</em></p>

Due modalità di colore: **mano** (blu/corallo) o **classe di altezza** (arcobaleno cromatico — tutti i Do sono rossi, tutti i Fa# sono ciano). Il formato SVG permette al modello di vedere l'immagine e leggere il markup per verificare altezza, ritmo e indipendenza delle mani.

## Il Cockpit

Uno strumento e studio vocale nel browser che si apre accanto al server MCP. Nessun plugin, nessun DAW — solo una pagina web con un pianoforte.

- **Piano roll a doppia modalità** — alternare tra modalità Strumento (colori cromatici per classe di altezza) e modalità Vocale (note colorate per forma vocalica: /a/ /e/ /i/ /o/ /u/)
- **Tastiera visiva** — due ottave da C4, mappata sulla tastiera QWERTY. Clicca o digita.
- **20 preset vocali** — 15 voci Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, choir, synth-vox), 4 voci tratto e una sezione corale sintetica
- **10 preset strumentali** — le 6 voci di pianoforte lato server più synth-pad, organ, bell e strings
- **Ispettore note** — clicca qualsiasi nota per modificare velocità, vocale e respiro
- **7 sistemi di accordatura** — temperamento equabile, intonazione giusta (maggiore/minore), pitagorico, mesotonico al quarto di comma, Werckmeister III, o offset in centesimi personalizzati. Riferimento La4 regolabile (392–494 Hz).
- **Audit di accordatura** — tabella di frequenze, tester di intervalli con analisi di frequenza di battimento, import/export di accordatura
- **Import/export partitura** — serializza l'intera partitura come JSON e ricaricala
- **API per LLM** — `window.__cockpit` espone `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` e `getScore()` per composizione programmatica

## Il Ciclo di Apprendimento

```
 Leggere             Suonare             Vedere              Riflettere
┌──────────┐     ┌───────────┐     ┌────────────┐     ┌──────────────┐
│ Studiare  │     │ Suonare   │     │ Vedere il  │     │ Scrivere ciò │
│ l'analisi │ ──▶ │ il brano  │ ──▶ │ piano roll │ ──▶ │ che si è     │
│ dell'esem-│     │ a qualsia-│     │ per        │     │ imparato nel │
│ plare     │     │ si velocità│    │ verificare │     │ diario       │
└──────────┘     └───────────┘     └────────────┘     └──────┬───────┘
                                                             │
                                                             ▼
                                                    ┌──────────────┐
                                                    │ La sessione  │
                                                    │ successiva   │
                                                    │ riprende qui │
                                                    └──────────────┘
```

## Libreria Musicale

120 brani in 12 generi, costruiti da veri file MIDI. Ogni genere ha un esemplare profondamente annotato — con contesto storico, analisi armonica battuta per battuta, momenti chiave, obiettivi didattici e consigli per l'esecuzione (guida vocale inclusa). Questi esemplari fungono da modelli: l'IA ne studia uno, poi annota il resto.

| Genere | Esemplare | Tonalità | Cosa insegna |
|--------|-----------|----------|--------------|
| Blues | The Thrill Is Gone (B.B. King) | Si minore | Forma blues minore, botta e risposta, suonare dietro il beat |
| Classica | Per Elisa (Beethoven) | La minore | Forma rondò, differenziazione del tocco, disciplina del pedale |
| Film | Comptine d'un autre été (Tiersen) | Mi minore | Tessiture arpeggiate, architettura dinamica senza cambio armonico |
| Folk | Greensleeves | Mi minore | Valzer in 3/4, mescolanza modale, stile vocale rinascimentale |
| Jazz | Foglie morte (Kosma) | Sol minore | Progressioni ii-V-I, note guida, ottavi swing, voicing senza fondamentale |
| Latin | Ragazza di Ipanema (Jobim) | Fa maggiore | Ritmo bossa nova, modulazione cromatica, ritegno vocale |
| New-Age | River Flows in You (Yiruma) | La maggiore | Riconoscimento I-V-vi-IV, arpeggi fluidi, rubato |
| Pop | Imagine (Lennon) | Do maggiore | Accompagnamento arpeggiato, ritegno, sincerità vocale |
| Ragtime | The Entertainer (Joplin) | Do maggiore | Basso oom-pah, sincope, forma multi-strain, disciplina del tempo |
| R&B | Superstition (Stevie Wonder) | Mib minore | Funk in sedicesimi, tastiera percussiva, note fantasma |
| Rock | Your Song (Elton John) | Mib maggiore | Condotta delle voci nella ballata per pianoforte, rivolti, canto conversazionale |
| Soul | Lean on Me (Bill Withers) | Do maggiore | Melodia diatonica, accompagnamento gospel, botta e risposta |

I brani progrediscono da **raw** (solo MIDI) → **annotated** → **ready** (completamente eseguibile con linguaggio musicale). L'IA promuove i brani studiandoli e scrivendo annotazioni con `annotate_song`.

## Motori Sonori

Cinque motori più un combinatore a strati che ne esegue due simultaneamente:

| Motore | Tipo | Suono |
|--------|------|-------|
| **Pianoforte Oscillatore** | Sintesi additiva | Pianoforte multi-armonico con rumore di martelletto, inarmonicità, polifonia a 48 voci, immagine stereo. Zero dipendenze. |
| **Pianoforte Campionato** | Riproduzione WAV | Salamander Grand Piano — 480 campioni, 16 strati di velocità, 88 tasti. L'originale. |
| **Vocale (Campioni)** | Campioni con pitch-shift | Toni vocalici sostenuti con portamento e modalità legato. |
| **Tratto Vocale** | Modello fisico | Pink Trombone — onda glottale LF attraverso una guida d'onda digitale a 44 celle. Quattro preset: soprano, contralto, tenore, basso. |
| **Sintesi Vocale** | Sintesi additiva | 15 preset vocali Kokoro. Modellazione dei formanti, respiro, vibrato. Deterministico (RNG con seme). |
| **A Strati** | Combinatore | Avvolge due motori e invia ogni evento MIDI ad entrambi — piano+synth, vocal+synth ecc. |

### Voci di Tastiera

Sei voci di pianoforte regolabili, ciascuna configurabile per parametro (brillantezza, decadimento, durezza del martelletto, scordatura, ampiezza stereo e altro):

| Voce | Carattere |
|------|-----------|
| Concert Grand | Ricco, pieno, classico |
| Upright | Caldo, intimo, folk |
| Electric Piano | Setoso, jazzistico, stile Fender Rhodes |
| Honky-Tonk | Scordato, ragtime, saloon |
| Music Box | Cristallino, etereo |
| Bright Grand | Incisivo, contemporaneo, pop |

## Il Diario di Pratica

Dopo ogni sessione, il server registra cosa è successo — quale brano, a che velocità, quante battute, quanto tempo. L'IA aggiunge le proprie riflessioni: cosa ha notato, quali pattern ha riconosciuto, cosa provare dopo.

```markdown
---
### 14:32 — Foglie morte
**jazz** | intermediate | Sol minore | 69 BPM × 0.7 | 32/32 battute | 45s

Il ii-V-I nelle battute 5-8 (Cm7-F7-SibMaj7) ha la stessa gravità
del V-i in The Thrill Is Gone, solo in maggiore. Blues e jazz
condividono più di quanto le etichette di genere suggeriscano.

Prossima volta: provare a velocità piena. Confrontare la modulazione
del ponte di Ipanema con questa.
---
```

Un file markdown al giorno, salvato in `~/.ai-jam-sessions/journal/`. Leggibile dall'uomo, solo in aggiunta. Sessione successiva, l'IA legge il suo diario e riprende da dove aveva lasciato.

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

## Strumenti MCP

24 strumenti in quattro categorie:

### Imparare

| Strumento | Funzione |
|-----------|----------|
| `list_songs` | Sfogliare per genere, difficoltà o parola chiave |
| `song_info` | Analisi musicale completa — struttura, momenti chiave, obiettivi didattici, suggerimenti di stile |
| `registry_stats` | Statistiche dell'intera libreria |
| `library_progress` | Stato delle annotazioni per tutti i generi |
| `list_measures` | Note, dinamiche e note didattiche di ogni battuta |
| `teaching_note` | Approfondimento su una singola battuta — diteggiatura, dinamiche, contesto |
| `suggest_song` | Raccomandazione basata su genere, difficoltà e cronologia |
| `practice_setup` | Velocità, modalità, impostazioni vocali e comando CLI consigliati |

### Suonare

| Strumento | Funzione |
|-----------|----------|
| `play_song` | Suonare tramite altoparlanti — brani della libreria o file .mid |
| `stop_playback` | Fermare |
| `pause_playback` | Pausa o ripresa |
| `set_speed` | Cambiare velocità durante la riproduzione (0.1×–4.0×) |
| `playback_status` | Snapshot in tempo reale: battuta attuale, tempo, velocità, voce tastiera, stato |
| `view_piano_roll` | Renderizzare come SVG (colore per mano o arcobaleno cromatico per classe di altezza) |

### Cantare

| Strumento | Funzione |
|-----------|----------|
| `sing_along` | Testo cantabile — nomi di note, solfeggio, contorno o sillabe. Con o senza pianoforte |
| `ai_jam_sessions` | Generare un brief di jam — progressione di accordi, schema melodico e suggerimenti di stile |

### Costruire

| Strumento | Funzione |
|-----------|----------|
| `add_song` | Aggiungere un nuovo brano come JSON |
| `import_midi` | Importare un file .mid con metadati |
| `annotate_song` | Scrivere linguaggio musicale per un brano grezzo e promuoverlo a ready |
| `save_practice_note` | Voce di diario con cattura automatica dei dati di sessione |
| `read_practice_journal` | Caricare le voci recenti |
| `list_keyboards` | Voci di tastiera disponibili |
| `tune_keyboard` | Regolare qualsiasi parametro di qualsiasi voce. Persiste tra le sessioni |
| `get_keyboard_config` | Configurazione attuale vs valori di fabbrica |
| `reset_keyboard` | Ripristinare una voce di tastiera ai valori di fabbrica |

## CLI

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

v0.2.1. Sei motori sonori, 31 strumenti MCP, 120 brani in 12 generi con esemplari profondamente annotati. Cockpit nel browser con 20 preset vocali, 10 voci strumentali, 7 sistemi di accordatura e un'API di partitura per LLM. Visualizzazione piano roll in due modalità di colore. Diario di pratica persistente. Il MIDI è tutto pronto — la libreria cresce man mano che l'IA impara.

## Licenza

MIT
