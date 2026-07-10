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
  <a href="https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions"><img src="https://img.shields.io/npm/v/@mcptoolshop/ai-jam-sessions" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/songs-120_across_12_genres-blue" alt="Songs"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/annotated-120%2F120-green" alt="Ready"></a>
  <a href="datasets/jam-actions-v0-public/README.md"><img src="https://img.shields.io/badge/dataset-jam--actions--v0%20(115_records)-8b5cf6" alt="Training dataset"></a>
  <a href="https://doi.org/10.5281/zenodo.20279919"><img src="https://zenodo.org/badge/DOI/10.5281/zenodo.20279919.svg" alt="DOI"></a>
</p>

---

## ¿Qué es esto?

Un piano y una guitarra que la IA aprende a tocar. No es un sintetizador, ni una biblioteca MIDI; es un instrumento de enseñanza.

Un LLM puede leer y escribir texto, pero no puede experimentar la música como lo hacemos nosotros. No tiene oídos, ni dedos, ni memoria muscular. AI Jam Sessions cierra esa brecha al proporcionarle al modelo sentidos que realmente puede utilizar:

- **Lectura:** partituras MIDI reales con anotaciones musicales detalladas. No son aproximaciones escritas a mano; están analizadas, interpretadas y explicadas.
- **Audición:** seis motores de audio (piano oscilador, piano de muestras, muestras vocales, tracto vocal físico, sintetizador vocal aditivo, guitarra modelada físicamente) que se reproducen a través de sus altavoces, para que las personas en la sala se conviertan en los oídos de la IA.
- **Visión:** un teclado de piano que muestra lo que se ha tocado como SVG, y el modelo puede leerlo y verificarlo. Un editor interactivo de tablaturas de guitarra. Un panel de control del navegador con un teclado visual, un editor de notas de doble modo y un laboratorio de afinación.
- **Memoria:** un diario de práctica que se mantiene a lo largo de las sesiones, para que el aprendizaje se acumule con el tiempo.
- **Canto:** síntesis del tracto vocal con 20 preajustes de voz, desde soprano operística hasta coro electrónico. Modo de canto sincronizado con solfeo, contorno y narración silábica.

Cada una de las 120 canciones ahora está completamente anotada: contexto histórico, análisis estructural barra por barra, momentos clave, objetivos de enseñanza y consejos para la interpretación, en los 12 géneros. Una versión anterior de este archivo README decía que las canciones originales estaban "esperando a que la IA absorbiera los patrones, tocara la música y escribiera sus propias anotaciones". Eso es exactamente lo que sucedió: las anotaciones fueron escritas por la IA basándose en un análisis determinista canción por canción (acordes, estructura de repetición, límites de sección, tonalidades verificadas), con una rúbrica de calidad como guía y una verificación adversarial de cada afirmación (números de compás, ventanas de acordes y recuentos estructurales, todo verificado en relación con el MIDI real antes de que se publicara nada).

A partir del mismo trabajo, también publicamos **[jam-actions-v0](#training-dataset)**: un conjunto de datos público de 115 trazas de uso de herramientas MCP en múltiples turnos sobre piano clásico real. Enseña a los LLM a realizar *un uso práctico de herramientas sobre música simbólica*, no solo generación de texto, y se entrega con una puerta de liberación de 7 ejes que distingue entre "transmitir pruebas" y "pasar porque la tarea es trivial". Consulte [Conjunto de datos de entrenamiento](#training-dataset) más abajo para obtener la información completa.

## El teclado de piano

El teclado de piano es cómo la IA ve la música. Renderiza cualquier canción como SVG: azul para la mano derecha, coral para la izquierda, con cuadrículas de compás, dinámica y límites de compás:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Dos modos de color: **mano** (azul/coral) o **clase de tono** (arcoíris cromático; cada Do es rojo, cada Fa# es cian). El formato SVG significa que el modelo puede ver la imagen y leer el marcado para verificar el tono, el ritmo y la independencia de las manos.

## El panel de control

Un estudio de composición basado en el navegador que se encuentra en este repositorio en [`apps/cockpit`](apps/cockpit) y funciona en vivo en **[mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)**. No hay complementos, ni DAW, ni instalación; todo permanece en su navegador (su trabajo se guarda automáticamente localmente). ¿Prefiere modificarlo?

```bash
cd apps/cockpit && npm install && npm run dev   # Vite dev server, opens in your browser
```

- **Transporte preciso al compás:** las notas existen en el tiempo musical, por lo que el control de BPM realmente ajusta la reproducción; una regla de tiempo con clic para buscar y arrastrar para establecer **regiones de bucle**; desplazamiento automático que sigue la cabeza de reproducción.
- **Captura con grabación activada:** toque las teclas QWERTY, el teclado en pantalla o un dispositivo Web MIDI y se guardará en la partitura: 1 compás de introducción, sobregrabación estilo secuenciador a través de ciclos de bucle (o modo de reemplazo), preservación del tiempo de interpretación original bajo una vista cuantificada, cada pasada es una unidad que se puede deshacer.
- **Deshacer/rehacer completo:** todas las ediciones, incluida Borrar e Importar, son reversibles (Ctrl+Z), con gestos de arrastre que se combinan de la manera en que lo hacen los editores reales.
- **Selección múltiple + portapapeles:** selección con herramienta Seleccionar/Dibujar, clics con modificadores estándar de la plataforma, copiar/cortar/pegar en la cabeza de reproducción, Duplicar.
- **Accesibilidad táctil:** eventos de puntero con captura en cada superficie, tocar para relocalizar como alternativa no de arrastre, edición de notas por teclado, superposiciones de partituras seguras para daltónicos.
- **Teclado de piano de doble modo:** cambie entre el modo Instrumento (colores cromáticos) y el modo Vocal (notas coloreadas según la forma de la vocal: /a/ /e/ /i/ /o/ /u/).
- **Teclado visual:** dos octavas desde Do4, asignado a su teclado QWERTY. Haga clic o escriba.
- **20 preajustes de voz:** 15 voces mapeadas por Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, más coro y sintetizador vocal), 4 voces mapeadas al tracto y una sección de coro sintético.
- **10 preajustes de instrumento:** las 6 voces de piano del lado del servidor más pad de sintetizador, órgano, campana y cuerdas.
- **Inspector de notas:** haga clic en cualquier nota para editar la velocidad, la vocal y la aspereza.
- **7 sistemas de afinación:** temperamento igual, entonación justa (mayor/menor), pitagórico, cuarto coma de intervalo, Werckmeister III o desplazamientos de centavos personalizados. Referencia A4 ajustable (392–494 Hz).
- **Auditoría de afinación:** tabla de frecuencias, probador de intervalos con análisis de frecuencia de batimiento y exportación/importación de afinación.
- **Importación/exportación de partituras:** serialice toda la partitura como JSON y cárguela.
- **API orientada a LLM:** `window.__cockpit` expone `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` y `getScore()` para que un LLM pueda componer, arreglar y reproducir de forma programática.

## El ciclo de aprendizaje

<p align="center">
  <img src="docs/learning-loop.svg" alt="The learning loop: Read (MIDI + annotations) → Play (six sound engines) → See (piano roll · guitar tab) → Reflect (practice journal), with the journal persisting so the next session picks up where the last left off" width="100%" />
</p>

## La biblioteca de canciones

120 canciones en 12 géneros, creadas a partir de archivos MIDI reales. Cada género tiene un ejemplo profundamente anotado, con contexto histórico, análisis armónico barra por barra, momentos clave, objetivos de enseñanza y consejos para la interpretación (incluida la guía vocal). Estos ejemplos sirven como plantillas: la IA estudia uno y luego anota el resto.

| Género | Ejemplo | Clave | Lo que enseña |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | Si menor | Forma de blues menor, llamada y respuesta, tocar después del ritmo |
| Clásica | Für Elise (Beethoven) | La menor | Forma de rondó, diferenciación del tacto, disciplina en el uso del pedal |
| Película | Comptine d'un autre été (Tiersen) | Mi menor | Texturas con arpegios, arquitectura dinámica sin cambio armónico |
| Folclórica | Greensleeves | Mi menor | Sensación de vals en 3/4, mezcla modal, estilo vocal renacentista |
| Jazz | Autumn Leaves (Kosma) | Sol menor | Progresiones ii-V-I, tonos guía, corcheas con swing, acordes sin fundamental |
| Latina | The Girl from Ipanema (Jobim) | Fa mayor | Ritmo de bossa nova, modulación cromática, moderación vocal |
| New-Age | River Flows in You (Yiruma) | La mayor | Reconocimiento I-V-vi-IV, arpegios fluidos, rubato |
| Pop | Imagine (Lennon) | Do mayor | Acompañamiento con arpegios, moderación, sinceridad vocal |
| Ragtime | The Entertainer (Joplin) | Do mayor | Bajo "oom-pah", síncopa, forma multiestrófica, disciplina en el tempo |
| R&B | Superstition (Stevie Wonder) | Mi bemol menor | Funk con semicorcheas, teclado percusivo, notas fantasma |
| Rock | Your Song (Elton John) | Mi bemol mayor | Conducción de la voz en una balada para piano, inversiones, canto conversacional |
| Soul | Lean on Me (Bill Withers) | Do mayor | Melodía diatónica, acompañamiento gospel, llamada y respuesta |

Las canciones progresan desde **crudas** (solo MIDI) → **anotadas** → **listas** (totalmente reproducibles con lenguaje musical). La IA promueve las canciones estudiándolas y escribiendo anotaciones con `annotate_song`.

## Motores de sonido

Seis motores, más un combinador en capas que ejecuta dos simultáneamente:

| Motor | Tipo | Cómo suena |
|--------|------|---------------------|
| **Oscillator Piano** | Síntesis aditiva | Piano multiarmónico con ruido de martillo, inarmonicidad, polifonía de 48 voces, imagen estéreo. Cero dependencias. |
| **Sample Piano** | Reproducción de WAV | Salamander Grand Piano: 480 muestras, 16 capas de velocidad, 88 teclas. Lo real. *Solo API programática: las muestras no se incluyen (usted proporciona la descarga de [Salamander](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html)); aún no está conectado a las listas de motores CLI/MCP.* |
| **Vocal (Sample)** | Muestras con cambio de tono | Tonos vocales sostenidos con portamento y modo legato. |
| **Vocal Tract** | Modelo físico | Pink Trombone: forma de onda glotal LF a través de una guía de ondas digital de 44 celdas. Cuatro preajustes: soprano, alto, tenor, bajo. |
| **Vocal Synth** | Síntesis aditiva | 15 preajustes de voz Kokoro con modelado de formantes, aspereza, vibrato. Determinista (RNG sembrado). |
| **Guitar** | Síntesis aditiva | Cuerda pulsada modelada físicamente: 4 preajustes (dreadnought de acero, clásica de nailon, archtop de jazz, de doce cuerdas), 8 afinaciones, 17 parámetros ajustables. |
| **Layered** | Combinador | Envuelve dos motores y envía cada evento MIDI a ambos: piano + sintetizador, voz + sintetizador, etc. |

### Voces de teclado

Seis voces de piano ajustables, cada una ajustable por parámetro (brillo, decaimiento, dureza del martillo, desafinación, amplitud estéreo y más):

| Voz | Característica |
|-------|-----------|
| Concert Grand | Rica, completa, clásica |
| Upright | Cálida, íntima, folclórica |
| Electric Piano | Sedosa, jazzística, con la sensación de un Fender Rhodes |
| Honky-Tonk | Desafinada, ragtime, de salón |
| Music Box | Cristalina, etérea |
| Bright Grand | Impactante, contemporánea, pop |

### Voces de guitarra

Cuatro preajustes de voz de guitarra con síntesis de cuerdas modelada físicamente, cada uno con 17 parámetros ajustables (brillo, resonancia del cuerpo, posición de pulsación, amortiguación de la cuerda y más):

| Voz | Característica |
|-------|-----------|
| Steel Dreadnought | Brillante, equilibrada, acústica clásica |
| Nylon Classical | Cálida, suave, redondeada |
| Jazz Archtop | Suave, amaderada, limpia |
| Twelve-String | Brillante, duplicada, similar a un coro |

## El diario de práctica

Después de cada sesión, el servidor captura lo que sucedió: qué canción, qué velocidad, cuántas medidas, cuánto duró. La IA añade sus propias reflexiones: lo que notó, qué patrones reconoció, qué probar a continuación.

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

Un archivo Markdown por día, almacenado en `~/.ai-jam-sessions/journal/`. Legible para humanos, solo se añaden datos. En la siguiente sesión, la IA lee su diario y continúa donde lo dejó.

## Conjunto de datos de entrenamiento

**jam-actions-v0**: un conjunto de datos público de trazas de uso de herramientas MCP multivuelta basadas en MIDI reales de piano clásico. Creado a partir de la misma biblioteca con la que este servidor enseña, el conjunto de datos enseña a los LLM a realizar **un uso fundamentado de las herramientas sobre música simbólica**, no solo generación de texto.

Cada registro asocia una sección de cuatro compases con un objetivo pedagógico anotado y un *registro del objetivo*, es decir, una sesión paso a paso en la que un asistente utiliza las herramientas MCP mencionadas anteriormente (`get_events_in_measure`, `get_events_in_hand`, `count_distinct_pitch_classes` y el resto de las 9 herramientas del conjunto MIDI inspector) para leer, analizar y comentar sobre la sección.

| | |
|---|---|
| **DOI** | [**`10.5281/zenodo.20279919`**](https://doi.org/10.5281/zenodo.20279919) — Zenodo, publicado el 19 de mayo de 2026 |
| Registros | 115 (subconjunto público) |
| Línea base canónica | E3 post-reparación de 16 registros |
| Composiciones | 8 obras clásicas para piano de 6 compositores (Bach, Beethoven, Chopin, Debussy, Mozart, Schumann) |
| MIDI original | piano-midi.de — arreglos de Bernd Krueger |
| Licencia | CC-BY-SA-3.0-DE (arreglos) sobre composiciones de dominio público |
| Versión | 0.4.3 (2026-05-19) |
| Esquema | `release-gate-assessment/2.0.0` |

**Historia de calidad: la puerta de liberación de 7 ejes.** El conjunto de datos incluye una puerta de liberación que distingue entre el razonamiento basado en evidencia y el rendimiento saturado. Los ejes 1 a 6 son limitantes (umbral absoluto, margen compuesto, tasa de uso de herramientas, corrección después del uso de la herramienta, recuento de interpretaciones erróneas, umbral inferior); el eje 7 es enriquecido frente a no informado. Los ejes 2 y 6 admiten un grupo `ceiling_saturated_pass`, por lo que los registros que obtienen una puntuación de 1.000 en las condiciones de solo texto / inspección con herramientas / MIDI aleatorio no diluyen los estratos más difíciles. La línea base del Slice 22 **APRUEBA** la puerta revisada. La línea base del Slice 19 aún **NO LA APRUEBA**, y se conserva como un diagnóstico de regresión para que la puerta sea efectiva.

**Reproducibilidad.** Un colaborador nuevo en cualquier plataforma (Windows nativo, macOS, Linux, WSL) puede verificar el paquete y reproducir el resultado PASS canónico en menos de un minuto:

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions && pnpm install
pnpm exec tsx scripts/verify-public-package-checksums.ts        # 274 entries, ~2s
pnpm exec tsx scripts/check-release-gate.ts \
  datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json
# → "Aggregate: PASS" (exit 0)
```

`.gitattributes` fija los finales de línea LF para `*.sha256` y el árbol del conjunto de datos público, por lo que el verificador de sumas de comprobación funciona en todas las plataformas. La CLI de la puerta de liberación es estrictamente posicional (rechaza argumentos posicionales desconocidos o múltiples), por lo que los colaboradores que comienzan no pueden invocarla incorrectamente sin darse cuenta.

**Dónde encontrarlo.** El registro publicado en Zenodo está disponible en https://zenodo.org/records/20279919 (DOI: [`10.5281/zenodo.20279919`](https://doi.org/10.5281/zenodo.20279919)), y el conjunto de datos está replicado en Hugging Face en [`mcp-tool-shop/jam-actions-v0`](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0) para los usuarios de `load_dataset()`. La tarjeta completa del conjunto de datos está disponible en [`datasets/jam-actions-v0-public/README.md`](datasets/jam-actions-v0-public/README.md). Los metadatos de depósito de Zenodo están disponibles en [`zenodo-metadata.json`](datasets/jam-actions-v0-public/zenodo-metadata.json), los metadatos de citación en [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff), el recibo de publicación en [`publication-receipt.json`](datasets/jam-actions-v0-public/publication-receipt.json) y las notas de la versión en [`RELEASE_NOTES.md`](datasets/jam-actions-v0-public/RELEASE_NOTES.md). El arco de construcción de 25 secciones, desde el borrador inicial del corpus hasta la corrección de un error, la remediación de Schumann, la revisión de la puerta RC, la auditoría de "operador solo" y la ejecución de la publicación, se encuentra en [`docs/`](docs/).

**Cítelo.** `mcp-tool-shop-org & Krueger, B. (2026). AI Jam Sessions — Tool-Use Traces v0 (Public Subset). Zenodo. https://doi.org/10.5281/zenodo.20279919`

**Espejo de HuggingFace.** Se incluirá en un parche v1.4.x; consulte [`datasets/jam-actions-v0-public/publication-receipt.json`](datasets/jam-actions-v0-public/publication-receipt.json) para el bloque de estado diferido. El DOI de Zenodo es el identificador de citación canónico; el espejo de HF es solo para el descubrimiento en el ecosistema de ML.

> Los arreglos MIDI son obra de Bernd Krueger (piano-midi.de), con licencia CC-BY-SA-3.0-DE. Las anotaciones, los registros y los artefactos de evaluación son del equipo de AI Jam Sessions, publicados bajo la misma licencia para preservar la cadena de "compartir por igual" de principio a fin. **Límite de licencia:** la licencia MIT del repositorio cubre el código; todo lo que se encuentra en `datasets/` tiene una licencia CC-BY-SA-3.0-DE. El corpus de trabajo en `datasets/jam-actions-v0/` contiene además dos obras (Satie Gymnopédie No. 1, Debussy Arabesque No. 1) que están *excluidas* del subconjunto publicado porque no se pudo verificar la procedencia de su arreglo; consulte [`datasets/jam-actions-v0/PROVENANCE-NOTE.md`](datasets/jam-actions-v0/PROVENANCE-NOTE.md).

## Instalar

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

Requiere **Node.js 18+**. No se necesitan controladores MIDI, puertos virtuales ni software externo.

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

46 herramientas y 3 plantillas de indicaciones en siete categorías:

### Aprender

| Herramienta | Qué hace |
|------|--------------|
| `list_songs` | Navegar por género, dificultad o palabra clave |
| `song_info` | Análisis musical completo: estructura, momentos clave, objetivos pedagógicos, consejos de estilo |
| `registry_stats` | Estadísticas en toda la biblioteca: número total de canciones, géneros, dificultades |
| `list_measures` | Notas, dinámica y notas pedagógicas de cada compás |
| `teaching_note` | Análisis profundo de un solo compás: digitación, dinámica, contexto |
| `suggest_song` | Recomendación basada en el género, la dificultad y lo que ha tocado |
| `practice_setup` | Velocidad, modo, configuración de voz y comando CLI recomendados para una canción |
| `compare_songs` | Reconocimiento de patrones entre géneros: relaciones clave, similitud de tono/intervalo, formas compartidas, conexiones pedagógicas |
| `annotation_progress` | Seguimiento de la calidad de las anotaciones en toda la biblioteca: puntuaciones, calificaciones y sugerencias de mejora |
| `server_info` | Versión del servidor, estadísticas de la biblioteca, lista de motores, sesión activa |

### Reproducir

| Herramienta | Qué hace |
|------|--------------|
| `play_song` | Reproduce la música a través de los altavoces: canciones de la biblioteca o archivos .mid sin procesar. Cuatro motores (piano, voz, viento, guitarra), cualquier velocidad, modo, rango de compases, además de un metrónomo con conteo inicial y una marca `record` que captura la sesión para la evaluación. El sintetizador y los motores en capas solo están disponibles a través de la línea de comandos. |
| `stop_playback` | Detener |
| `pause_playback` | Pausar o reanudar |
| `set_speed` | Cambiar la velocidad durante la reproducción (0,1×–4,0×) |
| `playback_status` | Instantánea en tiempo real: compás actual, tempo, velocidad, voz del teclado, estado |
| `view_piano_roll` | Renderizar como SVG (color de las notas o arco iris cromático de clases de altura) |
| `score_performance` | Evaluar una pieza MIDI para tocarla junto con la música: precisión de la afinación, ritmo, integridad, con retroalimentación gradual |
| `mute_hand` | Silenciar o reactivar la mano izquierda/derecha durante la práctica: aislar una mano a la vez |
| `detect_chord` | Identificar el acorde a partir de un conjunto de notas MIDI que suenan actualmente (por ejemplo, `[60,64,67]` → C) |
| `preview_teaching_cues` | Ver todas las notas y los momentos clave antes de tocar |

### Practicar

| Herramienta | Qué hace |
|------|--------------|
| `practice_loop` | El ejercicio que un profesor real asignaría: repetir los compases 5–8 más lentamente, y el tempo aumenta (+5%) solo después de una ejecución *correcta*; cada ejecución se registra, evalúa y resume. |
| `practice_status` | Estado del ejercicio: ejecución actual, velocidad y diagnóstico por compás de la última interpretación |
| `score_last_take` | Evaluar la interpretación más reciente registrada: precisión de la afinación, ritmo, integridad, veredicto por nota |
| `view_scored_piano_roll` | La partitura anotada que utiliza todo profesor: el piano roll superpuesto con los veredictos por nota en una paleta segura para personas con daltonismo (sólido = correcto, punteado = ritmo, ✕ = error) |

### Cantar

| Herramienta | Qué hace |
|------|--------------|
| `sing_along` | Texto cantable: nombres de las notas, solfeo, contorno o sílabas. Con o sin acompañamiento de piano. |
| `ai_jam_sessions` | Generar una guía para improvisar: progresión de acordes, esquema de la melodía e indicaciones de estilo para la reinterpretación |

### Guitarra

| Herramienta | Qué hace |
|------|--------------|
| `view_guitar_tab` | Renderizar tablatura interactiva de guitarra como HTML: haga clic para editar, cursor de reproducción, atajos de teclado |
| `list_guitar_voices` | Presets de voz de guitarra disponibles |
| `list_guitar_tunings` | Sistemas de afinación de guitarra disponibles (estándar, Drop-D, Open G, DADGAD, etc.) |
| `tune_guitar` | Ajustar cualquier parámetro de cualquier voz de guitarra. Se mantiene entre sesiones. |
| `get_guitar_config` | Configuración actual de la voz de guitarra frente a los valores predeterminados de fábrica |
| `reset_guitar` | Restablecer una voz de guitarra a los valores de fábrica |

### Crear

| Herramienta | Qué hace |
|------|--------------|
| `add_song` | Agregar una nueva canción como JSON |
| `import_midi` | Importar un archivo .mid con metadatos |
| `annotate_song` | Escribir lenguaje musical para una canción sin procesar y prepararla |
| `save_practice_note` | Entrada de diario con datos de sesión capturados automáticamente |
| `read_practice_journal` | Cargar entradas recientes para obtener contexto |
| `list_keyboards` | Voces de teclado disponibles |
| `tune_keyboard` | Ajustar cualquier parámetro de cualquier voz de teclado. Se mantiene entre sesiones. |
| `get_keyboard_config` | Configuración actual frente a los valores predeterminados de fábrica |
| `reset_keyboard` | Restablecer una voz de teclado a los valores de fábrica |
| `score_annotation` | Calidad de la anotación de la partitura en 5 dimensiones: integridad, profundidad, especificidad, valor didáctico, vocabulario |
| `validate_song_entry` | Validar un archivo JSON de canción con respecto al esquema antes de agregarlo |
| `transpose_song` | Transponer una canción hacia arriba o hacia abajo por semitonos: nueva tonalidad, nuevas notas |
| `list_sections` | Ver las secciones estructurales de una canción (Introducción, Estrofa, Coro, etc.) |
| `add_section` | Agregar un marcador de sección a una canción para la navegación estructural |

### Indicaciones MCP

Tres plantillas de indicaciones para flujos de trabajo didácticos estructurados:

| Indicación | Qué hace |
|--------|--------------|
| `annotate_song` | Flujo de trabajo guiado de anotación: estudiar un ejemplo, escribir lenguaje musical para una canción sin procesar |
| `practice_plan` | Crear un plan de práctica estructurado basado en el género, la dificultad y los objetivos |
| `performance_review` | Revisar una sesión completada: qué salió bien, en qué hay que centrarse a continuación |

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

## Estado

v1.5.0: la versión en la que aprendió a enseñar (ver [CHANGELOG](CHANGELOG.md)). Seis motores de sonido, 46 herramientas MCP, 3 plantillas de indicaciones y una **biblioteca totalmente anotada: 120/120 canciones de 12 géneros**, cada anotación basada en el análisis por canción y con control de calidad. El ciclo de enseñanza está cerrado de principio a fin: metrónomo con conteo inicial → grabación en vivo → evaluación por nota → piano roll anotado → bucles de práctica que aumentan el tempo solo después de ejecuciones correctas. La interfaz del navegador se convirtió en una herramienta de composición real: transporte preciso al ritmo con regiones de bucle, captura con activación de grabación, deshacer/rehacer completo, selección múltiple y portapapeles, soporte táctil; y está [disponible en la web](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/). Transposición de canciones, marcadores de sección, silencio/solo por mano, tablatura interactiva de guitarra, 7 sistemas de afinación, diario de práctica, persistencia de la sesión.

También se publica **[jam-actions-v0](#training-dataset)**: un conjunto de datos de entrenamiento de 115 registros de rastros de uso de herramientas MCP en múltiples turnos para piano clásico, con una puerta de lanzamiento de 7 ejes, reproducibilidad de inicio en frío y metadatos completos de Zenodo + CITATION.cff (CC-BY-SA-3.0-DE); ahora también se replica en [Hugging Face](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0). 2506 pruebas superadas en el servidor MCP + interfaz + paquetes de conjuntos de datos + arneses de evaluación + validador de puerta de lanzamiento. Todo el MIDI está ahí, cada canción puede enseñar y el corpus de ese aprendizaje se incluye con ella.

## Seguridad y privacidad

**Datos accedidos:** biblioteca de canciones (JSON + MIDI), directorio de canciones del usuario (`~/.ai-jam-sessions/songs/`), configuraciones de afinación de guitarra, entradas del diario de práctica, dispositivo de salida de audio local.

**Datos NO accedidos (rutas predeterminadas):** el servidor MCP y la CLI no realizan llamadas a la red, no leen credenciales ni acceden a archivos del sistema fuera del directorio de canciones del usuario. No se recopila ni se envía ninguna telemetría. La **herramienta de conjunto de datos/evaluación opcional** incluida en el mismo paquete (`scripts/run-llm-eval.ts`, verificador de procedencia) es la única excepción: cuando la invoca explícitamente, puede llamar a las API de LLM (lee `ANTHROPIC_API_KEY` de su entorno, nunca lo almacena) y obtener URL de procedencia. Nunca se ejecuta como parte del servidor, la CLI o la instalación.

**Permisos:** El servidor MCP utiliza únicamente el transporte stdio (no HTTP). La interfaz de línea de comandos accede al sistema de archivos local y a los dispositivos de audio. Consulte [SECURITY.md](SECURITY.md) para conocer la política completa.

## Licencia

MIT
