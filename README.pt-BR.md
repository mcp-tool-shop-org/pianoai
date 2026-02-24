<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <strong>Português</strong>
</p>

<p align="center">
  <img src="logo-banner.png" alt="AI Jam Sessions" width="520" />
</p>

<p align="center">
  <em>Machine Learning do jeito antigo</em>
</p>

<p align="center">
  Um servidor MCP que ensina IA a tocar piano e violão — e a cantar.<br/>
  120 músicas em 12 gêneros. Seis motores de som. Tablatura de violão interativa.<br/>
  Um cockpit no navegador com sintetizador vocal. Um diário de prática que lembra de tudo.
</p>

[![CI](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@mcptoolshop/ai-jam-sessions)](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions)
[![Songs](https://img.shields.io/badge/songs-120_across_12_genres-blue)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)
[![Ready](https://img.shields.io/badge/annotated-24-green)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)

---

## O que é isso?

Um piano e um violão que a IA aprende a tocar. Não é um sintetizador, não é uma biblioteca MIDI — é um instrumento pedagógico.

Um LLM pode ler e escrever texto, mas não pode vivenciar a música como nós. Sem ouvidos, sem dedos, sem memória muscular. AI Jam Sessions fecha essa lacuna dando ao modelo sentidos que ele pode realmente usar:

- **Ler** — partituras MIDI reais com anotações musicais profundas. Não aproximações escritas à mão — analisadas, processadas e explicadas.
- **Ouvir** — seis motores de áudio (piano oscilador, piano amostrado, amostras vocais, trato vocal físico, síntese aditiva vocal, violão fisicamente modelado) que tocam pelos alto-falantes. Os humanos na sala se tornam os ouvidos da IA.
- **Ver** — um piano roll que renderiza o que foi tocado como SVG que o modelo pode reler e verificar. Um editor de tablatura de violão interativo. Um cockpit no navegador com teclado visual, editor de notas dual e laboratório de afinação.
- **Lembrar** — um diário de prática que persiste entre sessões. O aprendizado se acumula.
- **Cantar** — síntese de trato vocal com 20 presets de voz, do soprano operístico ao coro eletrônico. Modo cante-junto com solfejo, contorno e narração silábica.

Cada um dos 12 gêneros tem um exemplar ricamente anotado — uma peça de referência com contexto histórico, análise estrutural compasso a compasso, momentos-chave, objetivos pedagógicos e dicas de interpretação. As outras 96 músicas são MIDI bruto, esperando que a IA absorva os padrões, toque a música e escreva suas próprias anotações.

## O Piano Roll

O piano roll é como a IA vê a música. Ele renderiza qualquer música como SVG — azul para a mão direita, coral para a esquerda, com grades de tempo, dinâmicas e limites de compasso:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll de Para Elisa compassos 1-8" width="100%" />
</p>

<p align="center"><em>Para Elisa, compassos 1–8 — o trinado E5-D#5 em azul, acompanhamento grave em coral</em></p>

Dois modos de cor: **mão** (azul/coral) ou **classe de altura** (arco-íris cromático — todo Dó é vermelho, todo Fá# é ciano). O formato SVG significa que o modelo pode ver a imagem e ler a marcação para verificar altura, ritmo e independência das mãos.

## O Cockpit

Um instrumento e estúdio vocal no navegador que abre junto com o servidor MCP. Sem plugins, sem DAW — apenas uma página web com um piano.

- **Piano roll de modo duplo** — alternar entre modo Instrumento (cores cromáticas por classe de altura) e modo Vocal (notas coloridas por forma vocálica: /a/ /e/ /i/ /o/ /u/)
- **Teclado visual** — duas oitavas a partir de C4, mapeado no teclado QWERTY. Clique ou digite.
- **20 presets de voz** — 15 vozes Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, choir, synth-vox), 4 vozes de trato e uma seção coral sintética
- **10 presets de instrumento** — as 6 vozes de piano do servidor mais synth-pad, organ, bell e strings
- **Inspetor de notas** — clique em qualquer nota para editar velocidade, vogal e respiração
- **7 sistemas de afinação** — temperamento igual, entonação justa (maior/menor), pitagórico, mesotônico de quarto de coma, Werckmeister III, ou offsets em cents personalizados. Referência Lá4 ajustável (392–494 Hz).
- **Auditoria de afinação** — tabela de frequências, testador de intervalos com análise de frequência de batimento, importação/exportação de afinação
- **Importar/exportar partitura** — serializa a partitura inteira como JSON e recarrega
- **API para LLM** — `window.__cockpit` expõe `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` e `getScore()` para composição programática

## O Ciclo de Aprendizado

```
 Ler                 Tocar               Ver                 Refletir
┌──────────┐     ┌───────────┐     ┌────────────┐     ┌──────────────┐
│ Estudar   │     │ Tocar a   │     │ Ver o      │     │ Escrever o   │
│ a análise │ ──▶ │ música em │ ──▶ │ piano roll │ ──▶ │ que aprendeu │
│ do        │     │ qualquer  │     │ para       │     │ no diário    │
│ exemplar  │     │ velocidade│     │ verificar  │     │              │
└──────────┘     └───────────┘     └────────────┘     └──────┬───────┘
                                                             │
                                                             ▼
                                                    ┌──────────────┐
                                                    │ A próxima    │
                                                    │ sessão       │
                                                    │ começa aqui  │
                                                    └──────────────┘
```

## Biblioteca de Músicas

120 músicas em 12 gêneros, construídas a partir de arquivos MIDI reais. Cada gênero tem um exemplar profundamente anotado — com contexto histórico, análise harmônica compasso a compasso, momentos-chave, objetivos pedagógicos e dicas de interpretação (incluindo guia vocal). Esses exemplares servem como modelos: a IA estuda um, depois anota o resto.

| Gênero | Exemplar | Tonalidade | O que ensina |
|--------|----------|------------|--------------|
| Blues | The Thrill Is Gone (B.B. King) | Si menor | Forma blues menor, chamada e resposta, tocar atrás do beat |
| Clássica | Para Elisa (Beethoven) | Lá menor | Forma rondó, diferenciação de toque, disciplina de pedal |
| Cinema | Comptine d'un autre été (Tiersen) | Mi menor | Texturas arpejadas, arquitetura dinâmica sem mudança harmônica |
| Folk | Greensleeves | Mi menor | Valsa em 3/4, mistura modal, estilo vocal renascentista |
| Jazz | Autumn Leaves (Kosma) | Sol menor | Progressões ii-V-I, notas-guia, colcheias swing, voicings sem fundamental |
| Latin | Garota de Ipanema (Jobim) | Fá maior | Ritmo de bossa nova, modulação cromática, contenção vocal |
| New-Age | River Flows in You (Yiruma) | Lá maior | Reconhecimento I-V-vi-IV, arpejos fluidos, rubato |
| Pop | Imagine (Lennon) | Dó maior | Acompanhamento arpejado, contenção, sinceridade vocal |
| Ragtime | The Entertainer (Joplin) | Dó maior | Baixo oom-pah, síncope, forma multi-strain, disciplina de tempo |
| R&B | Superstition (Stevie Wonder) | Mib menor | Funk em semicolcheias, teclado percussivo, notas fantasma |
| Rock | Your Song (Elton John) | Mib maior | Condução de vozes em balada de piano, inversões, canto conversacional |
| Soul | Lean on Me (Bill Withers) | Dó maior | Melodia diatônica, acompanhamento gospel, chamada e resposta |

As músicas progridem de **raw** (apenas MIDI) → **annotated** → **ready** (totalmente executável com linguagem musical). A IA promove músicas estudando-as e escrevendo anotações com `annotate_song`.

## Motores de Som

Seis motores mais um combinador em camadas que executa dois simultaneamente:

| Motor | Tipo | Som |
|-------|------|-----|
| **Piano Oscilador** | Síntese aditiva | Piano multi-harmônico com ruído de martelo, inarmonicidade, polifonia de 48 vozes, imagem estéreo. Zero dependências. |
| **Piano Amostrado** | Reprodução WAV | Salamander Grand Piano — 480 amostras, 16 camadas de velocidade, 88 teclas. O autêntico. |
| **Vocal (Amostras)** | Amostras com pitch-shift | Tons vocálicos sustentados com portamento e modo legato. |
| **Trato Vocal** | Modelo físico | Pink Trombone — onda glotal LF através de um guia de onda digital de 44 células. Quatro presets: soprano, contralto, tenor, baixo. |
| **Síntese Vocal** | Síntese aditiva | 15 presets vocais Kokoro. Modelagem de formantes, respiração, vibrato. Determinístico (RNG com semente). |
| **Violão** | Síntese aditiva | Corda dedilhada fisicamente modelada — 4 presets (aço dreadnought, clássico nylon, jazz archtop, doze cordas), 8 afinações, 17 parâmetros ajustáveis. |
| **Em Camadas** | Combinador | Envolve dois motores e despacha cada evento MIDI para ambos — piano+synth, vocal+synth, etc. |

### Vozes de Teclado

Seis vozes de piano ajustáveis, cada uma configurável por parâmetro (brilho, decaimento, dureza do martelo, desafinação, largura estéreo e mais):

| Voz | Caráter |
|-----|---------|
| Concert Grand | Rico, pleno, clássico |
| Upright | Quente, íntimo, folk |
| Electric Piano | Sedoso, jazzístico, estilo Fender Rhodes |
| Honky-Tonk | Desafinado, ragtime, saloon |
| Music Box | Cristalino, etéreo |
| Bright Grand | Cortante, contemporâneo, pop |

### Vozes de Violão

Quatro presets de violão com síntese de cordas fisicamente modelada, cada um com 17 parâmetros ajustáveis (brilho, ressonância do corpo, posição do dedilhado, amortecimento das cordas e mais):

| Voz | Caráter |
|-----|--------|
| Steel Dreadnought | Brilhante, equilibrado, acústico clássico |
| Nylon Classical | Quente, suave, arredondado |
| Jazz Archtop | Suave, amadeirado, limpo |
| Twelve-String | Cintilante, dobrado, efeito coro |

## O Diário de Prática

Após cada sessão, o servidor registra o que aconteceu — qual música, que velocidade, quantos compassos, quanto tempo. A IA adiciona suas próprias reflexões: o que notou, que padrões reconheceu, o que tentar em seguida.

```markdown
---
### 14:32 — Autumn Leaves
**jazz** | intermediate | Sol menor | 69 BPM × 0.7 | 32/32 compassos | 45s

O ii-V-I nos compassos 5-8 (Cm7-F7-SibMaj7) tem a mesma gravidade
que o V-i em The Thrill Is Gone, só que em maior. Blues e jazz
compartilham mais do que os rótulos de gênero sugerem.

Próxima: tentar em velocidade máxima. Comparar a modulação da
ponte de Ipanema com esta.
---
```

Um arquivo markdown por dia, armazenado em `~/.ai-jam-sessions/journal/`. Legível por humanos, apenas adição. Na próxima sessão, a IA lê seu diário e retoma de onde parou.

## Instalação

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

Requer **Node.js 18+**. Sem drivers MIDI, sem portas virtuais, sem software externo.

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

## Ferramentas MCP

31 ferramentas em cinco categorias:

### Aprender

| Ferramenta | Função |
|------------|--------|
| `list_songs` | Navegar por gênero, dificuldade ou palavra-chave |
| `song_info` | Análise musical completa — estrutura, momentos-chave, objetivos pedagógicos, dicas de estilo |
| `registry_stats` | Estatísticas de toda a biblioteca |
| `library_progress` | Status de anotação em todos os gêneros |
| `list_measures` | Notas, dinâmicas e notas pedagógicas de cada compasso |
| `teaching_note` | Detalhamento de um compasso — dedilhado, dinâmicas, contexto |
| `suggest_song` | Recomendação baseada em gênero, dificuldade e histórico |
| `practice_setup` | Velocidade, modo, configuração de voz e comando CLI recomendados |

### Tocar

| Ferramenta | Função |
|------------|--------|
| `play_song` | Tocar pelos alto-falantes — músicas da biblioteca ou arquivos .mid |
| `stop_playback` | Parar |
| `pause_playback` | Pausar ou retomar |
| `set_speed` | Mudar velocidade durante a reprodução (0.1×–4.0×) |
| `playback_status` | Snapshot em tempo real: compasso atual, tempo, velocidade, voz do teclado, estado |
| `view_piano_roll` | Renderizar como SVG (cor por mão ou arco-íris cromático por classe de altura) |

### Cantar

| Ferramenta | Função |
|------------|--------|
| `sing_along` | Texto cantável — nomes de notas, solfejo, contorno ou sílabas. Com ou sem acompanhamento de piano |
| `ai_jam_sessions` | Gerar um brief de jam — progressão de acordes, esboço melódico e dicas de estilo |

### Violão

| Ferramenta | Função |
|------------|--------|
| `view_guitar_tab` | Tablatura de violão interativa em HTML — edição por clique, cursor de reprodução, atalhos de teclado |
| `list_guitar_voices` | Presets de voz de violão disponíveis |
| `list_guitar_tunings` | Sistemas de afinação de violão disponíveis (padrão, drop-D, open G, DADGAD, etc.) |
| `tune_guitar` | Ajustar qualquer parâmetro de qualquer voz de violão. Persiste entre sessões |
| `get_guitar_config` | Configuração atual da voz de violão vs valores de fábrica |
| `reset_guitar` | Restaurar uma voz de violão para fábrica |

### Construir

| Ferramenta | Função |
|------------|--------|
| `add_song` | Adicionar nova música como JSON |
| `import_midi` | Importar arquivo .mid com metadados |
| `annotate_song` | Escrever linguagem musical para uma música bruta e promovê-la para ready |
| `save_practice_note` | Entrada de diário com captura automática de dados de sessão |
| `read_practice_journal` | Carregar entradas recentes |
| `list_keyboards` | Vozes de teclado disponíveis |
| `tune_keyboard` | Ajustar qualquer parâmetro de qualquer voz. Persiste entre sessões |
| `get_keyboard_config` | Configuração atual vs padrões de fábrica |
| `reset_keyboard` | Restaurar uma voz de teclado aos padrões de fábrica |

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

## Status

v0.3.0. Seis motores de som, 31 ferramentas MCP, 120 músicas em 12 gêneros com exemplares profundamente anotados. Editor de tablatura de violão interativo. Cockpit no navegador com 20 presets vocais, 10 vozes de instrumento, 7 sistemas de afinação e uma API de partitura para LLM. Visualização piano roll em dois modos de cor. Diário de prática persistente. O MIDI está completo — a biblioteca cresce conforme a IA aprende. Cockpit no navegador com 20 presets vocais, 10 vozes de instrumento, 7 sistemas de afinação e uma API de partitura para LLM. Visualização de piano roll em dois modos de cor. Diário de prática persistente. O MIDI está todo pronto — a biblioteca cresce conforme a IA aprende.

## Licença

MIT
