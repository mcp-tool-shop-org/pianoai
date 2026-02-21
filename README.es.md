<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <strong>Español</strong> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.png" alt="AI Jam Session logo" width="180" />
</p>

<h1 align="center">AI Jam Session</h1>

<p align="center">
  <em>Aprendizaje Automático a la Antigua</em>
</p>

<p align="center">
  Un servidor MCP que enseña a la IA a tocar piano.<br/>
  120 canciones. 12 géneros. MIDI real. Un diario de práctica que lo recuerda todo.
</p>

[![Songs](https://img.shields.io/badge/songs-120_across_12_genres-blue)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)
[![Ready](https://img.shields.io/badge/ready_to_play-24-green)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)

---

## ¿Qué es esto?

Un piano que la IA aprende a tocar. No es un sintetizador, no es una biblioteca MIDI -- es un instrumento de enseñanza.

Cada género tiene una canción modelo anotada -- una pieza de referencia con análisis musical, objetivos pedagógicos y guía de estilo. Las otras 96 canciones son MIDI sin procesar, esperando a que la IA estudie el modelo, toque las canciones y escriba sus propias anotaciones. Cada sesión continúa donde terminó la anterior gracias a un diario de práctica que persiste entre conversaciones.

El LLM no solo *toca* música. Aprende a *leer* música, *ver* lo que toca en un piano roll, *escuchar* el resultado por los altavoces, y *escribir* lo que aprendió. Ese es el ciclo.

## El Ciclo de Aprendizaje

```
 Estudiar           Tocar              Ver                 Reflexionar
┌─────────┐     ┌───────────┐     ┌────────────┐     ┌──────────────┐
│ Leer el  │     │ Tocar la  │     │ Ver el     │     │ Escribir lo  │
│ análisis │ ──▶ │ canción a │ ──▶ │ piano roll │ ──▶ │ aprendido en │
│ modelo   │     │ cualquier │     │ (SVG)      │     │ el diario    │
│          │     │ velocidad │     │            │     │              │
└─────────┘     └───────────┘     └────────────┘     └──────┬───────┘
                                                            │
                                                            ▼
                                                   ┌──────────────┐
                                                   │ La siguiente  │
                                                   │ sesión        │
                                                   │ continúa aquí │
                                                   └──────────────┘
```

## La Biblioteca de Canciones

120 canciones en 12 géneros, construidas a partir de archivos MIDI reales. Cada género tiene un modelo completamente anotado -- una pieza de referencia que la IA estudia antes de abordar el resto.

| Género | Canciones | Modelo |
|--------|-----------|--------|
| Clásica | 10 listas | Für Elise, Clair de Lune, Moonlight Sonata... |
| R&B | 4 listas | Superstition (Stevie Wonder) |
| Jazz | 1 lista | Autumn Leaves |
| Blues | 1 lista | The Thrill Is Gone (B.B. King) |
| Pop | 1 lista | Imagine (John Lennon) |
| Rock | 1 lista | Your Song (Elton John) |
| Soul | 1 lista | Lean on Me (Bill Withers) |
| Latina | 1 lista | The Girl from Ipanema |
| Cine | 1 lista | Comptine d'un autre été (Yann Tiersen) |
| Ragtime | 1 lista | The Entertainer (Scott Joplin) |
| New-Age | 1 lista | River Flows in You (Yiruma) |
| Folk | 1 lista | Greensleeves |

Las canciones progresan de **raw** (solo MIDI) a **ready** (completamente anotadas y reproducibles). La IA promueve canciones estudiándolas y escribiendo anotaciones con `annotate_song`.

## El Diario de Práctica

El diario es la memoria de la IA. Después de tocar una canción, el servidor registra lo que sucedió -- qué canción, a qué velocidad, cuántos compases, cuánto tiempo. La IA agrega sus propias reflexiones: qué patrones notó, qué reconoció, qué intentar después.

```markdown
---
### 14:32 — Autumn Leaves
**jazz** | intermediate | G minor | 69 BPM x 0.7x | 32/32 measures | 45s

El ii-V-I en los compases 5-8 (Cm7-F7-BbMaj7) tiene la misma gravedad
que el V-i en The Thrill Is Gone, solo que en mayor. El blues y el jazz
comparten más de lo que sugieren las etiquetas de género.

Próximo: intentar a velocidad completa. Comparar la modulación del
puente de Ipanema con esto.
---
```

Un archivo markdown por día, almacenado en `~/.pianoai/journal/`. Legible por humanos, solo adición. En la siguiente sesión, la IA lee su diario y continúa donde lo dejó.

## Instalación

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

Requiere **Node.js 18+**. Sin controladores MIDI, sin puertos virtuales, sin software externo.

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

## Herramientas MCP

### Aprender

| Herramienta | Función |
|-------------|---------|
| `list_songs` | Buscar por género, dificultad o palabra clave |
| `song_info` | Análisis musical, objetivos pedagógicos, consejos de estilo |
| `library_progress` | Estado de anotación en todos los géneros |
| `list_measures` | Notas y apuntes de enseñanza de cada compás |
| `teaching_note` | Análisis profundo de un compás individual |

### Tocar

| Herramienta | Función |
|-------------|---------|
| `play_song` | Reproducir por altavoces (velocidad, modo, rango de compases) |
| `stop_playback` | Detener la canción actual |
| `pause_playback` | Pausar o reanudar |
| `set_speed` | Cambiar velocidad durante la reproducción |
| `view_piano_roll` | Renderizar canción como piano roll SVG |

### Recordar

| Herramienta | Función |
|-------------|---------|
| `save_practice_note` | Escribir una entrada en el diario (datos de sesión capturados automáticamente) |
| `read_practice_journal` | Cargar entradas recientes para contexto |
| `annotate_song` | Promover una canción sin procesar a lista (la tarea de la IA) |

## CLI

```
pianoai list [--genre <genre>] [--difficulty <level>]
pianoai play <song-id> [--speed <mult>] [--mode <mode>]
pianoai view <song-id> [--measures <start-end>] [--out <file.svg>]
pianoai info <song-id>
pianoai library
```

## Estado

v0.1.0. 120 archivos MIDI en 12 géneros. 24 canciones completamente anotadas y reproducibles (un modelo por género + 10 clásicas + 4 R&B). Diario de práctica para aprendizaje persistente entre sesiones. Seis voces de teclado (grand, upright, electric, honkytonk, musicbox, bright). Todo el MIDI está listo -- la biblioteca crece a medida que la IA aprende.

## Licencia

MIT
