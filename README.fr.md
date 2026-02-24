<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <strong>Français</strong> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo-banner.png" alt="AI Jam Sessions" width="520" />
</p>

<p align="center">
  <em>L'apprentissage automatique à l'ancienne</em>
</p>

<p align="center">
  Un serveur MCP qui apprend à l'IA à jouer du piano et de la guitare — et à chanter.<br/>
  120 morceaux dans 12 genres. Six moteurs sonores. Tablature de guitare interactive.<br/>
  Un cockpit navigateur avec synthétiseur vocal. Un journal de pratique qui se souvient de tout.
</p>

[![CI](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@mcptoolshop/ai-jam-sessions)](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions)
[![Songs](https://img.shields.io/badge/songs-120_across_12_genres-blue)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)
[![Ready](https://img.shields.io/badge/annotated-24-green)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)

---

## Qu'est-ce que c'est ?

Un piano et une guitare que l'IA apprend à jouer. Pas un synthétiseur, pas une bibliothèque MIDI — un instrument pédagogique.

Un LLM sait lire et écrire du texte, mais il ne peut pas vivre la musique comme nous. Pas d'oreilles, pas de doigts, pas de mémoire musculaire. AI Jam Sessions comble ce fossé en donnant au modèle des sens qu'il peut réellement utiliser :

- **Lire** — de vraies partitions MIDI avec des annotations musicales profondes. Pas des approximations manuscrites — analysées, décortiquées et expliquées.
- **Entendre** — six moteurs audio (piano oscillateur, piano échantillonné, échantillons vocaux, conduit vocal physique, synthèse additive vocale, guitare modélisée physiquement) jouent via vos haut-parleurs. Les humains dans la pièce deviennent les oreilles de l'IA.
- **Voir** — un piano roll qui rend ce qui a été joué en SVG que le modèle peut relire et vérifier. Un éditeur de tablature de guitare interactif. Un cockpit navigateur avec clavier visuel, éditeur de notes dual et laboratoire d'accordage.
- **Se souvenir** — un journal de pratique persistant entre les sessions. L'apprentissage se cumule.
- **Chanter** — synthèse de conduit vocal avec 20 presets de voix, du soprano lyrique au chœur électronique. Mode chant accompagné avec solfège, contour et narration syllabique.

Chacun des 12 genres a un exemplaire richement annoté — un morceau de référence avec contexte historique, analyse structurelle mesure par mesure, moments clés, objectifs pédagogiques et conseils d'interprétation. Les 96 autres morceaux sont du MIDI brut, en attente que l'IA absorbe les motifs, joue la musique et écrive ses propres annotations.

## Le Piano Roll

Le piano roll est la façon dont l'IA voit la musique. Il rend n'importe quel morceau en SVG — bleu pour la main droite, corail pour la gauche, avec grilles de temps, dynamiques et limites de mesure :

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll de La Lettre à Élise mesures 1-8" width="100%" />
</p>

<p align="center"><em>La Lettre à Élise, mesures 1–8 — le trille E5-D#5 en bleu, accompagnement grave en corail</em></p>

Deux modes de couleur : **main** (bleu/corail) ou **classe de hauteur** (arc-en-ciel chromatique — tous les Do sont rouges, tous les Fa# sont cyan). Le format SVG permet au modèle de voir l'image et de lire le balisage pour vérifier la hauteur, le rythme et l'indépendance des mains.

## Le Cockpit

Un instrument et studio vocal dans le navigateur qui s'ouvre aux côtés du serveur MCP. Pas de plugins, pas de DAW — juste une page web avec un piano.

- **Piano roll double mode** — basculer entre mode Instrument (couleurs chromatiques par classe de hauteur) et mode Vocal (notes colorées par voyelle : /a/ /e/ /i/ /o/ /u/)
- **Clavier visuel** — deux octaves depuis C4, mappé sur votre clavier QWERTY. Cliquer ou taper.
- **20 presets vocaux** — 15 voix Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, choir, synth-vox), 4 voix de conduit et une section chorale synthétique
- **10 presets d'instruments** — les 6 voix de piano côté serveur plus synth-pad, organ, bell et strings
- **Inspecteur de notes** — cliquer sur n'importe quelle note pour éditer la vélocité, la voyelle et le souffle
- **7 systèmes d'accordage** — tempérament égal, intonation juste (majeur/mineur), pythagoricien, mésotonique au quart de comma, Werckmeister III, ou décalages en cents personnalisés. Référence La4 ajustable (392–494 Hz).
- **Audit d'accordage** — table de fréquences, testeur d'intervalles avec analyse de fréquence de battement, import/export d'accordage
- **Import/export de partition** — sérialiser la partition complète en JSON
- **API pour LLM** — `window.__cockpit` expose `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` et `getScore()` pour la composition programmatique

## La Boucle d'Apprentissage

```
 Lire                Jouer               Voir                Réfléchir
┌──────────┐     ┌───────────┐     ┌────────────┐     ┌──────────────┐
│ Étudier   │     │ Jouer le  │     │ Voir le    │     │ Écrire ce    │
│ l'analyse │ ──▶ │ morceau à │ ──▶ │ piano roll │ ──▶ │ qu'on a      │
│ de l'exem-│     │ n'importe │     │ pour       │     │ appris dans  │
│ plaire    │     │ quel tempo│     │ vérifier   │     │ le journal   │
└──────────┘     └───────────┘     └────────────┘     └──────┬───────┘
                                                             │
                                                             ▼
                                                    ┌──────────────┐
                                                    │ La session   │
                                                    │ suivante     │
                                                    │ reprend ici  │
                                                    └──────────────┘
```

## Bibliothèque de Morceaux

120 morceaux dans 12 genres, construits à partir de vrais fichiers MIDI. Chaque genre a un exemplaire profondément annoté — avec contexte historique, analyse harmonique mesure par mesure, moments clés, objectifs pédagogiques et conseils d'interprétation (guide vocal inclus). Ces exemplaires servent de modèles : l'IA en étudie un, puis annote le reste.

| Genre | Exemplaire | Tonalité | Ce qu'il enseigne |
|-------|------------|----------|-------------------|
| Blues | The Thrill Is Gone (B.B. King) | Si mineur | Forme blues mineur, appel-réponse, jouer en retard sur le temps |
| Classique | La Lettre à Élise (Beethoven) | La mineur | Forme rondo, différenciation du toucher, discipline de la pédale |
| Film | Comptine d'un autre été (Tiersen) | Mi mineur | Textures arpégées, architecture dynamique sans changement harmonique |
| Folk | Greensleeves | Mi mineur | Valse en 3/4, mélange modal, style vocal Renaissance |
| Jazz | Les Feuilles mortes (Kosma) | Sol mineur | Progressions ii-V-I, notes guides, croches swing, voicings sans fondamentale |
| Latin | La Fille d'Ipanema (Jobim) | Fa majeur | Rythme bossa nova, modulation chromatique, retenue vocale |
| New-Age | River Flows in You (Yiruma) | La majeur | Reconnaissance I-V-vi-IV, arpèges fluides, rubato |
| Pop | Imagine (Lennon) | Do majeur | Accompagnement arpégé, retenue, sincérité vocale |
| Ragtime | The Entertainer (Joplin) | Do majeur | Basse oom-pah, syncope, forme multi-strain, discipline de tempo |
| R&B | Superstition (Stevie Wonder) | Mib mineur | Funk en doubles croches, clavier percussif, notes fantômes |
| Rock | Your Song (Elton John) | Mib majeur | Conduite des voix en ballade piano, renversements, chant conversationnel |
| Soul | Lean on Me (Bill Withers) | Do majeur | Mélodie diatonique, accompagnement gospel, appel-réponse |

Les morceaux progressent de **raw** (MIDI seul) → **annotated** → **ready** (entièrement jouable avec langage musical). L'IA promeut les morceaux en les étudiant et en écrivant des annotations avec `annotate_song`.

## Moteurs Sonores

Six moteurs plus un combinateur par couches qui en exécute deux simultanément :

| Moteur | Type | Son |
|--------|------|-----|
| **Piano Oscillateur** | Synthèse additive | Piano multi-harmonique avec bruit de marteau, inharmonicité, polyphonie 48 voix, imagerie stéréo. Zéro dépendance. |
| **Piano Échantillonné** | Lecture WAV | Salamander Grand Piano — 480 échantillons, 16 couches de vélocité, 88 touches. L'authentique. |
| **Vocal (Échantillons)** | Échantillons à pitch variable | Tons vocaliques soutenus avec portamento et mode legato. |
| **Conduit Vocal** | Modèle physique | Pink Trombone — onde glottale LF à travers un guide d'onde numérique à 44 cellules. Quatre presets : soprano, alto, ténor, basse. |
| **Synthèse Vocale** | Synthèse additive | 15 presets vocaux Kokoro. Mise en forme des formants, souffle, vibrato. Déterministe (RNG avec graine). |
| **Guitare** | Synthèse additive | Corde pincée modélisée physiquement — 4 presets (acier dreadnought, classique nylon, jazz archtop, douze-cordes), 8 accordages, 17 paramètres réglables. |
| **Par Couches** | Combinateur | Enveloppe deux moteurs et distribue chaque événement MIDI aux deux — piano+synth, vocal+synth, etc. |

### Voix de Clavier

Six voix de piano réglables, chacune ajustable par paramètre (brillance, déclin, dureté du marteau, désaccord, largeur stéréo et plus) :

| Voix | Caractère |
|------|-----------|
| Concert Grand | Riche, plein, classique |
| Upright | Chaud, intime, folk |
| Electric Piano | Soyeux, jazzy, style Fender Rhodes |
| Honky-Tonk | Désaccordé, ragtime, saloon |
| Music Box | Cristallin, éthéré |
| Bright Grand | Incisif, contemporain, pop |

### Voix de Guitare

Quatre presets de guitare avec synthèse de cordes modélisée physiquement, chacun avec 17 paramètres réglables (brillance, résonance du corps, position de pincement, amortissement des cordes et plus) :

| Voix | Caractère |
|------|----------|
| Steel Dreadnought | Brillant, équilibré, acoustique classique |
| Nylon Classical | Chaud, doux, arrondi |
| Jazz Archtop | Doux, boisé, propre |
| Twelve-String | Chatoyant, doublé, effet chorus |

## Le Journal de Pratique

Après chaque session, le serveur enregistre ce qui s'est passé — quel morceau, quelle vitesse, combien de mesures, combien de temps. L'IA ajoute ses propres réflexions : ce qu'elle a remarqué, quels motifs elle a reconnus, quoi essayer ensuite.

```markdown
---
### 14:32 — Les Feuilles mortes
**jazz** | intermediate | Sol mineur | 69 BPM × 0.7 | 32/32 mesures | 45s

Le ii-V-I aux mesures 5-8 (Cm7-F7-SibMaj7) a la même gravité
que le V-i dans The Thrill Is Gone, mais en majeur. Le blues et
le jazz partagent plus que les étiquettes de genre ne le suggèrent.

Prochaine fois : essayer à pleine vitesse. Comparer la modulation
du pont d'Ipanema avec celle-ci.
---
```

Un fichier markdown par jour, stocké dans `~/.ai-jam-sessions/journal/`. Lisible par les humains, en ajout seul. Session suivante, l'IA lit son journal et reprend là où elle s'est arrêtée.

## Installation

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

Nécessite **Node.js 18+**. Pas de pilotes MIDI, pas de ports virtuels, pas de logiciel externe.

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

## Outils MCP

31 outils répartis en cinq catégories :

### Apprendre

| Outil | Fonction |
|-------|----------|
| `list_songs` | Parcourir par genre, difficulté ou mot-clé |
| `song_info` | Analyse musicale complète — structure, moments clés, objectifs pédagogiques, conseils de style |
| `registry_stats` | Statistiques de toute la bibliothèque |
| `library_progress` | État des annotations pour tous les genres |
| `list_measures` | Notes, dynamiques et notes pédagogiques de chaque mesure |
| `teaching_note` | Zoom sur une seule mesure — doigté, dynamiques, contexte |
| `suggest_song` | Recommandation basée sur le genre, la difficulté et l'historique |
| `practice_setup` | Vitesse, mode, configuration vocale et commande CLI recommandés |

### Jouer

| Outil | Fonction |
|-------|----------|
| `play_song` | Jouer via les haut-parleurs — morceaux de la bibliothèque ou fichiers .mid |
| `stop_playback` | Arrêter |
| `pause_playback` | Pause ou reprise |
| `set_speed` | Changer la vitesse en cours de lecture (0.1×–4.0×) |
| `playback_status` | Snapshot en temps réel : mesure actuelle, tempo, vitesse, voix clavier, état |
| `view_piano_roll` | Rendu SVG (couleur par main ou arc-en-ciel chromatique par classe de hauteur) |

### Chanter

| Outil | Fonction |
|-------|----------|
| `sing_along` | Texte chantable — noms de notes, solfège, contour ou syllabes. Avec ou sans piano |
| `ai_jam_sessions` | Générer un brief de jam — progression d'accords, esquisse mélodique et conseils de style |

### Guitare

| Outil | Fonction |
|-------|----------|
| `view_guitar_tab` | Tablature de guitare interactive en HTML — édition par clic, curseur de lecture, raccourcis clavier |
| `list_guitar_voices` | Presets de voix de guitare disponibles |
| `list_guitar_tunings` | Systèmes d'accordage de guitare disponibles (standard, drop-D, open G, DADGAD, etc.) |
| `tune_guitar` | Ajuster n'importe quel paramètre de n'importe quelle voix de guitare. Persiste entre sessions |
| `get_guitar_config` | Configuration actuelle d'une voix de guitare vs valeurs d'usine |
| `reset_guitar` | Réinitialiser une voix de guitare aux valeurs d'usine |

### Construire

| Outil | Fonction |
|-------|----------|
| `add_song` | Ajouter un nouveau morceau en JSON |
| `import_midi` | Importer un fichier .mid avec métadonnées |
| `annotate_song` | Écrire le langage musical d'un morceau brut et le promouvoir en ready |
| `save_practice_note` | Entrée de journal avec capture automatique des données de session |
| `read_practice_journal` | Charger les entrées récentes |
| `list_keyboards` | Voix de clavier disponibles |
| `tune_keyboard` | Ajuster n'importe quel paramètre de n'importe quelle voix. Persiste entre sessions |
| `get_keyboard_config` | Configuration actuelle vs valeurs d'usine |
| `reset_keyboard` | Réinitialiser une voix de clavier aux valeurs d'usine |

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

## Statut

v0.3.0. Six moteurs sonores, 31 outils MCP, 120 morceaux dans 12 genres avec des exemplaires profondément annotés. Éditeur de tablature de guitare interactif. Cockpit navigateur avec 20 presets vocaux, 10 voix d'instruments, 7 systèmes d'accordage et une API de partition pour LLM. Visualisation piano roll en deux modes de couleur. Journal de pratique persistant. Le MIDI est complet — la bibliothèque grandit au fil de l'apprentissage de l'IA.

## Licence

MIT
