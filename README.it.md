<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <strong>Italiano</strong> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.png" alt="AI Jam Session logo" width="180" />
</p>

<h1 align="center">AI Jam Session</h1>

<p align="center">
  <em>Machine Learning alla vecchia maniera</em>
</p>

<p align="center">
  Un server MCP che insegna all'IA a suonare il pianoforte.<br/>
  120 brani. 12 generi. MIDI reale. Un diario di pratica che ricorda tutto.
</p>

[![Songs](https://img.shields.io/badge/songs-120_across_12_genres-blue)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)
[![Ready](https://img.shields.io/badge/ready_to_play-24-green)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)

---

## Cos'è?

Un pianoforte che l'IA impara a suonare. Non un sintetizzatore, non una libreria MIDI -- uno strumento didattico.

Un LLM può leggere e scrivere testo. Ma non può vivere la musica come noi -- niente orecchie, niente occhi, niente memoria muscolare. AI Jam Session colma questo divario dando al modello sensi che può effettivamente usare:

- **Lettura** -- vere partiture MIDI con annotazioni didattiche, non approssimazioni scritte a mano
- **Udito** -- un motore pianistico che suona dagli altoparlanti, così gli umani nella stanza diventano le orecchie dell'IA
- **Vista** -- un piano roll che renderizza ciò che è stato suonato come SVG, che il modello può rileggere e verificare
- **Memoria** -- un diario di pratica che persiste tra le sessioni, così l'apprendimento si accumula

Ogni genere ha un modello annotato -- un pezzo di riferimento che l'IA studia prima di affrontare il resto. Gli altri 96 brani sono MIDI grezzo, in attesa che l'IA impari gli schemi, suoni la musica e scriva le proprie annotazioni. Ogni sessione prosegue da dove si era interrotta la precedente.

## Il Piano Roll

Ecco come l'IA vede la musica. Il piano roll renderizza qualsiasi brano come SVG -- blu per la mano destra, corallo per la sinistra, con griglie di battito, dinamiche e confini di battuta:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll di Für Elise battute 1-8, mostrando mano destra (blu) e mano sinistra (corallo)" width="100%" />
</p>

<p align="center"><em>Für Elise, battute 1-8 -- il trillo E5-D#5 in blu, accompagnamento di basso in corallo</em></p>

La maggior parte dei piano roll sono animazioni di riproduzione progettate per produttori umani. Questo è costruito per l'IA. Il formato SVG permette al modello sia di *vedere* l'immagine sia di *leggere* il markup sorgente per verificare l'accuratezza delle note, l'indipendenza delle mani e il ritmo. Non è una visualizzazione -- è un ciclo di feedback.

## Il Ciclo di Apprendimento

```
 Leggere             Suonare            Vedere              Riflettere
┌──────────┐     ┌───────────┐     ┌────────────┐     ┌──────────────┐
│ Studiare  │     │ Suonare   │     │ Vedere il  │     │ Scrivere     │
│ l'analisi │ ──▶ │ il brano  │ ──▶ │ piano roll │ ──▶ │ ciò che si   │
│ modello   │     │ a qualsiasi│    │ per        │     │ è imparato   │
│           │     │ velocità  │     │ verificare │     │ nel diario   │
└──────────┘     └───────────┘     └────────────┘     └──────┬───────┘
                                                             │
                                                             ▼
                                                    ┌──────────────┐
                                                    │ La sessione  │
                                                    │ successiva   │
                                                    │ riprende qui │
                                                    └──────────────┘
```

## La Libreria Musicale

120 brani in 12 generi, costruiti da file MIDI reali. Ogni genere ha un modello completamente annotato -- un pezzo di riferimento che l'IA studia prima di affrontare il resto.

| Genere | Brani | Modello |
|--------|-------|---------|
| Classica | 10 pronti | Für Elise, Clair de Lune, Moonlight Sonata... |
| R&B | 4 pronti | Superstition (Stevie Wonder) |
| Jazz | 1 pronto | Autumn Leaves |
| Blues | 1 pronto | The Thrill Is Gone (B.B. King) |
| Pop | 1 pronto | Imagine (John Lennon) |
| Rock | 1 pronto | Your Song (Elton John) |
| Soul | 1 pronto | Lean on Me (Bill Withers) |
| Latin | 1 pronto | The Girl from Ipanema |
| Film | 1 pronto | Comptine d'un autre été (Yann Tiersen) |
| Ragtime | 1 pronto | The Entertainer (Scott Joplin) |
| New-Age | 1 pronto | River Flows in You (Yiruma) |
| Folk | 1 pronto | Greensleeves |

I brani progrediscono da **raw** (solo MIDI) a **ready** (completamente annotati e riproducibili). L'IA promuove i brani studiandoli e scrivendo annotazioni con `annotate_song`.

## Il Diario di Pratica

Il diario è la memoria dell'IA. Dopo aver suonato un brano, il server registra cosa è successo -- quale brano, a che velocità, quante battute, per quanto tempo. L'IA aggiunge le proprie riflessioni: quali pattern ha notato, cosa ha riconosciuto, cosa provare la prossima volta.

```markdown
---
### 14:32 — Autumn Leaves
**jazz** | intermediate | G minor | 69 BPM x 0.7x | 32/32 measures | 45s

Il ii-V-I nelle battute 5-8 (Cm7-F7-BbMaj7) ha la stessa gravità del
V-i in The Thrill Is Gone, solo in maggiore. Blues e jazz hanno più in
comune di quanto suggeriscano le etichette di genere.

Prossima volta: provare a velocità piena. Confrontare la modulazione
del ponte di Ipanema con questa.
---
```

Un file markdown al giorno, salvato in `~/.pianoai/journal/`. Leggibile da umani, solo aggiunta. Alla sessione successiva l'IA legge il suo diario e riprende da dove si era fermata.

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

### Imparare

| Strumento | Funzione |
|-----------|----------|
| `list_songs` | Sfoglia per genere, difficoltà o parola chiave |
| `song_info` | Analisi musicale, obiettivi didattici, consigli di stile |
| `library_progress` | Stato delle annotazioni in tutti i generi |
| `list_measures` | Note e appunti didattici di ogni battuta |
| `teaching_note` | Analisi approfondita di una singola battuta |

### Suonare

| Strumento | Funzione |
|-----------|----------|
| `play_song` | Riprodurre dagli altoparlanti (velocità, modalità, intervallo di battute) |
| `stop_playback` | Fermare il brano corrente |
| `pause_playback` | Pausa o ripresa |
| `set_speed` | Cambiare velocità durante la riproduzione |
| `view_piano_roll` | Renderizzare il brano come piano roll SVG |

### Ricordare

| Strumento | Funzione |
|-----------|----------|
| `save_practice_note` | Scrivere una voce nel diario (dati sessione catturati automaticamente) |
| `read_practice_journal` | Caricare le voci recenti per contesto |
| `annotate_song` | Promuovere un brano grezzo a pronto (i compiti dell'IA) |

## CLI

```
pianoai list [--genre <genre>] [--difficulty <level>]
pianoai play <song-id> [--speed <mult>] [--mode <mode>]
pianoai view <song-id> [--measures <start-end>] [--out <file.svg>]
pianoai info <song-id>
pianoai library
```

## Stato

v0.1.0. 120 file MIDI in 12 generi. 24 brani completamente annotati e riproducibili (un modello per genere + 10 classici + 4 R&B). Diario di pratica per apprendimento persistente tra sessioni. Sei voci di tastiera (grand, upright, electric, honkytonk, musicbox, bright). Tutto il MIDI è pronto -- la libreria cresce man mano che l'IA impara.

## Licenza

MIT
