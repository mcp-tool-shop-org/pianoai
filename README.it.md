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
</p>

---

## Cos'è questo?

Un pianoforte e una chitarra che un'intelligenza artificiale impara a suonare. Non un sintetizzatore, né una libreria MIDI, ma uno strumento didattico.

Un modello linguistico di grandi dimensioni (LLM) può leggere e scrivere testi, ma non può sperimentare la musica nello stesso modo in cui lo facciamo noi. Non ha orecchie, dita o memoria muscolare. AI Jam Sessions colma questa lacuna fornendo al modello dei "sensi" che può effettivamente utilizzare:

- **Lettura:** partiture MIDI reali con annotazioni musicali dettagliate. Non approssimazioni scritte a mano, ma elementi analizzati, spiegati e interpretati.
- **Ascolto:** sei motori audio (pianoforte a oscillatore, pianoforte con campioni, campioni vocali, tratto vocale fisico, sintetizzatore vocale additivo, chitarra modellata fisicamente) che riproducono il suono attraverso i tuoi altoparlanti, in modo che le persone nella stanza diventino le "orecchie" dell'IA.
- **Visione:** una rappresentazione grafica delle note (piano roll) che mostra ciò che è stato suonato in formato SVG, un formato che il modello può leggere e verificare. Un editor di tablature interattivo per chitarra. Un'interfaccia utente con una tastiera virtuale, un editor di note in modalità doppia e un laboratorio di accordatura.
- **Memoria:** un diario di pratica che viene salvato tra le sessioni, in modo che l'apprendimento si accumuli nel tempo.
- **Canto:** sintesi del tratto vocale con 20 preset vocali, dall'alto soprano all'intero coro elettronico. Modalità di accompagnamento con narrazione di note, melodie e sillabe.

Ogni uno dei 12 generi musicali include un esempio ricco di annotazioni: un brano di riferimento che l'IA studia per prima, con contesto storico, analisi strutturale battuta per battuta, momenti chiave, obiettivi didattici e suggerimenti per l'esecuzione. Gli altri 96 brani sono file MIDI grezzi, in attesa che l'IA ne comprenda i modelli, suoni la musica e scriva le proprie annotazioni.

## La rappresentazione grafica delle note (Piano Roll)

La rappresentazione grafica delle note è il modo in cui l'IA "vede" la musica. Trasforma qualsiasi brano in un file SVG: il blu rappresenta la mano destra, il corallo la mano sinistra, con griglie di ritmo, dinamiche e confini delle battute:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Due modalità di colore: **mano** (blu/corallo) o **altezza** (arcobaleno cromatico: ogni Do è rosso, ogni Fa# è ciano). Il formato SVG consente al modello di vedere l'immagine e di leggere i dati per verificare l'altezza, il ritmo e l'indipendenza delle mani.

## L'interfaccia utente (Cockpit)

Un'interfaccia utente per strumenti e voce, basata su browser, che si apre insieme al server MCP. Nessun plugin, nessuna DAW, solo una pagina web con un pianoforte.

- **Rappresentazione grafica delle note in modalità doppia:** passa dalla modalità Strumento (colori cromatici per le altezze) alla modalità Voce (note colorate in base alla forma della vocale: /a/ /e/ /i/ /o/ /u/)
- **Tastiera virtuale:** due ottave dal Do4, mappate alla tua tastiera QWERTY. Clicca o digita.
- **20 preset vocali:** 15 voci mappate a Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, più coro e voce sintetizzata), 4 voci mappate al tratto vocale e una sezione di coro sintetico.
- **10 preset di strumenti:** i 6 suoni di pianoforte lato server, più synth-pad, organo, campanelli e archi.
- **Ispezione delle note:** clicca su qualsiasi nota per modificare la velocità, la vocale e la "respirazione".
- **7 sistemi di accordatura:** Temperamento equabile, intonazione giusta (maggiore/minore), pitagorico, meantone a quarto di comma, Werckmeister III, oppure offset personalizzati in centesimi di tono. Riferimento A4 regolabile (392–494 Hz).
- **Controllo dell'accordatura:** tabella delle frequenze, tester degli intervalli con analisi della frequenza delle battute, e possibilità di esportare/importare l'accordatura.
- **Importazione/esportazione di partiture:** serializza l'intera partitura in formato JSON e caricala nuovamente.
- **API per LLM:** `window.__cockpit` espone `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` e `getScore()`, in modo che un LLM possa comporre, arrangiare e riprodurre la musica in modo programmatico.

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

120 canzoni in 12 generi musicali, create da file MIDI reali. Ogni genere include un esempio ricco di annotazioni: con contesto storico, analisi armonica battuta per battuta, momenti chiave, obiettivi didattici e suggerimenti per l'esecuzione (inclusi suggerimenti vocali). Questi esempi fungono da modelli: l'IA ne studia uno, quindi annota gli altri.

| Genere | Esempio | Chiave | Cosa insegna |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | Si minore | Forma blues minore, risposta e chiamata, suonare leggermente indietro rispetto al ritmo. |
| Classica | Für Elise (Beethoven) | La minore | Forma rondò, differenziazione del tocco, disciplina nell'uso dei pedali. |
| Colonna sonora | Comptine d'un autre été (Tiersen) | Mi minore | Tessiture arpeggiate, architettura dinamica senza cambiamento armonico. |
| Folk | Greensleeves | Mi minore | Sensazione di valzer in 3/4, mescolanza di modi, stile vocale rinascimentale. |
| Jazz | Autumn Leaves (Kosma) | Sol minore | Progressioni ii-V-I, note guida, ottavi swing, accordi senza fondamentale. |
| Latina | The Girl from Ipanema (Jobim) | Fa maggiore | Ritmo bossa nova, modulazione cromatica, restrizione vocale. |
| New-Age | River Flows in You (Yiruma) | La maggiore | Riconoscimento di accordi I-V-vi-IV, arpeggi fluidi, rubato. |
| Pop | Imagine (Lennon) | Do maggiore | Accompagnamento arpeggiato, restrizione, sincerità vocale. |
| Ragtime | The Entertainer (Joplin) | Do maggiore | Basso "oom-pah", sincopazione, forma a più sezioni, disciplina del tempo. |
| R&B | Superstition (Stevie Wonder) | Si minore | Funk a sedicesimi, tastiera percussiva, note fantasma. |
| Rock | Your Song (Elton John) | Si maggiore | Voicing di pianoforte in stile ballata, inversioni, canto conversazionale. |
| Soul | Lean on Me (Bill Withers) | Do maggiore | Melodia diatonica, accompagnamento gospel, risposta e chiamata. |

I brani passano da uno stato **grezzo** (solo MIDI) a uno stato **annotato** e infine a uno stato **pronto** (completamente riproducibile con linguaggio musicale). L'intelligenza artificiale promuove i brani studiandoli e scrivendo annotazioni con la funzione `annotate_song`.

## Motori Sonori

Sei motori, più un combinatore a strati che ne esegue due contemporaneamente:

| Motore | Tipo | Come suona |
|--------|------|---------------------|
| **Oscillator Piano** | Sintesi additiva | Pianoforte multi-armonico con rumore di martelletto, inarmonia, polifonia a 48 voci, imaging stereo. Nessuna dipendenza. |
| **Sample Piano** | Riproduzione di file WAV | Salamander Grand Piano — 480 campioni, 16 livelli di velocità, 88 tasti. La versione reale. |
| **Vocal (Sample)** | Campioni con variazione di altezza | Timbri vocalici prolungati con portamento e modalità legato. |
| **Vocal Tract** | Modello fisico | Pink Trombone — Forma d'onda glottale a bassa frequenza attraverso un waveguide digitale a 44 celle. Quattro preset: soprano, contralto, tenore, basso. |
| **Vocal Synth** | Sintesi additiva | 15 preset vocali Kokoro con modellazione della formante, respiro, vibrato. Deterministico (generatore di numeri casuali con seme). |
| **Guitar** | Sintesi additiva | Corda pizzicata modellata fisicamente — 4 preset (acciaio dreadnought, nylon classico, jazz archtop, dodici corde), 8 accordature, 17 parametri regolabili. |
| **Layered** | Combinatore | Avvolge due motori e invia ogni evento MIDI a entrambi: pianoforte+sintetizzatore, voce+sintetizzatore, ecc. |

### Timbri per tastiera

Sei timbri per pianoforte regolabili, ognuno con parametri modificabili individualmente (brillantezza, decadimento, durezza del martelletto, disaccordatura, ampiezza stereo e altro):

| Timbre | Caratteristica |
|-------|-----------|
| Grand Concert | Ricco, pieno, classico |
| Pianoforte verticale | Caldo, intimo, folk |
| Pianoforte elettrico | Setoso, jazz, sensazione Fender Rhodes |
| Honky-Tonk | Detuned, ragtime, saloon |
| Music Box | Cristallino, etereo |
| Grande, brillante | Moderno, pop, ritmico |

### Voci di chitarra

Quattro preset di voci di chitarra con sintesi del suono delle corde modellata fisicamente, ognuno con 17 parametri regolabili (brillantezza, risonanza del corpo, posizione del pizzico, smorzamento delle corde e altro):

| Timbre | Caratteristica |
|-------|-----------|
| Chitarra Dreadnought in acciaio | Brillante, equilibrato, acustico classico |
| Chitarra classica in nylon | Caldo, morbido, rotondo |
| Jazz Archtop | Suadente, legnoso, pulito |
| Chitarra a 12 corde | Luminoso, raddoppiato, simile a un chorus |

## Il diario di pratica

Dopo ogni sessione, il server registra ciò che è accaduto: quale canzone, a quale velocità, quante battute, per quanto tempo. L'intelligenza artificiale aggiunge le proprie osservazioni: cosa ha notato, quali schemi ha riconosciuto, cosa provare successivamente.

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

Un file Markdown al giorno, salvato in `~/.ai-jam-sessions/journal/`. Leggibile dagli umani, solo in modalità append. Nella sessione successiva, l'intelligenza artificiale legge il suo diario e riprende da dove si era interrotta.

## Installazione

```bash
npm install -g ai-jam-sessions
```

Richiede **Node.js 18+**. Nessun driver MIDI, nessuna porta virtuale, nessun software esterno.

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

41 strumenti e 3 modelli di prompt in sei categorie:

### Impara

| Strumento | Cosa fa |
|------|--------------|
| `list_songs` | Esplora per genere, difficoltà o parola chiave |
| `song_info` | Analisi musicale completa: struttura, momenti chiave, obiettivi didattici, suggerimenti di stile |
| `registry_stats` | Statistiche a livello di libreria: numero totale di canzoni, generi, difficoltà |
| `list_measures` | Note, dinamiche e note didattiche per ogni battuta |
| `teaching_note` | Analisi approfondita di una singola battuta: diteggiatura, dinamiche, contesto |
| `suggest_song` | Raccomandazione basata su genere, difficoltà e ciò che hai già suonato |
| `practice_setup` | Velocità, modalità, impostazioni della voce e comando CLI consigliati per una canzone |
| `compare_songs` | Riconoscimento di schemi tra generi: relazioni tra le tonalità, somiglianze di altezze/intervalli, forme comuni, collegamenti didattici |
| `annotation_progress` | Valutazione della qualità delle annotazioni in tutta la libreria: punteggi, voti e suggerimenti di miglioramento |
| `server_info` | Versione del server, statistiche della libreria, elenco dei motori, sessione attiva |

### Riproduci

| Strumento | Cosa fa |
|------|--------------|
| `play_song` | Riproduzione tramite altoparlanti: canzoni della libreria o file .mid grezzi. Qualsiasi motore, velocità, modalità, intervallo di battute. |
| `stop_playback` | Ferma |
| `pause_playback` | Metti in pausa o riprendi |
| `set_speed` | Cambia la velocità durante la riproduzione (0.1×–4.0×) |
| `playback_status` | Snapshot in tempo reale: battuta corrente, tempo, velocità, voce della tastiera, stato |
| `view_piano_roll` | Rendering come SVG (colorazione manuale o arcobaleno cromatico per classe di altezze) |
| `score_performance` | Partitura di un accompagnamento MIDI: accuratezza dell'intonazione, tempismo, completezza, con feedback graduato |
| `mute_hand` | Silenzia o riattiva la mano sinistra/destra durante la pratica: isola una mano alla volta |
| `preview_teaching_cues` | Visualizza tutte le note didattiche e i momenti chiave prima di suonare |

### Canta

| Strumento | Cosa fa |
|------|--------------|
| `sing_along` | Testo cantabile: nomi delle note, solfeggio, contorno o sillabe. Con o senza accompagnamento di pianoforte. |
| `ai_jam_sessions` | Genera un breve per l'improvvisazione: progressione di accordi, schema melodico e suggerimenti di stile per la reinterpretazione |

### Chitarra

| Strumento | Cosa fa |
|------|--------------|
| `view_guitar_tab` | Rendering di tablature interattive per chitarra come HTML: modifica con un clic, cursore di riproduzione, scorciatoie da tastiera |
| `list_guitar_voices` | Preset di voci di chitarra disponibili |
| `list_guitar_tunings` | Sistemi di accordatura per chitarra disponibili (standard, drop-D, open G, DADGAD, ecc.) |
| `tune_guitar` | Regola qualsiasi parametro di qualsiasi voce di chitarra. Le impostazioni vengono mantenute tra le sessioni. |
| `get_guitar_config` | Configurazione corrente della voce di chitarra rispetto alle impostazioni predefinite di fabbrica |
| `reset_guitar` | Ripristina le impostazioni predefinite di una voce di chitarra |

### Crea

| Strumento | Cosa fa |
|------|--------------|
| `add_song` | Aggiungi una nuova canzone in formato JSON |
| `import_midi` | Importa un file .mid con metadati |
| `annotate_song` | Scrivere la notazione musicale per un brano grezzo e trasformarlo in una versione completa. |
| `save_practice_note` | Voce di diario con dati della sessione acquisiti automaticamente. |
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

Versione 1.4.0. Sei motori audio, 41 strumenti MCP, 3 modelli di suggerimento, 120 brani in 12 generi con esempi dettagliatamente annotati. Trasposizione di brani, marcatori di sezione, mute/solo per mano per una pratica mirata. Editor interattivo di tablature per chitarra. Interfaccia web con 20 preset vocali, 10 timbri di strumenti, 7 sistemi di accordatura e un'API per la notazione accessibile tramite LLM. Visualizzazione della tastiera in due modalità di colore. Diario di pratica per un apprendimento continuo. Persistenza dello stato della sessione anche dopo il riavvio del server. Creazione di partiture MIDI, valutazione della qualità della notazione e riconoscimento di schemi tra generi. Tutti i file MIDI sono inclusi: la libreria cresce man mano che l'intelligenza artificiale impara.

## Sicurezza e privacy

**Dati accessibili:** libreria di brani (JSON + MIDI), directory dei brani dell'utente (`~/.ai-jam-sessions/songs/`), configurazioni di accordatura della chitarra, voci del diario di pratica, dispositivo di output audio locale.

**Dati NON accessibili:** nessuna API cloud, nessuna credenziale utente, nessun dato di navigazione, nessun file di sistema al di fuori della directory dei brani dell'utente. Non vengono raccolti o trasmessi dati di telemetria.

**Autorizzazioni:** Il server MCP utilizza solo il trasporto stdio (nessun HTTP). L'interfaccia a riga di comando accede al file system locale e ai dispositivi audio. Consultare [SECURITY.md](SECURITY.md) per la politica completa.

## Licenza

MIT.
