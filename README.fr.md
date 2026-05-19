<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

## Qu'est-ce que c'est ?

Un piano et une guitare que l'IA apprend à jouer. Ce n'est pas un synthétiseur, ni une bibliothèque MIDI, mais un instrument pédagogique.

Un LLM (Large Language Model) peut lire et écrire du texte, mais il ne peut pas expérimenter la musique de la même manière que nous. Il n'a pas d'oreilles, de doigts, ni de mémoire musculaire. AI Jam Sessions comble ce manque en donnant au modèle des sens qu'il peut réellement utiliser :

- **Lecture** : des partitions MIDI réelles avec des annotations musicales détaillées. Pas des approximations manuscrites, mais des éléments analysés, expliqués et interprétés.
- **Audition** : six moteurs audio (piano à ondes, piano échantillonné, échantillons vocaux, tract vocal physique, synthétiseur vocal additif, guitare modélisée physiquement) qui jouent via vos haut-parleurs, permettant ainsi aux humains présents de devenir les "oreilles" de l'IA.
- **Vision** : un piano roll qui affiche ce qui a été joué sous forme de SVG, que le modèle peut relire et vérifier. Un éditeur de tablatures de guitare interactif. Un "cockpit" navigateur avec un clavier visuel, un éditeur de notes en mode double et un laboratoire de réglage.
- **Mémoire** : un journal de pratique qui persiste d'une session à l'autre, permettant ainsi à l'apprentissage de s'accumuler au fil du temps.
- **Chant** : synthèse du tract vocal avec 20 préréglages de voix, allant du soprano d'opéra à la chorale électronique. Mode de chant avec narration de la gamme, du contour et des syllabes.

Chacun des 12 genres est accompagné d'un exemple richement annoté, une référence que l'IA étudie en premier, avec un contexte historique, une analyse structurelle détaillée mesure par mesure, les moments clés, les objectifs pédagogiques et des conseils de performance. Les 96 autres chansons sont des fichiers MIDI bruts, en attente que l'IA en assimile les schémas, joue la musique et rédige ses propres annotations.

Parmi ce même travail, nous publions également **[jam-actions-v0](#training-dataset)** : un ensemble de données public de 115 traces d'utilisation d'outils MCP (Multi-turn Control Plane) sur un véritable piano classique. Il enseigne aux LLM à effectuer une *utilisation d'outils ancrée dans la musique symbolique*, et non pas seulement à générer du texte, et il est livré avec une porte de sortie à 7 axes qui distingue "la transmission de preuves" de "la transmission parce que la tâche est triviale". Consultez la section [Training Dataset](#training-dataset) ci-dessous pour connaître l'ensemble de l'histoire.

## Le Piano Roll

Le piano roll est la façon dont l'IA perçoit la musique. Il affiche n'importe quelle chanson sous forme de SVG : bleu pour la main droite, corail pour la main gauche, avec des grilles de temps, des dynamiques et des barres :

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Deux modes de couleur : **main** (bleu/corail) ou **classe de hauteur** (arc-en-ciel chromatique : chaque do est rouge, chaque fa# est cyan). Le format SVG permet au modèle de voir l'image et de lire les métadonnées pour vérifier la hauteur, le rythme et l'indépendance des mains.

## Le Cockpit

Un studio d'instruments et de voix basé sur un navigateur qui s'ouvre en parallèle avec le serveur MCP. Pas de plugins, pas de DAW, juste une page web avec un piano.

- **Piano roll en mode double** : basculez entre le mode Instrument (couleurs de classe de hauteur chromatique) et le mode Vocal (les notes sont colorées en fonction de la forme de la voyelle : /a/ /e/ /i/ /o/ /u/)
- **Clavier visuel** : deux octaves de C4, mappés à votre clavier QWERTY. Cliquez ou tapez.
- **20 préréglages de voix** : 15 voix mappées à Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, plus une chorale et un synthé-voix), 4 voix mappées au tract et une section de chorale synthétique.
- **10 préréglages d'instruments** : les 6 voix de piano côté serveur, plus un synthé-pad, un orgue, une cloche et des cordes.
- **Inspecteur de notes** : cliquez sur n'importe quelle note pour modifier la vélocité, la voyelle et le souffle.
- **7 systèmes de réglage** : Tempérament égal, justesse (majeur/mineur), pythagoricien, meantone à quart de comma, Werckmeister III, ou décalages de centièmes personnalisés. Référence A4 réglable (392–494 Hz).
- **Audit de réglage** : tableau des fréquences, testeur d'intervalles avec analyse de la fréquence des battements, et exportation/importation du réglage.
- **Importation/exportation de partitions** : sérialisez la partition entière au format JSON et chargez-la.
- **API pour LLM** : `window.__cockpit` expose `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` et `getScore()` afin qu'un LLM puisse composer, arranger et lire la musique de manière programmatique.

## La boucle d'apprentissage

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

## La bibliothèque de chansons

120 chansons dans 12 genres différents, créées à partir de fichiers MIDI réels. Chaque genre comprend un exemple détaillé, avec un contexte historique, une analyse harmonique précise, les moments clés, les objectifs pédagogiques et des conseils d'interprétation (y compris des indications vocales). Ces exemples servent de modèles : l'IA étudie l'un d'eux, puis analyse le reste.

| Genre | Exemple | Tonalité | Ce qu'il enseigne |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | Mi mineur | Forme de blues mineur, réponse et question, jeu en retard sur le rythme. |
| Classique | Für Elise (Beethoven) | La mineur | Forme de rondo, différenciation du toucher, discipline de la pédale. |
| Film | Comptine d'un autre été (Tiersen) | Mi mineur | Textures en arpèges, architecture dynamique sans changement harmonique. |
| Folk | Greensleeves | Mi mineur | Rythme de valse en 3/4, mélange modal, style vocal de la Renaissance. |
| Jazz | Autumn Leaves (Kosma) | Sol mineur | Progressions ii-V-I, notes guides, huitièmes de note en swing, voicings sans fondamentale. |
| Latin | The Girl from Ipanema (Jobim) | Fa majeur | Rythme de bossa nova, modulation chromatique, retenue vocale. |
| New-Age | River Flows in You (Yiruma) | La majeur | Reconnaissance des accords I-V-vi-IV, arpèges fluides, rubato. |
| Pop | Imagine (Lennon) | Do majeur | Accompagnement en arpèges, retenue, sincérité vocale. |
| Ragtime | The Entertainer (Joplin) | Do majeur | Basse "oom-pah", syncopation, forme en plusieurs parties, discipline du tempo. |
| R&B | Superstition (Stevie Wonder) | Si mineur | Funk en seizièmes de note, clavier percussif, notes fantômes. |
| Rock | Your Song (Elton John) | Sib majeur | Voix de piano, inversions, chant conversationnel. |
| Soul | Lean on Me (Bill Withers) | Do majeur | Mélodie diatonique, accompagnement de style gospel, réponse et question. |

Les chansons progressent de l'état **brut** (MIDI uniquement) → **annoté** → **prêt** (entièrement jouable avec une terminologie musicale). L'IA fait progresser les chansons en les étudiant et en y ajoutant des annotations avec la fonction `annotate_song`.

## Moteurs sonores

Six moteurs, plus un combinateur multicouche qui exécute les deux simultanément :

| Moteur | Type | Ce qu'il donne comme son |
|--------|------|---------------------|
| **Oscillator Piano** | Synthèse additive | Piano multi-harmonique avec bruit de marteau, inharmonicité, polyphonie de 48 voix, rendu stéréo. Aucune dépendance. |
| **Sample Piano** | Lecture de fichiers WAV | Salamander Grand Piano — 480 échantillons, 16 couches de vélocité, 88 touches. Le vrai son. |
| **Vocal (Sample)** | Échantillons décalés en hauteur | Timbres vocaliques soutenus avec portamento et mode legato. |
| **Vocal Tract** | Modèle physique | Pink Trombone — Forme d'onde glottale basse fréquence à travers un guide d'ondes numérique à 44 cellules. Quatre préréglages : soprano, alto, ténor, basse. |
| **Vocal Synth** | Synthèse additive | 15 préréglages de voix Kokoro avec mise en forme de la résonance, souffle, vibrato. Déterministe (générateur de nombres aléatoires initialisé). |
| **Guitar** | Synthèse additive | Cordes pincées modélisées physiquement — 4 préréglages (acier dreadnought, nylon classique, jazz archtop, douze cordes), 8 accordages, 17 paramètres réglables. |
| **Layered** | Combinateur | Combine deux moteurs et envoie chaque événement MIDI aux deux — piano + synthé, voix + synthé, etc. |

### Voix de clavier

Six voix de piano réglables, chacune avec des paramètres ajustables individuellement (brillance, résonance, dureté du marteau, désaccord, largeur stéréo, etc.) :

| Voix | Caractéristique |
|-------|-----------|
| Piano à queue de concert | Riche, ample, classique |
| Piano droit | Chaud, intime, folk |
| Piano électrique | Son soyeux, jazzy, rappelant un Fender Rhodes |
| Piano Honky-Tonk | Désaccordé, ragtime, ambiance saloon |
| Boîte à musique | Cristallin, éthéré |
| Piano à queue brillant | Brillant, contemporain, pop |

### Voix de guitare

Quatre préréglages de voix de guitare avec synthèse de cordes modélisée physiquement, chacun avec 17 paramètres réglables (brillance, résonance du corps, position du pincement, amortissement des cordes, etc.) :

| Voix | Caractéristique |
|-------|-----------|
| Steel Dreadnought | Brillant, équilibré, acoustique classique |
| Nylon Classique | Chaud, doux, arrondi |
| Jazz Archtop | Doux, boisé, clair |
| Douze cordes | Chatoyant, doublé, effet chorus |

## Le Journal de Pratique

Après chaque session, le serveur enregistre ce qui s'est passé : quelle chanson, quelle vitesse, combien de mesures, quelle durée. L'IA ajoute ses propres réflexions : ce qu'elle a remarqué, les schémas qu'elle a reconnus, ce qu'il faut essayer ensuite.

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

Un fichier Markdown par jour, stocké dans `~/.ai-jam-sessions/journal/`. Lisible par un humain, ajout uniquement. Lors de la session suivante, l'IA lit son journal et reprend là où elle s'était arrêtée.

## Ensemble de données d'entraînement

**jam-actions-v0** — un ensemble de données public de traces d'utilisation d'outils MCP (Music Control Protocol) en plusieurs étapes, basées sur de vraies données MIDI de piano classique. Construit à partir de la même bibliothèque que celle utilisée pour enseigner à ce serveur, cet ensemble de données permet aux LLM (Large Language Models) d'effectuer une **utilisation d'outils basée sur la musique symbolique** — et non pas seulement la génération de texte.

Chaque enregistrement associe une fenêtre de phrase de 4 mesures à un objectif d'apprentissage annoté et à une *trace cible* — une session étape par étape dans laquelle un assistant utilise les outils MCP mentionnés ci-dessus (`get_events_in_measure`, `get_events_in_hand`, `count_distinct_pitch_classes`, et le reste de l'interface d'inspection MIDI à 9 outils) pour lire, analyser et discuter de la phrase.

| | |
|---|---|
| Enregistrements | 115 (sous-ensemble public) |
| Base de référence canonique | 16 enregistrements corrigés (E3) |
| Compositions | 8 œuvres de piano classique (Beethoven, Bach, Schubert, Schumann, Mozart, Mendelssohn, Tchaïkovski) |
| Source MIDI | piano-midi.de — arrangements de Bernd Krueger |
| Licence | CC-BY-SA-3.0-DE (arrangements) sur des compositions du domaine public |
| Version | 0.4.3 (2026-05-19) |
| Schéma | `release-gate-assessment/2.0.0` |

**Qualité de l'histoire — la porte de contrôle à 7 axes.** L'ensemble de données est fourni avec une porte de contrôle qui distingue les résultats valides et fondés sur des preuves des résultats saturés et non pertinents. Les axes 1 à 6 sont des critères d'exclusion (plancher absolu, marge de sécurité, taux d'utilisation des outils, correction après utilisation, nombre d'interprétations erronées, seuil minimum) ; l'axe 7 indique si le rapport est enrichi ou non. Les axes 2 et 6 permettent un "ceiling_saturated_pass" afin que les enregistrements qui obtiennent un score de 1,000 dans les conditions "texte uniquement" / "inspection par outil" / "MIDI aléatoire" ne diluent pas les niveaux de qualité les plus élevés. La base de référence de la tranche 22 **PASSE** la porte révisée. La base de référence de la tranche 19 **RESTE EN ÉCHEC** — elle est conservée comme diagnostic de régression afin que la porte soit efficace.

**Reproductibilité.** Un nouveau contributeur sur n'importe quelle plateforme (Windows natif, macOS, Linux, WSL) peut vérifier le package et reproduire le verdict "PASS" de la base de référence en moins d'une minute :

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions && pnpm install
pnpm exec tsx scripts/verify-public-package-checksums.ts        # 273 entries, ~2s
pnpm exec tsx scripts/check-release-gate.ts \
  datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json
# → "Verdict: PASS"
```

`.gitattributes` fixe les fins de ligne LF pour les fichiers `*.sha256` et l'arborescence du jeu de données public, afin que le vérificateur de checksum fonctionne sur toutes les plateformes. L'interface en ligne de commande `release-gate` est strictement positionnelle (elle rejette les arguments positionnels inconnus ou multiples), ce qui empêche les contributeurs débutants de l'utiliser incorrectement sans le savoir.

**Où le trouver.** La description complète du jeu de données se trouve dans le fichier [`datasets/jam-actions-v0-public/README.md`](datasets/jam-actions-v0-public/README.md). Les métadonnées de dépôt Zenodo se trouvent dans le fichier [`zenodo-metadata.json`](datasets/jam-actions-v0-public/zenodo-metadata.json), les métadonnées de citation dans le fichier [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff), et les notes de version dans le fichier [`RELEASE_NOTES.md`](datasets/jam-actions-v0-public/RELEASE_NOTES.md). L'ensemble des étapes de construction, depuis le brouillon initial du corpus jusqu'à la correction des erreurs, la correction de Schumann, la révision de la phase de validation, et l'audit de l'utilisation autonome, se trouve dans le répertoire [`docs/`](docs/).

> Les arrangements MIDI sont de Bernd Krueger (piano-midi.de), sous licence CC-BY-SA-3.0-DE. Les annotations, les traces et les artefacts d'évaluation sont de l'équipe AI Jam Sessions, publiés sous la même licence afin de préserver la chaîne de partage.

## Installation

```bash
npm install -g ai-jam-sessions
```

Nécessite **Node.js 18+**. Pas de pilotes MIDI, pas de ports virtuels, pas de logiciels externes.

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

41 outils et 3 modèles de requêtes répartis en six catégories :

### Apprentissage

| Outil | Ce qu'il fait |
|------|--------------|
| `list_songs` | Parcourir par genre, difficulté ou mot-clé |
| `song_info` | Analyse musicale complète : structure, moments clés, objectifs pédagogiques, conseils de style |
| `registry_stats` | Statistiques globales de la bibliothèque : nombre total de chansons, genres, difficultés |
| `list_measures` | Notes, nuances et indications pédagogiques pour chaque mesure |
| `teaching_note` | Analyse approfondie d'une seule mesure : doigtés, nuances, contexte |
| `suggest_song` | Recommandation basée sur le genre, la difficulté et ce que vous avez déjà joué |
| `practice_setup` | Vitesse recommandée, mode, paramètres de voix et commande de l'interface en ligne de commande pour une chanson |
| `compare_songs` | Reconnaissance de motifs inter-genres : relations harmoniques, similarités de hauteur/intervalle, formes communes, liens pédagogiques |
| `annotation_progress` | Évaluation de la qualité des annotations dans toute la bibliothèque : scores, notes et suggestions d'amélioration |
| `server_info` | Version du serveur, statistiques de la bibliothèque, liste des moteurs, session active |

### Lecture

| Outil | Ce qu'il fait |
|------|--------------|
| `play_song` | Lecture via les haut-parleurs : chansons de la bibliothèque ou fichiers .mid bruts. N'importe quel moteur, vitesse, mode, plage de mesures. |
| `stop_playback` | Arrêt |
| `pause_playback` | Pause ou reprise |
| `set_speed` | Modification de la vitesse pendant la lecture (0,1×–4,0×) |
| `playback_status` | Instantané en temps réel : mesure actuelle, tempo, vitesse, voix du clavier, état |
| `view_piano_roll` | Rendu au format SVG (coloration manuelle ou arc-en-ciel chromatique par classe de hauteur) |
| `score_performance` | Notation d'un accompagnement MIDI : justesse de la hauteur, timing, complétude, avec feedback gradué |
| `mute_hand` | Mute ou unmute de la main gauche/droite pendant la pratique : isole une main à la fois |
| `preview_teaching_cues` | Affichage de toutes les notes pédagogiques et des moments clés avant de jouer |

### Chant

| Outil | Ce qu'il fait |
|------|--------------|
| `sing_along` | Texte chantable : noms de notes, solfège, contour ou syllabes. Avec ou sans accompagnement de piano. |
| `ai_jam_sessions` | Génération d'un bref résumé de la session : progression d'accords, structure mélodique et indications de style pour la réinterprétation |

### Guitare

| Outil | Ce qu'il fait |
|------|--------------|
| `view_guitar_tab` | Rendu de tablatures de guitare interactives au format HTML : édition par clic, curseur de lecture, raccourcis clavier |
| `list_guitar_voices` | Présets de voix de guitare disponibles |
| `list_guitar_tunings` | Systèmes d'accordage de guitare disponibles (standard, drop-D, open G, DADGAD, etc.) |
| `tune_guitar` | Ajustement de n'importe quel paramètre de n'importe quelle voix de guitare. Persiste entre les sessions. |
| `get_guitar_config` | Configuration actuelle de la voix de guitare par rapport aux paramètres par défaut d'usine |
| `reset_guitar` | Réinitialisation d'une voix de guitare aux paramètres d'usine |

### Construction

| Outil | Ce qu'il fait |
|------|--------------|
| `add_song` | Ajout d'une nouvelle chanson au format JSON |
| `import_midi` | Importation d'un fichier .mid avec métadonnées |
| `annotate_song` | Écrire la notation musicale pour une chanson brute et la transformer en une version aboutie. |
| `save_practice_note` | Journal avec données de session enregistrées automatiquement. |
| `read_practice_journal` | Charger les entrées récentes pour le contexte. |
| `list_keyboards` | Voix de clavier disponibles. |
| `tune_keyboard` | Ajuster n'importe quel paramètre de n'importe quelle voix de clavier. Les modifications sont conservées entre les sessions. |
| `get_keyboard_config` | Configuration actuelle par rapport aux paramètres d'usine. |
| `reset_keyboard` | Réinitialiser une voix de clavier aux paramètres d'usine. |
| `score_annotation` | Qualité de l'annotation musicale selon 5 dimensions : exhaustivité, profondeur, spécificité, valeur pédagogique, vocabulaire. |
| `validate_song_entry` | Valider un fichier JSON de chanson par rapport au schéma avant de l'ajouter. |
| `transpose_song` | Transposer une chanson vers le haut ou vers le bas de demi-tons : nouvelle tonalité, nouvelles notes. |
| `list_sections` | Afficher les sections structurelles d'une chanson (Intro, Couplet, Refrain, etc.). |
| `add_section` | Ajouter un marqueur de section à une chanson pour la navigation structurée. |

### Prompts MCP

Trois modèles de prompts pour des flux de travail pédagogiques structurés :

| Prompt | Ce qu'il fait |
|--------|--------------|
| `annotate_song` | Flux de travail d'annotation guidé : étudier un exemple, écrire la notation musicale pour une chanson brute. |
| `practice_plan` | Créer un plan de pratique structuré basé sur le genre, la difficulté et les objectifs. |
| `performance_review` | Revoir une session terminée : ce qui a bien fonctionné, sur quoi se concentrer ensuite. |

## Interface en ligne de commande (CLI)

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

## Statut

Version 1.4.1. Six moteurs de son, 41 outils MCP, 3 modèles de prompts, 120 chansons dans 12 genres avec des exemples annotés de manière approfondie. Transposition de chansons, marqueurs de section, sourdine/solo par main pour une pratique ciblée. Éditeur interactif de tablatures de guitare. Cockpit de navigateur avec 20 préréglages vocaux, 10 voix d'instruments, 7 systèmes d'accordage et une API de notation compatible avec les LLM. Visualisation du piano roll en deux modes de couleur. Journal de pratique pour un apprentissage continu. Persistance de l'état de la session lors des redémarrages du serveur. Notation MIDI avec accompagnement, évaluation de la qualité de l'annotation et reconnaissance de motifs inter-genres.

Publie également **[jam-actions-v0](#training-dataset)** : un ensemble de données d'entraînement de 115 enregistrements de traces d'utilisation d'outils MCP multi-tours sur le piano classique, avec une porte de sortie à 7 axes, une reproductibilité en situation de démarrage à froid et des métadonnées Zenodo + CITATION.cff complètes (CC-BY-SA-3.0-DE). 1513 tests réussis sur le serveur MCP + les empaqueteurs de données + les environnements de test + le validateur de la porte de sortie. Tous les fichiers MIDI sont présents : la bibliothèque grandit au fur et à mesure que l'IA apprend, et maintenant, un corpus de cet apprentissage est inclus.

## Sécurité et confidentialité

**Données consultées :** bibliothèque de chansons (JSON + MIDI), répertoire des chansons de l'utilisateur (`~/.ai-jam-sessions/songs/`), configurations d'accordage de la guitare, entrées du journal de pratique, périphérique de sortie audio local.

**Données NON consultées :** pas d'API cloud, pas de données d'identification utilisateur, pas de données de navigation, pas de fichiers système en dehors du répertoire des chansons de l'utilisateur. Aucune télémétrie n'est collectée ou envoyée.

**Autorisations :** Le serveur MCP utilise uniquement le transport stdio (pas de HTTP). L'interface en ligne de commande accède au système de fichiers local et aux périphériques audio. Consultez [SECURITY.md](SECURITY.md) pour connaître la politique complète.

## Licence

MIT.
