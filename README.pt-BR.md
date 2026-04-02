<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
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
[![Músicas](https://img.shields.io/badge/músicas-120_em_12_gêneros-blue)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)
[![Pronto](https://img.shields.io/badge/annotado-24-green)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)

---

## O que é isso?

Um piano e uma guitarra que a IA aprende a tocar. Não é um sintetizador, nem uma biblioteca MIDI — é um instrumento de aprendizado.

Um LLM (Large Language Model - Modelo de Linguagem Grande) pode ler e escrever texto, mas não pode experimentar a música da mesma forma que nós. Não tem ouvidos, dedos, nem memória muscular. O AI Jam Sessions (Sessões de Música da IA) preenche essa lacuna, fornecendo ao modelo sentidos que ele realmente pode usar:

- **Leitura** — partituras MIDI reais com anotações musicais detalhadas. Não são aproximações manuscritas — são analisadas, interpretadas e explicadas.
- **Audição** — seis motores de áudio (piano oscilador, piano de amostras, amostras vocais, trato vocal físico, sintetizador vocal aditivo, guitarra modelada fisicamente) que tocam pelos seus alto-falantes, permitindo que os humanos no ambiente se tornem os "ouvidos" da IA.
- **Visualização** — uma representação gráfica da música (piano roll) que renderiza o que foi tocado em formato SVG, que o modelo pode ler e verificar. Um editor de tablaturas de guitarra interativo. Um painel de controle (cockpit) no navegador com um teclado visual, editor de notas em dois modos e um laboratório de afinação.
- **Memória** — um diário de prática que persiste entre as sessões, permitindo que o aprendizado se acumule ao longo do tempo.
- **Canto** — síntese do trato vocal com 20 predefinições de voz, desde soprano lírico até coral eletrônico. Modo de acompanhamento com narração de notas, contornos e sílabas.

Cada um dos 12 gêneros possui um exemplo ricamente anotado — uma peça de referência que a IA estuda primeiro, com contexto histórico, análise estrutural detalhada, momentos-chave, objetivos de aprendizado e dicas de performance. As outras 96 músicas são arquivos MIDI brutos, esperando que a IA absorva os padrões, toque a música e escreva suas próprias anotações.

## A Representação Gráfica da Música (Piano Roll)

A representação gráfica da música é a forma como a IA "vê" a música. Ela renderiza qualquer música em formato SVG — azul para a mão direita, coral para a mão esquerda, com grades de tempo, dinâmica e limites de compasso:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Dois modos de cores: **mão** (azul/coral) ou **classe de afinação** (arco-íris cromático — todo o Dó é vermelho, todo o F# é ciano). O formato SVG permite que o modelo tanto veja a imagem quanto leia as informações para verificar a afinação, o ritmo e a independência das mãos.

## O Painel de Controle (Cockpit)

Um estúdio de instrumentos e vocais baseado em navegador que é aberto junto com o servidor MCP. Não requer plugins, nem DAWs (Digital Audio Workstations - Estações de Trabalho de Áudio Digital) — apenas uma página da web com um piano.

- **Rolagem de piano em modo duplo** — alterne entre o modo de instrumento (cores cromáticas das notas) e o modo vocal (notas coloridas de acordo com a forma da vogal: /a/ /e/ /i/ /o/ /u/).
- **Teclado visual** — duas oitavas do D4, mapeadas para o seu teclado QWERTY. Clique ou digite.
- **20 presets de voz** — 15 vozes mapeadas para o Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, além de coral e voz sintetizada), 4 vozes mapeadas para faixas, e uma seção de coral sintetizado.
- **10 presets de instrumento** — as 6 vozes de piano do servidor, além de sintetizador, órgão, sino e cordas.
- **Inspetor de notas** — clique em qualquer nota para editar a velocidade, a vogal e a intensidade.
- **7 sistemas de afinação** — Temperamento igual, afinação justa (maior/menor), afinação pitagórica, afinação com quarto de comma, Werckmeister III, ou ajustes personalizados de centésimos. Referência A4 ajustável (392–494 Hz).
- **Auditoria de afinação** — tabela de frequências, testador de intervalos com análise de frequência de batimento, e importação/exportação de afinação.
- **Importação/exportação de partitura** — serialize a partitura inteira como JSON e carregue-a de volta.
- **API voltada para LLM** — `window.__cockpit` expõe `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` e `getScore()`, para que um LLM possa compor, arranjar e reproduzir programaticamente.

## O Ciclo de Aprendizagem

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

## A Biblioteca de Músicas

120 músicas em 12 gêneros, criadas a partir de arquivos MIDI reais. Cada gênero tem um exemplo ricamente anotado — com contexto histórico, análise harmônica detalhada por compasso, momentos-chave, objetivos de ensino e dicas de performance (incluindo orientação vocal). Esses exemplos servem como modelos: a IA estuda um, e então anota os demais.

| Gênero | Exemplo | Tom | O que ensina |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | Mi menor | Forma de blues menor, resposta e chamada, tocar atrás do ritmo |
| Clássico | Für Elise (Beethoven) | Mi menor | Forma de rondo, diferenciação de toque, disciplina de pedal |
| Filme | Comptine d'un autre été (Tiersen) | Mi menor | Texturas em arpejos, arquitetura dinâmica sem mudança harmônica |
| Folk | Greensleeves | Mi menor | 3/4, ritmo de valsa, mistura modal, estilo vocal renascentista |
| Jazz | Autumn Leaves (Kosma) | Sol menor | Progressões ii-V-I, tons guias, oitavas com swing, voicings sem fundamental |
| Latina | The Girl from Ipanema (Jobim) | Dó maior | Ritmo de bossa nova, modulação cromática, contenção vocal |
| New-Age | River Flows in You (Yiruma) | Dó maior | Reconhecimento de I-V-vi-IV, arpejos fluidos, rubato |
| Pop | Imagine (Lennon) | Dó maior | Acompanhamento em arpejos, contenção, sinceridade vocal |
| Ragtime | The Entertainer (Joplin) | Dó maior | Baixo "oom-pah", síncope, forma com várias seções, disciplina de tempo |
| R&B | Superstition (Stevie Wonder) | Si bemol menor | Funk em 16ª nota, teclado percussivo, notas fantasma |
| Rock | Your Song (Elton John) | Si bemol maior | Voz de balada de piano, inversões, canto conversacional |
| Soul | Lean on Me (Bill Withers) | Dó maior | Melodia diatônica, acompanhamento gospel, resposta e chamada |

As músicas progridem de **crua** (apenas MIDI) → **anotada** → **pronta** (totalmente reproduzível com linguagem musical). A IA promove as músicas estudando-as e escrevendo anotações com `annotate_song`.

## Motores de Som

Seis motores, mais um combinador que permite que dois sejam executados simultaneamente:

| Motor | Tipo | Como soa |
|--------|------|---------------------|
| **Oscillator Piano** | Síntese aditiva | Piano multi-harmônico com ruído de martelo, inarmonicidade, polifonia de 48 vozes, imagem estéreo. Sem dependências. |
| **Sample Piano** | Reprodução de arquivos WAV | Piano de cauda Salamander — 480 amostras, 16 camadas de velocidade, 88 teclas. O verdadeiro. |
| **Vocal (Sample)** | Amostras com afinação alterada | Tons vocálicos sustentados com portamento e modo legato. |
| **Vocal Tract** | Modelo físico | Trombone Pink — Onda sonora glotal através de um guia de onda digital de 44 células. Quatro predefinições: soprano, alto, tenor, baixo. |
| **Vocal Synth** | Síntese aditiva | 15 predefinições de voz Kokoro com modelagem de formantes, respiração, vibrato. Determinístico (gerador de números aleatórios com semente). |
| **Guitar** | Síntese aditiva | Cordas dedilhadas modeladas fisicamente — 4 predefinições (aço dreadnought, nylon clássico, jazz archtop, cordas duplas), 8 afinações, 17 parâmetros ajustáveis. |
| **Layered** | Combinador | Combina dois motores e envia todos os eventos MIDI para ambos — piano + sintetizador, voz + sintetizador, etc. |

### Vozes de Teclado

Seis vozes de piano ajustáveis, cada uma com parâmetros ajustáveis individualmente (brilho, decaimento, dureza do martelo, desafinação, largura estéreo e muito mais):

| Voz | Característica |
|-------|-----------|
| Piano de cauda | Rico, cheio, clássico |
| Piano vertical | Quente, íntimo, folk |
| Piano elétrico | Sedoso, jazzístico, sensação Fender Rhodes |
| Honky-Tonk | Desafinado, ragtime, saloon |
| Caixa de música | Cristalino, etéreo |
| Piano brilhante | Brilhante, contemporâneo, pop |

### Vozes de Guitarra

Quatro predefinições de voz de guitarra com síntese de cordas modeladas fisicamente, cada uma com 17 parâmetros ajustáveis (brilho, ressonância do corpo, posição de dedilhado, amortecimento da corda e muito mais):

| Voz | Característica |
|-------|-----------|
| Aço Dreadnought | Brilhante, equilibrado, acústico clássico |
| Nylon Clássico | Quente, suave, arredondado |
| Jazz Archtop | Suave, amadeirado, limpo |
| Cordas Duplas | Brilhante, duplicado, semelhante a um coro |

## O Diário de Prática

Após cada sessão, o servidor registra o que aconteceu — qual música, qual velocidade, quantas compassos, quanto tempo. A IA adiciona suas próprias reflexões: o que ela notou, quais padrões ela reconheceu, o que tentar em seguida.

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

Um arquivo Markdown por dia, armazenado em `~/.ai-jam-sessions/journal/`. Legível por humanos, somente para anexar. Na próxima sessão, a IA lê seu diário e continua de onde parou.

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

## MCP Tools

34 ferramentas em cinco categorias:

### Aprender

| Ferramenta | O que ela faz |
|------|--------------|
| `list_songs` | Navegar por gênero, dificuldade ou palavra-chave |
| `song_info` | Análise musical completa — estrutura, momentos-chave, objetivos de ensino, dicas de estilo |
| `registry_stats` | Estatísticas de toda a biblioteca: número total de músicas, gêneros, dificuldades |
| `list_measures` | Notas, dinâmica e notas de ensino de cada compasso |
| `teaching_note` | Análise detalhada de um único compasso — digitação, dinâmica, contexto |
| `suggest_song` | Recomendação com base em gênero, dificuldade e o que você já tocou |
| `practice_setup` | Velocidade, modo, configurações de voz e comando de linha de comando recomendados para uma música |
| `compare_songs` | Reconhecimento de padrões entre gêneros — relações de tonalidade, semelhança de altura/intervalo, formas compartilhadas, conexões de ensino |
| `annotation_progress` | Avaliação da qualidade das anotações em toda a biblioteca — pontuações, notas e sugestões de melhoria. |

### Reproduzir

| Ferramenta | O que ela faz |
|------|--------------|
| `play_song` | Reprodução por alto-falantes — músicas da biblioteca ou arquivos .mid brutos. Qualquer motor, velocidade, modo, intervalo de compassos. |
| `stop_playback` | Parar |
| `pause_playback` | Pausar ou retomar |
| `set_speed` | Alterar a velocidade durante a reprodução (0,1×–4,0×) |
| `playback_status` | Captura em tempo real: compasso atual, andamento, velocidade, timbre do teclado, estado. |
| `view_piano_roll` | Renderizar como SVG (cores sólidas ou arco-íris cromático por classe de altura). |
| `score_performance` | Avaliação da precisão de uma reprodução MIDI — precisão da altura, ritmo, completude, com feedback graduado. |

### Cantar

| Ferramenta | O que ela faz |
|------|--------------|
| `sing_along` | Texto cantável — nomes das notas, solfeggio, contorno ou sílabas. Com ou sem acompanhamento de piano. |
| `ai_jam_sessions` | Gerar um esboço para improvisação — progressão de acordes, contorno melódico e dicas de estilo para reinterpretação. |

### Guitarra

| Ferramenta | O que ela faz |
|------|--------------|
| `view_guitar_tab` | Renderizar tablaturas de guitarra interativas como HTML — edição por clique, cursor de reprodução, atalhos de teclado. |
| `list_guitar_voices` | Presets de timbre de guitarra disponíveis. |
| `list_guitar_tunings` | Sistemas de afinação de guitarra disponíveis (padrão, drop-D, aberto em G, DADGAD, etc.). |
| `tune_guitar` | Ajustar qualquer parâmetro de qualquer timbre de guitarra. As configurações são mantidas entre as sessões. |
| `get_guitar_config` | Configuração atual do timbre de guitarra versus configurações padrão de fábrica. |
| `reset_guitar` | Restaurar as configurações padrão de fábrica de um timbre de guitarra. |

### Construir

| Ferramenta | O que ela faz |
|------|--------------|
| `add_song` | Adicionar uma nova música como JSON. |
| `import_midi` | Importar um arquivo .mid com metadados. |
| `annotate_song` | Escrever a linguagem musical para uma música bruta e promovê-la para um estado pronto para uso. |
| `save_practice_note` | Entrada de diário com dados da sessão capturados automaticamente. |
| `read_practice_journal` | Carregar entradas recentes para contexto. |
| `list_keyboards` | Timbre de teclado disponíveis. |
| `tune_keyboard` | Ajustar qualquer parâmetro de qualquer timbre de teclado. As configurações são mantidas entre as sessões. |
| `get_keyboard_config` | Configuração atual versus configurações padrão de fábrica. |
| `reset_keyboard` | Restaurar as configurações padrão de fábrica de um timbre de teclado. |
| `score_annotation` | Avaliação da qualidade das anotações em 5 dimensões — completude, profundidade, especificidade, valor pedagógico, vocabulário. |

## Interface de linha de comando (CLI)

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

v1.1.0. Seis motores de som, 34 ferramentas MCP, 120 músicas em 12 gêneros com exemplos ricamente anotados. Editor interativo de tablaturas de guitarra. Painel de navegador com 20 presets vocais, 10 timbres de instrumentos, 7 sistemas de afinação e uma API de pontuação compatível com LLM. Visualização de piano roll em dois modos de cores. Diário de prática para aprendizado contínuo. Avaliação da precisão de reprodução MIDI, avaliação da qualidade das anotações e reconhecimento de padrões entre gêneros. Todos os arquivos MIDI estão disponíveis — a biblioteca cresce à medida que a IA aprende.

## Segurança e Privacidade

**Dados acessados:** biblioteca de músicas (JSON + MIDI), diretório de músicas do usuário (`~/.ai-jam-sessions/songs/`), configurações de afinação de guitarra, entradas do diário de prática, dispositivo de saída de áudio local.

**Dados NÃO acessados:** nenhuma API de nuvem, nenhuma credencial de usuário, nenhum dado de navegação, nenhum arquivo do sistema fora do diretório de músicas do usuário. Nenhuma telemetria é coletada ou enviada.

**Permissões:** O servidor MCP usa apenas o transporte stdio (sem HTTP). A interface de linha de comando acessa o sistema de arquivos local e os dispositivos de áudio. Consulte [SECURITY.md](SECURITY.md) para a política completa.

## Licença

MIT
