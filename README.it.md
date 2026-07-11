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
  <a href="https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions"><img src="https://img.shields.io/npm/v/@mcptoolshop/ai-jam-sessions" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/songs-120_across_12_genres-blue" alt="Songs"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/annotated-120%2F120-green" alt="Ready"></a>
  <a href="datasets/jam-actions-v0-public/README.md"><img src="https://img.shields.io/badge/dataset-jam--actions--v0%20(115_records)-8b5cf6" alt="Training dataset"></a>
  <a href="https://doi.org/10.5281/zenodo.20279919"><img src="https://zenodo.org/badge/DOI/10.5281/zenodo.20279919.svg" alt="DOI"></a>
</p>

---

## Cos'è questo?

Un pianoforte e una chitarra che l'IA impara a suonare. Non un sintetizzatore, non una libreria MIDI: uno strumento didattico.

Un LLM può leggere e scrivere testi, ma non può sperimentare la musica come facciamo noi. Nessuna orecchio, nessuna dita, nessun ricordo motorio. AI Jam Sessions colma questa lacuna fornendo al modello sensi che può effettivamente utilizzare:

- **Lettura:** spartiti MIDI reali con annotazioni musicali approfondite. Non approssimazioni scritte a mano, ma testi analizzati, scomposti e spiegati.
- **Ascolto:** sei motori audio (pianoforte oscillatore, pianoforte campionato, campioni vocali, tratto vocale fisico, sintetizzatore vocale additivo, chitarra modellata fisicamente) che vengono riprodotti attraverso gli altoparlanti, in modo che le persone nella stanza diventino le orecchie dell'IA.
- **Visione:** una tastiera di pianoforte che visualizza ciò che è stato suonato come SVG, un formato leggibile dal modello per verificare e confermare. Un editor interattivo di tablature per chitarra. Una console del browser con una tastiera visiva, un editor di note a doppia modalità e un laboratorio di accordatura.
- **Memoria:** un diario di pratica che persiste tra le sessioni, in modo che l'apprendimento si accumuli nel tempo.
- **Canto:** sintesi del tratto vocale con 20 preset vocali, da soprano d'opera a coro elettronico. Modalità "sing along" con solfeggio, contorno e narrazione delle sillabe.

Ognuna delle 120 canzoni è ora completamente annotata: contesto storico, analisi strutturale barra per barra, momenti chiave, obiettivi didattici e suggerimenti sulle tecniche di esecuzione, in tutti i 12 generi. Una versione precedente di questo file README affermava che le canzoni originali "stavano aspettando che l'IA assorbisse gli schemi, suonasse la musica e scrivesse le proprie annotazioni". Ed è esattamente quello che è successo: le annotazioni sono state scritte dall'IA sulla base di un'analisi deterministica per ogni canzone (accordi, struttura della ripetizione, confini delle sezioni, tonalità verificate), soggetta a una griglia di qualità e verificata in modo contraddittorio affermazione per affermazione (numeri delle misure, finestre degli accordi e conteggi strutturali, tutti verificati rispetto al MIDI effettivo prima che qualsiasi cosa venisse rilasciata).

Da questo stesso lavoro, pubblichiamo anche **[jam-actions-v0](#training-dataset)**: un set di dati pubblico composto da 115 sequenze di utilizzo di strumenti MCP in più fasi su pianoforte classico reale. Insegna agli LLM a eseguire *un uso pratico e mirato della musica simbolica*, non solo la generazione di testo, ed è dotato di una "release gate" a 7 assi che distingue il "trasmettere prove" dal "procedere perché l'attività è banale". Consultare [Training Dataset](#training-dataset) qui sotto per tutti i dettagli.

## La tastiera del pianoforte

La tastiera del pianoforte è il modo in cui l'IA "vede" la musica. Visualizza qualsiasi canzone come SVG: blu per la mano destra, corallo per la sinistra, con griglie di battuta, dinamiche e confini delle misure:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Due modalità colore: **mano** (blu/corallo) o **classe tonale** (arcobaleno cromatico: ogni Do è rosso, ogni Fa# è ciano). Il formato SVG significa che il modello può sia "vedere" l'immagine che leggere il markup per verificare altezza, ritmo e indipendenza delle mani.

## La console

Uno studio di composizione basato su browser che si trova in questo repository all'indirizzo [`apps/cockpit`](apps/cockpit) ed è disponibile online all'indirizzo **[mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)**. Nessun plugin, nessun software DAW, nessuna installazione; tutto rimane nel tuo browser (il tuo lavoro viene salvato automaticamente in locale). Preferisci modificarlo?

```bash
cd apps/cockpit && npm install && npm run dev   # Vite dev server, opens in your browser
```

- **Trasporto preciso al battito:** le note sono sincronizzate con il tempo musicale, quindi il controllo BPM regola effettivamente la riproduzione; una barra del tempo "click-to-seek" con trascinamento per impostare le **regioni di loop**; scorrimento automatico che segue l'indicatore di riproduzione.
- **Registrazione:** suona i tasti QWERTY, la tastiera sullo schermo o un dispositivo Web MIDI e il suono viene registrato nello spartito: conteggio iniziale di 1 battuta, sovraincisione in stile "looper" attraverso cicli di loop (o modalità di sostituzione), tempistica della performance originale preservata sotto una visualizzazione quantizzata, ogni passaggio è un'unità modificabile.
- **Annulla/Ripristina completo:** ogni modifica, inclusi Annulla e Importa, può essere annullata (Ctrl+Z), con gesti di trascinamento che si combinano come farebbero i veri editor.
- **Selezione multipla + area di ritaglio:** selezione tramite marcatura sotto un'opzione per attivare/disattivare lo strumento Selezione/Disegno, clic modificatori standard della piattaforma, copia/taglia/incolla all'indicatore di riproduzione, Duplica.
- **Touch e accessibilità:** eventi puntatore con acquisizione su ogni superficie, tocco per riposizionare come alternativa al trascinamento, modifica delle note tramite tastiera, sovrapposizioni di spartiti sicure per chi soffre di daltonismo.
- **Tastiera del pianoforte a doppia modalità:** passa tra la modalità Strumento (colori cromatici) e la modalità Vocale (note colorate in base alla forma della vocale: /a/ /e/ /i/ /o/ /u/).
- **Tastiera visiva:** due ottave dal Do4, mappata sulla tastiera QWERTY. Clicca o digita.
- **20 preset vocali:** 15 voci mappate Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, più coro e synth-vox), 4 voci mappate sul tratto vocale e una sezione di coro sintetico.
- **10 preset per strumenti:** le 6 voci di pianoforte lato server più synth-pad, organo, campana e archi.
- **Ispettore delle note:** clicca su qualsiasi nota per modificare la velocità, la vocale e la "breathiness".
- **7 sistemi di accordatura:** temperamento equabile, intonazione giusta (maggiore/minore), pitagorico, temperamento a virgola di quarto, Werckmeister III o offset in cent personalizzati. Riferimento A4 regolabile (392–494 Hz).
- **Verifica dell'accordatura:** tabella delle frequenze, tester degli intervalli con analisi della frequenza del battito ed esportazione/importazione dell'accordatura.
- **Importazione/esportazione dello spartito:** serializza l'intero spartito come JSON e caricalo di nuovo.
- **API rivolta all'LLM:** `window.__cockpit` espone `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` e `getScore()` in modo che un LLM possa comporre, arrangiare e riprodurre la musica a livello di programmazione.

## Il ciclo di apprendimento

<p align="center">
  <img src="docs/learning-loop.svg" alt="The learning loop: Read (MIDI + annotations) → Play (six sound engines) → See (piano roll · guitar tab) → Reflect (practice journal), with the journal persisting so the next session picks up where the last left off" width="100%" />
</p>

## La libreria delle canzoni

120 canzoni in 12 generi diversi, create da file MIDI reali. Ogni genere ha un esempio annotato in modo approfondito: contesto storico, analisi armonica barra per barra, momenti chiave, obiettivi didattici e suggerimenti sulle tecniche di esecuzione (inclusa la guida vocale). Questi esempi fungono da modelli: l'IA ne studia uno, quindi annota gli altri.

| Genere | Esempio | Chiave | Cosa insegna |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | Si minore | Forma blues in tonalità minore, schema domanda-risposta, esecuzione leggermente fuori dal tempo |
| Classica | Für Elise (Beethoven) | La minore | Forma in rondò, differenziazione del tocco, disciplina nell'uso del pedale |
| Colonna sonora di un film | Comptine d'un autre été (Tiersen) | Mi minore | Strutture basate su arpeggi, architettura dinamica senza cambiamenti armonici |
| Musica popolare | Greensleeves | Mi minore | Sensazione di valzer in 3/4, mescolanza modale, stile vocale rinascimentale |
| Jazz | Autumn Leaves (Kosma) | Sol minore | Progressioni ii-V-I, note guida, ottavi in swing, accordi senza la fondamentale |
| Musica latina | The Girl from Ipanema (Jobim) | Fa maggiore | Ritmo bossa nova, modulazione cromatica, moderazione vocale |
| New-Age | River Flows in You (Yiruma) | La maggiore | Riconoscimento della progressione I-V-vi-IV, arpeggi fluidi, rubato |
| Pop | Imagine (Lennon) | Do maggiore | Accompagnamento basato su arpeggi, moderazione, sincerità vocale |
| Ragtime | The Entertainer (Joplin) | Do maggiore | Basso "oom-pah", sincopi, forma multi-strofica, disciplina nel tempo |
| R&B | Superstition (Stevie Wonder) | Mi bemolle minore | Funk in sedicesimi, tastiera percussiva, note fantasma |
| Rock | Your Song (Elton John) | Mi bemolle maggiore | Melodia di ballata al pianoforte, inversioni, canto colloquiale |
| Soul | Lean on Me (Bill Withers) | Do maggiore | Melodia diatonica, accompagnamento gospel, schema domanda-risposta |

Le canzoni progrediscono da **grezze** (solo MIDI) a **annotate** e poi diventano **pronte** (completamente riproducibili con il linguaggio musicale). L'IA promuove le canzoni studiandole e scrivendo annotazioni con `annotate_song`.

## Motori del suono

Sei motori, più un combinatore a livelli che esegue due di essi contemporaneamente:

| Motore | Tipo | Come suona |
|--------|------|---------------------|
| **Oscillator Piano** | Sintesi additiva | Pianoforte multi-armonico con rumore di martelletto, inarmonicità, polifonia a 48 voci, immagine stereo. Nessuna dipendenza esterna. |
| **Sample Piano** | Riproduzione WAV | Salamander Grand Piano — 480 campioni, 16 livelli di velocità, 88 tasti. Il suono reale. *Solo API programmatica: i campioni non sono inclusi (è necessario fornire il download di [Salamander](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html)); non ancora collegato alle liste dei motori CLI/MCP.* |
| **Vocal (Sample)** | Campioni con variazione di altezza | Toni vocalici sostenuti con portamento e modalità legato. |
| **Vocal Tract** | Modello fisico | Pink Trombone — forma d'onda glottale LF attraverso una guida d'onda digitale a 44 celle. Quattro preset: soprano, contralto, tenore, basso. |
| **Vocal Synth** | Sintesi additiva | 15 preset vocali Kokoro con modellazione della formante, respiro, vibrato. Deterministico (RNG con seme). |
| **Guitar** | Sintesi additiva | Strumento a corda pizzicata modellato fisicamente — 4 preset (dreadnought in acciaio, classica in nylon, jazz archtop, dodici corde), 8 accordature, 17 parametri regolabili. |
| **Layered** | Combinatore | Combina due motori e invia ogni evento MIDI a entrambi: pianoforte + sintetizzatore, voce + sintetizzatore, ecc. |

### Voci per tastiera

Sei voci di pianoforte regolabili, ciascuna con parametri modificabili (luminosità, decadimento, durezza del martelletto, disintonizzazione, ampiezza stereo e altro):

| Voce | Caratteristica |
|-------|-----------|
| Concert Grand | Ricco, pieno, classico |
| Upright | Caldo, intimo, folk |
| Electric Piano | Setoso, jazzistico, simile a un Fender Rhodes |
| Honky-Tonk | Disintonizzato, ragtime, da saloon |
| Music Box | Cristallino, etereo |
| Bright Grand | Incisivo, contemporaneo, pop |

### Voci per chitarra

Quattro preset di voce per chitarra con sintesi delle corde modellata fisicamente, ciascuno con 17 parametri regolabili (luminosità, risonanza del corpo, posizione del plettro, smorzamento delle corde e altro):

| Voce | Caratteristica |
|-------|-----------|
| Steel Dreadnought | Luminoso, equilibrato, acustico classico |
| Nylon Classical | Caldo, morbido, arrotondato |
| Jazz Archtop | Dolce, legnoso, pulito |
| Twelve-String | Scintillante, raddoppiato, simile a un chorus |

## Il diario della pratica

Dopo ogni sessione, il server registra ciò che è accaduto: quale canzone, a quale velocità, quante misure, per quanto tempo. L'IA aggiunge le proprie riflessioni: cosa ha notato, quali schemi ha riconosciuto, cosa provare dopo.

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

Un file markdown al giorno, memorizzato in `~/.ai-jam-sessions/journal/`. Leggibile dall'uomo, solo aggiunte. Nella sessione successiva, l'IA legge il suo diario e riprende da dove si era interrotta.

## Dataset di addestramento

**jam-actions-v0** — un dataset pubblico di tracce di utilizzo multi-turno degli strumenti MCP, basato su MIDI reali di pianoforte classico. Costruito utilizzando la stessa libreria con cui questo server insegna, il dataset insegna agli LLM a eseguire **un uso pratico e mirato di strumenti in musica simbolica** — non solo generazione di testo.

Ogni registrazione associa una sequenza musicale di quattro misure a un obiettivo didattico annotato e a una *traccia di riferimento*, ovvero una sessione passo dopo passo in cui un assistente utilizza gli strumenti MCP sopra descritti (`get_events_in_measure`, `get_events_in_hand`, `count_distinct_pitch_classes` e il resto dei 9 strumenti dell'interfaccia MIDI) per leggere, analizzare e discutere la sequenza musicale.

| | |
|---|---|
| **DOI** | [**`10.5281/zenodo.20279919`**](https://doi.org/10.5281/zenodo.20279919) — Zenodo, pubblicato il 19 maggio 2026 |
| Registrazioni | 115 (sottoinsieme pubblico) |
| Baseline canonica | E3 post-correzione con 16 registrazioni |
| Composizioni | 8 opere classiche per pianoforte di 6 compositori (Bach, Beethoven, Chopin, Debussy, Mozart, Schumann) |
| MIDI originale | piano-midi.de — arrangiamenti di Bernd Krueger |
| Licenza | CC-BY-SA-3.0-DE (arrangiamenti) per composizioni di pubblico dominio |
| Versione | 0.4.3 (2026-05-19) |
| Schema | `release-gate-assessment/2.0.0` |

**Storia della qualità: il filtro a 7 assi.** Il set di dati include un filtro che distingue tra valutazioni basate su prove concrete e valutazioni eccessivamente ottimistiche. Gli assi da 1 a 6 sono limitanti (soglia assoluta minima, margine composto, frequenza di utilizzo degli strumenti, correttezza dopo l'uso dello strumento, numero di interpretazioni errate, soglia minima); l'asse 7 indica la presenza o assenza di informazioni aggiuntive. Gli assi 2 e 6 consentono una categoria `ceiling_saturated_pass`, in modo che le registrazioni che ottengono un punteggio di 1,000 nelle condizioni di sola analisi testuale / analisi con strumenti / MIDI casuale non alterino i livelli più difficili. La baseline Slice 22 **SUPERARE** il filtro rivisto. La baseline Slice 19 lo **NON SUPERARE** ancora: è stata mantenuta come strumento diagnostico per garantire l'efficacia del filtro.

**Riproducibilità.** Un nuovo collaboratore su qualsiasi piattaforma (Windows nativo, macOS, Linux, WSL) può verificare il pacchetto e riprodurre la valutazione PASS canonica in meno di un minuto:

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions && pnpm install
pnpm exec tsx scripts/verify-public-package-checksums.ts        # 274 entries, ~2s
pnpm exec tsx scripts/check-release-gate.ts \
  datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json
# → "Aggregate: PASS" (exit 0)
```

Il file `.gitattributes` imposta i terminatori di riga LF per `*.sha256` e l'albero del set di dati pubblico, in modo che lo strumento di verifica della checksum funzioni su tutte le piattaforme. L'interfaccia a riga di comando del filtro è rigida (rifiuta argomenti posizionali sconosciuti o multipli), quindi i nuovi collaboratori non possono attivarla accidentalmente.

**Dove trovarlo.** La registrazione pubblicata su Zenodo è disponibile all'indirizzo https://zenodo.org/records/20279919 (DOI: [`10.5281/zenodo.20279919`](https://doi.org/10.5281/zenodo.20279919)), e il set di dati è replicato su Hugging Face all'indirizzo [`mcp-tool-shop/jam-actions-v0`](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0) per gli utenti di `load_dataset()`. La scheda completa del set di dati è disponibile all'indirizzo [`datasets/jam-actions-v0-public/README.md`](datasets/jam-actions-v0-public/README.md). I metadati della pubblicazione su Zenodo sono disponibili all'indirizzo [`zenodo-metadata.json`](datasets/jam-actions-v0-public/zenodo-metadata.json), i metadati per la citazione all'indirizzo [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff), la ricevuta della pubblicazione all'indirizzo [`publication-receipt.json`](datasets/jam-actions-v0-public/publication-receipt.json) e le note di rilascio all'indirizzo [`RELEASE_NOTES.md`](datasets/jam-actions-v0-public/RELEASE_NOTES.md). La sequenza di 25 fasi della creazione, dalla bozza iniziale del corpus alla correzione dell'errore "off-by-one", alla revisione di Schumann, alla revisione del filtro RC, all'audit sull'utilizzo da parte di un singolo operatore e all'esecuzione della pubblicazione, è disponibile in [`docs/`](docs/).

**Citare.** `mcp-tool-shop-org & Krueger, B. (2026). AI Jam Sessions — Tool-Use Traces v0 (Public Subset). Zenodo. https://doi.org/10.5281/zenodo.20279919`

**Apporta effettivamente dei miglioramenti? — i risultati del perfezionamento.** Le affermazioni relative al set di dati vengono verificate in modo rigoroso: le versioni perfezionate preregistrate vengono confrontate con una base di riferimento sigillata, e le regole per garantire l'integrità vengono fissate prima dell'inizio dell'addestramento. **v0** (solo i 78 esempi) ha prodotto un *risultato negativo onesto*: il sistema di domande e risposte basato su strumenti ha ottenuto un punteggio di 0,661 → 0,601 ([relazione](docs/finetune-arc-eval-report.md)). **v1** (un set di dati con 494 esempi che include esempi verificati durante l'esecuzione e adattati per il contesto) ha migliorato la stessa metrica da 0,661 a **0,863** (+0,202, permutazione p = 0,0043, tutti i cinque set di dati hanno superato la base di riferimento, con un miglioramento di +0,433 per il brano non visto) — e viene comunque rilasciato come *"migliore in termini di direzione, ma con prestazioni limitate"* perché 12 su 16 confronti a coppie non hanno raggiunto l'obiettivo preregistrato di ≥13/16 vittorie ([relazione](docs/finetune-arc-v1-eval-report.md)). Nessun adattatore viene pubblicato in caso di risultati quasi soddisfacenti. Tutti gli esempi, le impostazioni, le modifiche e i dati per ogni set sono disponibili in [`experiments/`](experiments/) — l'obiettivo è la coerenza.

> Gli arrangiamenti MIDI sono opera di Bernd Krueger (piano-midi.de), con licenza CC-BY-SA-3.0-DE. Le annotazioni, le tracce e gli artefatti di valutazione sono opera del team AI Jam Sessions e vengono rilasciati con la stessa licenza, in modo che la catena "share-alike" sia preservata dall'inizio alla fine. **Limite della licenza:** la licenza MIT del repository copre il codice; tutto ciò che si trova in `datasets/` è soggetto a licenza CC-BY-SA-3.0-DE. Il corpus di lavoro in `datasets/jam-actions-v0/` contiene inoltre due opere (Satie Gymnopédie No. 1, Debussy Arabesque No. 1) che sono *escluse* dal sottoinsieme pubblicato perché la loro origine nell'arrangiamento non poteva essere verificata: vedere [`datasets/jam-actions-v0/PROVENANCE-NOTE.md`](datasets/jam-actions-v0/PROVENANCE-NOTE.md).

## Installazione

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

Richiede **Node.js 22+** (la versione v2.0.0 ha aumentato il requisito minimo con `node-web-audio-api` 2.0). Nessun driver MIDI, nessuna porta virtuale, nessun software esterno.

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

46 strumenti e 3 modelli di prompt suddivisi in sette categorie:

### Scopri

| Strumento | A cosa serve |
|------|--------------|
| `list_songs` | Cerca per genere, difficoltà o parola chiave |
| `song_info` | Analisi musicale completa: struttura, momenti chiave, obiettivi didattici, suggerimenti sullo stile |
| `registry_stats` | Statistiche sull'intera libreria: numero totale di brani, generi, difficoltà |
| `list_measures` | Note, dinamiche e note didattiche per ogni misura |
| `teaching_note` | Analisi approfondita di una singola misura: diteggiatura, dinamiche, contesto |
| `suggest_song` | Raccomandazione basata sul genere, sulla difficoltà e su ciò che hai suonato |
| `practice_setup` | Velocità, modalità, impostazioni della voce e comando CLI consigliati per un brano |
| `compare_songs` | Riconoscimento di schemi tra generi: relazioni chiave, somiglianze di tonalità/intervallo, forme condivise, connessioni didattiche |
| `annotation_progress` | Monitoraggio della qualità delle annotazioni in tutta la libreria: punteggi, valutazioni e suggerimenti per il miglioramento |
| `server_info` | Versione del server, statistiche della libreria, elenco dei motori, sessione attiva |

### Riproduci

| Strumento | A cosa serve |
|------|--------------|
| `play_song` | Riproduci tramite gli altoparlanti: brani della libreria o file .mid non elaborati. Quattro motori (pianoforte, voce, strumento a fiato, chitarra), qualsiasi velocità, modalità, intervallo di misure, oltre a un metronomo con conteggio iniziale e un flag "registra" che cattura la sessione per la valutazione. Il sintetizzatore e i motori stratificati sono disponibili solo tramite CLI. |
| `stop_playback` | Stop |
| `pause_playback` | Metti in pausa o riprendi |
| `set_speed` | Modifica la velocità durante la riproduzione (0,1×–4,0×) |
| `playback_status` | Snapshot in tempo reale: misura corrente, tempo, velocità, voce della tastiera, stato |
| `view_piano_roll` | Renderizza come SVG (colore delle note o arcobaleno cromatico delle classi di altezza) |
| `score_performance` | Valuta una traccia MIDI per l'accompagnamento: precisione dell'intonazione, ritmo, completezza, con feedback graduale |
| `mute_hand` | Disattiva o riattiva la mano sinistra/destra durante la pratica: isola una mano alla volta |
| `detect_chord` | Identifica l'accordo da un insieme di note MIDI attualmente in riproduzione (ad esempio, `[60,64,67]` → Do) |
| `preview_teaching_cues` | Visualizza tutte le note didattiche e i momenti chiave prima di iniziare a suonare |

### Pratica

| Strumento | A cosa serve |
|------|--------------|
| `practice_loop` | L'esercizio che un insegnante reale assegna: ripeti le misure 5-8 più lentamente, e il tempo aumenta (+5%) solo dopo una esecuzione *perfetta*: ogni esecuzione viene registrata, valutata e riassunta. |
| `practice_status` | Stato dell'esercizio: esecuzione corrente, velocità e diagnostica per misura dell'ultima esecuzione |
| `score_last_take` | Valuta l'ultima esecuzione registrata: precisione dell'intonazione, ritmo, completezza, valutazioni per nota |
| `view_scored_piano_roll` | La partitura annotata che ogni insegnante utilizza: la tastiera del pianoforte sovrapposta alle valutazioni per nota in una tavolozza a prova di daltonismo (solido = corretto, tratteggiato = ritmo, ✕ = mancante) |

### Canta

| Strumento | A cosa serve |
|------|--------------|
| `sing_along` | Testo cantabile: nomi delle note, solfeggio, melodia o sillabe. Con o senza accompagnamento di pianoforte. |
| `ai_jam_sessions` | Genera un breve schema per l'improvvisazione: progressione degli accordi, schema della melodia e suggerimenti sullo stile per la reinterpretazione |

### Chitarra

| Strumento | A cosa serve |
|------|--------------|
| `view_guitar_tab` | Renderizza una tablatura interattiva per chitarra come HTML: clicca per modificare, cursore di riproduzione, scorciatoie da tastiera |
| `list_guitar_voices` | Preset delle voci per chitarra disponibili |
| `list_guitar_tunings` | Sistemi di accordatura per chitarra disponibili (standard, drop-D, open G, DADGAD, ecc.) |
| `tune_guitar` | Regola qualsiasi parametro di qualsiasi voce per chitarra. Le impostazioni vengono mantenute tra le sessioni. |
| `get_guitar_config` | Configurazione corrente della voce per chitarra rispetto alle impostazioni predefinite |
| `reset_guitar` | Ripristina le impostazioni predefinite di una voce per chitarra |

### Crea

| Strumento | A cosa serve |
|------|--------------|
| `add_song` | Aggiungi una nuova canzone come JSON |
| `import_midi` | Importa un file .mid con metadati |
| `annotate_song` | Scrivi il linguaggio musicale per una canzone non elaborata e promuovila a "pronta" |
| `save_practice_note` | Voce del diario con dati di sessione acquisiti automaticamente |
| `read_practice_journal` | Carica le voci recenti per fornire un contesto |
| `list_keyboards` | Voci della tastiera disponibili |
| `tune_keyboard` | Regola qualsiasi parametro di qualsiasi voce della tastiera. Le impostazioni vengono mantenute tra le sessioni. |
| `get_keyboard_config` | Configurazione corrente rispetto alle impostazioni predefinite |
| `reset_keyboard` | Ripristina le impostazioni predefinite di una voce della tastiera |
| `score_annotation` | Qualità dell'annotazione della partitura in base a 5 dimensioni: completezza, profondità, specificità, valore didattico, vocabolario |
| `validate_song_entry` | Valida un file JSON di una canzone rispetto allo schema prima di aggiungerlo |
| `transpose_song` | Trasponi una canzone verso l'alto o verso il basso per semitoni: nuova tonalità, nuove note |
| `list_sections` | Visualizza le sezioni strutturali di una canzone (Introduzione, Strofa, Ritornello, ecc.) |
| `add_section` | Aggiungi un marcatore di sezione a una canzone per la navigazione strutturale |

### Suggerimenti MCP

Tre modelli di suggerimento per flussi di lavoro didattici strutturati:

| Suggerimento | A cosa serve |
|--------|--------------|
| `annotate_song` | Flusso di lavoro guidato per l'annotazione: studia un esempio, scrivi il linguaggio musicale per una canzone non elaborata |
| `practice_plan` | Crea un piano di pratica strutturato in base al genere, alla difficoltà e agli obiettivi |
| `performance_review` | Rivedi una sessione completata: cosa è andato bene, su cosa concentrarsi successivamente |

## CLI

```
ai-jam-sessions list [--genre <genre>] [--difficulty <level>]
ai-jam-sessions play <song-id> [--speed <mult>] [--mode <mode>] [--engine <piano|vocal|tract|synth|guitar|piano+synth|guitar+synth>] [--metronome] [--count-in <bars>] [--record]
ai-jam-sessions practice <song-id> --measures <start-end> [--start-speed <pct>] [--target <pct>] [--step <pct>]
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

v2.0.0 — la versione in cui il set di dati ha dimostrato la sua coerenza (vedere [CHANGELOG](CHANGELOG.md)). **Importante: il requisito minimo per Node.js è ora 22** (`node-web-audio-api` 2.0); l'interfaccia dello strumento rimane invariata: sei motori audio, 46 strumenti MCP, 3 modelli di prompt e una **libreria completamente annotata: 120/120 brani in 12 generi** (12 campi chiave corretti per riflettere le tonalità rilevate nel contenuto in questa versione). Il ciclo di apprendimento è completo dall'inizio alla fine: metronomo con conteggio iniziale → registrazione dal vivo → valutazione nota per nota → partitura del pianoforte annotata → cicli di pratica che aumentano il tempo solo dopo passaggi completi. L'interfaccia nel browser è un vero strumento di composizione: trasporto preciso al ritmo con regioni di loop, acquisizione con attivazione della registrazione, annullamento/ripetizione completo, selezione multipla e area di copia-incolla, supporto touch — [disponibile online](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/).

Pubblica anche **[jam-actions-v0](#training-dataset)** — un set di dati di addestramento con 115 esempi di sequenze di utilizzo di strumenti MCP in più fasi su brani per pianoforte classici, con una soglia di rilascio a 7 assi, riproducibilità in condizioni iniziali e metadati completi Zenodo + CITATION.cff (CC-BY-SA-3.0-DE) — replicato su [Hugging Face](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0), e ora include **risultati del perfezionamento in entrambe le direzioni**: un risultato negativo onesto (v0) e un miglioramento disciplinato tramite preregistrazione che si è fermato a una vittoria di distanza dall'obiettivo prefissato (v1) — vedere i [risultati del perfezionamento](#training-dataset). Questa versione corregge anche i brani di Bach alla fonte (revisioni dell'insieme di lavoro r001/r002 con correzioni) dopo che la soglia di rilascio della pipeline v1 ha rilevato che il set pubblicato superava le 62 misure effettive del BWV 846. 2506 test superati tra il server MCP, l'interfaccia, i pacchetti di dati e gli strumenti di valutazione e la soglia di rilascio. Il MIDI è tutto incluso, ogni brano può essere utilizzato per l'addestramento e il corpus di apprendimento viene fornito insieme ad esso.

## Sicurezza e privacy

**Dati interessati:** libreria di canzoni (JSON + MIDI), directory delle canzoni dell'utente (`~/.ai-jam-sessions/songs/`), configurazioni di accordatura per chitarra, voci del diario di pratica, dispositivo di output audio locale.

**Dati NON interessati (percorsi predefiniti):** il server MCP e la CLI non effettuano chiamate di rete, non leggono credenziali e non toccano file di sistema al di fuori della directory delle canzoni dell'utente. Non vengono raccolti o inviati dati di telemetria. Lo **strumento di set di dati/valutazione opzionale** fornito nello stesso pacchetto (`scripts/run-llm-eval.ts`, verificatore della provenienza) è l'unica eccezione: quando lo si richiama esplicitamente, può chiamare le API LLM (legge `ANTHROPIC_API_KEY` dall'ambiente, non la memorizza mai) e recuperare gli URL di provenienza. Non viene eseguito come parte del server, della CLI o dell'installazione.

**Autorizzazioni:** il server MCP utilizza esclusivamente il protocollo di trasporto stdio (non HTTP). L’interfaccia a riga di comando accede al file system locale e ai dispositivi audio. Per l’elenco completo delle autorizzazioni, consultare il documento [SECURITY.md](SECURITY.md).

## Licenza

Licenza MIT
