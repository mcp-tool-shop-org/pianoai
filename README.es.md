<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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
</p>

---

## ¿Qué es esto?

Un piano y una guitarra que una IA aprende a tocar. No es un sintetizador, ni una biblioteca MIDI; es un instrumento de aprendizaje.

Un modelo de lenguaje grande (LLM) puede leer y escribir texto, pero no puede experimentar la música de la misma manera que nosotros. No tiene oídos, dedos ni memoria muscular. AI Jam Sessions cierra esa brecha al proporcionar al modelo los sentidos que realmente puede usar:

- **Lectura:** Partituras MIDI reales con anotaciones musicales detalladas. No son aproximaciones escritas a mano, sino que se analizan, se explican y se interpretan.
- **Audición:** Seis motores de audio (piano de oscilador, piano de muestras, muestras vocales, tracto vocal físico, sintetizador vocal aditivo, guitarra modelada físicamente) que reproducen a través de tus altavoces, para que los humanos en la habitación se conviertan en los "oídos" de la IA.
- **Visualización:** Un piano roll que representa lo que se ha tocado en formato SVG, que el modelo puede leer y verificar. Un editor interactivo de tablaturas de guitarra. Un panel de control en el navegador con un teclado visual, un editor de notas de doble modo y un laboratorio de afinación.
- **Memoria:** Un diario de práctica que persiste a través de las sesiones, para que el aprendizaje se acumule con el tiempo.
- **Canto:** Síntesis del tracto vocal con 20 preajustes de voz, desde soprano lírica hasta coro electrónico. Modo de canto con narración de solfeo, contorno y sílabas.

Cada uno de los 12 géneros tiene un ejemplo ricamente anotado: una pieza de referencia que la IA estudia primero, con contexto histórico, análisis estructural barra por barra, momentos clave, objetivos de enseñanza y consejos de interpretación. Las otras 96 canciones son archivos MIDI sin procesar, esperando a que la IA absorba los patrones, interprete la música y escriba sus propias anotaciones.

## El Piano Roll

El piano roll es la forma en que la IA "ve" la música. Representa cualquier canción en formato SVG: azul para la mano derecha, coral para la izquierda, con cuadrículas de ritmo, dinámica y límites de compás:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Dos modos de color: **mano** (azul/coral) o **clase de tono** (arcoíris cromático: cada do es rojo, cada si es cian). El formato SVG permite que el modelo vea la imagen y lea la información para verificar el tono, el ritmo y la independencia de las manos.

## El Panel de Control

Un estudio de instrumentos y voz basado en un navegador que se abre junto con el servidor MCP. No requiere plugins ni DAWs; solo una página web con un piano.

- **Piano roll de doble modo:** Cambia entre el modo Instrumento (colores de clase de tono cromáticos) y el modo Vocal (las notas se colorean según la forma de la vocal: /a/ /e/ /i/ /o/ /u/).
- **Teclado visual:** Dos octavas desde C4, mapeadas a tu teclado QWERTY. Haz clic o escribe.
- **20 preajustes de voz:** 15 voces mapeadas a Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, además de coro y voz sintética), 4 voces mapeadas al tracto vocal y una sección de coro sintético.
- **10 preajustes de instrumento:** Las 6 voces de piano del servidor, más un sintetizador, un órgano, un timbre y cuerdas.
- **Inspector de notas:** Haz clic en cualquier nota para editar la velocidad, la vocal y el brillo.
- **7 sistemas de afinación:** Temperamento igual, afinación justa (mayor/menor), pitagórico, meantone de cuarto comma, Werckmeister III, o desplazamientos de centésimas personalizables. Referencia A4 ajustable (392–494 Hz).
- **Auditoría de afinación:** Tabla de frecuencias, probador de intervalos con análisis de frecuencia de latidos, y exportación/importación de afinación.
- **Importación/exportación de partituras:** Serializa toda la partitura como JSON y cárgala de nuevo.
- **API para LLM:** `window.__cockpit` expone `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` y `getScore()`, para que un LLM pueda componer, arreglar y reproducir música de forma programática.

## El Ciclo de Aprendizaje

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

## La Biblioteca de Canciones

120 canciones en 12 géneros, creadas a partir de archivos MIDI reales. Cada género tiene un ejemplo ricamente anotado, con contexto histórico, análisis armónico barra por barra, momentos clave, objetivos de enseñanza y consejos de interpretación (incluida la guía vocal). Estos ejemplos sirven como plantillas: la IA estudia uno, y luego anota el resto.

| Género | Ejemplo | Clave | Lo que enseña |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | Si menor | Forma de blues menor, llamada y respuesta, tocar por detrás del ritmo. |
| Clásico | Für Elise (Beethoven) | La menor | Forma de rondo, diferenciación del tacto, disciplina del pedal. |
| Película | Comptine d'un autre été (Tiersen) | Mi menor | Texturas arpegiadas, arquitectura dinámica sin cambio armónico. |
| Folclórico | Greensleeves | Mi menor | Sensación de vals en 3/4, mezcla modal, estilo vocal renacentista. |
| Jazz | Autumn Leaves (Kosma) | Sol menor | Progresiones ii-V-I, tonos guía, corcheas con swing, voicings sin fundamentales. |
| Latino | The Girl from Ipanema (Jobim) | Fa mayor | Ritmo de bossa nova, modulación cromática, contención vocal. |
| New-Age | River Flows in You (Yiruma) | La mayor | Reconocimiento de I-V-vi-IV, arpegios fluidos, rubato. |
| Pop | Imagine (Lennon) | Do mayor | Acompañamiento arpegiado, contención, sinceridad vocal. |
| Ragtime | The Entertainer (Joplin) | Do mayor | Bajo "oom-pah", síncopa, forma de múltiples secciones, disciplina del tempo. |
| R&B | Superstition (Stevie Wonder) | Si menor | Funk en semicorcheas, teclado percusivo, notas fantasma. |
| Rock | Your Song (Elton John) | Si mayor | Conducción de la voz en balada de piano, inversiones, canto conversacional. |
| Soul | Lean on Me (Bill Withers) | Do mayor | Melodía diatónica, acompañamiento gospel, llamada y respuesta. |

Las canciones progresan desde **crudas** (solo MIDI) → **anotadas** → **listas** (totalmente reproducibles con lenguaje musical). La IA promueve las canciones estudiándolas y escribiendo anotaciones con `annotate_song`.

## Motores de Sonido

Seis motores, más un combinador en capas que ejecuta dos simultáneamente:

| Motor | Tipo | Cómo suena |
|--------|------|---------------------|
| **Oscillator Piano** | Síntesis aditiva | Piano multi-armónico con ruido de martillo, inarmonía, polifonía de 48 voces, imagen estéreo. Sin dependencias. |
| **Sample Piano** | Reproducción de WAV | Salamander Grand Piano — 480 muestras, 16 capas de velocidad, 88 teclas. Lo real. |
| **Vocal (Sample)** | Muestras con cambio de tono | Tonos vocálicos sostenidos con portamento y modo legato. |
| **Vocal Tract** | Modelo físico | Pink Trombone — Forma de onda glotal de baja frecuencia a través de una guía de onda digital de 44 celdas. Cuatro presets: soprano, alto, tenor, bajo. |
| **Vocal Synth** | Síntesis aditiva | 15 presets de voz Kokoro con modelado de formantes, aspereza, vibrato. Determinista (RNG con semilla). |
| **Guitar** | Síntesis aditiva | Cuerda pulsada modelada físicamente — 4 presets (acústica de acero, clásica de nylon, archtop de jazz, de doce cuerdas), 8 afinaciones, 17 parámetros ajustables. |
| **Layered** | Combinador | Envuelve dos motores y envía cada evento MIDI a ambos — piano + sintetizador, voz + sintetizador, etc. |

### Voces de Teclado

Seis voces de piano ajustables, cada una ajustable por parámetro (brillo, decaimiento, dureza del martillo, desafinación, ancho estéreo, y más):

| Voz | Característica |
|-------|-----------|
| Gran piano de concierto | Rico, completo, clásico |
| Piano vertical | Cálido, íntimo, folclórico |
| Piano eléctrico | Sedoso, jazzy, sensación Fender Rhodes |
| Honky-Tonk | Detunado, ragtime, salón |
| Caja de música | Cristalino, etéreo |
| Piano de cola brillante | Moderno, pop, contundente |

### Voces de guitarra

Cuatro presets de voces de guitarra con síntesis de cuerdas modelada físicamente, cada uno con 17 parámetros ajustables (brillo, resonancia del cuerpo, posición de pulsación, amortiguación de las cuerdas, y más):

| Voz | Característica |
|-------|-----------|
| Acústica tipo Dreadnought | Brillante, equilibrado, acústico clásico |
| Clásica de nylon | Cálido, suave, redondeado |
| Archtop de jazz | Suave, amaderado, limpio |
| De 12 cuerdas | Brillante, con doble sonido, tipo coro |

## El diario de práctica

Después de cada sesión, el servidor registra lo que sucedió: qué canción, a qué velocidad, cuántas compases, cuánto tiempo. La IA añade sus propias reflexiones: lo que observó, los patrones que reconoció, qué probar a continuación.

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

## Instalar

```bash
npm install -g ai-jam-sessions
```

Requiere **Node.js 18+**. No requiere controladores MIDI, ni puertos virtuales, ni software externo.

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

41 herramientas y 3 plantillas de prompts en seis categorías:

### Aprender

| Herramienta | Qué hace |
|------|--------------|
| `list_songs` | Explorar por género, dificultad o palabra clave |
| `song_info` | Análisis musical completo: estructura, momentos clave, objetivos de enseñanza, consejos de estilo |
| `registry_stats` | Estadísticas de toda la biblioteca: número total de canciones, géneros, dificultades |
| `list_measures` | Notas, dinámicas y notas de enseñanza de cada compás |
| `teaching_note` | Análisis detallado de un compás: digitación, dinámicas, contexto |
| `suggest_song` | Recomendación basada en género, dificultad y lo que has tocado |
| `practice_setup` | Velocidad, modo, configuración de voz y comando de línea de comandos recomendados para una canción |
| `compare_songs` | Reconocimiento de patrones entre géneros: relaciones de tonalidades, similitud de notas/intervalos, formas compartidas, conexiones de enseñanza |
| `annotation_progress` | Evaluación de la calidad de las anotaciones en toda la biblioteca: puntuaciones, calificaciones y sugerencias de mejora |
| `server_info` | Versión del servidor, estadísticas de la biblioteca, lista de motores, sesión activa |

### Reproducir

| Herramienta | Qué hace |
|------|--------------|
| `play_song` | Reproducir a través de los altavoces: canciones de la biblioteca o archivos .mid sin procesar. Cualquier motor, velocidad, modo, rango de compases. |
| `stop_playback` | Detener |
| `pause_playback` | Pausar o reanudar |
| `set_speed` | Cambiar la velocidad durante la reproducción (0.1×–4.0×) |
| `playback_status` | Captura en tiempo real: compás actual, tempo, velocidad, voz del teclado, estado |
| `view_piano_roll` | Renderizar como SVG (coloración manual o arcoíris cromático por clase de tono) |
| `score_performance` | Evaluar una interpretación MIDI: precisión de la afinación, ritmo, integridad, con retroalimentación graduada |
| `mute_hand` | Silenciar o activar la mano izquierda/derecha durante la práctica: aislar una mano a la vez |
| `preview_teaching_cues` | Ver todas las notas de enseñanza y momentos clave antes de tocar |

### Cantar

| Herramienta | Qué hace |
|------|--------------|
| `sing_along` | Texto cantable: nombres de notas, solfeo, contorno o sílabas. Con o sin acompañamiento de piano. |
| `ai_jam_sessions` | Generar un esquema de improvisación: progresión de acordes, esquema melódico y sugerencias de estilo para la reinterpretación |

### Guitarra

| Herramienta | Qué hace |
|------|--------------|
| `view_guitar_tab` | Renderizar tablaturas de guitarra interactivas como HTML: edición con un clic, cursor de reproducción, atajos de teclado |
| `list_guitar_voices` | Presets de voces de guitarra disponibles |
| `list_guitar_tunings` | Sistemas de afinación de guitarra disponibles (estándar, drop-D, open G, DADGAD, etc.) |
| `tune_guitar` | Ajustar cualquier parámetro de cualquier voz de guitarra. Se mantiene a través de las sesiones. |
| `get_guitar_config` | Configuración actual de la voz de guitarra frente a los valores predeterminados de fábrica |
| `reset_guitar` | Restablecer la configuración de fábrica de una voz de guitarra |

### Construir

| Herramienta | Qué hace |
|------|--------------|
| `add_song` | Añadir una nueva canción como JSON |
| `import_midi` | Importar un archivo .mid con metadatos |
| `annotate_song` | Escribir la notación musical para una canción básica y convertirla en una pieza terminada. |
| `save_practice_note` | Entrada de diario con datos de sesión capturados automáticamente. |
| `read_practice_journal` | Cargar las entradas recientes para proporcionar contexto. |
| `list_keyboards` | Voces de teclado disponibles. |
| `tune_keyboard` | Ajustar cualquier parámetro de cualquier voz de teclado. Los ajustes se guardan entre sesiones. |
| `get_keyboard_config` | Configuración actual frente a los valores predeterminados de fábrica. |
| `reset_keyboard` | Restablecer una voz de teclado a los valores de fábrica. |
| `score_annotation` | Calidad de la anotación de una partitura en 5 dimensiones: exhaustividad, profundidad, especificidad, valor educativo, vocabulario. |
| `validate_song_entry` | Validar un archivo JSON de una canción contra el esquema antes de añadirlo. |
| `transpose_song` | Transponer una canción hacia arriba o hacia abajo en semitonos: nueva tonalidad, nuevas notas. |
| `list_sections` | Ver las secciones estructurales de una canción (Introducción, Verso, Estribillo, etc.). |
| `add_section` | Añadir un marcador de sección a una canción para facilitar la navegación estructural. |

### Indicaciones (Prompts) de MCP

Tres plantillas de indicaciones para flujos de trabajo de enseñanza estructurados:

| Indicación. | Qué hace |
|--------|--------------|
| `annotate_song` | Flujo de trabajo de anotación guiado: estudiar un ejemplo, escribir la notación musical para una canción básica. |
| `practice_plan` | Crear un plan de práctica estructurado basado en el género, la dificultad y los objetivos. |
| `performance_review` | Revisar una sesión completada: ¿qué funcionó bien?, ¿en qué enfocarse a continuación? |

## Interfaz de línea de comandos (CLI)

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

## Estado

v1.4.0. Seis motores de sonido, 41 herramientas de MCP, 3 plantillas de indicaciones, 120 canciones en 12 géneros con ejemplos anotados en profundidad. Transposición de canciones, marcadores de sección, silencio/solo por mano para una práctica enfocada. Editor interactivo de tablaturas de guitarra. Panel de control en el navegador con 20 presets de voz, 10 voces de instrumentos, 7 sistemas de afinación y una API de partitura orientada a modelos de lenguaje. Visualización de piano roll en dos modos de color. Diario de práctica para un aprendizaje continuo. Persistencia del estado de la sesión a través de reinicios del servidor. Partitura MIDI para tocar junto, evaluación de la calidad de la anotación y reconocimiento de patrones entre géneros. Todos los archivos MIDI están disponibles; la biblioteca crece a medida que la IA aprende.

## Seguridad y privacidad

**Datos accedidos:** biblioteca de canciones (JSON + MIDI), directorio de canciones del usuario (`~/.ai-jam-sessions/songs/`), configuraciones de afinación de guitarra, entradas del diario de práctica, dispositivo de salida de audio local.

**Datos NO accedidos:** no hay APIs en la nube, no hay credenciales de usuario, no hay datos de navegación, no hay archivos del sistema fuera del directorio de canciones del usuario. No se recopilan ni se envían datos de telemetría.

**Permisos:** El servidor de MCP utiliza únicamente el transporte stdio (sin HTTP). La CLI accede al sistema de archivos local y a los dispositivos de audio. Consulte [SECURITY.md](SECURITY.md) para obtener la política completa.

## Licencia

MIT.
