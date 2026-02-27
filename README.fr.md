<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

## Qu'est-ce que c'est ?

Un piano et une guitare que l'IA apprend à jouer. Ce n'est pas un synthétiseur, ni une bibliothèque MIDI, mais un instrument pédagogique.

Un LLM (Large Language Model) peut lire et écrire du texte, mais il ne peut pas expérimenter la musique de la même manière que nous. Il n'a pas d'oreilles, de doigts, ni de mémoire musculaire. AI Jam Sessions comble ce fossé en donnant au modèle des sens qu'il peut réellement utiliser :

- **Lecture** : de véritables partitions MIDI avec des annotations musicales détaillées. Pas de simples approximations manuscrites, mais des partitions analysées, expliquées et interprétées.
- **Audition** : six moteurs audio (piano à ondes, piano échantillonné, échantillons vocaux, tract vocal physique, synthétiseur vocal additif, guitare modélisée physiquement) qui produisent le son via vos haut-parleurs, permettant aux humains présents dans la pièce de devenir les "oreilles" de l'IA.
- **Vision** : un piano roll qui affiche ce qui a été joué sous forme de SVG, que le modèle peut relire et vérifier. Un éditeur de tablatures interactif pour guitare. Un cockpit navigateur avec un clavier visuel, un éditeur de notes en mode double, et un laboratoire de réglage.
- **Mémoire** : un journal de pratique qui persiste d'une session à l'autre, permettant à l'apprentissage de s'accumuler au fil du temps.
- **Chant** : synthèse du tract vocal avec 20 préréglages de voix, de la soprano d'opéra à la chorale électronique. Mode de chant avec narration de la gamme, du contour et des syllabes.

Chacun des 12 genres possède un exemple richement annoté, une référence que l'IA étudie en premier, avec un contexte historique, une analyse structurelle mesure par mesure, des moments clés, des objectifs pédagogiques et des conseils de performance. Les 96 autres chansons sont des fichiers MIDI bruts, en attente que l'IA en comprenne les schémas, joue la musique et rédige ses propres annotations.

## Le Piano Roll

Le piano roll est la façon dont l'IA "voit" la musique. Il affiche n'importe quelle chanson sous forme de SVG : bleu pour la main droite, corail pour la main gauche, avec des grilles de temps, des dynamiques et des barres de mesure :

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Deux modes de couleur : **main** (bleu/corail) ou **classe de hauteur** (arc-en-ciel chromatique : chaque do est rouge, chaque fa# est cyan). Le format SVG permet au modèle de voir l'image et de lire le code pour vérifier la hauteur, le rythme et l'indépendance des mains.

## Le Cockpit

Un studio d'instruments et de voix basé sur un navigateur, qui s'ouvre en parallèle du serveur MCP. Pas de plugins, pas de DAW, juste une page web avec un piano.

- **Pavé de piano à double mode** : Basculez entre le mode Instrument (couleurs chromatiques des notes) et le mode Voix (les notes sont colorées en fonction de la forme de la voyelle : /a/ /e/ /i/ /o/ /u/).
- **Clavier visuel** : Deux octaves de Do4, mappés sur votre clavier QWERTY. Cliquez ou tapez.
- **20 préréglages de voix** : 15 voix mappées Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, plus chœur et voix synthétiques), 4 voix mappées sur les pistes, et une section de chœur synthétique.
- **10 préréglages d'instruments** : Les 6 voix de piano côté serveur, plus synthé, orgue, cloches et cordes.
- **Inspecteur de notes** : Cliquez sur n'importe quelle note pour modifier la vélocité, la voyelle et le vibrato.
- **7 systèmes d'accordage** : Tempérament égal, intonation juste (majeur/mineur), pythagoricien, meantone à quart de comma, Werckmeister III, ou décalages de cents personnalisés. Référence A4 réglable (392–494 Hz).
- **Audit d'accordage** : Tableau des fréquences, test des intervalles avec analyse des battements, et exportation/importation de l'accordage.
- **Importation/exportation de partitions** : Sérialisez la partition entière au format JSON et chargez-la.
- **API pour les LLM** : `window.__cockpit` expose `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` et `getScore()` afin qu'un LLM puisse composer, arranger et lire la musique de manière programmatique.

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

120 chansons dans 12 genres, créées à partir de fichiers MIDI réels. Chaque genre comprend un exemple annoté en profondeur, avec un contexte historique, une analyse harmonique détaillée mesure par mesure, les moments clés, les objectifs pédagogiques et des conseils d'interprétation (y compris des conseils vocaux). Ces exemples servent de modèles : l'IA étudie l'un d'eux, puis annote les autres.

| Genre | Exemple | Tonalité | Ce qu'il enseigne |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | Mi mineur | Forme blues mineure, question-réponse, jeu en retard sur le rythme. |
| Classique | Für Elise (Beethoven) | La mineur | Forme rondo, différenciation du toucher, discipline de la pédale. |
| Film | Comptine d'un autre été (Tiersen) | Mi mineur | Textures en arpèges, architecture dynamique sans changement harmonique. |
| Folk | Greensleeves | Mi mineur | 3/4, valse, mélange modal, style vocal de la Renaissance. |
| Jazz | Autumn Leaves (Kosma) | Sol mineur | Progressions ii-V-I, notes guides, huitièmes de note en swing, voicings sans fondamentale. |
| Latin | The Girl from Ipanema (Jobim) | Fa majeur | Rythme de bossa nova, modulation chromatique, retenue vocale. |
| New-Age | River Flows in You (Yiruma) | La majeur | Reconnaissance I-V-vi-IV, arpèges fluides, rubato. |
| Pop | Imagine (Lennon) | Do majeur | Accompagnement en arpèges, retenue, sincérité vocale. |
| Ragtime | The Entertainer (Joplin) | Do majeur | Basse "oom-pah", syncopation, forme en plusieurs parties, discipline du tempo. |
| R&B | Superstition (Stevie Wonder) | Sib mineur | Funk en 16èmes de note, clavier percussif, notes fantômes. |
| Rock | Your Song (Elton John) | Sib majeur | Voix de piano, inversions, chant conversationnel. |
| Soul | Lean on Me (Bill Withers) | Do majeur | Mélodie diatonique, accompagnement gospel, question-réponse. |

Les chansons progressent de **brutes** (MIDI uniquement) → **annotées** → **prêtes** (entièrement jouables avec un langage musical). L'IA fait progresser les chansons en les étudiant et en écrivant des annotations avec `annotate_song`.

## Sound Engines

Six moteurs, plus un combinateur qui permet de faire fonctionner simultanément n'importe quelle paire :

| Moteur | Type | Description sonore |
|--------|------|---------------------|
| **Oscillator Piano** | Synthèse additive | Piano multi-harmonique avec bruit de marteau, inharmonicité, polyphonie de 48 voix, rendu stéréo. Aucune dépendance. |
| **Sample Piano** | Lecture de fichiers WAV | Piano Salamander Grand — 480 échantillons, 16 couches de vélocité, 88 touches. Le vrai son. |
| **Vocal (Sample)** | Échantillons décalés en hauteur | Timbres de voyelles soutenus avec portamento et mode legato. |
| **Vocal Tract** | Modèle physique | Trombone Pink — Forme d'onde glottale basse fréquence à travers un guide d'ondes numérique à 44 cellules. Quatre préréglages : soprano, alto, ténor, basse. |
| **Vocal Synth** | Synthèse additive | 15 préréglages de voix Kokoro avec façonnage de la formante, souffle, vibrato. Déterministe (générateur de nombres aléatoires avec graine). |
| **Guitar** | Synthèse additive | Cordes pincées modélisées physiquement — 4 préréglages (acier dreadnought, nylon classique, jazz archtop, douze cordes), 8 accordages, 17 paramètres réglables. |
| **Layered** | Combinateur | Combine deux moteurs et envoie chaque événement MIDI aux deux — piano + synthé, voix + synthé, etc. |

### Voix de clavier

Six voix de piano réglables, chacune avec des paramètres ajustables individuellement (brillance, décroissance, dureté du marteau, désaccord, largeur stéréo, etc.) :

| Voix | Description |
|-------|-----------|
| Grand concert | Riche, ample, classique |
| Piano droit | Chaud, intime, folk |
| Piano électrique | Soie, jazz, sonorité Fender Rhodes |
| Honky-Tonk | Désaccordé, ragtime, ambiance saloon |
| Boîte à musique | Cristallin, éthéré |
| Grand brillant | Percutant, contemporain, pop |

### Voix de guitare

Quatre préréglages de voix de guitare avec synthèse de cordes modélisées physiquement, chacun avec 17 paramètres réglables (brillance, résonance du corps, position de pincement, amortissement des cordes, etc.) :

| Voix | Description |
|-------|-----------|
| Steel Dreadnought | Brillant, équilibré, acoustique classique |
| Nylon Classical | Chaud, doux, arrondi |
| Jazz Archtop | Doux, boisé, clair |
| Twelve-String | Chatoyant, doublé, effet chorus |

## Le Journal de Pratique

Après chaque session, le serveur enregistre ce qui s'est passé : quelle chanson, quelle vitesse, combien de mesures, pendant combien de temps. L'IA ajoute ses propres réflexions : ce qu'elle a remarqué, les schémas qu'elle a reconnus, ce qu'il faut essayer ensuite.

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

Un fichier Markdown par jour, stocké dans `~/.ai-jam-sessions/journal/`. Lisible par l'homme, ajout uniquement. Lors de la prochaine session, l'IA lit son journal et reprend là où elle s'était arrêtée.

## Installation

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

Nécessite **Node.js 18+**. Pas de pilotes MIDI, pas de ports virtuels, pas de logiciels externes.

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

31 outils répartis dans quatre catégories :

### Apprentissage

| Outil | Ce qu'il fait |
|------|--------------|
| `list_songs` | Parcourir par genre, difficulté ou mot-clé |
| `song_info` | Analyse musicale complète — structure, moments clés, objectifs pédagogiques, conseils de style |
| `registry_stats` | Statistiques globales de la bibliothèque : nombre total de chansons, genres, difficultés |
| `library_progress` | Statut de l'annotation pour tous les genres |
| `list_measures` | Notes, dynamiques et notes pédagogiques pour chaque mesure |
| `teaching_note` | Analyse approfondie d'une seule mesure — doigtés, dynamiques, contexte |
| `suggest_song` | Recommandation basée sur le genre, la difficulté et ce que vous avez déjà joué |
| `practice_setup` | Vitesse, mode, réglages de voix et commande CLI recommandés pour une chanson |

### Lecture

| Outil | Ce qu'il fait |
|------|--------------|
| `play_song` | Lecture via les haut-parleurs — chansons de la bibliothèque ou fichiers .mid bruts. N'importe quel moteur, vitesse, mode, plage de mesures. |
| `stop_playback` | Arrêt |
| `pause_playback` | Pause ou reprise. |
| `set_speed` | Modification de la vitesse pendant la lecture (de 0,1x à 4,0x). |
| `playback_status` | Capture instantanée en temps réel : mesure actuelle, tempo, vitesse, timbre de clavier, état. |
| `view_piano_roll` | Rendu au format SVG (couleurs manuelles ou arc-en-ciel chromatique par classe de hauteur). |

### Chanter

| Outil | Ce qu'il fait |
|------|--------------|
| `sing_along` | Texte chantable : noms des notes, solfège, contour mélodique ou syllabes. Avec ou sans accompagnement de piano. |
| `ai_jam_sessions` | Génération d'un bref résumé pour improvisation : progression d'accords, structure mélodique et indications de style pour une réinterprétation. |

### Guitare

| Outil | Ce qu'il fait |
|------|--------------|
| `view_guitar_tab` | Rendu de tablatures de guitare interactives au format HTML : édition par clic, curseur de lecture, raccourcis clavier. |
| `list_guitar_voices` | Présets de timbre de guitare disponibles. |
| `list_guitar_tunings` | Systèmes d'accordage de guitare disponibles (standard, drop-D, ouvert en G, DADGAD, etc.). |
| `tune_guitar` | Ajustement de n'importe quel paramètre de n'importe quel timbre de guitare. Les modifications sont conservées entre les sessions. |
| `get_guitar_config` | Configuration actuelle du timbre de guitare par rapport aux paramètres par défaut. |
| `reset_guitar` | Réinitialisation d'un timbre de guitare aux paramètres d'usine. |

### Construction

| Outil | Ce qu'il fait |
|------|--------------|
| `add_song` | Ajout d'une nouvelle chanson au format JSON. |
| `import_midi` | Importation d'un fichier .mid avec métadonnées. |
| `annotate_song` | Écriture d'un langage musical pour une chanson brute et conversion en chanson prête à être utilisée. |
| `save_practice_note` | Entrée de journal avec données de session capturées automatiquement. |
| `read_practice_journal` | Chargement des entrées récentes pour le contexte. |
| `list_keyboards` | Timbre de clavier disponibles. |
| `tune_keyboard` | Ajustement de n'importe quel paramètre de n'importe quel timbre de clavier. Les modifications sont conservées entre les sessions. |
| `get_keyboard_config` | Configuration actuelle par rapport aux paramètres par défaut. |
| `reset_keyboard` | Réinitialisation d'un timbre de clavier aux paramètres d'usine. |

## Interface en ligne de commande (CLI)

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

## État

Version 0.3.0. Six moteurs de son, 31 outils MCP, 120 chansons dans 12 genres avec des exemples annotés de manière approfondie. Éditeur de tablatures de guitare interactives. Interface web avec 20 présets vocaux, 10 timbres d'instruments, 7 systèmes d'accordage et une API de partition compatible avec les modèles de langage. Visualisation du piano roll en deux modes de couleur. Journal de pratique pour un apprentissage continu. Tous les fichiers MIDI sont présents : la bibliothèque s'agrandit au fur et à mesure que l'IA apprend.

## Sécurité et confidentialité

**Données utilisées :** bibliothèque de chansons (JSON + MIDI), répertoire des chansons de l'utilisateur (`~/.ai-jam-sessions/songs/`), configurations d'accordage de guitare, entrées du journal de pratique, périphérique de sortie audio local.

**Données non utilisées :** aucune API cloud, aucune information d'identification de l'utilisateur, aucune donnée de navigation, aucun fichier système en dehors du répertoire des chansons de l'utilisateur. Aucune télémétrie n'est collectée ni envoyée.

**Autorisations :** Le serveur MCP utilise uniquement le transport stdio (pas de HTTP). L'interface en ligne de commande accède au système de fichiers local et aux périphériques audio. Consultez [SECURITY.md](SECURITY.md) pour la politique complète.

## Licence

MIT.
