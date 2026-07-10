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
  <a href="https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions"><img src="https://img.shields.io/npm/v/@mcptoolshop/ai-jam-sessions" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/songs-120_across_12_genres-blue" alt="Songs"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/annotated-120%2F120-green" alt="Ready"></a>
  <a href="datasets/jam-actions-v0-public/README.md"><img src="https://img.shields.io/badge/dataset-jam--actions--v0%20(115_records)-8b5cf6" alt="Training dataset"></a>
  <a href="https://doi.org/10.5281/zenodo.20279919"><img src="https://zenodo.org/badge/DOI/10.5281/zenodo.20279919.svg" alt="DOI"></a>
</p>

---

## Qu'est-ce que c'est ?

Un piano et une guitare sur lesquels l'IA apprend à jouer. Pas un synthétiseur, pas une bibliothèque MIDI, mais un instrument pédagogique.

Un LLM peut lire et écrire du texte, mais il ne peut pas vivre la musique comme nous le faisons. Il n’a ni oreilles, ni doigts, ni mémoire musculaire. AI Jam Sessions comble cette lacune en donnant au modèle des sens qu’il peut réellement utiliser :

- **Lecture** : partitions MIDI réelles avec des annotations musicales approfondies. Pas d’approximations manuscrites, mais des données analysées, décortiquées et expliquées.
- **Audition** : six moteurs audio (piano oscillateur, piano échantillonné, échantillons vocaux, tractus vocal physique, synthé vocal additif, guitare modélisée physiquement) qui diffusent le son via vos haut-parleurs, de sorte que les personnes présentes dans la pièce deviennent les oreilles de l’IA.
- **Vision** : une partition de piano qui représente ce qui a été joué sous forme de SVG, que le modèle peut lire et vérifier. Un éditeur interactif de tablatures de guitare. Une interface navigateur avec un clavier visuel, un éditeur de notes à deux modes et un laboratoire d’accordage.
- **Mémorisation** : un journal de pratique qui est conservé entre les sessions, afin que l’apprentissage s’accumule au fil du temps.
- **Chant** : synthèse du tractus vocal avec 20 préréglages vocaux, allant du soprano d’opéra à la chorale électronique. Mode « chantez en même temps » avec solfège, contour et narration syllabique.

Chacune des 120 chansons est désormais entièrement annotée : contexte historique, analyse structurelle mesure par mesure, moments clés, objectifs pédagogiques et conseils de performance, dans les 12 genres. Une version antérieure de ce fichier README indiquait que les chansons brutes « attendaient que l’IA assimile les motifs, joue la musique et rédige ses propres annotations ». C’est exactement ce qui s’est passé : les annotations ont été rédigées par l’IA sur la base d’une analyse déterministe de chaque chanson (accords, structure répétitive, limites des sections, tonalités vérifiées), sous réserve d’une grille d’évaluation de la qualité et soumises à une vérification factuelle contradictoire, mesure par mesure, fenêtre d’accord par fenêtre d’accord et nombre de structures, le tout vérifié par rapport au MIDI réel avant toute publication.

À partir de ce même travail, nous publions également **[jam-actions-v0](#training-dataset)** : un ensemble de données public composé de 115 séquences d’utilisation d’outils MCP en plusieurs étapes sur du piano classique réel. Il apprend aux LLM à effectuer une *utilisation d’outils ancrée dans la musique symbolique*, et pas seulement à générer du texte, et est livré avec une grille de publication à 7 axes qui distingue le fait de « transmettre des preuves » du fait de « passer parce que la tâche est triviale ». Voir [Ensemble de données d’entraînement](#training-dataset) ci-dessous pour connaître tous les détails.

## La partition de piano

La partition de piano est le moyen par lequel l’IA perçoit la musique. Elle représente chaque chanson sous forme de SVG : bleu pour la main droite, corail pour la main gauche, avec des grilles rythmiques, des nuances et des limites de mesures :

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Deux modes de couleur : **main** (bleu/corail) ou **classe chromatique** (arc-en-ciel chromatique : chaque Do est rouge, chaque Fa# est cyan). Le format SVG signifie que le modèle peut à la fois voir l’image et lire le balisage pour vérifier la hauteur, le rythme et l’indépendance des mains.

## La console de commande

Un studio de composition basé sur un navigateur qui se trouve dans ce dépôt à [`apps/cockpit`](apps/cockpit) et fonctionne en direct à l’adresse **[mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)**. Pas de plugins, pas de DAW, pas d’installation ; tout reste dans votre navigateur (votre travail est automatiquement enregistré localement). Préférez-vous le modifier ?

```bash
cd apps/cockpit && npm install && npm run dev   # Vite dev server, opens in your browser
```

- **Transport précis au rythme** : les notes sont synchronisées avec le temps musical, de sorte que la commande BPM contrôle réellement le tempo de lecture ; une règle chronologique cliquable pour naviguer dans le temps, avec possibilité de faire glisser pour définir des **régions de boucle** ; défilement automatique qui suit la tête de lecture.
- **Enregistrement activé** : jouez sur les touches AZERTY, sur le clavier à l’écran ou sur un appareil Web MIDI et cela s’enregistre dans la partition : 1 mesure d’introduction, enregistrement en boucle sur plusieurs cycles (ou mode de remplacement), préservation du tempo de performance brut sous une vue quantifiée, chaque passage est une unité unique qui peut être annulée.
- **Annulation/rétablissement complet** : toutes les modifications, y compris Effacer et Importer, sont réversibles (Ctrl+Z), avec des gestes de glissement qui se combinent comme le font les éditeurs classiques.
- **Sélection multiple + presse-papiers** : sélection par rectangle sous un outil de bascule Sélection/Dessin, clics modificateurs standard de la plateforme, copier/couper/coller à la tête de lecture, Dupliquer.
- **Tactile et accessible** : événements de pointeur avec capture sur chaque surface, tapoter pour repositionner comme alternative au glissement, édition des notes au clavier, superposition de partitions sûre pour les daltoniens.
- **Partition de piano à deux modes** : basculez entre le mode Instrument (couleurs chromatiques) et le mode Vocal (notes colorées en fonction de la forme vocalique : /a/ /e/ /i/ /o/ /u/).
- **Clavier visuel** : deux octaves à partir de Do4, mappé sur votre clavier AZERTY. Cliquez ou tapez.
- **20 préréglages vocaux** : 15 voix mappées Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, plus une chorale et une voix synthétique), 4 voix mappées au tractus vocal et une section de chorale synthétique.
- **10 préréglages d’instruments** : les 6 voix de piano côté serveur, plus un pad synthé, un orgue, une cloche et des cordes.
- **Inspecteur de notes** : cliquez sur n’importe quelle note pour modifier la vélocité, la voyelle et le souffle.
- **7 systèmes d’accordage** : tempérament égal, intonation juste (majeur/mineur), pythagoricien, quart de comma moyen, Werckmeister III ou décalages personnalisés en cents. Référence A4 réglable (392 à 494 Hz).
- **Audit d’accordage** : tableau des fréquences, testeur d’intervalles avec analyse de la fréquence de battement et exportation/importation de l’accordage.
- **Importation/exportation de partitions** : sérialisez toute la partition au format JSON et chargez-la à nouveau.
- **API orientée LLM** : `window.__cockpit` expose `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` et `getScore()` afin qu’un LLM puisse composer, arranger et lire en continu de manière programmatique.

## La boucle d’apprentissage

<p align="center">
  <img src="docs/learning-loop.svg" alt="The learning loop: Read (MIDI + annotations) → Play (six sound engines) → See (piano roll · guitar tab) → Reflect (practice journal), with the journal persisting so the next session picks up where the last left off" width="100%" />
</p>

## La bibliothèque de chansons

120 chansons dans 12 genres différents, créées à partir de fichiers MIDI réels. Chaque genre possède un exemple annoté en profondeur : contexte historique, analyse harmonique mesure par mesure, moments clés, objectifs pédagogiques et conseils de performance (y compris des indications vocales). Ces exemples servent de modèles : l’IA en étudie un, puis annote les autres.

| Genre | Exemple | Clé | Ce que cela enseigne |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | Si mineur | Forme de blues mineure, question-réponse, jeu en contretemps |
| Classique | Für Elise (Beethoven) | La mineur | Forme de rondo, différenciation du toucher, maîtrise du pédalier |
| Film | Comptine d’un autre été (Tiersen) | Mi mineur | Textures arpégées, architecture dynamique sans changement harmonique |
| Musique folklorique | Greensleeves | Mi mineur | Rythme de valse en 3/4, mélange modal, style vocal de la Renaissance |
| Jazz | Autumn Leaves (Kosma) | Sol mineur | Progressions ii-V-I, notes directrices, croches en swing, accords sans fondamentale |
| Musique latine | The Girl from Ipanema (Jobim) | Fa majeur | Rythme de bossa nova, modulation chromatique, retenue vocale |
| New-Age | River Flows in You (Yiruma) | La majeur | Reconnaissance I-V-vi-IV, arpèges fluides, rubato |
| Pop | Imagine (Lennon) | Do majeur | Accompagnement arpégé, retenue, sincérité vocale |
| Ragtime | The Entertainer (Joplin) | Do majeur | Basse « oom-pah », syncopes, forme à plusieurs sections, maîtrise du tempo |
| R&B | Superstition (Stevie Wonder) | Mi bémol mineur | Funk en seizièmes de note, clavier percussif, notes fantômes |
| Rock | Your Song (Elton John) | Mi bémol majeur | Mélodie de ballade au piano, renversements, chant conversationnel |
| Soul | Lean on Me (Bill Withers) | Do majeur | Mélodie diatonique, accompagnement gospel, question-réponse |

Les morceaux progressent de **brut** (MIDI uniquement) à **annoté** à **prêt** (totalement jouable avec un langage musical). L’IA fait la promotion des morceaux en les étudiant et en rédigeant des annotations avec `annotate_song`.

## Moteurs sonores

Six moteurs, plus un combinateur à couches qui exécute simultanément deux d’entre eux :

| Moteur | Type | Son produit |
|--------|------|---------------------|
| **Oscillator Piano** | Synthèse additive | Piano multi-harmonique avec bruit de marteau, inharmonicité, polyphonie à 48 voix, imagerie stéréo. Aucune dépendance. |
| **Sample Piano** | Lecture WAV | Salamander Grand Piano — 480 échantillons, 16 niveaux de vélocité, 88 touches. Le vrai son. *API programmatique uniquement : les échantillons ne sont pas inclus (vous fournissez le téléchargement [Salamander](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html)) ; pas encore intégré aux listes de moteurs CLI/MCP.* |
| **Vocal (Sample)** | Échantillons à hauteur modifiée | Tons voyelles soutenus avec portamento et mode legato. |
| **Vocal Tract** | Modèle physique | Pink Trombone — onde glottale LF dans un guide d’ondes numérique à 44 cellules. Quatre préréglages : soprano, alto, ténor, basse. |
| **Vocal Synth** | Synthèse additive | 15 préréglages de voix Kokoro avec mise en forme du formateur, souffle, vibrato. Déterministe (générateur aléatoire à graines). |
| **Guitar** | Synthèse additive | Corde pincée modélisée physiquement — 4 préréglages (dreadnought en acier, classique en nylon, jazz arche, douze cordes), 8 accordages, 17 paramètres réglables. |
| **Layered** | Combinateur | Enveloppe deux moteurs et transmet chaque événement MIDI aux deux — piano+synthé, voix+synthé, etc. |

### Voix de clavier

Six voix de piano réglables, chacune ajustable par paramètre (brillance, durée, dureté du marteau, désaccordage, largeur stéréo, et plus) :

| Voix | Caractère |
|-------|-----------|
| Concert Grand | Riche, ample, classique |
| Upright | Chaud, intime, folk |
| Electric Piano | Soie, jazz, son Fender Rhodes |
| Honky-Tonk | Désaccordé, ragtime, saloon |
| Music Box | Cristallin, éthéré |
| Bright Grand | Perçant, contemporain, pop |

### Voix de guitare

Quatre préréglages de voix de guitare avec synthèse de cordes modélisée physiquement, chacun avec 17 paramètres réglables (brillance, résonance du corps, position de pincement, amortissement des cordes, et plus) :

| Voix | Caractère |
|-------|-----------|
| Steel Dreadnought | Brillant, équilibré, acoustique classique |
| Nylon Classical | Chaud, doux, arrondi |
| Jazz Archtop | Doux, boisé, clair |
| Twelve-String | Scintillant, doublé, effet de chœur |

## Le journal d’entraînement

Après chaque session, le serveur enregistre ce qui s’est passé — quel morceau, quelle vitesse, combien de mesures, combien de temps. L’IA ajoute ses propres réflexions : ce qu’elle a remarqué, quels schémas elle a reconnus, quoi essayer ensuite.

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

Un fichier Markdown par jour, stocké dans `~/.ai-jam-sessions/journal/`. Lisible par l’homme, ajout uniquement. Lors de la prochaine session, l’IA lit son journal et reprend là où elle s’était arrêtée.

## Ensemble d’entraînement

**jam-actions-v0** — un ensemble de données public de traces d’utilisation multi-tour des outils MCP, basé sur de véritables fichiers MIDI de piano classique. Construit à partir de la même bibliothèque que ce serveur utilise pour l’enseignement, l’ensemble de données apprend aux LLM à effectuer une **utilisation d’outils basée sur des données dans le domaine de la musique symbolique** — et pas seulement la génération de texte.

Chaque enregistrement associe une séquence de quatre mesures à un objectif pédagogique annoté et à une « trace cible », c’est-à-dire une session étape par étape dans laquelle un assistant utilise les outils MCP mentionnés ci-dessus (`get_events_in_measure`, `get_events_in_hand`, `count_distinct_pitch_classes` et le reste des 9 outils de l’interface MIDI) pour lire, analyser et discuter de la séquence.

| | |
|---|---|
| **DOI** | [**`10.5281/zenodo.20279919`**](https://doi.org/10.5281/zenodo.20279919) — Zenodo, publié le 2026-05-19 |
| Enregistrements | 115 (sous-ensemble public) |
| Base de référence canonique | E3 post-correction avec 16 enregistrements |
| Compositions | 8 œuvres classiques pour piano, composées par 6 compositeurs (Bach, Beethoven, Chopin, Debussy, Mozart, Schumann) |
| Source MIDI | piano-midi.de — arrangements de Bernd Krueger |
| Licence | CC-BY-SA-3.0-DE (arrangements) pour les compositions du domaine public |
| Version | 0.4.3 (2026-05-19) |
| Schéma | `release-gate-assessment/2.0.0` |

**Un récit de qualité : le seuil de validation à 7 axes.** L’ensemble de données est fourni avec un seuil de validation qui distingue les évaluations fondées sur des preuves des évaluations atteignant le niveau maximal. Les axes 1 à 6 sont bloquants (seuil absolu, marge composée, taux d’utilisation des outils, correction après utilisation de l’outil, nombre d’interprétations erronées, seuil du stratum) ; l’axe 7 est une comparaison entre les données enrichies et non enrichies. Les axes 2 et 6 autorisent un compartiment `ceiling_saturated_pass`, de sorte que les enregistrements qui obtiennent un score de 1,000 dans les conditions texte uniquement / inspection par l’outil / MIDI aléatoire ne faussent pas les stratus plus difficiles. La base de référence Slice 22 **VALIDE** le seuil révisé. La base de référence Slice 19 échoue toujours à ce seuil ; elle est conservée en tant qu’indicateur de régression afin que le seuil soit rigoureux.

**Reproductibilité.** Un contributeur utilisant n’importe quelle plateforme (Windows natif, macOS, Linux, WSL) peut vérifier le package et reproduire le résultat PASS canonique en moins d’une minute :

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions && pnpm install
pnpm exec tsx scripts/verify-public-package-checksums.ts        # 274 entries, ~2s
pnpm exec tsx scripts/check-release-gate.ts \
  datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json
# → "Aggregate: PASS" (exit 0)
```

Le fichier `.gitattributes` fixe les fins de ligne LF pour `*.sha256` et l’arborescence du jeu de données public afin que le vérificateur de sommes de contrôle fonctionne sur toutes les plateformes. L’interface en ligne de commande du seuil de validation est stricte en termes de position (elle rejette les arguments positionnels inconnus ou multiples), de sorte que les contributeurs qui l’utilisent pour la première fois ne peuvent pas l’invoquer incorrectement sans s’en rendre compte.

**Où le trouver.** L’enregistrement publié sur Zenodo se trouve à l’adresse https://zenodo.org/records/20279919 (DOI : [`10.5281/zenodo.20279919`](https://doi.org/10.5281/zenodo.20279919)), et l’ensemble de données est mis en miroir sur Hugging Face à l’adresse [`mcp-tool-shop/jam-actions-v0`](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0) pour les utilisateurs de `load_dataset()`. La fiche complète de l’ensemble de données se trouve à l’adresse [`datasets/jam-actions-v0-public/README.md`](datasets/jam-actions-v0-public/README.md). Les métadonnées du dépôt Zenodo se trouvent à l’adresse [`zenodo-metadata.json`](datasets/jam-actions-v0-public/zenodo-metadata.json), les métadonnées de citation à l’adresse [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff), le reçu de publication à l’adresse [`publication-receipt.json`](datasets/jam-actions-v0-public/publication-receipt.json) et les notes de version à l’adresse [`RELEASE_NOTES.md`](datasets/jam-actions-v0-public/RELEASE_NOTES.md). La série de 25 étapes de construction — depuis la première ébauche du corpus jusqu’à la correction, la remédiation de Schumann, la révision du seuil RC, l’audit d’autonomie de l’opérateur et l’exécution de la publication — se trouve dans [`docs/`](docs/).

**Citez-le.** `mcp-tool-shop-org & Krueger, B. (2026). AI Jam Sessions — Tool-Use Traces v0 (Public Subset). Zenodo. https://doi.org/10.5281/zenodo.20279919`

**Mise en miroir sur HuggingFace.** Disponible dans une version 1.4.x ultérieure — voir [`datasets/jam-actions-v0-public/publication-receipt.json`](datasets/jam-actions-v0-public/publication-receipt.json) pour le bloc d’état différé. Le DOI Zenodo est l’identifiant de citation canonique ; la mise en miroir HF est uniquement destinée à la découverte dans l’écosystème du ML.

> Les arrangements MIDI sont de Bernd Krueger (piano-midi.de), sous licence CC-BY-SA-3.0-DE. Les annotations, les traces et les artefacts d’évaluation sont de l’équipe AI Jam Sessions, publiés sous la même licence afin que la chaîne de partage soit préservée de bout en bout. **Limite de licence :** la licence MIT du dépôt couvre le code ; tout ce qui se trouve dans `datasets/` est soumis à la licence CC-BY-SA-3.0-DE. Le corpus de travail situé dans `datasets/jam-actions-v0/` contient également deux œuvres (Satie Gymnopédie n° 1, Debussy Arabesque n° 1) qui sont *exclues* du sous-ensemble publié parce que la provenance de leur arrangement n’a pas pu être vérifiée — voir [`datasets/jam-actions-v0/PROVENANCE-NOTE.md`](datasets/jam-actions-v0/PROVENANCE-NOTE.md).

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

## Outils MCP

46 outils et 3 modèles d’invite répartis en sept catégories :

### Apprendre

| Outil | Ce qu’il fait |
|------|--------------|
| `list_songs` | Parcourir par genre, difficulté ou mot-clé |
| `song_info` | Analyse musicale complète : structure, moments clés, objectifs pédagogiques, conseils de style |
| `registry_stats` | Statistiques à l’échelle de la bibliothèque : nombre total de chansons, genres, difficultés |
| `list_measures` | Notes, dynamiques et notes pédagogiques pour chaque mesure |
| `teaching_note` | Analyse approfondie d’une seule mesure : doigté, dynamique, contexte |
| `suggest_song` | Recommandation basée sur le genre, la difficulté et ce que vous avez joué |
| `practice_setup` | Vitesse, mode, paramètres de voix et commande CLI recommandés pour une chanson |
| `compare_songs` | Reconnaissance des motifs intergenres : relations clés, similarité des hauteurs/intervalles, formes partagées, liens pédagogiques |
| `annotation_progress` | Suivi de la qualité de l’annotation dans toute la bibliothèque : scores, notes et suggestions d’amélioration |
| `server_info` | Version du serveur, statistiques de la bibliothèque, liste des moteurs, session active |

### Jouer

| Outil | Ce qu’il fait |
|------|--------------|
| `play_song` | Lecture via les haut-parleurs : morceaux de la bibliothèque ou fichiers .mid bruts. Quatre moteurs (piano, voix, registre, guitare), vitesse, mode et plage de mesures arbitraires, plus un métronome avec compte à rebours et un indicateur « enregistrement » qui enregistre la session pour l’évaluation. Le synthétiseur et les moteurs superposés sont accessibles uniquement via l’interface en ligne de commande (CLI). |
| `stop_playback` | Arrêter |
| `pause_playback` | Mettre en pause ou reprendre |
| `set_speed` | Modifier la vitesse pendant la lecture (de 0,1× à 4,0×) |
| `playback_status` | Instantané en temps réel : mesure actuelle, tempo, vitesse, voix du clavier, état |
| `view_piano_roll` | Rendre sous forme de SVG (couleur des notes ou arc-en-ciel chromatique des classes de hauteur) |
| `score_performance` | Évaluer une pièce MIDI jouée en accompagnement : précision de la hauteur, rythme, exhaustivité, avec évaluation progressive |
| `mute_hand` | Couper ou rétablir le son de la main gauche/droite pendant l’entraînement : isoler une seule main à la fois |
| `detect_chord` | Identifier l’accord à partir d’un ensemble de notes MIDI actuellement jouées (par exemple, `[60,64,67]` → Do) |
| `preview_teaching_cues` | Afficher toutes les notes pédagogiques et les moments clés avant de jouer |

### S’entraîner

| Outil | Ce qu’il fait |
|------|--------------|
| `practice_loop` | L’exercice qu’un véritable professeur assignerait : répéter les mesures 5 à 8 plus lentement, puis augmenter le tempo (+5 %) uniquement après une exécution *parfaite* ; chaque exécution est enregistrée, évaluée et résumée. |
| `practice_status` | État de l’exercice : exécution actuelle, vitesse et diagnostic par mesure de la dernière tentative |
| `score_last_take` | Évaluer la dernière tentative enregistrée : précision de la hauteur, rythme, exhaustivité, évaluation par note |
| `view_scored_piano_roll` | La partition annotée que tout professeur utilise : le piano-rouleau superposé aux évaluations par note dans une palette adaptée aux personnes daltoniennes (plein = correct, pointillé = rythme, ✕ = manquant) |

### Chanter

| Outil | Ce qu’il fait |
|------|--------------|
| `sing_along` | Texte chantable : noms des notes, solfège, contour ou syllabes. Avec ou sans accompagnement au piano. |
| `ai_jam_sessions` | Générer un bref descriptif d’une improvisation : progression d’accords, esquisse de la mélodie et indications de style pour une réinterprétation |

### Guitare

| Outil | Ce qu’il fait |
|------|--------------|
| `view_guitar_tab` | Rendre interactivement le tablature de guitare au format HTML : clic pour modifier, curseur de lecture, raccourcis clavier |
| `list_guitar_voices` | Préréglages de voix de guitare disponibles |
| `list_guitar_tunings` | Systèmes d’accordage de guitare disponibles (standard, accordage en drop D, accordage ouvert en sol, DADGAD, etc.) |
| `tune_guitar` | Ajuster n’importe quel paramètre de n’importe quelle voix de guitare. Les paramètres sont conservés entre les sessions. |
| `get_guitar_config` | Configuration actuelle de la voix de guitare par rapport aux valeurs par défaut d’usine |
| `reset_guitar` | Réinitialiser une voix de guitare aux valeurs d’usine |

### Créer

| Outil | Ce qu’il fait |
|------|--------------|
| `add_song` | Ajouter une nouvelle chanson au format JSON |
| `import_midi` | Importer un fichier .mid avec des métadonnées |
| `annotate_song` | Écrire un langage musical pour une chanson brute et la préparer |
| `save_practice_note` | Entrée de journal avec les données de session enregistrées automatiquement |
| `read_practice_journal` | Charger les entrées récentes pour plus de contexte |
| `list_keyboards` | Voix de clavier disponibles |
| `tune_keyboard` | Ajuster n’importe quel paramètre de n’importe quelle voix de clavier. Les paramètres sont conservés entre les sessions. |
| `get_keyboard_config` | Configuration actuelle par rapport aux valeurs par défaut d’usine |
| `reset_keyboard` | Réinitialiser une voix de clavier aux valeurs d’usine |
| `score_annotation` | Qualité de l’annotation de la partition sur 5 dimensions : exhaustivité, profondeur, spécificité, valeur pédagogique, vocabulaire |
| `validate_song_entry` | Valider un fichier JSON de chanson par rapport au schéma avant de l’ajouter |
| `transpose_song` | Transposer une chanson d’un ou plusieurs demi-tons vers le haut ou vers le bas : nouvelle tonalité, nouvelles notes |
| `list_sections` | Afficher les sections structurelles d’une chanson (introduction, couplet, refrain, etc.) |
| `add_section` | Ajouter un marqueur de section à une chanson pour la navigation structurale |

### Instructions MCP

Trois modèles d’instructions pour des flux de travail pédagogiques structurés :

| Instruction | Ce qu’il fait |
|--------|--------------|
| `annotate_song` | Flux de travail d’annotation guidé : étudier un exemple, écrire un langage musical pour une chanson brute |
| `practice_plan` | Créer un plan d’entraînement structuré basé sur le genre, la difficulté et les objectifs |
| `performance_review` | Examiner une session terminée : ce qui a bien fonctionné, sur quoi se concentrer ensuite |

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

## État

v1.5.0 : la version dans laquelle il a appris à enseigner (voir [CHANGELOG](CHANGELOG.md)). Six moteurs sonores, 46 outils MCP, 3 modèles d’instructions et une **bibliothèque entièrement annotée : 120/120 chansons dans 12 genres**, chaque annotation étant basée sur l’analyse de chaque chanson et validée en termes de qualité. La boucle d’apprentissage est fermée de bout en bout : métronome avec compte à rebours → enregistrement en direct → évaluation par note → piano-rouleau annoté → boucles d’entraînement qui augmentent le tempo uniquement après des exécutions parfaites. Le cockpit du navigateur est devenu un véritable outil de composition : transport précis au rythme, capture avec activation de l’enregistrement, annulation/rétablissement complets, sélection et presse-papiers multiples, prise en charge tactile, et il est [disponible sur le web](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/). Transposition de chanson, marqueurs de section, coupure/activation du son de la main gauche/droite, tablature interactive pour guitare, 7 systèmes d’accordage, journal d’entraînement, persistance des sessions.

Publie également **[jam-actions-v0](#training-dataset)** : un ensemble de données d’entraînement de 115 enregistrements traçant l’utilisation de plusieurs outils MCP sur du piano classique, avec une grille de validation à 7 axes, reproductibilité en situation de démarrage à froid et métadonnées complètes Zenodo + CITATION.cff (CC-BY-SA-3.0-DE) ; il est également mis en miroir sur [Hugging Face](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0). 2 506 tests réussis pour le serveur MCP + cockpit + paquets de données + harnais d’évaluation + validateur de grille de validation. Le MIDI est tout là, chaque chanson peut servir à l’apprentissage et ce corpus d’apprentissage est fourni avec.

## Sécurité et confidentialité

**Données concernées :** bibliothèque de chansons (JSON + MIDI), répertoire des chansons de l’utilisateur (`~/.ai-jam-sessions/songs/`), configurations d’accordage de guitare, entrées du journal d’entraînement, périphérique de sortie audio local.

**Données non concernées (chemins par défaut) :** le serveur MCP et la CLI ne font aucun appel réseau, ne lisent aucune information d’identification et n’accèdent à aucun fichier système en dehors du répertoire des chansons de l’utilisateur. Aucune télémétrie n’est collectée ni envoyée. L’**outil d’ensemble de données/d’évaluation optionnel** fourni dans le même paquet (`scripts/run-llm-eval.ts`, vérificateur de provenance) est la seule exception : lorsque vous l’invoquez explicitement, il peut appeler des API LLM (lit `ANTHROPIC_API_KEY` depuis votre environnement, ne le stocke jamais) et récupérer des URL de provenance. Il ne s’exécute jamais dans le cadre du serveur, de la CLI ou de l’installation.

**Autorisations :** Le serveur MCP utilise uniquement le protocole de transport stdio (pas de HTTP). L’interface en ligne de commande accède au système de fichiers local et aux périphériques audio. Veuillez consulter le fichier [SECURITY.md](SECURITY.md) pour connaître l’intégralité de la politique.

## Licence

Licence MIT
