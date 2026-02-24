<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <strong>Español</strong> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo-banner.png" alt="AI Jam Sessions" width="520" />
</p>

<p align="center">
  <em>Aprendizaje automático a la antigua usanza</em>
</p>

<p align="center">
  Un servidor MCP que enseña a la IA a tocar el piano — y a cantar.<br/>
  120 canciones en 12 géneros. Cinco motores de sonido. Una cabina de control en el navegador con sintetizador vocal.<br/>
  Un diario de práctica que lo recuerda todo.
</p>

[![CI](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@mcptoolshop/ai-jam-sessions)](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions)
[![Songs](https://img.shields.io/badge/songs-120_across_12_genres-blue)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)
[![Ready](https://img.shields.io/badge/annotated-24-green)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)

---

## ¿Qué es esto?

Un piano que la IA aprende a tocar. No un sintetizador, no una biblioteca MIDI — un instrumento pedagógico.

Un LLM puede leer y escribir texto, pero no puede experimentar la música como nosotros. Sin oídos, sin dedos, sin memoria muscular. AI Jam Sessions cierra esa brecha dándole al modelo sentidos que puede usar realmente:

- **Leer** — partituras MIDI reales con anotaciones musicales profundas. No aproximaciones escritas a mano — analizadas, procesadas y explicadas.
- **Escuchar** — cinco motores de audio (piano oscilador, piano de muestras, muestras vocales, tracto vocal físico, síntesis aditiva vocal) que suenan por los altavoces. Los humanos en la sala se convierten en los oídos de la IA.
- **Ver** — un piano roll que renderiza lo tocado como SVG que el modelo puede releer y verificar. Una cabina de control en el navegador con teclado visual, editor de notas dual y laboratorio de afinación.
- **Recordar** — un diario de práctica que persiste entre sesiones. El aprendizaje se acumula.
- **Cantar** — síntesis de tracto vocal con 20 presets de voz, desde soprano operística hasta coro electrónico. Modo de cantar junto con solfeo, contorno y narración silábica.

Cada uno de los 12 géneros tiene un ejemplar ricamente anotado — una pieza de referencia con contexto histórico, análisis estructural compás por compás, momentos clave, objetivos pedagógicos y consejos de interpretación. Las otras 96 canciones son MIDI sin procesar, esperando que la IA absorba los patrones, toque la música y escriba sus propias anotaciones.

## El Piano Roll

El piano roll es cómo la IA ve la música. Renderiza cualquier canción como SVG — azul para la mano derecha, coral para la izquierda, con rejillas de pulso, dinámicas y límites de compás:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll de Para Elisa compases 1-8" width="100%" />
</p>

<p align="center"><em>Para Elisa, compases 1–8 — el trino E5-D#5 en azul, acompañamiento grave en coral</em></p>

Dos modos de color: **mano** (azul/coral) o **clase de altura** (arcoíris cromático — todos los C son rojos, todos los F# son cian). El formato SVG permite al modelo ver la imagen y leer el marcado para verificar altura, ritmo e independencia de manos.

## La Cabina de Control

Un instrumento y estudio vocal en el navegador que se abre junto al servidor MCP. Sin plugins, sin DAW — solo una página web con un piano.

- **Piano roll de doble modo** — alterna entre modo Instrumento (colores cromáticos por clase de altura) y modo Vocal (notas coloreadas por forma vocálica: /a/ /e/ /i/ /o/ /u/)
- **Teclado visual** — dos octavas desde C4, mapeado a tu teclado QWERTY. Clic o teclea.
- **20 presets de voz** — 15 voces Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, choir, synth-vox), 4 voces de tracto y una sección coral sintética
- **10 presets de instrumento** — las 6 voces de piano del servidor más synth-pad, organ, bell y strings
- **Inspector de notas** — haz clic en cualquier nota para editar velocidad, vocal y respirosidad
- **7 sistemas de afinación** — temperamento igual, entonación justa (mayor/menor), pitagórico, mesotónico de cuarto de coma, Werckmeister III, o centavos personalizados. Referencia A4 ajustable (392–494 Hz).
- **Auditoría de afinación** — tabla de frecuencias, tester de intervalos con análisis de frecuencia de batimiento, importación/exportación de afinación
- **Importar/exportar partitura** — serializa la partitura completa como JSON
- **API para LLM** — `window.__cockpit` expone `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` y `getScore()` para composición programática

## El Ciclo de Aprendizaje

```
 Leer                Tocar               Ver                 Reflexionar
┌──────────┐     ┌───────────┐     ┌────────────┐     ┌──────────────┐
│ Estudiar  │     │ Tocar la  │     │ Ver el     │     │ Escribir lo  │
│ el análisis│ ──▶│ canción a │ ──▶ │ piano roll │ ──▶ │ aprendido en │
│ del ejemplar│   │ cualquier │     │ para       │     │ el diario    │
│           │     │ velocidad │     │ verificar  │     │              │
└──────────┘     └───────────┘     └────────────┘     └──────┬───────┘
                                                             │
                                                             ▼
                                                    ┌──────────────┐
                                                    │ La siguiente  │
                                                    │ sesión       │
                                                    │ continúa aquí│
                                                    └──────────────┘
```

## Biblioteca de Canciones

120 canciones en 12 géneros, construidas a partir de archivos MIDI reales. Cada género tiene un ejemplar profundamente anotado — con contexto histórico, análisis armónico compás por compás, momentos clave, objetivos pedagógicos y consejos de interpretación (incluida guía vocal). Estos ejemplares sirven como plantillas: la IA estudia uno y anota el resto.

| Género | Ejemplar | Tonalidad | Qué enseña |
|--------|----------|-----------|------------|
| Blues | The Thrill Is Gone (B.B. King) | Si menor | Forma blues menor, llamada y respuesta, tocar detrás del pulso |
| Clásica | Para Elisa (Beethoven) | La menor | Forma rondó, diferenciación de toque, disciplina de pedal |
| Cine | Comptine d'un autre été (Tiersen) | Mi menor | Texturas arpegiadas, arquitectura dinámica sin cambio armónico |
| Folk | Greensleeves | Mi menor | Vals en 3/4, mezcla modal, estilo vocal renacentista |
| Jazz | Autumn Leaves (Kosma) | Sol menor | Progresiones ii-V-I, notas guía, corcheas swing, voicings sin raíz |
| Latin | La chica de Ipanema (Jobim) | Fa mayor | Ritmo de bossa nova, modulación cromática, contención vocal |
| New-Age | River Flows in You (Yiruma) | La mayor | Reconocimiento I-V-vi-IV, arpegios fluidos, rubato |
| Pop | Imagine (Lennon) | Do mayor | Acompañamiento arpegiado, contención, sinceridad vocal |
| Ragtime | The Entertainer (Joplin) | Do mayor | Bajo oom-pah, síncopa, forma multi-strain, disciplina de tempo |
| R&B | Superstition (Stevie Wonder) | Mib menor | Funk de semicorcheas, teclado percusivo, notas fantasma |
| Rock | Your Song (Elton John) | Mib mayor | Conducción de voces en balada de piano, inversiones, canto conversacional |
| Soul | Lean on Me (Bill Withers) | Do mayor | Melodía diatónica, acompañamiento gospel, llamada y respuesta |

Las canciones progresan de **raw** (solo MIDI) → **annotated** → **ready** (totalmente reproducible con lenguaje musical). La IA promueve canciones estudiándolas y escribiendo anotaciones con `annotate_song`.

## Motores de Sonido

Cinco motores más un combinador por capas que ejecuta dos simultáneamente:

| Motor | Tipo | Sonido |
|-------|------|--------|
| **Piano Oscilador** | Síntesis aditiva | Piano multi-armónico con ruido de martillo, inarmonicidad, polifonía de 48 voces, imagen estéreo. Cero dependencias. |
| **Piano de Muestras** | Reproducción WAV | Salamander Grand Piano — 480 muestras, 16 capas de velocidad, 88 teclas. Lo real. |
| **Vocal (Muestras)** | Muestras con pitch-shift | Tonos vocálicos sostenidos con portamento y modo legato. |
| **Tracto Vocal** | Modelo físico | Pink Trombone — forma de onda glotal LF, guía de onda digital de 44 celdas. Cuatro presets: soprano, alto, tenor, bajo. |
| **Síntesis Vocal** | Síntesis aditiva | 15 presets de voz Kokoro. Modelado de formantes, respirosidad, vibrato. Determinístico (RNG con semilla). |
| **Por Capas** | Combinador | Envuelve dos motores y despacha cada evento MIDI a ambos — piano+synth, vocal+synth, etc. |

### Voces de Teclado

Seis voces de piano ajustables, cada una con parámetros configurables (brillo, decaimiento, dureza de martillo, desafinación, amplitud estéreo y más):

| Voz | Carácter |
|-----|----------|
| Concert Grand | Rico, pleno, clásico |
| Upright | Cálido, íntimo, folk |
| Electric Piano | Sedoso, jazzy, estilo Fender Rhodes |
| Honky-Tonk | Desafinado, ragtime, salón |
| Music Box | Cristalino, etéreo |
| Bright Grand | Brillante, contemporáneo, pop |

## El Diario de Práctica

Después de cada sesión, el servidor registra lo que ocurrió — qué canción, qué velocidad, cuántos compases, cuánto tiempo. La IA añade sus propias reflexiones: qué notó, qué patrones reconoció, qué probar a continuación.

```markdown
---
### 14:32 — Autumn Leaves
**jazz** | intermediate | Sol menor | 69 BPM × 0.7 | 32/32 compases | 45s

El ii-V-I en compases 5-8 (Cm7-F7-BbMaj7) tiene la misma gravedad
que el V-i en The Thrill Is Gone, pero en mayor. El blues y el jazz
comparten más de lo que las etiquetas de género sugieren.

Siguiente: probar a velocidad completa. Comparar la modulación del
puente de Ipanema con esto.
---
```

Un archivo markdown por día, almacenado en `~/.ai-jam-sessions/journal/`. Legible por humanos, solo escritura. En la siguiente sesión, la IA lee su diario y continúa donde lo dejó.

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

24 herramientas en cuatro categorías:

### Aprender

| Herramienta | Función |
|-------------|---------|
| `list_songs` | Explorar por género, dificultad o palabra clave |
| `song_info` | Análisis musical completo — estructura, momentos clave, objetivos pedagógicos, consejos de estilo |
| `registry_stats` | Estadísticas de toda la biblioteca |
| `library_progress` | Estado de anotación en todos los géneros |
| `list_measures` | Notas, dinámicas y notas pedagógicas de cada compás |
| `teaching_note` | Detalle de un solo compás — digitación, dinámicas, contexto |
| `suggest_song` | Recomendación basada en género, dificultad e historial |
| `practice_setup` | Velocidad, modo, configuración de voz y comando CLI recomendados |

### Tocar

| Herramienta | Función |
|-------------|---------|
| `play_song` | Reproducir por altavoces — canciones de la biblioteca o archivos .mid |
| `stop_playback` | Detener |
| `pause_playback` | Pausar o reanudar |
| `set_speed` | Cambiar velocidad durante la reproducción (0.1×–4.0×) |
| `playback_status` | Snapshot en tiempo real: compás actual, tempo, velocidad, voz de teclado, estado |
| `view_piano_roll` | Renderizar como SVG (color por mano o arcoíris cromático por clase de altura) |

### Cantar

| Herramienta | Función |
|-------------|---------|
| `sing_along` | Texto cantable — nombres de notas, solfeo, contorno o sílabas. Con o sin acompañamiento de piano |
| `ai_jam_sessions` | Generar un brief de jam — progresión de acordes, esquema melódico y consejos de estilo |

### Construir

| Herramienta | Función |
|-------------|---------|
| `add_song` | Añadir una nueva canción como JSON |
| `import_midi` | Importar un archivo .mid con metadatos |
| `annotate_song` | Escribir lenguaje musical para una canción sin procesar y promoverla a ready |
| `save_practice_note` | Entrada de diario con captura automática de datos de sesión |
| `read_practice_journal` | Cargar entradas recientes |
| `list_keyboards` | Voces de teclado disponibles |
| `tune_keyboard` | Ajustar cualquier parámetro de cualquier voz. Persiste entre sesiones |
| `get_keyboard_config` | Configuración actual vs valores de fábrica |
| `reset_keyboard` | Restablecer una voz de teclado a fábrica |

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

## Estado

v0.2.1. Seis motores de sonido, 31 herramientas MCP, 120 canciones en 12 géneros con ejemplares profundamente anotados. Cabina de control en el navegador con 20 presets vocales, 10 voces de instrumento, 7 sistemas de afinación y una API de partitura para LLM. Visualización de piano roll en dos modos de color. Diario de práctica persistente. El MIDI está completo — la biblioteca crece a medida que la IA aprende.

## Licencia

MIT
