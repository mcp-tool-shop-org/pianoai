<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

## ¿Qué es esto?

Un piano y una guitarra que una IA aprende a tocar. No es un sintetizador, ni una biblioteca MIDI, sino un instrumento de aprendizaje.

Un modelo de lenguaje grande (LLM) puede leer y escribir texto, pero no puede experimentar la música de la misma manera que nosotros. No tiene oídos, ni dedos, ni memoria muscular. AI Jam Sessions cierra esa brecha al proporcionar al modelo sentidos que realmente puede usar:

- **Lectura** — partituras MIDI reales con anotaciones musicales detalladas. No son aproximaciones escritas a mano, sino que se analizan, se interpretan y se explican.
- **Audición** — seis motores de audio (piano de oscilador, piano de muestras, muestras vocales, tracto vocal físico, sintetizador vocal aditivo, guitarra modelada físicamente) que se reproducen a través de tus altavoces, para que los humanos en la habitación se conviertan en los oídos de la IA.
- **Visualización** — un piano roll que renderiza lo que se ha tocado como SVG, que el modelo puede leer y verificar. Un editor interactivo de tablaturas de guitarra. Un panel de control en el navegador con un teclado visual, un editor de notas de doble modo y un laboratorio de afinación.
- **Memoria** — un diario de práctica que persiste a través de las sesiones, para que el aprendizaje se acumule con el tiempo.
- **Canto** — síntesis de tracto vocal con 20 preajustes de voz, desde soprano lírico hasta coro electrónico. Modo de canto con solfeo, contorno y narración de sílabas.

Cada uno de los 12 géneros tiene un ejemplo ricamente anotado: una pieza de referencia que la IA estudia primero, con contexto histórico, análisis estructural compás por compás, momentos clave, objetivos de enseñanza y consejos de interpretación. Las otras 96 canciones son archivos MIDI sin procesar, esperando a que la IA absorba los patrones, interprete la música y escriba sus propias anotaciones.

## El Piano Roll

El piano roll es la forma en que la IA ve la música. Renderiza cualquier canción como SVG: azul para la mano derecha, coral para la izquierda, con cuadrículas de ritmo, dinámica y límites de compás:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Dos modos de color: **mano** (azul/coral) o **clase de tono** (arcoíris cromático: cada do es rojo, cada fa sostenido es cian). El formato SVG significa que el modelo puede ver la imagen y leer el código para verificar el tono, el ritmo y la independencia de las manos.

## El Panel de Control

Un estudio de instrumentos y voz basado en el navegador que se abre junto con el servidor MCP. No requiere plugins ni DAW, solo una página web con un piano.

- **Rollo de piano de doble modo** — cambie entre el modo de instrumento (colores cromáticos de las notas) y el modo de voz (las notas coloreadas según la forma de la vocal: /a/ /e/ /i/ /o/ /u/).
- **Teclado visual** — dos octavas desde Do4, mapeadas a su teclado QWERTY. Haga clic o escriba.
- **20 presets de voz** — 15 voces mapeadas a Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, además de coro y voz sintética), 4 voces mapeadas a pistas y una sección de coro sintético.
- **10 presets de instrumento** — las 6 voces de piano del servidor, más un sintetizador, un órgano, un timbre de campana y cuerdas.
- **Inspector de notas** — haga clic en cualquier nota para editar la velocidad, la vocal y el brillo.
- **7 sistemas de afinación** — afinación temperada, afinación justa (mayor/menor), pitagórica, meantone de un cuarto de coma, Werckmeister III, o desplazamientos de centésimas personalizables. Referencia A4 ajustable (392–494 Hz).
- **Auditoría de afinación** — tabla de frecuencias, probador de intervalos con análisis de frecuencia de latidos, y exportación/importación de afinación.
- **Importación/exportación de partituras** — serialice toda la partitura como JSON y cárguela de nuevo.
- **API para LLM** — `window.__cockpit` expone `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` y `getScore()` para que un LLM pueda componer, arreglar y reproducir música programáticamente.

## El ciclo de aprendizaje

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

## La biblioteca de canciones

120 canciones en 12 géneros, creadas a partir de archivos MIDI reales. Cada género tiene un ejemplo exhaustivamente anotado, con contexto histórico, análisis armónico paso a paso, momentos clave, objetivos de enseñanza y consejos de interpretación (incluyendo guía vocal). Estos ejemplos sirven como plantillas: la IA estudia uno, y luego anota el resto.

| Género | Ejemplo | Tonalidad | Lo que enseña |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | Si menor | Forma de blues menor, llamada y respuesta, tocar por detrás del ritmo. |
| Clásico | Für Elise (Beethoven) | La menor | Forma de rondó, diferenciación del tacto, disciplina del pedal. |
| Cine | Comptine d'un autre été (Tiersen) | Mi menor | Texturas arpegiadas, arquitectura dinámica sin cambio armónico. |
| Folk | Greensleeves | Mi menor | Compás de 3/4, mezcla modal, estilo vocal renacentista. |
| Jazz | Autumn Leaves (Kosma) | Sol menor | Progresiones ii-V-I, tonos guía, corcheas con swing, voicings sin raíz. |
| Latino | The Girl from Ipanema (Jobim) | Do mayor | Ritmo de bossa nova, modulación cromática, contención vocal. |
| New-Age | River Flows in You (Yiruma) | La mayor | Reconocimiento de I-V-vi-IV, arpegios fluidos, rubato. |
| Pop | Imagine (Lennon) | Do mayor | Acompañamiento arpegiado, contención, sinceridad vocal. |
| Ragtime | The Entertainer (Joplin) | Do mayor | Bajo "oom-pah", síncopa, forma de múltiples secciones, disciplina del tempo. |
| R&B | Superstition (Stevie Wonder) | Si menor | Funk de dieciseisavos, teclado percusivo, notas fantasma. |
| Rock | Your Song (Elton John) | Mi mayor | Conducción de voz de balada de piano, inversiones, canto conversacional. |
| Soul | Lean on Me (Bill Withers) | Do mayor | Melodía diatónica, acompañamiento gospel, llamada y respuesta. |

Las canciones progresan de **crudas** (solo MIDI) → **anotadas** → **listas** (totalmente reproducibles con lenguaje musical). La IA promociona canciones estudiándolas y escribiendo anotaciones con `annotate_song`.

## Motores de sonido

Seis motores, más un combinador en capas que ejecuta dos de ellos simultáneamente:

| Motor | Tipo | Sonido característico |
|--------|------|---------------------|
| **Oscillator Piano** | Síntesis aditiva | Piano multi-armónico con ruido de martillo, inarmónico, polifonía de 48 voces, imagen estéreo. Sin dependencias. |
| **Sample Piano** | Reproducción de archivos WAV | Piano de cola Salamander: 480 muestras, 16 capas de velocidad, 88 teclas. La versión real. |
| **Vocal (Sample)** | Muestras con desplazamiento de tono | Tonos vocales sostenidos con portamento y modo legato. |
| **Vocal Tract** | Modelo físico | Trombón "Pink": forma de onda glótica de baja frecuencia a través de una guía de onda digital de 44 celdas. Cuatro presets: soprano, alto, tenor, bajo. |
| **Vocal Synth** | Síntesis aditiva | 15 presets de voces "Kokoro" con modelado de formantes, aspereza, vibrato. Determinista (generador de números aleatorios con semilla). |
| **Guitar** | Síntesis aditiva | Cuerda pulsada modelada físicamente: 4 presets (acústica "dreadnought" de acero, clásica de nylon, "archtop" de jazz, de doce cuerdas), 8 afinaciones, 17 parámetros ajustables. |
| **Layered** | Combinador | Combina dos motores y envía cada evento MIDI a ambos: piano + sintetizador, voz + sintetizador, etc. |

### Voces de teclado

Seis voces de piano ajustables, cada una con parámetros individuales (brillo, decaimiento, dureza del martillo, desafinación, ancho estéreo, y más):

| Voz | Característica |
|-------|-----------|
| Piano de cola de concierto | Rico, completo, clásico |
| Piano vertical | Cálido, íntimo, de estilo folclórico |
| Piano eléctrico | Suave, jazzy, con sensación de Fender Rhodes |
| Piano "Honky-Tonk" | Desafinado, ragtime, de salón |
| Caja de música | Cristalino, etéreo |
| Piano de cola brillante | Agudo, contemporáneo, pop |

### Voces de guitarra

Cuatro presets de voces de guitarra con síntesis de cuerda modelada físicamente, cada uno con 17 parámetros ajustables (brillo, resonancia de la caja, posición de pulsación, amortiguación de la cuerda, y más):

| Voz | Característica |
|-------|-----------|
| Acústica "Dreadnought" de acero | Brillante, equilibrado, acústica clásica |
| Clásica de nylon | Cálido, suave, redondeado |
| "Archtop" de jazz | Suave, de madera, limpio |
| De doce cuerdas | Brillante, doble, con efecto de coro |

## El diario de práctica

Después de cada sesión, el servidor registra lo que sucedió: qué canción, a qué velocidad, cuántas compases, cuánto tiempo. La IA añade sus propias reflexiones: lo que notó, los patrones que reconoció, qué probar a continuación.

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

Un archivo Markdown por día, almacenado en `~/.ai-jam-sessions/journal/`. Legible por humanos, solo se puede añadir contenido. En la siguiente sesión, la IA lee su diario y continúa desde donde lo dejó.

## Instalación

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

Requiere **Node.js 18+**. No requiere controladores MIDI, ni puertos virtuales, ni software externo.

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

31 herramientas en cuatro categorías:

### Aprender

| Herramienta | Qué hace |
|------|--------------|
| `list_songs` | Navegar por género, dificultad o palabra clave |
| `song_info` | Análisis musical completo: estructura, momentos clave, objetivos de enseñanza, consejos de estilo |
| `registry_stats` | Estadísticas de toda la biblioteca: número total de canciones, géneros, dificultades |
| `library_progress` | Estado de anotación en todos los géneros |
| `list_measures` | Notas, dinámicas y notas de enseñanza de cada compás |
| `teaching_note` | Análisis detallado de un compás: digitación, dinámicas, contexto |
| `suggest_song` | Recomendación basada en género, dificultad y lo que has tocado |
| `practice_setup` | Velocidad, modo, configuraciones de voz y comando de línea de comandos recomendados para una canción |

### Reproducir

| Herramienta | Qué hace |
|------|--------------|
| `play_song` | Reproducir a través de los altavoces: canciones de la biblioteca o archivos .mid sin procesar. Cualquier motor, velocidad, modo, rango de compases. |
| `stop_playback` | Detener |
| `pause_playback` | Pausar o reanudar. |
| `set_speed` | Cambiar la velocidad durante la reproducción (0.1×–4.0×). |
| `playback_status` | Captura instantánea en tiempo real: medida actual, tempo, velocidad, timbre de teclado, estado. |
| `view_piano_roll` | Renderizar como SVG (coloración manual o arcoíris cromático por clase de tono). |

### Cantar

| Herramienta | Qué hace |
|------|--------------|
| `sing_along` | Texto cantable: nombres de notas, solfeo, contorno o sílabas. Con o sin acompañamiento de piano. |
| `ai_jam_sessions` | Generar un esquema de improvisación: progresión de acordes, esquema melódico y sugerencias de estilo para la reinterpretación. |

### Guitarra

| Herramienta | Qué hace |
|------|--------------|
| `view_guitar_tab` | Renderizar tablaturas de guitarra interactivas como HTML: edición con un clic, cursor de reproducción, atajos de teclado. |
| `list_guitar_voices` | Presets de timbre de guitarra disponibles. |
| `list_guitar_tunings` | Sistemas de afinación de guitarra disponibles (estándar, drop-D, abierto en G, DADGAD, etc.). |
| `tune_guitar` | Ajustar cualquier parámetro de cualquier timbre de guitarra. Los cambios se guardan entre sesiones. |
| `get_guitar_config` | Configuración actual del timbre de guitarra frente a los valores predeterminados de fábrica. |
| `reset_guitar` | Restaurar la configuración de fábrica de un timbre de guitarra. |

### Construir

| Herramienta | Qué hace |
|------|--------------|
| `add_song` | Añadir una nueva canción en formato JSON. |
| `import_midi` | Importar un archivo .mid con metadatos. |
| `annotate_song` | Escribir el lenguaje musical para una canción básica y convertirla a un formato listo para usar. |
| `save_practice_note` | Entrada de diario con datos de sesión capturados automáticamente. |
| `read_practice_journal` | Cargar entradas recientes para obtener contexto. |
| `list_keyboards` | Timbre de teclado disponibles. |
| `tune_keyboard` | Ajustar cualquier parámetro de cualquier timbre de teclado. Los cambios se guardan entre sesiones. |
| `get_keyboard_config` | Configuración actual frente a los valores predeterminados de fábrica. |
| `reset_keyboard` | Restaurar la configuración de fábrica de un timbre de teclado. |

## Interfaz de línea de comandos (CLI)

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

v0.3.0. Seis motores de sonido, 31 herramientas MCP, 120 canciones en 12 géneros con ejemplos detalladamente anotados. Editor interactivo de tablaturas de guitarra. Panel de control para navegador con 20 presets de voz, 10 timbres de instrumentos, 7 sistemas de afinación y una API de partitura orientada a modelos de lenguaje. Visualización de piano roll en dos modos de color. Diario de práctica para un aprendizaje continuo. Todos los archivos MIDI están disponibles; la biblioteca crece a medida que la IA aprende.

## Seguridad y privacidad

**Datos accedidos:** biblioteca de canciones (JSON + MIDI), directorio de canciones del usuario (`~/.ai-jam-sessions/songs/`), configuraciones de afinación de guitarra, entradas del diario de práctica, dispositivo de salida de audio local.

**Datos NO accedidos:** no hay APIs en la nube, no hay credenciales de usuario, no hay datos de navegación, no hay archivos del sistema fuera del directorio de canciones del usuario. No se recopilan ni se envían datos de telemetría.

**Permisos:** El servidor MCP utiliza únicamente el transporte stdio (sin HTTP). La interfaz de línea de comandos accede al sistema de archivos local y a los dispositivos de audio. Consulte [SECURITY.md](SECURITY.md) para obtener la política completa.

## Licencia

MIT.
