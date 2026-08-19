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
  <a href="https://doi.org/10.5281/zenodo.20279918"><img src="https://zenodo.org/badge/DOI/10.5281/zenodo.20279918.svg" alt="DOI"></a>
</p>

---

## Cos'è questo?

Un pianoforte e una chitarra che l'IA impara a suonare. Non un sintetizzatore, non una libreria MIDI: uno strumento didattico.

Un LLM può leggere e scrivere testi, ma non può sperimentare la musica come facciamo noi. Nessuna orecchio, nessuna dita, nessun ricordo motorio. AI Jam Sessions colma questa lacuna fornendo al modello sensi che può effettivamente utilizzare:

- **Lettura:** spartiti MIDI reali con annotazioni musicali approfondite. Non approssimazioni scritte a mano, ma testi analizzati, interpretati e spiegati.
- **Ascolto:** sei motori audio (pianoforte oscillatore, pianoforte campionato, campioni vocali, tratto vocale fisico, sintetizzatore vocale additivo, chitarra modellata fisicamente) che vengono riprodotti attraverso gli altoparlanti, in modo che le persone nella stanza diventino le orecchie dell'IA.
- **Visione:** una tastiera di pianoforte che visualizza ciò che è stato suonato come SVG, un formato che il modello può leggere e verificare. Un editor interattivo di tablature per chitarra. Una console del browser con una tastiera visiva, un editor di note a doppia modalità e un laboratorio di accordatura.
- **Memoria:** un diario di esercizi che persiste tra le sessioni, in modo che l'apprendimento si accumuli nel tempo.
- **Canto:** sintesi del tratto vocale con 20 preset vocali, da soprano d'opera a coro elettronico. Modalità "sing along" con solfeggio, contorno e narrazione delle sillabe.

Ognuna delle 120 canzoni è ora completamente annotata: contesto storico, analisi strutturale barra per barra, momenti chiave, obiettivi didattici e suggerimenti sulle tecniche di esecuzione, in tutti i 12 generi. Una versione precedente di questo file README affermava che le canzoni originali stavano "aspettando che l'IA assorbisse gli schemi, suonasse la musica e scrivesse le proprie annotazioni". Questo è esattamente ciò che è successo: le annotazioni sono state scritte dall'IA sulla base di un'analisi deterministica per ogni canzone (accordi, struttura della ripetizione, confini delle sezioni, tonalità verificate), soggetta a una griglia di qualità e verificata in modo contraddittorio affermazione per affermazione: numeri delle misure, finestre degli accordi e conteggi strutturali sono tutti stati verificati rispetto al MIDI effettivo prima che qualsiasi cosa fosse rilasciata.

Da questo stesso lavoro, pubblichiamo anche **[jam-actions-v0](#training-dataset)**: un set di dati pubblico di 115 tracce di utilizzo di strumenti MCP in più fasi su pianoforte classico reale. Insegna agli LLM a eseguire *un uso pratico e contestuale della musica simbolica*, non solo la generazione di testo, ed è dotato di una porta di rilascio a 7 assi che distingue "la trasmissione di prove" da "l'accettazione perché il compito è banale". Consultare [Training Dataset](#training-dataset) qui sotto per tutti i dettagli.

## La tastiera del pianoforte

La tastiera del pianoforte è il modo in cui l'IA "vede" la musica. Visualizza qualsiasi canzone come SVG: blu per la mano destra, corallo per la sinistra, con griglie di battuta, dinamiche e confini delle misure:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Due modalità colore: **mano** (blu/corallo) o **classe tonale** (arcobaleno cromatico: ogni Do è rosso, ogni Fa# è ciano). Il formato SVG significa che il modello può sia vedere l'immagine che leggere il markup per verificare altezza, ritmo e indipendenza delle mani.

## La console

Uno studio di composizione basato su browser che si trova in questo repository all'indirizzo [`apps/cockpit`](apps/cockpit) e funziona in tempo reale all'indirizzo **[mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)**. Nessun plugin, nessun software DAW, nessuna installazione; tutto rimane nel tuo browser (il tuo lavoro viene salvato automaticamente in locale). Preferisci modificarlo?

```bash
cd apps/cockpit && npm install && npm run dev   # Vite dev server, opens in your browser
```

- **Trasporto preciso al battito:** le note sono sincronizzate con il tempo musicale, quindi il controllo BPM regola effettivamente la riproduzione; una barra del tempo cliccabile per spostarsi nel tempo con la possibilità di trascinare per impostare le **regioni di loop**; scorrimento automatico che segue l'indicatore di riproduzione.
- **Registrazione:** suona i tasti QWERTY, la tastiera sullo schermo o un dispositivo Web MIDI e il suono viene registrato nello spartito: 1 battuta di introduzione, sovraincisione in stile looper durante i cicli di loop (o modalità di sostituzione), la tempistica della performance originale viene preservata sotto una visualizzazione quantizzata, ogni passaggio è un'unità modificabile.
- **Annulla/Ripristina completo:** ogni modifica, inclusi Annulla e Importa, può essere annullata (Ctrl+Z), con gesti di trascinamento che si combinano come farebbero i veri editor.
- **Selezione multipla + area di ritaglio:** selezione tramite marcatura sotto un'opzione per attivare/disattivare lo strumento Selezione/Disegno, clic modificatori standard della piattaforma, copia/taglia/incolla all'indicatore di riproduzione, Duplica.
- **Touch e accessibilità:** eventi puntatore con acquisizione su ogni superficie, tocco per spostare come alternativa al trascinamento, modifica delle note tramite tastiera, sovrapposizioni di spartiti sicure per chi soffre di daltonismo.
- **Tastiera del pianoforte a doppia modalità:** passa tra la modalità Strumento (colori cromatici) e la modalità Vocale (note colorate in base alla forma della vocale: /a/ /e/ /i/ /o/ /u/).
- **Tastiera visiva:** due ottave dal Do4, mappata sulla tastiera QWERTY. Clicca o digita.
- **20 preset vocali:** 15 voci mappate Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, più coro e voce sintetica), 4 voci mappate sul tratto vocale e una sezione di coro sintetico.
- **10 preset per strumenti:** le 6 voci di pianoforte lato server più synth-pad, organo, campana e archi.
- **Ispettore delle note:** clicca su qualsiasi nota per modificare la velocità, la vocale e l'intensità.
- **7 sistemi di accordatura:** temperamento equabile, intonazione giusta (maggiore/minore), pitagorico, quarto-comma mesotonico, Werckmeister III o offset in cent personalizzati. Riferimento A4 regolabile (392–494 Hz).
- **Controllo dell'accordatura:** tabella delle frequenze, tester di intervalli con analisi della frequenza di battito ed esportazione/importazione dell'accordatura.
- **Importazione/esportazione dello spartito:** serializza l'intero spartito come JSON e caricalo nuovamente.
- **API rivolta all'LLM:** `window.__cockpit` espone `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` e `getScore()` in modo che un LLM possa comporre, arrangiare e riprodurre a livello di programma.

## Il ciclo di apprendimento

<p align="center">
  <img src="docs/learning-loop.svg" alt="The learning loop: Read (MIDI + annotations) → Play (six sound engines) → See (piano roll · guitar tab) → Reflect (practice journal), with the journal persisting so the next session picks up where the last left off" width="100%" />
</p>

## La libreria delle canzoni

120 canzoni in 12 generi diversi, create da file MIDI reali. Ogni genere ha un esempio approfonditamente annotato, con contesto storico, analisi armonica barra per barra, momenti chiave, obiettivi didattici e suggerimenti sulle tecniche di esecuzione (inclusa la guida vocale). Questi esempi fungono da modelli: l'IA ne studia uno, quindi annota gli altri.

| Genere | Esempio | Tonalità | Cosa insegna |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | Si minore | Forma blues minore, schema domanda e risposta, esecuzione leggermente in ritardo rispetto al tempo |
| Classico | Per Elisa (Beethoven) | La minore | Forma di rondò, differenziazione del tocco, disciplina nell'uso del pedale |
| Colonna sonora cinematografica | Comptine d'un autre été (Tiersen) | Mi minore | Strutture arpeggiate, architettura dinamica senza cambiamenti armonici |
| Musica popolare | Greensleeves | Mi minore | Sensazione di valzer in 3/4, mescolanza modale, stile vocale rinascimentale |
| Jazz | Autumn Leaves (Kosma) | Sol minore | Progressioni ii-V-I, note guida, ottavi in swing, accordature senza la nota fondamentale |
| Musica latina | The Girl from Ipanema (Jobim) | Fa maggiore | Ritmo bossa nova, modulazione cromatica, moderazione vocale |
| New-Age | River Flows in You (Yiruma) | La maggiore | Riconoscimento I-V-vi-IV, arpeggi fluidi, rubato |
| Pop | Imagine (Lennon) | Do maggiore | Accompagnamento arpeggiato, moderazione, sincerità vocale |
| Ragtime | The Entertainer (Joplin) | Do maggiore | Basso "oom-pah", sincopi, forma multi-strofica, disciplina nel tempo |
| R&B | Superstition (Stevie Wonder) | Mi bemolle minore | Funk in sedicesimi, tastiera percussiva, note fantasma |
| Rock | Your Song (Elton John) | Mi bemolle maggiore | Melodia di ballata al pianoforte, conduzione delle voci, inversioni, canto colloquiale |
| Soul | Lean on Me (Bill Withers) | Do maggiore | Melodia diatonica, accompagnamento gospel, schema domanda e risposta |

Le canzoni progrediscono da **grezze** (solo MIDI) a **annotate** a **pronte** (completamente riproducibili con il linguaggio musicale). L'IA promuove le canzoni studiandole e scrivendo annotazioni con `annotate_song`.

## Motori del suono

Sei motori, più un combinatore a livelli che esegue due di essi contemporaneamente:

| Motore | Tipo | Come suona |
|--------|------|---------------------|
| **Oscillator Piano** | Sintesi additiva | Pianoforte multi-armonico con rumore di martello, inarmonicità, polifonia a 48 voci, immagine stereo. Nessuna dipendenza. |
| **Sample Piano** | Riproduzione WAV | Salamander Grand Piano — 480 campioni, 16 livelli di velocità, 88 tasti. La realtà. *Solo API programmatica: i campioni non sono inclusi (si prega di fornire il download di [Salamander](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html)); non ancora collegato alle liste dei motori CLI/MCP.* |
| **Vocal (Sample)** | Campioni con variazione di altezza | Toni vocali sostenuti con portamento e modalità legato. |
| **Vocal Tract** | Modello fisico | Pink Trombone — forma d'onda glottale LF attraverso un waveguide digitale a 44 celle. Quattro preset: soprano, contralto, tenore, basso. |
| **Vocal Synth** | Sintesi additiva | 15 preset vocali Kokoro con modellazione della formante, respiro, vibrato. Deterministico (RNG con seme). |
| **Guitar** | Sintesi additiva | Corda pizzicata modellata fisicamente — 4 preset (dreadnought in acciaio, classica in nylon, jazz archtop, a dodici corde), 8 accordature, 17 parametri regolabili. |
| **Layered** | Combinatore | Combina due motori e invia ogni evento MIDI a entrambi: pianoforte + sintetizzatore, voce + sintetizzatore, ecc. |

### Voci per tastiera

Sei voci di pianoforte regolabili, ciascuna con parametri regolabili (luminosità, decadimento, durezza del martello, distorsione, ampiezza stereo e altro):

| Voce | Caratteristica |
|-------|-----------|
| Concert Grand | Ricco, pieno, classico |
| Upright | Caldo, intimo, popolare |
| Electric Piano | Setoso, jazzistico, stile Fender Rhodes |
| Honky-Tonk | Distorto, ragtime, da saloon |
| Music Box | Cristallino, etereo |
| Bright Grand | Incisivo, contemporaneo, pop |

### Voci per chitarra

Quattro preset di voci per chitarra con sintesi delle corde modellata fisicamente, ciascuno con 17 parametri regolabili (luminosità, risonanza del corpo, posizione del pizzico, smorzamento delle corde e altro):

| Voce | Caratteristica |
|-------|-----------|
| Steel Dreadnought | Luminoso, equilibrato, acustica classica |
| Nylon Classical | Caldo, morbido, arrotondato |
| Jazz Archtop | Dolce, legnoso, pulito |
| Twelve-String | Scintillante, raddoppiato, simile a un chorus |

## Il diario della pratica

Dopo ogni sessione, il server registra ciò che è accaduto: quale canzone, quale velocità, quante misure, quanto tempo. L'IA aggiunge le proprie riflessioni: cosa ha notato, quali schemi ha riconosciuto, cosa provare dopo.

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

Un file markdown al giorno, archiviato in `~/.ai-jam-sessions/journal/`. Leggibile dall'uomo, solo aggiunte. Nella sessione successiva, l'IA legge il suo diario e riprende da dove si era interrotta.

## Dataset di addestramento

**jam-actions-v0** — un dataset pubblico di tracce di utilizzo multi-turno degli strumenti MCP, basato su MIDI reali di pianoforte classico. Costruito utilizzando la stessa libreria con cui questo server insegna, il dataset insegna agli LLM a eseguire **un utilizzo pratico e contestuale della musica simbolica**, non solo la generazione di testo.

Ogni record associa una finestra di frase di 4 misure a un target di insegnamento annotato e a una *traccia target* — una sessione passo dopo passo in cui un assistente utilizza gli strumenti MCP sopra (`get_events_in_measure`, `get_events_in_hand`, `count_distinct_pitch_classes` e il resto delle 9 voci dell'ispettore MIDI) per leggere, analizzare e discutere la frase.

| | |
|---|---|
| **DOI** | [**`10.5281/zenodo.20279918`**](https://doi.org/10.5281/zenodo.20279918) — concept DOI, resolves to the latest published version (v0.5.0: [`10.5281/zenodo.21313954`](https://doi.org/10.5281/zenodo.21313954), published 2026-07-11) |
| Record | 115 (sottoinsieme pubblico) |
| Baseline canonica | E3 post-riparazione a 16 record |
| Composizioni | 8 brani classici per pianoforte di 6 compositori (Bach, Beethoven, Chopin, Debussy, Mozart, Schumann) |
| MIDI di origine | piano-midi.de — arrangiamenti di Bernd Krueger |
| Licenza | CC-BY-SA-3.0-DE (arrangiamenti) per composizioni di pubblico dominio |
| Versione | 0.5.0 (11 luglio 2026) — versione correttiva di Bach BWV 846, errori 001 + 002 |
| Schema | `release-gate-assessment/2.0.0` |

**Valutazione della qualità: il sistema di rilascio a 7 assi.** Il set di dati include un sistema di rilascio che distingue tra passaggi basati su prove concrete e passaggi con risultati insoddisfacenti. Gli assi da 1 a 6 sono limitanti (soglia assoluta, margine composto, frequenza di utilizzo degli strumenti, correttezza dopo l'uso dello strumento, numero di interpretazioni errate, soglia minima); l'asse 7 indica la presenza o assenza di elementi arricchenti. Gli assi 2 e 6 ammettono un bucket `ceiling_saturated_pass` in modo che i record con un punteggio di 1.000 nelle condizioni solo testuale / ispezionato con strumenti / MIDI casuale non alterino i livelli più difficili. Il valore di riferimento di Slice 22 **SODDISFA** il sistema di rilascio rivisto. Il valore di riferimento di Slice 19 continua a **NON SODDISFARLO**, ma viene mantenuto come strumento diagnostico per garantire l'efficacia del sistema.

**Riproducibilità.** Un nuovo collaboratore su qualsiasi piattaforma (Windows nativo, macOS, Linux, WSL) può verificare il pacchetto e riprodurre il risultato positivo in meno di un minuto:

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions && pnpm install
pnpm exec tsx scripts/verify-public-package-checksums.ts        # 274 entries, ~2s
pnpm build && pnpm exec tsx scripts/verify-public-package-execution.ts
# → "VERDICT: PASS" — every frozen tool call replays live (needs an audio device)
git show jam-actions-v0-feature-marketed-2026-05-19:datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json > /tmp/b.json
pnpm exec tsx scripts/check-release-gate.ts /tmp/b.json
# → "Aggregate: PASS" (exit 0) — the sealed baseline ships in the v0.4.3 deposit; v0.5.0 restores it from git history
```

`.gitattributes` imposta i terminatori di riga LF per `*.sha256` e l'albero del set di dati pubblico, in modo che il verificatore della somma di controllo funzioni su tutte le piattaforme. L'interfaccia a riga di comando del sistema di rilascio è rigorosa (rifiuta argomenti posizionali sconosciuti o multipli), quindi i nuovi collaboratori non possono attivarla inavvertitamente.

**Dove trovarlo.** Il record Zenodo si trova all'indirizzo DOI [`10.5281/zenodo.20279918`](https://doi.org/10.5281/zenodo.20279918) (sempre l'ultima versione; la v0.5.0 è stata pubblicata l'11 luglio 2026 all'indirizzo https://zenodo.org/records/21313954), e il set di dati è replicato su Hugging Face all'indirizzo [`mcp-tool-shop/jam-actions-v0`](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0) per gli utenti `load_dataset()`. La scheda completa del set di dati si trova all'indirizzo [`datasets/jam-actions-v0-public/README.md`](datasets/jam-actions-v0-public/README.md). I metadati del deposito Zenodo si trovano all'indirizzo [`zenodo-metadata.json`](datasets/jam-actions-v0-public/zenodo-metadata.json), i metadati per la citazione all'indirizzo [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff), la ricevuta della pubblicazione all'indirizzo [`publication-receipt.json`](datasets/jam-actions-v0-public/publication-receipt.json) e le note di rilascio all'indirizzo [`RELEASE_NOTES.md`](datasets/jam-actions-v0-public/RELEASE_NOTES.md). L'arco di creazione delle 25 sezioni, dalla bozza iniziale del corpus alla correzione dell'errore "off-by-one", alla revisione di Schumann, alla revisione del sistema RC-gate, all'audit sull'utilizzo da parte di un singolo operatore e all'esecuzione della pubblicazione, si trova all'indirizzo [`docs/`](docs/).

**Citare.** `mcp-tool-shop-org & Krueger, B. (2026). AI Jam Sessions — Tool-Use Traces v0 (Public Subset). Zenodo. https://doi.org/10.5281/zenodo.20279918`

**Funziona davvero per l'addestramento? — i risultati del fine-tuning, tre fasi.** Le affermazioni del set di dati vengono testate in modo rigoroso: il fine-tuning preregistrato viene valutato rispetto a valori di riferimento sigillati, con le regole di onestà congelate prima di qualsiasi addestramento. **v0** (le sole 78 tracce Jam) ha restituito un *risultato negativo onesto*: la QA basata su strumenti è passata da 0,661 a 0,601 ([relazione](docs/finetune-arc-eval-report.md)). **v1** (un set di dati con 494 esempi che aggiunge tracce verificate durante l'esecuzione e modellate per il grounding) ha migliorato la stessa metrica di +0,202, con tutti i cinque seed al di sopra del valore di riferimento, ma è stato comunque rilasciato come *"migliore in termini direzionali, ma non sufficiente"* perché 12 su 16 vittorie a confronto non hanno superato la soglia preregistrata di ≥13/16; nessun adattatore pubblicato da un risultato quasi positivo ([relazione](docs/finetune-arc-v1-eval-report.md)). **B-1** ha quindi ritestato gli artefatti *congelati* di v1 su una coorte preregistrata di 36 record, composta principalmente da materiale escluso: 0,678 → **0,890** (+0,212, 29/36 vittorie a confronto rispetto alla soglia ex-ante di 24/34, p < 0,0001 e 10/12 su musica mai addestrata), un **risultato positivo**, con la riserva onesta: le sezioni basate solo sul testo rimangono al di sotto del valore di riferimento ([relazione](docs/finetune-arc-v2-b1-eval-report.md)). I cinque adattatori seed sono pubblicati all'indirizzo [`mcp-tool-shop/jam-ft-v1-qwen25`](https://huggingface.co/mcp-tool-shop/jam-ft-v1-qwen25) con l'affermazione legata alla media di tutti i seed, non al miglior risultato tra i seed. Tutte e tre le fasi, i blocchi, le modifiche e le ricevute per ogni seed si trovano all'indirizzo [`experiments/`](experiments/) — la disciplina è il punto focale.

> Gli arrangiamenti MIDI sono di Bernd Krueger (piano-midi.de), con licenza CC-BY-SA-3.0-DE. Le annotazioni, le tracce e gli artefatti di valutazione sono del team AI Jam Sessions, rilasciati sotto la stessa licenza in modo che la catena "share-alike" sia preservata dall'inizio alla fine. **Limite della licenza:** la licenza MIT del repository copre il codice; tutto ciò che si trova sotto `datasets/` è con licenza CC-BY-SA-3.0-DE. Il corpus di lavoro all'indirizzo `datasets/jam-actions-v0/` contiene inoltre due opere (Satie Gymnopédie No. 1, Debussy Arabesque No. 1) che sono *escluse* dal subset pubblicato perché la loro origine nell'arrangiamento non poteva essere verificata; vedere [`datasets/jam-actions-v0/PROVENANCE-NOTE.md`](datasets/jam-actions-v0/PROVENANCE-NOTE.md).

## Installazione

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

Richiede **Node.js 22+** (la v2.0.0 ha aumentato il requisito minimo con `node-web-audio-api` 2.0). Nessun driver MIDI, nessuna porta virtuale, nessun software esterno.

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

49 strumenti e 4 modelli di prompt suddivisi in sette categorie:

### Scopri

| Strumento | Cosa fa |
|------|--------------|
| `list_songs` | Sfoglia per genere, difficoltà o parola chiave |
| `song_info` | Analisi musicale completa: struttura, momenti chiave, obiettivi didattici, suggerimenti sullo stile |
| `registry_stats` | Statistiche a livello di libreria: numero totale di brani, generi, difficoltà |
| `list_measures` | Note, dinamiche e note didattiche per ogni misura |
| `teaching_note` | Analisi approfondita di una singola misura: diteggiatura, dinamiche, contesto |
| `suggest_song` | Raccomandazione basata sul genere, sulla difficoltà e su ciò che hai suonato |
| `practice_setup` | Velocità, modalità, impostazioni della voce e comando CLI consigliati per un brano |
| `compare_songs` | Riconoscimento di schemi tra generi: relazioni chiave, similarità di tono/intervallo, forme condivise, connessioni didattiche |
| `annotation_progress` | Monitoraggio della qualità delle annotazioni in tutta la libreria: punteggi, valutazioni e suggerimenti per il miglioramento |
| `server_info` | Versione del server, statistiche della libreria, elenco dei motori, sessione attiva |

### Riproduci

| Strumento | Cosa fa |
|------|--------------|
| `play_song` | Riproduci tramite gli altoparlanti: brani della libreria o file .mid non elaborati. Quattro motori (pianoforte, voce, strumento musicale, chitarra), qualsiasi velocità, modalità, intervallo di misure, oltre a un metronomo con conteggio iniziale e un flag `record` che registra la sessione per la valutazione. Il sintetizzatore e i motori stratificati sono disponibili solo tramite CLI. |
| `stop_playback` | Stop |
| `pause_playback` | Metti in pausa o riprendi |
| `set_speed` | Modifica la velocità durante la riproduzione (da 0,1× a 4,0×) |
| `playback_status` | Snapshot in tempo reale: misura corrente, tempo, velocità, voce della tastiera, stato |
| `view_piano_roll` | Renderizza come SVG (colore delle note o arcobaleno cromatico delle classi di altezza) |
| `score_performance` | Valuta una traccia MIDI per l'accompagnamento: precisione dell'intonazione, ritmo, completezza, con feedback graduale |
| `mute_hand` | Disattiva o riattiva la mano sinistra/destra durante l'esercizio: isola una mano alla volta |
| `detect_chord` | Identifica l'accordo da un insieme di note MIDI attualmente in riproduzione (ad esempio, `[60,64,67]` → Do) |
| `preview_teaching_cues` | Visualizza tutte le note didattiche e i momenti chiave prima di iniziare a suonare |

### Esercitati

| Strumento | Cosa fa |
|------|--------------|
| `practice_loop` | L'esercizio assegnato da un insegnante reale: ripeti le misure 5-8 più lentamente, e il tempo aumenta (+5%) solo dopo una esecuzione *corretta*: ogni esecuzione viene registrata, valutata e riassunta. |
| `practice_status` | Stato dell'esercizio: esecuzione corrente, velocità e diagnostica per misura dell'ultima esecuzione |
| `score_last_take` | Valuta l'ultima esecuzione registrata: precisione dell'intonazione, ritmo, completezza, valutazioni per nota |
| `view_scored_piano_roll` | La partitura annotata che ogni insegnante utilizza: la tastiera del pianoforte sovrapposta alle valutazioni per nota in una tavolozza a prova di daltonismo (solido = corretto, tratteggiato = ritmo, ✕ = mancante) |

### Canta

| Strumento | Cosa fa |
|------|--------------|
| `sing_along` | Testo cantabile: nomi delle note, solfeggio, melodia o sillabe. Con o senza accompagnamento di pianoforte. |
| `ai_jam_sessions` | Genera una bozza per l'improvvisazione: progressione degli accordi, schema della melodia e suggerimenti sullo stile per la reinterpretazione |
| `verify_harmony` | Il gate di verifica del ciclo creativo: una proposta di riarmonizzazione viene controllata dagli strumenti deterministici della piattaforma: fedeltà dell'accordo (il motore degli accordi deve riconoscere ogni accordo previsto), consonanza della melodia (tono/tensione/cromaticismo), conduzione delle voci del basso, appartenenza alla tonalità |
| `auto_reharmonize` | Il ciclo creativo in una sola operazione: un modello locale propone una riarmonizzazione, il gate deterministico di `verify_harmony` controlla ogni voicing, la migliore tra n opzioni fino a quando non viene restituita un'interpretazione verificata |
| `compose_panel` | Esegui il pannello di composizione della conduzione delle voci su qualsiasi brano: quattro sistemi realizzano accompagnamenti, i giudici LLM cross-famiglia eseguiscono una valutazione alla cieca e li classificano, aggregati Bradley-Terry, con un gate che elimina le esecuzioni non interpretabili (solo segnale direzionale, mai un punteggio di qualità) |

### Chitarra

| Strumento | Cosa fa |
|------|--------------|
| `view_guitar_tab` | Renderizza una tablatura interattiva per chitarra come HTML: clicca per modificare, cursore di riproduzione, scorciatoie da tastiera |
| `list_guitar_voices` | Preset delle voci per chitarra disponibili |
| `list_guitar_tunings` | Sistemi di accordatura per chitarra disponibili (standard, drop-D, open G, DADGAD, ecc.) |
| `tune_guitar` | Regola qualsiasi parametro di qualsiasi voce per chitarra. Le impostazioni vengono mantenute tra le sessioni. |
| `get_guitar_config` | Configurazione corrente della voce per chitarra rispetto alle impostazioni predefinite |
| `reset_guitar` | Ripristina le impostazioni predefinite di una voce per chitarra |

### Crea

| Strumento | Cosa fa |
|------|--------------|
| `add_song` | Aggiungi un nuovo brano come JSON |
| `import_midi` | Importa un file .mid con metadati |
| `annotate_song` | Scrivi il linguaggio musicale per un brano non elaborato e promuovilo a "pronto" |
| `save_practice_note` | Voce del diario con dati di sessione acquisiti automaticamente |
| `read_practice_journal` | Carica le voci recenti per fornire contesto |
| `list_keyboards` | Voci per tastiera disponibili |
| `tune_keyboard` | Regola qualsiasi parametro di qualsiasi voce per tastiera. Le impostazioni vengono mantenute tra le sessioni. |
| `get_keyboard_config` | Configurazione corrente rispetto alle impostazioni predefinite |
| `reset_keyboard` | Ripristina le impostazioni predefinite di una voce per tastiera |
| `score_annotation` | Qualità dell'annotazione della partitura su 5 dimensioni: completezza, profondità, specificità, valore didattico, vocabolario |
| `validate_song_entry` | Valida un file JSON del brano rispetto allo schema prima di aggiungerlo |
| `transpose_song` | Trasponi un brano verso l'alto o verso il basso di semitoni: nuova tonalità, nuove note |
| `list_sections` | Visualizza le sezioni strutturali di un brano (Introduzione, Strofa, Ritornello, ecc.) |
| `add_section` | Aggiungi un marcatore di sezione a un brano per la navigazione strutturale |

### Prompt MCP

Quattro modelli di prompt per flussi di lavoro didattici strutturati:

| Prompt | Cosa fa |
|--------|--------------|
| `annotate_song` | Flusso di lavoro guidato per l'annotazione: studia un esempio, scrivi il linguaggio musicale per un brano non elaborato |
| `practice_plan` | Crea un piano di pratica strutturato in base al genere, alla difficoltà e agli obiettivi |
| `performance_review` | Rivedi una sessione completata: cosa ha funzionato bene, su cosa concentrarsi successivamente |
| `maker_loop` | Esegui l'intero ciclo creativo: proponi una riarmonizzazione, verificala con gli strumenti deterministici della piattaforma, quindi aggiungi e riproduci il risultato verificato |

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

v2.1.0: la versione in cui l'analista è diventato un **creatore** (vedi [CHANGELOG](CHANGELOG.md)). Il ciclo creativo viene fornito come prodotto: un modello propone una riarmonizzazione di qualsiasi brano della libreria e gli strumenti deterministici della piattaforma lo controllano: il motore degli accordi deve confermare ogni voicing previsto (`verify_harmony`), ogni nota della melodia è etichettata rispetto alla nuova armonia e solo un'interpretazione verificata passa a `add_song` → `play_song` → `view_piano_roll`. La generazione viene verificata tramite la costruzione: nessun rubric, nessuna autovalutazione; lo stesso `inferChord` che scrive le bozze per l'improvvisazione è il giudice. Il modello di prompt `maker_loop` guida l'intero ciclo.

Dalla versione 2.1.0, `main` ha anche ampliato il motore di composizione (`src/compose/`): un gate deterministico per la conduzione delle voci con preset di stile denominati, specifiche di voicing basate sull'appartenenza tramite costruzione, un raffinatore che lavora parte per parte e lo strumento `compose_panel` che esegue un pannello di valutazione alla cieca cross-famiglia (solo direzionale: non interpretabile e inconcludente sono risultati di primo livello). L'interfaccia live è composta da **49 strumenti e 4 modelli di prompt**, con **2930 test superati (1 saltato)**. **Stato della pubblicazione:** l'ultima versione su npm è la **2.0.0**: tutto ciò che riguarda la versione 2.1.0 si trova solo su `main`; esegui da una copia fino alla prossima release.

In precedenza, nella versione 2.0.0 — la versione in cui il set di dati ha dimostrato la sua efficacia. **Importante: la versione minima richiesta di Node.js è ora la 22** (`node-web-audio-api` 2.0); lo strumento stesso rimane invariato: sei motori audio, 47 strumenti MCP, 3 modelli di prompt e una **libreria completamente annotata: 120/120 brani suddivisi in 12 generi** (12 campi chiave corretti per adattarsi alle chiavi rilevate dal contenuto in questa versione). Il ciclo di apprendimento è completo dall'inizio alla fine: metronomo con conteggio iniziale → registrazione live → valutazione nota per nota → la partitura del pianoforte evidenziata → cicli di pratica che aumentano il tempo solo dopo passaggi eseguiti correttamente. La console del browser è un vero strumento di composizione: trasporto preciso al ritmo, acquisizione con attivazione della registrazione, annullamento/ripetizione completo, selezione multipla e area di copia-incolla, supporto touch — [disponibile sul web](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/).

Pubblica anche **[jam-actions-v0](#training-dataset)** — un set di dati di addestramento composto da 115 registrazioni di sequenze di utilizzo dello strumento MCP su brani classici per pianoforte, con una soglia di rilascio a 7 assi, riproducibilità in condizioni di avvio a freddo e metadati completi Zenodo + CITATION.cff (CC-BY-SA-3.0-DE) — replicato su [Hugging Face](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0), e ora include **risultati di ottimizzazione fine documentati in entrambe le direzioni**: un risultato negativo onesto (v0) e un risultato positivo disciplinato dalla preregistrazione che si è fermato a una vittoria di coppia prima del raggiungimento dell'obiettivo previsto (v1) — vedere i [documenti sull'ottimizzazione fine](#training-dataset). Questa versione corregge anche le registrazioni di Bach alla fonte (revisioni del set di lavoro r001/r002 con correzioni) dopo che il filtro di esecuzione della pipeline v1 ha rilevato un superamento della finestra pubblicata rispetto alle 62 misure effettive di BWV 846. 2506 test superati tra il server MCP, la console, i pacchetti del set di dati e gli strumenti di valutazione + validatore del filtro di rilascio. Il MIDI è tutto presente, ogni brano può essere utilizzato per l'apprendimento e il corpus di tale apprendimento viene fornito insieme.

## Sicurezza e privacy

**Dati interessati:** libreria di brani (JSON + MIDI), directory dei brani dell'utente (`~/.ai-jam-sessions/songs/`), configurazioni per l'accordatura della chitarra, voci del diario delle sessioni di pratica, dispositivo di output audio locale.

**Dati NON interessati (percorsi predefiniti):** il server e la CLI MCP non effettuano chiamate di rete, non leggono credenziali e non accedono a file di sistema al di fuori della directory dei brani dell'utente. Non vengono raccolti o inviati dati di telemetria. L'**strumento/tooling per il set di dati/valutazione opzionale** incluso nello stesso pacchetto (`scripts/run-llm-eval.ts`, verificatore della provenienza) è l'unica eccezione: quando lo si richiama esplicitamente, può chiamare le API LLM (legge `ANTHROPIC_API_KEY` dall'ambiente, ma non lo memorizza mai) e recuperare gli URL di provenienza. Non viene eseguito come parte del server, della CLI o dell'installazione.

**Autorizzazioni:** il server MCP utilizza solo il trasporto stdio (nessun HTTP). La CLI accede al file system locale e ai dispositivi audio. Consultare [SECURITY.md](SECURITY.md) per l'elenco completo delle policy.

## Licenza

MIT
