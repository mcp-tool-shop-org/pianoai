<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <strong>Français</strong> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.png" alt="AI Jam Session logo" width="180" />
</p>

<h1 align="center">AI Jam Session</h1>

<p align="center">
  <em>L'apprentissage automatique à l'ancienne</em>
</p>

<p align="center">
  Un serveur MCP qui apprend à l'IA à jouer du piano.<br/>
  120 morceaux. 12 genres. Du vrai MIDI. Un journal de pratique qui se souvient de tout.
</p>

[![Songs](https://img.shields.io/badge/songs-120_across_12_genres-blue)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)
[![Ready](https://img.shields.io/badge/ready_to_play-24-green)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)

---

## Qu'est-ce que c'est ?

Un piano que l'IA apprend à jouer. Pas un synthétiseur, pas une bibliothèque MIDI -- un instrument pédagogique.

Un LLM peut lire et écrire du texte. Mais il ne peut pas vivre la musique comme nous -- pas d'oreilles, pas d'yeux, pas de mémoire musculaire. AI Jam Session comble ce fossé en donnant au modèle des sens qu'il peut réellement utiliser :

- **Lecture** -- de vraies partitions MIDI avec annotations pédagogiques, pas des approximations manuscrites
- **Écoute** -- un moteur de piano qui joue par les haut-parleurs, pour que les humains dans la pièce deviennent les oreilles de l'IA
- **Vision** -- un piano roll qui rend ce qui a été joué en SVG, que le modèle peut relire et vérifier
- **Mémoire** -- un journal de pratique qui persiste entre les sessions, pour que l'apprentissage s'accumule

Chaque genre a un modèle annoté -- une pièce de référence que l'IA étudie avant d'aborder le reste. Les 96 autres morceaux sont du MIDI brut, attendant que l'IA apprenne les motifs, joue la musique et rédige ses propres annotations. Chaque session reprend là où la précédente s'est arrêtée.

## Le Piano Roll

Voici comment l'IA voit la musique. Le piano roll rend n'importe quel morceau en SVG -- bleu pour la main droite, corail pour la gauche, avec grilles de temps, nuances et limites de mesures :

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll de Für Elise mesures 1-8, montrant la main droite (bleu) et la main gauche (corail)" width="100%" />
</p>

<p align="center"><em>Für Elise, mesures 1-8 -- le trille E5-D#5 en bleu, accompagnement de basse en corail</em></p>

La plupart des piano rolls sont des animations de lecture conçues pour les producteurs humains. Celui-ci est conçu pour l'IA. Le format SVG permet au modèle de *voir* l'image et de *lire* le code source pour vérifier la justesse des notes, l'indépendance des mains et le rythme. Ce n'est pas une visualisation -- c'est une boucle de rétroaction.

## La Boucle d'Apprentissage

```
 Lire                Jouer              Voir                Réfléchir
┌──────────┐     ┌───────────┐     ┌────────────┐     ┌──────────────┐
│ Étudier   │     │ Jouer le  │     │ Voir le    │     │ Écrire ce    │
│ l'analyse │ ──▶ │ morceau à │ ──▶ │ piano roll │ ──▶ │ qu'on a      │
│ modèle    │     │ n'importe │     │ pour       │     │ appris       │
│           │     │ quelle    │     │ vérifier   │     │              │
│           │     │ vitesse   │     │            │     │              │
└──────────┘     └───────────┘     └────────────┘     └──────┬───────┘
                                                             │
                                                             ▼
                                                    ┌──────────────┐
                                                    │ La session   │
                                                    │ suivante     │
                                                    │ reprend ici  │
                                                    └──────────────┘
```

## La Bibliothèque

120 morceaux dans 12 genres, construits à partir de vrais fichiers MIDI. Chaque genre a un modèle entièrement annoté -- une pièce de référence que l'IA étudie avant d'aborder le reste.

| Genre | Morceaux | Modèle |
|-------|----------|--------|
| Classique | 10 prêts | Für Elise, Clair de Lune, Sonate au clair de lune... |
| R&B | 4 prêts | Superstition (Stevie Wonder) |
| Jazz | 1 prêt | Les Feuilles mortes |
| Blues | 1 prêt | The Thrill Is Gone (B.B. King) |
| Pop | 1 prêt | Imagine (John Lennon) |
| Rock | 1 prêt | Your Song (Elton John) |
| Soul | 1 prêt | Lean on Me (Bill Withers) |
| Latin | 1 prêt | La Fille d'Ipanema |
| Film | 1 prêt | Comptine d'un autre été (Yann Tiersen) |
| Ragtime | 1 prêt | The Entertainer (Scott Joplin) |
| New-Age | 1 prêt | River Flows in You (Yiruma) |
| Folk | 1 prêt | Greensleeves |

Les morceaux progressent de **raw** (MIDI uniquement) à **ready** (entièrement annotés et jouables). L'IA promeut les morceaux en les étudiant et en écrivant des annotations avec `annotate_song`.

## Le Journal de Pratique

Le journal est la mémoire de l'IA. Après avoir joué un morceau, le serveur enregistre ce qui s'est passé -- quel morceau, à quelle vitesse, combien de mesures, combien de temps. L'IA ajoute ses propres réflexions : les motifs remarqués, les schémas reconnus, ce qu'elle veut essayer ensuite.

```markdown
---
### 14:32 — Les Feuilles mortes
**jazz** | intermediate | G minor | 69 BPM x 0.7x | 32/32 measures | 45s

Le ii-V-I aux mesures 5-8 (Cm7-F7-BbMaj7) a la même gravité que le
V-i dans The Thrill Is Gone, mais en majeur. Le blues et le jazz ont
plus en commun que les étiquettes de genre ne le suggèrent.

Prochaine fois : essayer à pleine vitesse. Comparer la modulation du
pont d'Ipanema avec ceci.
---
```

Un fichier markdown par jour, stocké dans `~/.pianoai/journal/`. Lisible par un humain, en ajout uniquement. À la session suivante, l'IA lit son journal et reprend là où elle s'était arrêtée.

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

### Apprendre

| Outil | Fonction |
|-------|----------|
| `list_songs` | Parcourir par genre, difficulté ou mot-clé |
| `song_info` | Analyse musicale, objectifs pédagogiques, conseils de style |
| `library_progress` | État d'annotation de tous les genres |
| `list_measures` | Notes et annotations de chaque mesure |
| `teaching_note` | Analyse approfondie d'une mesure |

### Jouer

| Outil | Fonction |
|-------|----------|
| `play_song` | Jouer par les haut-parleurs (vitesse, mode, plage de mesures) |
| `stop_playback` | Arrêter le morceau en cours |
| `pause_playback` | Mettre en pause ou reprendre |
| `set_speed` | Changer la vitesse en cours de lecture |
| `view_piano_roll` | Afficher le morceau en piano roll SVG |

### Se souvenir

| Outil | Fonction |
|-------|----------|
| `save_practice_note` | Écrire une entrée de journal (données de session capturées automatiquement) |
| `read_practice_journal` | Charger les entrées récentes pour le contexte |
| `annotate_song` | Promouvoir un morceau brut en prêt (les devoirs de l'IA) |

## CLI

```
pianoai list [--genre <genre>] [--difficulty <level>]
pianoai play <song-id> [--speed <mult>] [--mode <mode>]
pianoai view <song-id> [--measures <start-end>] [--out <file.svg>]
pianoai info <song-id>
pianoai library
```

## Statut

v0.1.0. 120 fichiers MIDI dans 12 genres. 24 morceaux entièrement annotés et jouables (un modèle par genre + 10 classiques + 4 R&B). Journal de pratique pour un apprentissage persistant entre les sessions. Six voix de clavier (grand, upright, electric, honkytonk, musicbox, bright). Tout le MIDI est là -- la bibliothèque grandit au fur et à mesure que l'IA apprend.

## Licence

MIT
