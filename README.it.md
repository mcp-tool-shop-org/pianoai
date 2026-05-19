<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://codecov.io/gh/mcp-tool-shop-org/ai-jam-sessions"><img src="https://codecov.io/gh/mcp-tool-shop-org/ai-jam-sessions/branch/main/graph/badge.svg" alt="codecov"></a>
  <a href="https://www.npmjs.com/package/ai-jam-sessions"><img src="https://img.shields.io/npm/v/ai-jam-sessions" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/songs-120_across_12_genres-blue" alt="Songs"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/annotated-24-green" alt="Ready"></a>
  <a href="datasets/jam-actions-v0-public/README.md"><img src="https://img.shields.io/badge/dataset-jam--actions--v0%20(115_records)-8b5cf6" alt="Training dataset"></a>
</p>

---

## Cos'è questo?

Un pianoforte e una chitarra che un'intelligenza artificiale impara a suonare. Non un sintetizzatore, né una libreria MIDI, ma uno strumento didattico.

Un modello linguistico di grandi dimensioni (LLM) può leggere e scrivere testi, ma non può sperimentare la musica nello stesso modo in cui lo facciamo noi. Non ha orecchie, dita o memoria muscolare. AI Jam Sessions colma questa lacuna fornendo al modello dei "sensi" che può effettivamente utilizzare:

- **Lettura** — spartiti MIDI reali con annotazioni musicali dettagliate. Non approssimazioni scritte a mano, ma elementi analizzati, spiegati e interpretati.
- **Ascolto** — sei motori audio (pianoforte a oscillatore, pianoforte con campioni, campioni vocali, tratto vocale fisico, sintetizzatore vocale additivo, chitarra modellata fisicamente) che riproducono attraverso i tuoi altoparlanti, permettendo agli esseri umani nella stanza di diventare le "orecchie" dell'IA.
- **Visione** — una rappresentazione grafica della tastiera (piano roll) che mostra ciò che è stato suonato in formato SVG, un formato che il modello può leggere e verificare. Un editor di tablature interattivo per chitarra. Un'interfaccia web con una tastiera visiva, un editor di note in modalità doppia e un laboratorio di accordatura.
- **Memoria** — un diario di pratica che persiste tra le sessioni, permettendo all'apprendimento di consolidarsi nel tempo.
- **Canto** — sintesi del tratto vocale con 20 preset vocali, dall'alto soprano all'intero coro elettronico. Modalità di accompagnamento con narrazione di note, melodie e sillabe.

Ogni uno dei 12 generi musicali ha un esempio ricco di annotazioni: un brano di riferimento che l'IA studia per prima, con contesto storico, analisi strutturale battuta per battuta, momenti chiave, obiettivi didattici e suggerimenti per l'esecuzione. Gli altri 96 brani sono file MIDI grezzi, in attesa che l'IA ne assimili i modelli, suoni la musica e scriva le proprie annotazioni.

Da questo stesso lavoro, pubblichiamo anche **[jam-actions-v0](#training-dataset)** — un set di dati pubblico di 115 sequenze di utilizzo di strumenti MCP (Multi-turn Control Plane) su un vero pianoforte classico. Questo insegna agli LLM a utilizzare gli strumenti in modo "contestuale" sulla musica simbolica, non solo a generare testo, ed è fornito con un sistema di "release gate" a 7 assi che distingue tra "fornire prove" e "fornire perché il compito è banale". Consultare la sezione [Training Dataset](#training-dataset) qui sotto per maggiori dettagli.

## La rappresentazione grafica della tastiera (Piano Roll)

La rappresentazione grafica della tastiera è il modo in cui l'IA "vede" la musica. Converte qualsiasi brano in formato SVG (Scalable Vector Graphics) — blu per la mano destra, corallo per la mano sinistra, con griglie di battute, dinamiche e confini delle misure:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Due modalità di colore: **mano** (blu/corallo) o **altezza** (arcobaleno cromatico: ogni Do è rosso, ogni Fa# è ciano). Il formato SVG permette al modello di vedere l'immagine e di leggere i dati per verificare l'intonazione, il ritmo e l'indipendenza delle mani.

## L'Interfaccia

Un'interfaccia web per strumenti e voce che si apre insieme al server MCP. Nessun plugin, nessuna DAW (Digital Audio Workstation), solo una pagina web con un pianoforte.

- **Rappresentazione grafica della tastiera in modalità doppia** — passa dalla modalità Strumento (colori cromatici per le altezze) alla modalità Voce (note colorate in base alla forma della vocale: /a/ /e/ /i/ /o/ /u/)
- **Tastiera visiva** — due ottave dal Do4, mappate alla tua tastiera QWERTY. Clicca o digita.
- **20 preset vocali** — 15 voci mappate con Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, più coro e voce sintetizzata), 4 voci mappate con il tratto vocale e una sezione di coro sintetico.
- **10 preset di strumenti** — le 6 voci del pianoforte lato server, più synth-pad, organo, campanelli e archi.
- **Ispezionatore delle note** — clicca su qualsiasi nota per modificare la velocità, la vocale e la "respirazione".
- **7 sistemi di accordatura** — Temperamento equabile, intonazione giusta (maggiore/minore), temperamento pitagorico, meantone a quarto comma, Werckmeister III, o offset personalizzati in centesimi di tono. Riferimento A4 regolabile (da 392 a 494 Hz).
- **Controllo dell'accordatura** — tabella delle frequenze, tester degli intervalli con analisi della frequenza delle battute e possibilità di esportare/importare l'accordatura.
- **Importazione/esportazione di partiture** — serializza l'intera partitura in formato JSON e caricala nuovamente.
- **API per LLM** — `window.__cockpit` espone le funzioni `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` e `getScore()`, permettendo a un LLM di comporre, arrangiare e riprodurre la musica in modo programmatico.

## Il Ciclo di Apprendimento

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

## La Libreria di Canzoni

120 canzoni in 12 generi diversi, create a partire da file MIDI reali. Ogni genere presenta un esempio dettagliatamente annotato, con contesto storico, analisi armonica rigo per rigo, momenti chiave, obiettivi didattici e suggerimenti per l'esecuzione (inclusa la guida vocale). Questi esempi fungono da modelli: l'intelligenza artificiale ne studia uno, quindi annota gli altri.

| Genere | Esempio | Tonalità | Cosa insegna |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | Si minore | Forma blues minore, risposta e richiamo, esecuzione "dietro" il ritmo. |
| Classica | Für Elise (Beethoven) | La minore | Forma rondò, differenziazione del tocco, disciplina nell'uso dei pedali. |
| Colonna Sonora | Comptine d'un autre été (Tiersen) | Mi minore | Texture arpeggiata, architettura dinamica senza cambiamento armonico. |
| Folk | Greensleeves | Mi minore | Sensazione di valzer in 3/4, mescolanza di modi, stile vocale rinascimentale. |
| Jazz | Autumn Leaves (Kosma) | Sol minore | Progressioni ii-V-I, note guida, ottavi swing, accordi senza fondamentale. |
| Latina | The Girl from Ipanema (Jobim) | Fa maggiore | Ritmo bossa nova, modulazione cromatica, controllo vocale. |
| New Age | River Flows in You (Yiruma) | La maggiore | Riconoscimento di I-V-vi-IV, arpeggi fluidi, rubato. |
| Pop | Imagine (Lennon) | Do maggiore | Accompagnamento arpeggiato, controllo, sincerità vocale. |
| Ragtime | The Entertainer (Joplin) | Do maggiore | Basso "oom-pah", sincopazione, forma a più sezioni, disciplina del tempo. |
| R&B | Superstition (Stevie Wonder) | Si minore | Funk a sedicesimi, tastiera percussiva, note fantasma. |
| Rock | Your Song (Elton John) | Si maggiore | Voicing di pianoforte in stile ballata, inversioni, canto conversazionale. |
| Soul | Lean on Me (Bill Withers) | Do maggiore | Melodia diatonica, accompagnamento gospel, risposta e richiamo. |

Le canzoni progrediscono da uno stato **grezzo** (solo MIDI) → **annotato** → **pronto** (completamente riproducibile con linguaggio musicale). L'intelligenza artificiale promuove le canzoni studiandole e scrivendo annotazioni con la funzione `annotate_song`.

## Motori Sonori

Sei motori, più un combinatore a strati che ne esegue due contemporaneamente:

| Motore | Tipo | Come suona |
|--------|------|---------------------|
| **Oscillator Piano** | Sintesi additiva | Pianoforte multi-armonico con rumore del martelletto, inarmonia, polifonia a 48 voci, imaging stereo. Nessuna dipendenza. |
| **Sample Piano** | Riproduzione di file WAV | Salamander Grand Piano — 480 campioni, 16 livelli di velocità, 88 tasti. La versione reale. |
| **Vocal (Sample)** | Campioni con variazione di altezza | Timbri vocalici prolungati con portamento e modalità legato. |
| **Vocal Tract** | Modello fisico | Pink Trombone — Forma d'onda glottale a bassa frequenza attraverso un waveguide digitale a 44 celle. Quattro preset: soprano, contralto, tenore, basso. |
| **Vocal Synth** | Sintesi additiva | 15 preset vocali Kokoro con modellazione della formante, respiro, vibrato. Deterministico (generatore di numeri casuali con seme). |
| **Guitar** | Sintesi additiva | Corda pizzicata modellata fisicamente — 4 preset (acciaio dreadnought, nylon classico, jazz archtop, dodici corde), 8 accordature, 17 parametri regolabili. |
| **Layered** | Combinatore | Avvolge due motori e invia ogni evento MIDI a entrambi: pianoforte+sintetizzatore, voce+sintetizzatore, ecc. |

### Timbri per Tastiera

Sei voci di pianoforte regolabili, ognuna con parametri modificabili individualmente (brillantezza, decadimento, durezza del martelletto, disaccordatura, ampiezza stereo e altro):

| Voce | Caratteristica |
|-------|-----------|
| Grandino da concerto | Ricco, pieno, classico |
| Pianoforte verticale | Caldo, intimo, folk |
| Pianoforte elettrico | Suono vellutato, jazz, tipico di un Fender Rhodes |
| Honky-Tonk | Disaccordato, ragtime, saloon |
| Scatola musicale | Cristallino, etereo |
| Grandino brillante | Brillante, contemporaneo, pop |

### Voci di chitarra

Quattro preset di voci di chitarra con sintesi del suono delle corde fisicamente modellata, ognuno con 17 parametri regolabili (brillantezza, risonanza del corpo, posizione della diteggiatura, smorzamento delle corde e altro):

| Voce | Caratteristica |
|-------|-----------|
| Chitarra acustica dreadnought in acciaio | Brillante, equilibrato, classico |
| Chitarra classica in nylon | Caldo, morbido, rotondo |
| Archtop jazz | Suono dolce, legnoso, pulito |
| Chitarra a 12 corde | Brillante, con effetto di raddoppio, simile a un chorus |

## Il diario di pratica

Dopo ogni sessione, il server registra ciò che è accaduto: quale canzone è stata suonata, a quale velocità, quante battute, per quanto tempo. L'intelligenza artificiale aggiunge le proprie osservazioni: cosa ha notato, quali schemi ha riconosciuto, cosa provare successivamente.

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

Un file Markdown al giorno, salvato in `~/.ai-jam-sessions/journal/`. Leggibile dagli umani, modificabile solo in appendice. Nella sessione successiva, l'intelligenza artificiale legge il suo diario e riprende da dove si era interrotta.

## Dataset di addestramento

**jam-actions-v0** — un dataset pubblico di tracce di utilizzo di strumenti MCP (Music Control Protocol) in più fasi, basato su file MIDI di pianoforte classico reali. Costruito utilizzando la stessa libreria con cui questo server viene addestrato, il dataset insegna ai modelli linguistici di generare **azioni basate su dati musicali simbolici**, e non solo testo.

Ogni record associa una sequenza di 4 battute a un obiettivo di insegnamento annotato e a una *traccia di riferimento* — una sessione passo dopo passo in cui un assistente utilizza gli strumenti MCP sopra indicati (`get_events_in_measure`, `get_events_in_hand`, `count_distinct_pitch_classes` e il resto dell'interfaccia di ispezione MIDI a 9 strumenti) per leggere, analizzare e discutere la sequenza.

| | |
|---|---|
| Record | 115 (sottoinsieme pubblico) |
| Baseline di riferimento | 16 record, versione post-correzione E3 |
| Composizioni | 8 opere per pianoforte classico (Beethoven, Bach, Schubert, Schumann, Mozart, Mendelssohn, Tchaikovsky) |
| File MIDI originali | piano-midi.de — arrangiamenti di Bernd Krueger |
| Licenza | CC-BY-SA-3.0-DE (arrangiamenti) su composizioni di dominio pubblico |
| Versione | 0.4.3 (2026-05-19) |
| Schema | `release-gate-assessment/2.0.0` |

**Sistema di controllo della qualità — la porta di rilascio a 7 assi.** Il dataset viene fornito con un sistema di controllo della qualità che distingue tra risultati validi e risultati non validi. Gli assi da 1 a 6 bloccano i risultati che non soddisfano determinati criteri (soglia minima assoluta, margine di sicurezza, tasso di utilizzo degli strumenti, correttezza dopo l'utilizzo dello strumento, numero di interpretazioni errate, soglia minima di qualità); l'asse 7 distingue tra risultati completi e risultati incompleti. Gli assi 2 e 6 ammettono una categoria `ceiling_saturated_pass` in modo che i record che ottengono un punteggio di 1.000 in condizioni di testo puro / ispezione con strumenti / MIDI casuale non sminuiscano i risultati migliori. La baseline di Slice 22 **SUPERABILE** supera il sistema di controllo della qualità rivisto. La baseline di Slice 19 continua a **NON SUPERARE** il sistema di controllo della qualità, ma è stata mantenuta come riferimento per la diagnostica di regressione, in modo che il sistema di controllo della qualità sia efficace.

**Riproducibilità.** Un nuovo utente su qualsiasi piattaforma (Windows nativo, macOS, Linux, WSL) può verificare il pacchetto e riprodurre il risultato di superamento (PASS) di riferimento in meno di un minuto:

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions && pnpm install
pnpm exec tsx scripts/verify-public-package-checksums.ts        # 273 entries, ~2s
pnpm exec tsx scripts/check-release-gate.ts \
  datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json
# → "Verdict: PASS"
```

`.gitattributes` imposta le interruzioni di riga LF per i file `*.sha256` e per l'albero dei dataset pubblici, in modo che lo strumento di verifica degli hash funzioni su tutte le piattaforme. L'interfaccia a riga di comando `release-gate` è rigorosa nella posizione degli argomenti (rifiuta argomenti posizionali sconosciuti o multipli), in modo che i contributori che la utilizzano per la prima volta non possano richiamarla in modo errato.

**Dove trovarlo.** La scheda completa del dataset è disponibile a [`datasets/jam-actions-v0-public/README.md`](datasets/jam-actions-v0-public/README.md). I metadati per il deposito su Zenodo sono disponibili a [`zenodo-metadata.json`](datasets/jam-actions-v0-public/zenodo-metadata.json), i metadati per le citazioni a [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff) e le note sulla versione a [`RELEASE_NOTES.md`](datasets/jam-actions-v0-public/RELEASE_NOTES.md). La sequenza di build di 24 passaggi, che va dalla bozza iniziale del corpus alla correzione degli errori, alla risoluzione dei problemi di Schumann, alla revisione della fase di controllo e all'audit di indipendenza degli operatori, è disponibile in [`docs/`](docs/).

> Le trascrizioni MIDI sono state realizzate da Bernd Krueger (piano-midi.de) e sono concesse in licenza CC-BY-SA-3.0-DE. Le annotazioni, i tracciati e gli artefatti di valutazione sono stati creati dal team di AI Jam Sessions e sono rilasciati con la stessa licenza, in modo da preservare la catena di condivisione.

## Installazione

```bash
npm install -g ai-jam-sessions
```

Richiede **Node.js 18+**. Non richiede driver MIDI, porte virtuali o software esterno.

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "ai_jam_sessions": {
      "command": "npx",
      "args": ["-y", "-p", "ai-jam-sessions", "ai-jam-sessions-mcp"]
    }
  }
}
```

## MCP Tools

41 strumenti e 3 modelli di prompt, suddivisi in sei categorie:

### Imparare

| Strumento | Cosa fa |
|------|--------------|
| `list_songs` | Esplora per genere, difficoltà o parola chiave |
| `song_info` | Analisi musicale completa: struttura, momenti chiave, obiettivi didattici, suggerimenti sullo stile |
| `registry_stats` | Statistiche a livello di libreria: numero totale di canzoni, generi, difficoltà |
| `list_measures` | Note, dinamiche e note didattiche per ogni battuta |
| `teaching_note` | Analisi approfondita di una singola battuta: diteggiatura, dinamiche, contesto |
| `suggest_song` | Raccomandazioni basate su genere, difficoltà e ciò che hai già ascoltato |
| `practice_setup` | Velocità, modalità, impostazioni del suono e comando della riga di comando consigliati per una canzone |
| `compare_songs` | Riconoscimento di schemi tra generi: relazioni tra le tonalità, somiglianze di altezze/intervalli, forme comuni, collegamenti didattici |
| `annotation_progress` | Valutazione della qualità delle annotazioni in tutta la libreria: punteggi, valutazioni e suggerimenti per il miglioramento |
| `server_info` | Versione del server, statistiche della libreria, elenco dei motori, sessione attiva |

### Riproduzione

| Strumento | Cosa fa |
|------|--------------|
| `play_song` | Riproduzione tramite altoparlanti: canzoni della libreria o file .mid grezzi. Qualsiasi motore, velocità, modalità, intervallo di battute. |
| `stop_playback` | Pausa |
| `pause_playback` | Pausa o ripresa |
| `set_speed` | Modifica della velocità durante la riproduzione (0.1×–4.0×) |
| `playback_status` | Snapshot in tempo reale: battuta corrente, tempo, velocità, suono della tastiera, stato |
| `view_piano_roll` | Rendering come SVG (colorazione manuale o arcobaleno cromatico per classe di altezza) |
| `score_performance` | Valutazione di una riproduzione MIDI: accuratezza dell'intonazione, tempismo, completezza, con feedback graduato |
| `mute_hand` | Silenzia o riattiva la mano sinistra/destra durante la pratica: isola una mano alla volta |
| `preview_teaching_cues` | Visualizza tutte le note didattiche e i momenti chiave prima di riprodurre |

### Canto

| Strumento | Cosa fa |
|------|--------------|
| `sing_along` | Testo cantabile: nomi delle note, solfeggio, contorno o sillabe. Con o senza accompagnamento pianistico. |
| `ai_jam_sessions` | Genera una breve descrizione per l'improvvisazione: progressione di accordi, schema melodico e suggerimenti sullo stile per la reinterpretazione |

### Chitarra

| Strumento | Cosa fa |
|------|--------------|
| `view_guitar_tab` | Rendering di tablature interattive per chitarra come HTML: modifica con un clic, cursore di riproduzione, scorciatoie da tastiera |
| `list_guitar_voices` | Preset di suoni per chitarra disponibili |
| `list_guitar_tunings` | Sistemi di accordatura per chitarra disponibili (standard, drop-D, open G, DADGAD, ecc.) |
| `tune_guitar` | Modifica di qualsiasi parametro di qualsiasi suono per chitarra. Le impostazioni vengono mantenute tra le sessioni. |
| `get_guitar_config` | Configurazione corrente del suono per chitarra rispetto alle impostazioni predefinite |
| `reset_guitar` | Ripristino delle impostazioni predefinite di un suono per chitarra |

### Creazione

| Strumento | Cosa fa |
|------|--------------|
| `add_song` | Aggiunta di una nuova canzone in formato JSON |
| `import_midi` | Importazione di un file .mid con metadati |
| `annotate_song` | Scrivere la notazione musicale per un brano grezzo e trasformarlo in una versione completa. |
| `save_practice_note` | Voce di diario con dati di sessione acquisiti automaticamente. |
| `read_practice_journal` | Caricare le voci recenti per fornire contesto. |
| `list_keyboards` | Timbri di tastiera disponibili. |
| `tune_keyboard` | Regolare qualsiasi parametro di qualsiasi timbro di tastiera. Le impostazioni vengono mantenute tra le sessioni. |
| `get_keyboard_config` | Configurazione corrente rispetto alle impostazioni di fabbrica. |
| `reset_keyboard` | Ripristinare un timbro di tastiera alle impostazioni di fabbrica. |
| `score_annotation` | Valutazione della qualità della notazione musicale in 5 dimensioni: completezza, profondità, specificità, valore didattico, vocabolario. |
| `validate_song_entry` | Validare un file JSON di un brano rispetto allo schema prima di aggiungerlo. |
| `transpose_song` | Trasporre un brano di un numero di semitoni, modificando la tonalità e le note. |
| `list_sections` | Visualizzare le sezioni strutturali di un brano (introduzione, strofa, ritornello, ecc.). |
| `add_section` | Aggiungere un marcatore di sezione a un brano per la navigazione strutturale. |

### Suggerimenti MCP

Tre modelli di suggerimento per flussi di lavoro didattici strutturati:

| Suggerimento | Cosa fa |
|--------|--------------|
| `annotate_song` | Flusso di lavoro guidato per la notazione: studiare un esempio, scrivere la notazione musicale per un brano grezzo. |
| `practice_plan` | Creare un piano di pratica strutturato basato su genere, difficoltà e obiettivi. |
| `performance_review` | Analizzare una sessione completata: cosa ha funzionato bene, su cosa concentrarsi successivamente. |

## Interfaccia a riga di comando (CLI)

```
ai-jam-sessions list [--genre <genre>] [--difficulty <level>]
ai-jam-sessions play <song-id> [--speed <mult>] [--mode <mode>] [--engine <piano|vocal|tract|synth|guitar|piano+synth|guitar+synth>]
ai-jam-sessions sing <song-id> [--with-piano] [--engine <engine>]
ai-jam-sessions view <song-id> [--measures <start-end>] [--out <file.svg>]
ai-jam-sessions view-guitar <song-id> [--measures <start-end>] [--tuning <tuning>]
ai-jam-sessions info <song-id>
ai-jam-sessions tune <keyboard-id> [--param value ...] [--reset] [--show]
ai-jam-sessions tune-guitar <voice-id> [--param value ...] [--reset] [--show]
ai-jam-sessions keyboards
ai-jam-sessions guitars
ai-jam-sessions stats
ai-jam-sessions library
ai-jam-sessions ports
ai-jam-sessions help
ai-jam-sessions --version
```

## Stato

Versione 1.4.1. Sei motori audio, 41 strumenti MCP, 3 modelli di suggerimento, 120 brani in 12 generi con esempi dettagliatamente annotati. Trasposizione dei brani, marcatori di sezione, mute/solo per mano per una pratica mirata. Editor interattivo di tablature per chitarra. Interfaccia web con 20 preset vocali, 10 timbri di strumenti, 7 sistemi di accordatura e un'API per la notazione compatibile con modelli linguistici di grandi dimensioni (LLM). Visualizzazione della tastiera in due modalità di colore. Diario di pratica per l'apprendimento continuo. Persistenza dello stato della sessione anche dopo il riavvio del server. Creazione di partiture MIDI, valutazione della qualità della notazione e riconoscimento di schemi tra generi.

Pubblica anche **[jam-actions-v0](#training-dataset)**: un set di dati di addestramento con 115 record di tracce di utilizzo di strumenti MCP in sessioni multiple su pianoforte classico, con un sistema di controllo a 7 assi, riproducibilità dall'inizio e metadati Zenodo + CITATION.cff completi (CC-BY-SA-3.0-DE). 1513 test superati sul server MCP, sui pacchetti di dati, sugli strumenti di valutazione e sul validatore del sistema di controllo. Tutti i file MIDI sono inclusi: la libreria cresce man mano che l'intelligenza artificiale impara, e ora viene fornito un corpus di questo apprendimento.

## Sicurezza e privacy

**Dati accessibili:** libreria di brani (JSON + MIDI), directory dei brani dell'utente (`~/.ai-jam-sessions/songs/`), configurazioni di accordatura della chitarra, voci del diario di pratica, dispositivo di output audio locale.

**Dati NON accessibili:** nessuna API cloud, nessuna credenziale utente, nessun dato di navigazione, nessun file di sistema al di fuori della directory dei brani dell'utente. Non vengono raccolti o trasmessi dati di telemetria.

**Autorizzazioni:** il server MCP utilizza solo il trasporto stdio (nessun HTTP). L'interfaccia a riga di comando accede al file system locale e ai dispositivi audio. Consultare [SECURITY.md](SECURITY.md) per la politica completa.

## Licenza

MIT
