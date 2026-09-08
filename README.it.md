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

Un pianoforte e una chitarra che l'IA impara a suonare. Non un sintetizzatore, non una libreria MIDI, ma uno strumento didattico.

Un LLM può leggere e scrivere testi, ma non può sperimentare la musica come facciamo noi. Nessuna orecchio, nessuna dita, nessun ricordo muscolare. AI Jam Sessions colma questa lacuna fornendo al modello sensi che può effettivamente utilizzare:

- **Lettura:** spartiti MIDI reali con annotazioni musicali approfondite. Non semplici approssimazioni scritte a mano, ma dati analizzati, interpretati e spiegati.
- **Ascolto:** sei motori audio (pianoforte a oscillatore, pianoforte a campioni, campioni vocali, tratto vocale fisico, sintetizzatore vocale additivo, chitarra modellata fisicamente) che riproducono il suono attraverso gli altoparlanti, trasformando le persone presenti nella stanza nelle "orecchie" dell'IA. E ora il modello ha le proprie orecchie: può misurare una registrazione che ha creato o una che hai creato tu, e dire cosa contiene effettivamente — vedi [Ascolto](#ascolto).
- **Visione:** una tastiera virtuale che visualizza ciò che è stato suonato in formato SVG, in modo che il modello possa leggerlo e verificarlo. Un editor interattivo di tablature per chitarra. Un'interfaccia di controllo con una tastiera visiva, un editor di note a doppia modalità e un laboratorio di accordatura.
- **Memorizzazione:** un diario di pratica che persiste tra le sessioni, in modo che l'apprendimento si accumuli nel tempo.
- **Canto:** sintesi del tratto vocale con 20 preset vocali, da soprano d'opera a coro elettronico. Modalità di accompagnamento con solfeggio, contorno e narrazione delle sillabe. E una vera linea melodica cantata sincronizzata con il tempo del pianoforte: un cantante guidato dalla partitura MIDI della canzone, con limitazioni temporali (40 ms) e di intonazione (50 centesimi) prima che tu lo senta — vedi [Canto](#canto).

Ognuna delle 120 canzoni è ora completamente annotata: contesto storico, analisi strutturale battuta per battuta, momenti chiave, obiettivi didattici e suggerimenti sulle performance, in tutti i 12 generi. Una versione precedente di questo file README affermava che le canzoni originali stavano "aspettando che l'IA assorbisse gli schemi, suonasse la musica e scrivesse le proprie annotazioni". Ed è esattamente quello che è successo: le annotazioni sono state scritte dall'IA sulla base di un'analisi deterministica per ogni canzone (accordi, struttura della ripetizione, confini delle sezioni, tonalità verificate), soggette a una griglia di qualità e controllate in modo avversario affermazione per affermazione: numeri delle battute, finestre degli accordi e conteggi strutturali sono tutti verificati rispetto al MIDI effettivo prima che qualsiasi cosa venga rilasciata.

Da questo stesso lavoro, pubblichiamo anche **[jam-actions-v0](#training-dataset)**: un set di dati pubblico di 115 tracce di utilizzo di strumenti MCP in più fasi su pianoforte classico reale. Insegna agli LLM a eseguire *un uso pratico basato sulla musica simbolica*, e non solo la generazione di testo, ed è dotato di una soglia di rilascio a 7 assi che distingue il "trasmettere prove" dal "passare perché l'attività è banale". Consultare [Training Dataset](#training-dataset) qui sotto per tutti i dettagli.

## Ascolto

Per molto tempo, questo server poteva produrre suoni ma non analizzarli. Il modello suonava, un essere umano ascoltava e il modello si basava sul suo giudizio. Questa lacuna è ora colmata.

Se gli si fornisce un file WAV, questo misura ciò che contiene. Non analizzando un'immagine e facendo delle congetture, ma elaborando il segnale attraverso gli stessi strumenti che già utilizza per la partitura:

- **`analyze_audio`:** attacchi, il contorno dell'intonazione e il livello. L'intonazione viene restituita come nomi di note con deviazioni in centesimi, mai come frequenze grezze.
- **`transcribe_audio`:** la registrazione come note: intonazione, inizio, durata e quanto ogni nota si discosta dall'intonazione di riferimento.
- **`score_audio_take`:** valuta una performance rispetto a una canzone presente nella libreria **ad orecchio**. Trascrive la registrazione, la confronta con la partitura e indica quali note sono state suonate correttamente, quali sono state alterate e quali sono state omesse. Quindi `view_scored_piano_roll` disegna il risultato sulla partitura, esattamente come fa per una registrazione MIDI. In questo modo è possibile valutare uno strumento reale, una performance cantata o qualsiasi altra cosa in cui non ci sia una registrazione MIDI.
- **`view_spectrogram`:** visualizza il suono. Uno spettrogramma a Q costante con una tastiera di pianoforte sul bordo sinistro, in modo che l'intonazione sia facilmente leggibile, e le note previste dalla canzone vengono disegnate sopra, su richiesta.

**Cosa non ti dirà.** L'immagine serve per individuare *dove* c'è un problema; ogni numero deriva dall'elaborazione del segnale, mai dalla lettura di un'immagine da parte del modello. Il trascrittore segue una linea alla volta, quindi un accordo o un mix completo produrranno un risultato affidabile ma errato, e lo indicherà. Il rilevamento degli attacchi raggiunge circa 0,88 nello stato dell'arte, quindi una nota "omessa" potrebbe essere una nota che il trascrittore non è stato in grado di rilevare, piuttosto che una nota che non hai suonato: gli strumenti riportano questa limitazione nei loro risultati, anziché nasconderla.

L'intera interfaccia è indipendente da qualsiasi libreria esterna: la trasformazione, il tracciatore di intonazione, il rilevatore di attacchi, il decodificatore WAV e il codificatore PNG sono tutti presenti in questo repository e producono numeri identici in Node e nel browser.

## L'Ensemble dal Vivo

Un sistema analizza una registrazione una volta che è terminata. Questo è il resto: chiede cosa sta
facendo ogni strumento **in questo momento**, durante l'esecuzione.

```
ensemble_now()
```

Risponde con le note sostenute di ogni strumento, la durata di ciascuna e l'accordo combinato
nell'intero ensemble. Durante un duetto, le due voci vengono riportate separatamente, in modo da poter
vedere il pianoforte che suona una triade mentre il sintetizzatore esegue la melodia sopra.

### Due canali, e quello più economico è anche il più preciso

Questa è la parte che vale la pena capire, perché determina quale valore considerare affidabile.

**Intento: cosa è stato chiesto a ciascun motore di suonare.** Quando il modello è quello che esegue,
questo non è una stima. Un accordo di pianoforte non è qualcosa da trascrivere; sono tre note che sono
state inviate. Le note sono esatte, immediate e non soggette a interpretazioni.

**Acustico: cosa è effettivamente uscito.** Ogni motore può indirizzare il proprio output a un bus di
analisi privato, in modo che ogni strumento venga misurato alla fonte, senza separazioni o ambiguità.
Questo canale è **verifica, non scoperta**: è il modo in cui si apprende se una voce si è discostata
dal tempo, se una registrazione è stata interrotta o se un motore è diventato silenzioso mentre
continuava a ricevere note.

Quando i due valori non corrispondono, si tratta di un dato relativo al rendering, non di una
correzione delle note.

### Costi

L'analisi di uno strumento costa circa **9 microsecondi per ogni callback audio**, rispetto a un blocco
di 42,67 ms, che corrisponde a circa lo 0,02% del budget audio, misurato con zero campioni persi.
Uno strumento senza un osservatore collegato non costa nulla.

### Cosa non ti dirà

Il canale acustico presenta un ritardo e indica di quanto: circa 23 ms per l'intonazione e 70 ms per
un attacco confermato, perché un attacco non può essere confermato finché l'audio successivo non è
arrivato. Gli attacchi vicini a tale limite vengono omessi anziché segnalati e successivamente
rimossi.

Il tracker acustico segue una linea alla volta, quindi non identificherà le note di un accordo, e non
pretende di farlo. Un accordo che non può risolvere è una sua limitazione nota, piuttosto che una
scoperta, e l'ensemble rimane in silenzio al riguardo, invece di lanciare falsi allarmi ogni volta che
il pianoforte suona un accordo.

## La tastiera virtuale

La tastiera virtuale è il modo in cui l'IA vede la musica. Visualizza qualsiasi canzone come SVG: blu per la mano destra, corallo per la sinistra, con griglie di battuta, dinamiche e confini delle misure:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Due modalità colore: **mano** (blu/corallo) o **classe tonale** (arcobaleno cromatico: ogni Do è rosso, ogni Fa# è ciano). Il formato SVG significa che il modello può sia vedere l'immagine che leggere i tag per verificare l'intonazione, il ritmo e l'indipendenza delle mani.

## La console

Uno studio di composizione basato su browser che si trova in questo repository all'indirizzo [`apps/cockpit`](apps/cockpit) e funziona in diretta all'indirizzo **[mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)**. Nessun plugin, nessun software DAW, nessuna installazione; tutto rimane nel tuo browser (il tuo lavoro viene salvato automaticamente localmente). Preferisci modificarlo?

```bash
cd apps/cockpit && npm install && npm run dev   # Vite dev server, opens in your browser
```

- **Per impostazione predefinita, viene utilizzato un pianoforte a coda campionato:** il sintetizzatore include una versione ridotta del pacchetto Salamander Grand (90 file OGG, 8 MB) che viene caricato alla prima interazione e riproduce l'audio attraverso la stessa catena di elaborazione delle voci del sintetizzatore; prima del caricamento (o in modalità offline), le voci di pianoforte con oscillatore accordato vengono riprodotte senza soluzione di continuità. Campioni di [Alexander Holm](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html), CC-BY 3.0.
- **Modalità pannello: la sala d'ascolto:** test A/B alla cieca a coppie delle voci del motore di composizione su melodie reali della libreria: clip con volume uniforme, elaborate offline attraverso il percorso audio reale, serie di prove casuali con prove nascoste per valutare il limite inferiore della discriminazione, classifiche Bradley-Terry con intervalli di confidenza bootstrap e risultati onesti (PROVVISORI fino a quando ogni coppia raggiunge il suo budget di voti; NON INTERPRETABILI quando il limite inferiore della discriminazione non viene superato). Una seconda sotto-modalità esegue la stessa classificazione utilizzando giudici LLM locali, oltre alla cronologia di entrambi i tipi di esecuzione e una vista di confronto (Kendall τ + corrispondenza del punteggio del motore) che chiede se le tracce proxy economiche riflettono la realtà umana.
- **Trasporto preciso al ritmo:** le note sono sincronizzate con il tempo musicale, quindi il controllo BPM regola effettivamente il tempo di riproduzione; una barra temporale con clic per la ricerca e la possibilità di trascinare per impostare le **regioni del loop**; scorrimento automatico che segue l'indicatore di riproduzione.
- **Registrazione: cattura audio:** suona i tasti QWERTY, la tastiera sullo schermo o un dispositivo Web MIDI e il suono viene registrato nella partitura: introduzione di 1 battuta, sovraincisione in stile looper durante i cicli del loop (o modalità di sostituzione), preservazione della tempistica della performance originale sotto una vista quantizzata, ogni passaggio è un'unità modificabile.
- **Annulla/Ripeti completo:** tutte le modifiche, inclusi Annulla e Importa, sono reversibili (Ctrl+Z), con gesti di trascinamento che si combinano come farebbero i veri editor.
- **Selezione multipla + area di ritaglio:** selezione tramite rettangolo sotto un'opzione per attivare/disattivare lo strumento Selezione/Disegno, clic modificatori standard della piattaforma, copia/taglia/incolla durante la riproduzione, Duplica.
- **Touch e accessibilità:** eventi del puntatore con cattura su ogni superficie, tocco per riposizionare come alternativa al trascinamento, modifica delle note tramite tastiera, sovrapposizioni di partiture sicure per persone daltoniche.
- **Pianoforte a doppia modalità:** passa tra la modalità Strumento (colori delle classi cromatiche) e la modalità Vocale (note colorate in base alla forma della vocale: /a/ /e/ /i/ /o/ /u/).
- **Tastiera visiva:** due ottave a partire da C4, mappata sulla tastiera QWERTY. Fai clic o digita.
- **20 preset di voci:** 15 voci mappate Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, più coro e voce sintetica), 4 voci mappate al tratto vocale e una sezione corale sintetica.
- **10 preset di strumenti:** le 6 voci di pianoforte lato server più pad sintetico, organo, campana e archi.
- **Ispettore delle note:** fai clic su qualsiasi nota per modificare la velocità, la vocale e l'intensità.
- **7 sistemi di accordatura:** temperamento equabile, intonazione giusta (maggiore/minore), pitagorico, temperamento a virgola di quarto, Werckmeister III o offset personalizzati in centesimi. Riferimento A4 regolabile (392–494 Hz).
- **Verifica dell'accordatura:** tabella delle frequenze, tester degli intervalli con analisi della frequenza del battito e esportazione/importazione dell'accordatura.
- **Importazione/Esportazione della partitura:** serializza l'intera partitura come JSON e caricala di nuovo.
- **API orientata all'LLM:** `window.__cockpit` espone `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` e `getScore()` in modo che un LLM possa comporre, arrangiare e riprodurre in modo programmatico.

## Il ciclo di apprendimento

<p align="center">
  <img src="docs/learning-loop.svg" alt="The learning loop: Read (MIDI + annotations) → Play (six sound engines) → See (piano roll · guitar tab) → Reflect (practice journal), with the journal persisting so the next session picks up where the last left off" width="100%" />
</p>

## La libreria delle canzoni

120 canzoni di 12 generi diversi, create da file MIDI reali. Ogni genere ha un esempio approfondito con contesto storico, analisi armonica battuta per battuta, momenti chiave, obiettivi didattici e suggerimenti sulle performance (inclusa la guida vocale). Questi esempi fungono da modelli: l'IA ne studia uno, quindi annota gli altri.

| Genere | Esempio | Tonalità | Cosa insegna |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | Si minore | Forma blues minore, botta e risposta, suonare leggermente in ritardo rispetto al tempo |
| Classica | Für Elise (Beethoven) | La minore | Forma di rondò, differenziazione del tocco, disciplina nell'uso del pedale |
| Colonna sonora | Comptine d'un autre été (Tiersen) | Mi minore | Texture arpeggiate, architettura dinamica senza cambiamenti armonici |
| Folk | Greensleeves | Mi minore | 3/4, ritmo di valzer, mescolanza modale, stile vocale rinascimentale |
| Jazz | Autumn Leaves (Kosma) | Sol minore | Progressioni ii-V-I, note guida, ottavi di swing, accordi senza la fondamentale |
| Latinoamericana | The Girl from Ipanema (Jobim) | Fa maggiore | Ritmo bossa nova, modulazione cromatica, moderazione vocale |
| New Age | River Flows in You (Yiruma) | La maggiore | Riconoscimento di I-V-vi-IV, arpeggi fluidi, rubato |
| Pop | Imagine (Lennon) | Do maggiore | Accompagnamento arpeggiato, moderazione, sincerità vocale |
| Ragtime | The Entertainer (Joplin) | Do maggiore | Basso "oom-pah", sincopi, forma multistrofa, disciplina nel tempo |
| R&B | Superstition (Stevie Wonder) | Mi bemolle minore | Funk in sedicesimi, tastiera percussiva, note fantasma |
| Rock | Your Song (Elton John) | Mi bemolle maggiore | Voce di accompagnamento in una ballata al pianoforte, inversioni, canto colloquiale |
| Soul | Lean on Me (Bill Withers) | Do maggiore | Melodia diatonica, accompagnamento gospel, botta e risposta |

Le canzoni passano da **grezze** (solo MIDI) a **annotate** a **pronte** (completamente riproducibili con il linguaggio musicale). L'IA promuove le canzoni studiandole e scrivendo annotazioni con `annotate_song`.

## Motori del suono

Sei motori, più un combinatore a livelli che esegue due di essi contemporaneamente:

| Motore | Tipo | Come suona |
|--------|------|---------------------|
| **Oscillator Piano** | Sintesi additiva | Pianoforte multi-armonico con rumore di martelletto, inarmonicità, brillantezza modulata dalla velocità, polifonia a 48 voci, spazializzazione stereo. Nessuna dipendenza esterna. |
| **Sample Piano** | Riproduzione di campioni | Salamander Grand Piano: il vero suono. **È il motore predefinito ogni volta che viene installato un pacchetto** (`samples/AccurateSalamander` o `AI_JAM_SAMPLES_DIR`); il file tar npm non contiene campioni, quindi è necessario fornire il download di [Salamander](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html). La console del browser include il proprio pacchetto ridotto da 8 MB (90 OGG, CC-BY 3.0 Alexander Holm), senza necessità di configurazione sul web. |
| **Vocal (Sample)** | Campioni con variazione di altezza | Toni vocalici prolungati con portamento e modalità legato. |
| **Vocal Tract** | Modello fisico | Pink Trombone: forma d'onda glottale a bassa frequenza attraverso una guida d'onda digitale a 44 celle. Quattro preset: soprano, alto, tenore, basso. |
| **Vocal Synth** | Sintesi additiva | 15 preset vocali Kokoro con modellazione del formante, respiro, vibrato. Deterministico (generatore di numeri casuali inizializzato). |
| **Guitar** | Sintesi additiva | Strumento a corda pizzicata modellato fisicamente: 4 preset (dreadnought in acciaio, classico in nylon, jazz archtop, dodici corde), 8 accordature, 17 parametri regolabili. |
| **Layered** | Combinatore | Combina due motori e invia ogni evento MIDI a entrambi: pianoforte + sintetizzatore, voce + sintetizzatore, ecc. |

### Voci per tastiera

Sei voci di pianoforte regolabili, ciascuna con parametri modificabili (brillantezza, decadimento, durezza del martelletto, disintonizzazione, ampiezza stereo e altro):

| Voce | Caratteristica |
|-------|-----------|
| Concert Grand | Ricco, pieno, classico |
| Upright | Caldo, intimo, folk |
| Electric Piano | Setoso, jazz, simile a un Fender Rhodes |
| Honky-Tonk | Disintonizzato, ragtime, da saloon |
| Music Box | Cristallino, etereo |
| Bright Grand | Incisivo, contemporaneo, pop |

### Voci per chitarra

Quattro preset di voci per chitarra con sintesi di corde modellata fisicamente, ciascuno con 17 parametri regolabili (brillantezza, risonanza del corpo, posizione del pizzico, smorzamento delle corde e altro):

| Voce | Caratteristica |
|-------|-----------|
| Steel Dreadnought | Brillante, equilibrato, classico acustico |
| Nylon Classical | Caldo, morbido, arrotondato |
| Jazz Archtop | Dolce, legnoso, pulito |
| Twelve-String | Scintillante, raddoppiato, simile a un chorus |

## Il diario della pratica

Dopo ogni sessione, il server registra ciò che è accaduto: quale brano, a quale velocità, quante misure, per quanto tempo. L'IA aggiunge le proprie riflessioni: cosa ha notato, quali schemi ha riconosciuto, cosa provare dopo.

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

Un file markdown al giorno, archiviato in `~/.ai-jam-sessions/journal/`. Leggibile da persone, solo in modalità di aggiunta. Nella sessione successiva, l'IA legge il suo diario e riprende da dove si era interrotta.

## Dataset di addestramento

**jam-actions-v0**: un dataset pubblico di tracce di utilizzo di strumenti MCP multi-turno, basato su MIDI reali di pianoforte classico. Costruito utilizzando la stessa libreria con cui questo server esegue l'addestramento, il dataset insegna agli LLM a eseguire **un utilizzo di strumenti basato su dati concreti in musica simbolica**, e non solo sulla generazione di testo.

Ogni record associa una finestra di frase di 4 misure con un target di insegnamento annotato e una *traccia target*: una sessione passo dopo passo in cui un assistente utilizza gli strumenti MCP sopra indicati (`get_events_in_measure`, `get_events_in_hand`, `count_distinct_pitch_classes` e il resto della superficie MIDI inspector a 9 strumenti) per leggere, analizzare e discutere la frase.

| | |
|---|---|
| **DOI** | [**`10.5281/zenodo.20279918`**](https://doi.org/10.5281/zenodo.20279918) — concept DOI, resolves to the latest published version (v0.5.0: [`10.5281/zenodo.21313954`](https://doi.org/10.5281/zenodo.21313954), published 2026-07-11) |
| Record | 115 (sottoinsieme pubblico) |
| Baseline canonica | E3 post-riparazione con 16 record |
| Composizioni | 8 opere per pianoforte classico di 6 compositori (Bach, Beethoven, Chopin, Debussy, Mozart, Schumann) |
| MIDI di origine | piano-midi.de: arrangiamenti di Bernd Krueger |
| Licenza | CC-BY-SA-3.0-DE (arrangiamenti) su composizioni di pubblico dominio |
| Versione | 0.5.0 (11 luglio 2026): versione correttiva per Bach BWV 846, errata 001 + 002 |
| Schema | `release-gate-assessment/2.0.0` |

**Storia della qualità: il sistema di rilascio a 7 assi.** Il dataset viene fornito con un sistema di rilascio che distingue tra risultati validi basati su prove concrete e risultati insoddisfacenti. Gli assi da 1 a 6 sono bloccanti (soglia assoluta, margine composto, frequenza di utilizzo degli strumenti, correttezza dopo l'utilizzo dello strumento, numero di interpretazioni errate, soglia minima); l'asse 7 è arricchito rispetto alla segnalazione standard. Gli assi 2 e 6 ammettono un bucket `ceiling_saturated_pass` in modo che i record con un punteggio di 1.000 nelle condizioni solo testuali / ispezionati con strumenti / MIDI casuali non diluiscano gli strati più difficili. La baseline Slice 22 **SUPERARE** il sistema di rilascio rivisto. La baseline Slice 19 lo **NON SUPERARE** ancora: viene conservata come diagnostico per la regressione, in modo che il sistema di rilascio sia efficace.

**Riproducibilità.** Un nuovo collaboratore su qualsiasi piattaforma (Windows nativo, macOS, Linux, WSL) può verificare il pacchetto e riprodurre il risultato canonico PASSATO in meno di un minuto:

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

`.gitattributes` fissa le terminazioni di riga LF per `*.sha256` e l'albero del dataset pubblico in modo che il verificatore dei checksum funzioni su ogni piattaforma. La CLI del sistema di rilascio è rigorosa (rifiuta argomenti posizionali sconosciuti o multipli) in modo che i collaboratori alle prime armi non possano attivarla accidentalmente.

**Dove trovarlo.** Il record Zenodo è disponibile all'indirizzo DOI [`10.5281/zenodo.20279918`](https://doi.org/10.5281/zenodo.20279918) (sempre l'ultima versione; v0.5.0 pubblicata il 2026-07-11 all'indirizzo https://zenodo.org/records/21313954), e il set di dati è replicato su Hugging Face all'indirizzo [`mcp-tool-shop/jam-actions-v0`](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0) per `load_dataset()` utenti. La scheda completa del set di dati è disponibile all'indirizzo [`datasets/jam-actions-v0-public/README.md`](datasets/jam-actions-v0-public/README.md). I metadati relativi al deposito Zenodo sono disponibili all'indirizzo [`zenodo-metadata.json`](datasets/jam-actions-v0-public/zenodo-metadata.json), i metadati per la citazione all'indirizzo [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff), la ricevuta della pubblicazione all'indirizzo [`publication-receipt.json`](datasets/jam-actions-v0-public/publication-receipt.json) e le note di rilascio all'indirizzo [`RELEASE_NOTES.md`](datasets/jam-actions-v0-public/RELEASE_NOTES.md). Il processo di creazione in 25 fasi — dall'elaborazione iniziale del corpus fino alla correzione, alla rimozione dei problemi rilevati da Schumann, alla revisione RC-gate, all'audit sull'utilizzo degli operatori e all'esecuzione della pubblicazione — è disponibile all'indirizzo [`docs/`](docs/).

**Citare.** `mcp-tool-shop-org & Krueger, B. (2026). AI Jam Sessions — Tool-Use Traces v0 (Public Subset). Zenodo. https://doi.org/10.5281/zenodo.20279918`

**Funziona davvero? — i risultati del fine-tuning, tre fasi.** Le affermazioni relative al set di dati vengono testate in modo rigoroso: il fine-tuning preregistrato viene valutato rispetto a baseline predefinite, con regole di correttezza applicate prima di qualsiasi addestramento. **v0** (solo le 78 tracce Jam) ha restituito un *risultato negativo onesto*: la QA basata su strumenti è passata da 0,661 a 0,601 ([report](docs/finetune-arc-eval-report.md)). **v1** (un set di dati con 494 esempi che aggiunge tracce verificate durante l'esecuzione e adattate al contesto) ha migliorato la stessa metrica di +0,202, con tutti i cinque seed superiori alla baseline; tuttavia, è stato rilasciato come *"migliore in termini di direzione, ma non sufficientemente potente"* perché 12 su 16 vittorie a confronto non hanno raggiunto il limite preregistrato di ≥13/16; nessun adattatore è stato pubblicato a seguito di questo risultato quasi positivo ([report](docs/finetune-arc-v1-eval-report.md)). **B-1** ha quindi ri-testato gli artefatti *congelati* v1 su un gruppo preregistrato di 36 record, composto principalmente da materiale non utilizzato in precedenza: 0,678 → **0,890** (+0,212, 29/36 vittorie a confronto rispetto al limite ex-ante di 24/34, p < 0,0001 e 10/12 su musica mai addestrata prima) — una **vittoria significativa**, con la precisazione onesta ancora valida: le sezioni contenenti solo testo rimangono inferiori alla baseline ([report](docs/finetune-arc-v2-b1-eval-report.md)). I cinque adattatori seed sono pubblicati all'indirizzo [`mcp-tool-shop/jam-ft-v1-qwen25`](https://huggingface.co/mcp-tool-shop/jam-ft-v1-qwen25), con l'affermazione collegata alla media di tutti i seed — non al miglior risultato tra i seed. Tutte e tre le fasi, i blocchi, le modifiche e i risultati per ciascun seed sono disponibili all'indirizzo [`experiments/`](experiments/) — la disciplina è l'obiettivo.

> Gli arrangiamenti MIDI sono di Bernd Krueger (piano-midi.de), con licenza CC-BY-SA-3.0-DE. Le annotazioni, le tracce e gli artefatti di valutazione sono del team AI Jam Sessions, rilasciati sotto la stessa licenza in modo che la catena di condivisione sia preservata dall'inizio alla fine. **Limite della licenza:** la licenza MIT del repository copre il codice; tutto ciò che si trova all'interno di `datasets/` è con licenza CC-BY-SA-3.0-DE. Il corpus di lavoro all'indirizzo `datasets/jam-actions-v0/` contiene inoltre due opere (Satie Gymnopédie No. 1, Debussy Arabesque No. 1) che sono *escluse* dal sottoinsieme pubblicato perché la provenienza dell'arrangiamento non poteva essere verificata — vedere [`datasets/jam-actions-v0/PROVENANCE-NOTE.md`](datasets/jam-actions-v0/PROVENANCE-NOTE.md).

### Il corpus acustico

**jam-actions-acoustic-v0**: il corrispettivo delle tracce di cui sopra, basato sull'**audio** anziché
sulla musica simbolica. 108 registrazioni, ciascuna delle quali associa un rendering sintetico
deliberatamente perturbato di una frase di pubblico dominio al risultato che gli strumenti di analisi
restituiscono effettivamente, in modo che ogni etichetta venga verificata rispetto allo strumento,
anziché solo rispetto a se stessa.

| | |
|---|---|
| Record | 108: 3 frasi × 9 tipi di perturbazione × 4 note di destinazione |
| Escluso | per **frase** (Für Elise), non per registrazione, in modo che una copia perturbata della stessa
melodia non possa "trapelare". |
| Classi | corrispondenza, errore/avviso di intonazione, errore/superamento del tempo, mancante, extra, vibrato
intonato, silenzio senza elementi da valutare |
| Audio | nessuno distribuito: ogni registrazione contiene una ricetta deterministica e l'hash della forma d'onda
che produce |
| Schema | `jam-actions-acoustic-v0/1.0.0` |

Due delle nove classi sono presenti perché un modello ingenuo risponde in modo sicuro ma errato: una
nota di vibrato il cui risultato corretto è *intonata* e il silenzio il cui risultato corretto è
*niente da valutare*. Ogni soglia da cui dipende il risultato viene copiata nella registrazione, perché
entrambe sono cambiate una volta durante la compilazione.

Il corpus è riproducibile da questo repository. La sua rigenerazione produce tutti i 115 file
pubblicati e un `checksums.sha256` identico, e un test verifica esattamente questo senza scrivere l'albero
pubblicato.

**Una limitazione, misurata anziché presunta.** Ogni registrazione contiene `wav_sha256`, l'hash della
forma d'onda prodotta dalla sua ricetta, e il renderer chiama `Math.pow` e `Math.sin` una volta per campione.
Nessuno dei due deve essere arrotondato correttamente, e i risultati di V8 sono cambiati tra Node 22 e
Node 24: dei 27.869 argomenti `Math.pow(2, x)` distinti che questo corpus valuta, 253 restituiscono un valore
double diverso. Quasi tutto questo scompare con la quantizzazione a 16 bit, ma **2 delle 108
registrazioni** — entrambe la perturbazione `extra` di Für Elise, il cui motivo si trova sull'unica nota in
cui il rapporto del semitono stesso è diverso — hanno un hash diverso in Node 24. Ogni altro campo
di ogni registrazione viene riprodotto su qualsiasi motore e il repository testa entrambe le affermazioni
separatamente. Se si esegue un nuovo rendering e si notano queste due incongruenze, si tratta di
questo, non di un download corrotto. Rendere la forma d'onda portabile a livello di bit significa
sostituire le funzioni trascendenti, il che modifica ogni hash e quindi richiede una nuova versione dello
schema.

### Crea il tuo

L'impalcatura su cui funziona il corpus è disponibile per i tuoi esperimenti.
[`experiments/_template/`](experiments/_template/) è un esempio funzionante che puoi copiare: dichiara un compito e
otterrai la formattazione SFT, il punteggio per classe, baseline banali sull'insieme di risultati
dichiarato e un controllo che nessuna unità di test sia divisa.

Il [contratto](experiments/_template/README.md) è la parte che vale la pena leggere. La verità
fondamentale è costruibile anziché scritta a mano, le etichette vengono verificate rispetto a ciò che
gli strumenti misurano, si divide in base all'unità che "trapela" e si segnalano le baseline e il
modello di base insieme a qualsiasi risultato. Ognuna di queste regole ha un costo per essere appresa.

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

## MCP Tools

49 strumenti e 4 modelli di prompt suddivisi in sette categorie:

### Scopri

| Strumento | Cosa fa |
|------|--------------|
| `list_songs` | Sfoglia per genere, difficoltà o parola chiave |
| `song_info` | Analisi musicale completa: struttura, momenti chiave, obiettivi didattici, suggerimenti sullo stile |
| `registry_stats` | Statistiche a livello di libreria: numero totale di brani, generi, difficoltà |
| `list_measures` | Ogni nota, dinamica e annotazione didattica di ogni misura |
| `teaching_note` | Approfondimento su una singola misura: diteggiatura, dinamica, contesto |
| `suggest_song` | Raccomandazioni basate sul genere, sulla difficoltà e su ciò che hai suonato |
| `practice_setup` | Velocità, modalità, impostazioni vocali e comando CLI consigliati per un brano |
| `compare_songs` | Riconoscimento di schemi tra generi diversi: relazioni chiave, somiglianze di tono/intervallo, forme condivise, connessioni didattiche |
| `annotation_progress` | Monitoraggio della qualità delle annotazioni in tutta la libreria: punteggi, valutazioni e suggerimenti per il miglioramento |
| `server_info` | Versione del server, statistiche della libreria, elenco dei motori, sessione attiva |

### Riproduci

| Strumento | Cosa fa |
|------|--------------|
| `play_song` | Riproduci tramite gli altoparlanti: brani della libreria o file .mid grezzi. Quattro motori (pianoforte, voce, tratto vocale, chitarra), qualsiasi velocità, modalità, intervallo di misure — oltre a un metronomo con conteggio iniziale e una `record` che registra la sessione per la valutazione. I motori synth e layer sono disponibili solo tramite CLI. |
| `stop_playback` | Ferma |
| `pause_playback` | Metti in pausa o riprendi |
| `set_speed` | Modifica la velocità durante la riproduzione (da 0,1× a 4,0×) |
| `playback_status` | Snapshot in tempo reale: misura corrente, tempo, velocità, voce della tastiera, stato |
| `view_piano_roll` | Renderizza come SVG (colore della mano o arcobaleno cromatico delle classi di altezza) |
| `score_performance` | Valuta un MIDI durante la riproduzione: precisione del tono, ritmo, completezza, con feedback valutato |
| `mute_hand` | Disattiva o attiva la mano sinistra/destra durante l'esercizio: isola una mano alla volta |
| `detect_chord` | Individua il nome dell'accordo da un insieme di note MIDI attualmente in riproduzione (ad esempio, `[60,64,67]` → Do) |
| `preview_teaching_cues` | Visualizza tutte le annotazioni didattiche e i momenti chiave prima di suonare |

### Esercitati

| Strumento | Cosa fa |
|------|--------------|
| `practice_loop` | L'esercizio che un insegnante reale assegna: ripeti le misure 5-8 più lentamente, e la velocità aumenta (+5%) solo dopo una *esecuzione pulita* — ogni esecuzione viene registrata, valutata e riassunta |
| `practice_status` | Stato dell'esercizio: esecuzione corrente, velocità e diagnostica per misura dell'ultima esecuzione |
| `score_last_take` | Valuta l'ultima esecuzione registrata: precisione del tono, ritmo, completezza, valutazioni per nota |
| `view_scored_piano_roll` | Lo spartito contrassegnato che ogni insegnante utilizza: la tastiera sovrapposta alle valutazioni per nota in una tavolozza a prova di daltonismo (solido = corretto, tratteggiato = ritmo, ✕ = mancante) |

### Canta

| Strumento | Cosa fa |
|------|--------------|
| `sing_along` | Testo cantabile: nomi delle note, solfeggio, andamento melodico o sillabe. Con o senza accompagnamento al pianoforte. |
| `ai_jam_sessions` | Genera un brief per una jam session: progressione di accordi, schema della melodia e suggerimenti sullo stile per la reinterpretazione. |
| `verify_harmony` | Il gate di verifica del ciclo di creazione: una riarmonizzazione proposta viene controllata dagli strumenti deterministici della piattaforma: fedeltà degli accordi (il motore degli accordi deve rilevare ogni accordo previsto), consonanza melodica (tono/tensione/cromaticismo), conduzione delle voci del basso, appartenenza alla tonalità. |
| `auto_reharmonize` | Il ciclo di creazione in una singola operazione: un modello locale propone una riarmonizzazione, il gate deterministico `verify_harmony` controlla ogni voicing, viene selezionata la migliore tra n opzioni fino a ottenere un'interpretazione verificata. |
| `compose_panel` | Esegui il pannello di composizione della conduzione delle voci su qualsiasi brano: quattro sistemi realizzano accompagnamenti, giudici LLM anonimi e appartenenti a famiglie diverse li classificano, aggregazione Bradley-Terry con un gate che elimina le esecuzioni non interpretabili (solo segnale direzionale, mai un punteggio di qualità). Esecuzione per alcuni minuti e visualizzazione delle notifiche sullo stato di avanzamento durante l'esecuzione. |

**Una linea cantata sincronizzata con il tempo: il percorso vocale.** Qualsiasi canzone presente nella libreria può contenere una vera linea melodica cantata che si sincronizza con il pianoforte: un **clock della partitura** (`scripts/build-score-clock.mjs`) deriva l'intonazione, l'attacco e la durata di ogni sillaba dalla MIDI della canzone sulla timeline del lettore; un cantante locale, con licenza Apache 2.0 e basato sulla partitura ([SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer)), canta da questo clock sulla tua GPU; e due gate misurano il risultato prima che venga considerato un mix: **tempo:** ogni vocale entro 40 ms dalla partitura; **intonazione:** ogni nota entro 50 centesimi, con un offset globale entro 20. Le parole vengono scelte da un insieme di registrazioni e unite solo ai confini delle parole con dissolvenze incrociate. Le impostazioni: `--track` (quale traccia MIDI è la melodia; `--list-tracks` per visualizzarla), `--lyrics "A-ma-zing grace …"` (un token per nota, le sillabe unite da `-`), `--measures`, il clip di prompt (la voce), il numero di registrazioni e le soglie del gate: ognuna con la sua citazione in `scripts/vocal_clock.py`. Percorso, impostazioni e risultati: [manuale → Voci](https://mcp-tool-shop-org.github.io/ai-jam-sessions/handbook/vocals/), [`docs/vocal-clock.md`](docs/vocal-clock.md); la ricerca alla base delle scelte: [`docs/vocal-singing-study-2026-09.md`](docs/vocal-singing-study-2026-09.md).

### Chitarra

| Strumento | Cosa fa |
|------|--------------|
| `view_guitar_tab` | Genera una tablatura interattiva per chitarra in formato HTML: clicca per modificare, cursore di riproduzione, scorciatoie da tastiera. |
| `list_guitar_voices` | Preset disponibili per le voci di chitarra. |
| `list_guitar_tunings` | Sistemi di accordatura per chitarra disponibili (standard, drop-D, open G, DADGAD, ecc.). |
| `tune_guitar` | Regola qualsiasi parametro di qualsiasi voce di chitarra. Le impostazioni vengono mantenute tra le sessioni. |
| `get_guitar_config` | Configurazione attuale della voce di chitarra rispetto alle impostazioni predefinite di fabbrica. |
| `reset_guitar` | Ripristina le impostazioni di fabbrica di una voce di chitarra. |

### Creazione

| Strumento | Cosa fa |
|------|--------------|
| `add_song` | Aggiungi un nuovo brano in formato JSON. |
| `import_midi` | Importa un file .mid con metadati. |
| `annotate_song` | Scrivi il linguaggio musicale per un brano grezzo e promuovilo a "pronto". |
| `save_practice_note` | Voce del diario con dati di sessione acquisiti automaticamente. |
| `read_practice_journal` | Carica le voci recenti per fornire contesto. |
| `list_keyboards` | Voci di tastiera disponibili. |
| `tune_keyboard` | Regola qualsiasi parametro di qualsiasi voce di tastiera. Le impostazioni vengono mantenute tra le sessioni. |
| `get_keyboard_config` | Configurazione attuale rispetto alle impostazioni predefinite di fabbrica. |
| `reset_keyboard` | Ripristina le impostazioni di fabbrica di una voce di tastiera. |
| `score_annotation` | Qualità dell'annotazione della partitura in base a 5 dimensioni: completezza, profondità, specificità, valore didattico, vocabolario. |
| `validate_song_entry` | Valida un file JSON del brano rispetto allo schema prima di aggiungerlo. |
| `transpose_song` | Trasponi un brano in alto o in basso per semitoni: nuova tonalità, nuove note. |
| `list_sections` | Visualizza le sezioni strutturali di un brano (Introduzione, Strofa, Ritornello, ecc.). |
| `add_section` | Aggiungi un marcatore di sezione a un brano per la navigazione strutturale. |

### Punteggio

| Strumento | Cosa fa |
|------|--------------|
| `score_performance` | Valuta un accompagnamento MIDI rispetto a una canzone di una libreria: intonazione, tempo, completezza,
con feedback graduato |
| `score_annotation` | Valuta la qualità dell'annotazione su 5 dimensioni |

### Ascolta

Misura l'audio registrato. Monofonico: segue una linea alla volta, quindi un accordo o un mix completo
producono risultati insensati. Ogni numero deriva dall'elaborazione del segnale, mai dalla lettura di
un'immagine da parte di un modello.

| Strumento | Cosa fa |
|------|--------------|
| `analyze_audio` | Misura un file WAV: tempi di attacco, la curva dell'intonazione come nomi di note con centesimi e livello. |
| `transcribe_audio` | Trasforma una registrazione monofonica in una sequenza di note, indicando la deviazione di ciascuna nota rispetto all'intonazione di riferimento. Le note che il tracker non è in grado di seguire vengono omesse anziché essere stimate. |
| `score_audio_take` | Valuta una performance confrontandola con una traccia musicale presente in una libreria, **a orecchio**, e poi passa il risultato a `view_scored_piano_roll`. |
| `view_spectrogram` | Visualizza il suono: uno spettrogramma a Q costante su un asse che rappresenta la tastiera di un pianoforte, con la possibilità di sovrapporlo alle note previste. Per impostazione predefinita, la visualizzazione è oscurata. |
| `ensemble_now` | Mostra cosa sta suonando **ogni strumento in questo preciso momento**, durante l'esecuzione. Le note provengono dai dati inviati, quindi sono esatte e non stimate. |

### Prompt MCP

Quattro modelli di prompt per flussi di lavoro didattici strutturati:

| Prompt | Cosa fa |
|--------|--------------|
| `annotate_song` | Flusso di lavoro guidato per l'annotazione: studia un esempio, scrivi il linguaggio musicale per un brano grezzo. |
| `practice_plan` | Crea un piano di pratica strutturato basato su genere, difficoltà e obiettivi. |
| `performance_review` | Rivedi una sessione completata: cosa ha funzionato bene, su cosa concentrarsi in seguito. |
| `maker_loop` | Esegui l'intero ciclo di creazione: proponi una riarmonizzazione, verificala con gli strumenti deterministici della piattaforma, quindi aggiungi e riproduci il risultato verificato. |

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

**v2.5.0: la versione in cui il modello può osservare la band mentre suona** (vedere [CHANGELOG](CHANGELOG.md)).
`ensemble_now` segnala cosa sta facendo ogni strumento mentre la musica è in corso: note tenute per strumento, la durata di ciascuna e l'accordo combinato. Funziona su due canali e il canale più economico è quello più preciso: quando questo server esegue l'analisi, sa esattamente cosa ha inviato, quindi un accordo è rappresentato da tre note anziché da un problema di trascrizione, mentre un sensore acustico separato misura ogni strumento **alla fonte** per la verifica. Il costo misurato è di circa **9 microsecondi per ogni callback audio**; la latenza è dichiarata esplicitamente anziché implicita (~23 ms per l'intonazione, ~70 ms per l'inizio confermato); e i limiti sono documentati perché possono essere modificati: il tracker è monofonico, i livelli secondari vengono analizzati individualmente e mai come un mix, e uno strumento senza sensore non è uno strumento silenzioso.
La stessa versione trasforma il sistema di gestione dei dati in un contratto che chiunque può utilizzare, con un modello di esempio, in modo che gli utenti possano creare i propri corpora e addestrare i propri adattatori utilizzando lo stesso metodo. Nel corso di questo processo, è stato scoperto che il meccanismo di riproducibilità del corpus acustico copre 109 dei suoi 115 percorsi pubblicati, e tre dei sei percorsi mancanti non sono mai stati emessi dal generatore: la rigenerazione li ha eliminati. Una rigenerazione completa riproduce ora ogni file e il manifesto dei checksum byte per byte. L'interfaccia live è composta da **54 strumenti e 4 modelli di prompt**, con **3.389 test superati su 165 file (1 saltato)**.

Nella versione precedente, v2.4.0: la versione in cui il modello ha acquisito la capacità di "ascoltare". Quattro strumenti hanno colmato il divario tra la riproduzione dell'audio e la sua analisi: `analyze_audio` per l'inizio, il profilo dell'intonazione e il livello; `transcribe_audio` per trasformare una registrazione monofonica in una sequenza di note; `score_audio_take` per valutare una performance a orecchio e passare il risultato alla sequenza di note del pianoforte esistente, senza modificarla; e `view_spectrogram` per visualizzare il suono su un asse a Q costante, che rappresenta la tastiera di un pianoforte. Tutto questo è un'elaborazione del segnale priva di dipendenze esterne, scritta in questo repository: la sua FFT, le finestre, le trasformazioni mel e a Q costante, il rilevamento dell'inizio e il tracciamento dell'intonazione, perché un modello non può valutare in modo affidabile un'immagine e le query deterministiche sono più efficaci dell'inferenza per le domande che richiedono risposte precise. Questa versione ha anche pubblicato **jam-actions-acoustic-v0**, 108 registrazioni di riferimento utilizzabili per testare l'uso degli strumenti sull'audio.

**v2.3.0: la versione in cui lo strumento ha imparato a cantare sincronizzato con il tempo** (vedi [CHANGELOG](CHANGELOG.md)). Ora, qualsiasi canzone presente nella libreria può contenere una vera linea melodica cantata che si sincronizza con il pianoforte: un **clock della partitura** deriva l'intonazione, l'attacco e la durata di ogni sillaba dalla MIDI della canzone sulla timeline del lettore; un cantante locale, con licenza Apache 2.0 e basato sulla partitura ([SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer)), canta da questo clock; e due gate misurano il risultato prima che venga considerato un mix: tempo (ogni vocale entro 40 ms dalla partitura) e intonazione (ogni nota entro 50 centesimi). La registrazione di Amazing Grace inclusa presenta un errore massimo di 6 ms nel tempo e di -2,7 centesimi nell'intonazione globale, con i risultati registrati; la pagina di destinazione la presenta come uno stato onesto, con l'unico difetto rimanente indicato (la giunzione iniziale). Il percorso, le sue impostazioni e la ricerca alla base di ogni scelta (cinque aree di studio, citate) sono presenti nel [manuale](https://mcp-tool-shop-org.github.io/ai-jam-sessions/handbook/vocals/) e in [`docs/`](docs/). L'interfaccia live è invariata, con **49 strumenti e 4 modelli di prompt**, con **3.080 test superati (1 saltato)** più la suite pytest dello strumento vocale. **Stato della pubblicazione:** pubblicato — [`@mcptoolshop/ai-jam-sessions@2.3.0`](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions) su npm, con tracciabilità della provenienza.

**v2.2.0: la versione in cui lo strumento ha acquisito un vero orecchio e una sala d'ascolto** (vedi [CHANGELOG](CHANGELOG.md)). Il pianoforte predefinito del pannello di controllo è ora un **pianoforte a coda campionato**: un pacchetto Salamander ridotto che si carica al primo gesto e torna al sintetizzatore oscillatore accordato fino a quando non sarà pronto, e il server seleziona automaticamente il motore di campionamento ogni volta che viene installato un pacchetto completo. Sopra c'è il **pannello di composizione**: una sala d'ascolto A/B anonima e con volume bilanciato in cui un essere umano classifica i voicing del motore di composizione rispetto a punti di riferimento validi dal punto di vista teorico e non validi (Bradley-Terry con intervalli di confidenza bootstrap, un limite di discriminazione in stile MUSHRA, PROVISORIO e NON INTERPRETABILE come risultati di primo livello), accanto a un pannello di modelli locali che esegue la stessa classificazione con giudici LLM appartenenti a famiglie diverse e una vista di confronto (Kendall τ) che chiede se il proxy economico traccia la verità umana.

La stessa versione include il motore di composizione che alimenta il pannello (`src/compose/`: un gate deterministico per la conduzione delle voci con preset di stile predefiniti, specifiche di armonizzazione basate sulla costruzione, un raffinatore che elabora una parte alla volta), un aggiornamento completo per la stabilità (45 problemi risolti: miglioramenti alla sicurezza, stringhe più chiare, modifiche visive che preservano l’aspetto), voci della libreria di Satie e Debussy rielaborate a partire dai dati di Mutopia, di pubblico dominio, e un aggiornamento per migliorare la robustezza contro test esterni: messaggi di errore descrittivi, buste di errore strutturate `{code, message, hint}`, un pacchetto tar curato, notifiche sullo stato di avanzamento per gli strumenti che richiedono più tempo e una grammatica per gli errori della riga di comando. Questa versione è stata rilasciata come [`@mcptoolshop/ai-jam-sessions@2.2.0`](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions) e include 49 strumenti, 4 modelli di prompt e 3.033 test.

In precedenza, nella versione 2.1.0: la versione in cui l'analista è diventato un **creatore**. Il ciclo di creazione viene fornito come prodotto: un modello propone una riarmonizzazione di qualsiasi brano della libreria e gli strumenti deterministici della piattaforma lo controllano: il motore degli accordi deve confermare ogni voicing previsto (`verify_harmony`), ogni nota della melodia è etichettata rispetto alla nuova armonia e solo un'interpretazione verificata viene inviata a `add_song` → `play_song` → `view_piano_roll`. Generazione verificata per costruzione: nessun rubric, nessuna autovalutazione; lo stesso `inferChord` che scrive i brief per le jam session è il giudice. Il modello di prompt `maker_loop` guida l'intero ciclo.

In precedenza, nella versione 2.0.0 — la versione in cui il set di dati ha dimostrato la sua efficacia. **Importante: la versione minima richiesta di Node.js è ora la 22** (`node-web-audio-api` 2.0); lo strumento stesso rimane invariato: sei motori audio, 47 strumenti MCP, 3 modelli di prompt e una **libreria completamente annotata: 120/120 brani suddivisi in 12 generi** (12 campi chiave corretti per adattarsi alle chiavi rilevate dal contenuto in questa versione). Il ciclo di apprendimento è completo dall'inizio alla fine: metronomo con conteggio iniziale → registrazione live → valutazione nota per nota → la partitura del pianoforte evidenziata → cicli di pratica che aumentano il tempo solo dopo passaggi eseguiti correttamente. La console del browser è un vero strumento di composizione: trasporto preciso al ritmo, acquisizione con attivazione della registrazione, annullamento/ripetizione completo, selezione multipla e area di copia-incolla, supporto touch — [disponibile sul web](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/).

Pubblica anche **[jam-actions-v0](#training-dataset)** — un set di dati di addestramento composto da 115 registrazioni di sequenze di utilizzo dello strumento MCP su brani classici per pianoforte, con una soglia di attivazione a 7 assi, riproducibilità in condizioni di avvio a freddo e metadati completi Zenodo + CITATION.cff (CC-BY-SA-3.0-DE) — replicato su [Hugging Face](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0), e ora include **risultati di ottimizzazione fine documentati in entrambe le direzioni**: un risultato negativo onesto (v0) e un risultato positivo disciplinato dalla preregistrazione che si è fermato a una vittoria di coppia prima del raggiungimento dell'obiettivo previsto (v1) — vedere i [documenti sull'ottimizzazione fine](#training-dataset). Questa versione corregge anche le registrazioni di Bach alla fonte (revisioni del set di lavoro r001/r002 con correzioni), dopo che il filtro di esecuzione della pipeline v1 ha rilevato un superamento della finestra pubblicata rispetto alle 62 misure effettive di BWV 846. 2506 test superati tra il server MCP, la console, i pacchetti del set di dati e gli strumenti di valutazione e il validatore del filtro di rilascio. Il MIDI è tutto presente, ogni brano può essere utilizzato per l'apprendimento e il corpus di tale apprendimento viene fornito insieme allo strumento.

## Sicurezza e privacy

**Dati interessati:** libreria di brani (JSON + MIDI), directory dei brani dell'utente (`~/.ai-jam-sessions/songs/`), configurazioni per l'accordatura della chitarra, voci del diario di pratica, dispositivo di output audio locale.

**Dati NON interessati (percorsi predefiniti):** il server e la CLI MCP non effettuano chiamate di rete, non leggono credenziali e non accedono a file di sistema al di fuori della directory dei brani dell'utente. Non vengono raccolti o inviati dati di telemetria. L'**strumento/tooling per il set di dati/valutazione opzionale** fornito nello stesso pacchetto (`scripts/run-llm-eval.ts`, verificatore della provenienza) è l'unica eccezione: quando lo si attiva esplicitamente, può chiamare le API LLM (legge `ANTHROPIC_API_KEY` dall'ambiente, ma non lo memorizza mai) e recuperare gli URL di provenienza. Non viene eseguito come parte del server, della CLI o dell'installazione.

**Autorizzazioni:** il server MCP utilizza solo il trasporto stdio (nessun HTTP). La CLI accede al file system locale e ai dispositivi audio. Consultare [SECURITY.md](SECURITY.md) per l'elenco completo delle policy.

## Licenza

MIT
