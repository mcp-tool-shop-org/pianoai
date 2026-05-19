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

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://codecov.io/gh/mcp-tool-shop-org/ai-jam-sessions"><img src="https://codecov.io/gh/mcp-tool-shop-org/ai-jam-sessions/branch/main/graph/badge.svg" alt="codecov"></a>
  <a href="https://www.npmjs.com/package/ai-jam-sessions"><img src="https://img.shields.io/npm/v/ai-jam-sessions" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/songs-120_across_12_genres-blue" alt="Songs"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/annotated-24-green" alt="Ready"></a>
  <a href="datasets/jam-actions-v0-public/README.md"><img src="https://img.shields.io/badge/dataset-jam--actions--v0%20(115_records)-8b5cf6" alt="Training dataset"></a>
</p>

---

## O que é isso?

Um piano e uma guitarra que uma inteligência artificial (IA) aprende a tocar. Não é um sintetizador, nem uma biblioteca MIDI — é um instrumento de aprendizado.

Um modelo de linguagem grande (LLM) pode ler e escrever texto, mas não pode experimentar a música da mesma forma que nós. Não tem ouvidos, dedos ou memória muscular. O AI Jam Sessions preenche essa lacuna, fornecendo ao modelo sentidos que ele realmente pode usar:

- **Leitura** — partituras MIDI reais com anotações musicais detalhadas. Não são aproximações manuscritas — são analisadas, explicadas e interpretadas.
- **Audição** — seis motores de áudio (piano oscilador, piano com amostras, amostras vocais, trato vocal físico, sintetizador vocal aditivo, guitarra com modelagem física) que tocam através dos seus alto-falantes, permitindo que os humanos na sala se tornem os "ouvidos" da IA.
- **Visualização** — uma representação gráfica da partitura (piano roll) que mostra o que foi tocado em formato SVG, permitindo que o modelo a leia e verifique. Um editor de tablaturas interativo para guitarra. Um painel de controle (cockpit) com um teclado visual, editor de notas em dois modos e um laboratório de afinação.
- **Memória** — um diário de prática que persiste entre as sessões, permitindo que o aprendizado se acumule ao longo do tempo.
- **Canto** — síntese vocal com 20 predefinições de voz, desde soprano lírico até coral eletrônico. Modo de acompanhamento com narração de notas, contornos e sílabas.

Cada um dos 12 gêneros possui um exemplo ricamente anotado — uma peça de referência que a IA estuda primeiro, com contexto histórico, análise estrutural detalhada, momentos importantes, objetivos de aprendizado e dicas de performance. As outras 96 músicas são arquivos MIDI brutos, esperando que a IA absorva os padrões, toque a música e escreva suas próprias anotações.

A partir desse mesmo trabalho, também publicamos **[jam-actions-v0](#training-dataset)** — um conjunto de dados público de 115 sequências de uso de ferramentas MCP (Multi-turn Control Plane) em um piano clássico real. Ele ensina LLMs a realizar *uso de ferramentas baseado em dados sobre música simbólica*, e não apenas geração de texto, e vem com um sistema de liberação de 7 eixos que distingue "fornecer evidências" de "fornecer porque a tarefa é trivial". Veja [Conjunto de Dados de Treinamento](#training-dataset) abaixo para saber mais.

## O Piano Roll (Representação Gráfica da Partitura)

O piano roll é a forma como a IA "vê" a música. Ele renderiza qualquer música como um arquivo SVG — azul para a mão direita, coral para a mão esquerda, com linhas de tempo, dinâmica e limites de compasso:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Dois modos de cores: **mão** (azul/coral) ou **classe de afinação** (arco-íris cromático — todo o Dó é vermelho, todo o F sustenido é ciano). O formato SVG permite que o modelo tanto veja a imagem quanto leia as informações para verificar a afinação, o ritmo e a independência das mãos.

## O Painel de Controle (Cockpit)

Um estúdio de instrumentos e voz baseado em navegador que se abre junto com o servidor MCP. Não há plugins, nem DAW (Digital Audio Workstation) — apenas uma página da web com um piano.

- **Piano roll em dois modos** — alterne entre o modo Instrumento (cores cromáticas de afinação) e o modo Vocal (notas coloridas de acordo com o formato da vogal: /a/ /e/ /i/ /o/ /u/)
- **Teclado visual** — duas oitavas do Dó 4, mapeadas para o seu teclado QWERTY. Clique ou digite.
- **20 predefinições de voz** — 15 vozes mapeadas para o Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, além de coral e sintetizador vocal), 4 vozes mapeadas para o trato vocal e uma seção de coral sintético.
- **10 predefinições de instrumento** — as 6 vozes de piano do servidor, além de sintetizador, órgão, sinos e cordas.
- **Inspetor de notas** — clique em qualquer nota para editar a intensidade, a vogal e o "ar" (breathiness).
- **7 sistemas de afinação** — Temperamento igual, afinação justa (maior/menor), afinação pitagórica, meantone de quarto de tom, Werckmeister III ou desvios de centésimos personalizados. Referência A4 ajustável (392–494 Hz).
- **Auditoria de afinação** — tabela de frequências, testador de intervalos com análise de frequência de batimento e exportação/importação de afinação.
- **Importação/exportação de partitura** — serialize a partitura inteira como JSON e carregue-a de volta.
- **API para LLMs** — `window.__cockpit` expõe `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` e `getScore()`, permitindo que um LLM componha, organize e reproduza a música programaticamente.

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

120 músicas em 12 gêneros, criadas a partir de arquivos MIDI reais. Cada gênero possui um exemplo detalhadamente anotado, com contexto histórico, análise harmônica detalhada por compasso, momentos-chave, objetivos de ensino e dicas de performance (incluindo orientação vocal). Esses exemplos servem como modelos: a IA estuda um, e então anota os demais.

| Gênero | Exemplo | Tom | O que ensina |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | Mi menor | Estrutura de blues menor, resposta e chamada, tocar fora do ritmo. |
| Clássico | Für Elise (Beethoven) | Mi menor | Forma de rondo, diferenciação de toques, disciplina de pedal. |
| Trilha Sonora | Comptine d'un autre été (Tiersen) | Mi menor | Texturas em arpejos, arquitetura dinâmica sem mudança harmônica. |
| Folk | Greensleeves | Mi menor | 3/4, ritmo de valsa, mistura modal, estilo vocal renascentista. |
| Jazz | Autumn Leaves (Kosma) | Sol menor | Progressões ii-V-I, tons guia, oitavas com "swing", voicings sem fundamental. |
| Música Latina | The Girl from Ipanema (Jobim) | Fá maior | Ritmo de bossa nova, modulação cromática, contenção vocal. |
| New-Age | River Flows in You (Yiruma) | Mi maior | Reconhecimento de I-V-vi-IV, arpejos fluidos, rubato. |
| Pop | Imagine (Lennon) | Dó maior | Acompanhamento em arpejos, contenção, sinceridade vocal. |
| Ragtime | The Entertainer (Joplin) | Dó maior | Baixo "oom-pah", síncope, forma com múltiplas seções, disciplina de tempo. |
| R&B | Superstition (Stevie Wonder) | Si bemol menor | Funk em semicolcheias, teclado percussivo, notas "fantasma". |
| Rock | Your Song (Elton John) | Si bemol maior | Voz de piano, inversões, canto conversacional. |
| Soul | Lean on Me (Bill Withers) | Dó maior | Melodia diatônica, acompanhamento em estilo gospel, resposta e chamada. |

As músicas evoluem de **crua** (apenas MIDI) → **anotada** → **pronta** (totalmente reproduzível com linguagem musical). A IA promove músicas estudando-as e escrevendo anotações com a função `annotate_song`.

## Motores de Som

Seis motores, mais um combinador em camadas que executa qualquer um dos dois simultaneamente:

| Motor | Tipo | Como soa |
|--------|------|---------------------|
| **Oscillator Piano** | Síntese aditiva | Piano multi-harmônico com ruído de baqueta, inarmonicidade, polifonia de 48 vozes, imagem estéreo. Sem dependências. |
| **Sample Piano** | Reprodução de arquivos WAV | Salamander Grand Piano — 480 amostras, 16 camadas de velocidade, 88 teclas. O verdadeiro. |
| **Vocal (Sample)** | Amostras com mudança de afinação | Tons vocálicos sustentados com portamento e modo legato. |
| **Vocal Tract** | Modelo físico | Pink Trombone — Onda sonora glotal de baixa frequência através de um guia de onda digital de 44 células. Quatro presets: soprano, alto, tenor, baixo. |
| **Vocal Synth** | Síntese aditiva | 15 presets de voz Kokoro com modelagem de formantes, respiração, vibrato. Determinístico (gerador de números aleatórios com semente). |
| **Guitar** | Síntese aditiva | Cordas dedilhadas modeladas fisicamente — 4 presets (aço dreadnought, nylon clássico, jazz archtop, cordas duplas), 8 afinações, 17 parâmetros ajustáveis. |
| **Layered** | Combinador | Envolve dois motores e envia todos os eventos MIDI para ambos — piano+sintetizador, voz+sintetizador, etc. |

### Vozes de Teclado

Seis timbres de piano ajustáveis, cada um com parâmetros individuais (brilho, decaimento, dureza do martelo, desafinação, largura estéreo e muito mais):

| Timbro | Característica |
|-------|-----------|
| Piano de concerto | Rico, cheio, clássico |
| Piano vertical | Quente, íntimo, folk |
| Piano elétrico | Suave, jazzístico, com a sensação de um Fender Rhodes |
| Piano de saloon | Desafinado, ragtime, saloon |
| Caixa de música | Cristalino, etéreo |
| Piano de cauda brilhante | Brilhante, contemporâneo, pop |

### Timbres de guitarra

Quatro timbres de guitarra com síntese de cordas modelada fisicamente, cada um com 17 parâmetros ajustáveis (brilho, ressonância do corpo, posição de dedilhado, amortecimento das cordas e muito mais):

| Timbro | Característica |
|-------|-----------|
| Aço Dreadnought | Brilhante, equilibrado, acústico clássico |
| Nylon Clássico | Quente, suave, arredondado |
| Jazz Archtop | Suave, amadeirado, limpo |
| Doze cordas | Brilhante, duplo, semelhante a um chorus |

## O Diário de Prática

Após cada sessão, o servidor registra o que aconteceu: qual música, qual velocidade, quantas compassos, quanto tempo. A IA adiciona suas próprias observações: o que notou, quais padrões reconheceu, o que tentar a seguir.

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

Um arquivo Markdown por dia, armazenado em `~/.ai-jam-sessions/journal/`. Legível por humanos, apenas para anexar. Na próxima sessão, a IA lê seu diário e continua de onde parou.

## Conjunto de dados de treinamento

**jam-actions-v0** — um conjunto de dados público de rastros de uso de ferramentas MCP (Music Control Protocol) em várias etapas, baseados em MIDI de piano clássico real. Construído a partir da mesma biblioteca que este servidor usa para ensinar, o conjunto de dados ensina LLMs (Large Language Models) a realizar **uso de ferramentas baseado em música simbólica** — não apenas geração de texto.

Cada registro combina uma janela de frase de 4 compassos com um alvo de aprendizado anotado e um *rastreamento de alvo* — uma sessão passo a passo em que um assistente usa as ferramentas MCP acima (`get_events_in_measure`, `get_events_in_hand`, `count_distinct_pitch_classes` e o restante da interface de inspetor MIDI de 9 ferramentas) para ler, analisar e discutir a frase.

| | |
|---|---|
| Registros | 115 (subconjunto público) |
| Linha de base canônica | 16 registros após a correção (E3) |
| Composições | 8 obras de piano clássico (Beethoven, Bach, Schubert, Schumann, Mozart, Mendelssohn, Tchaikovsky) |
| MIDI original | piano-midi.de — Arranjos de Bernd Krueger |
| Licença | CC-BY-SA-3.0-DE (arranjo) sobre composições de domínio público |
| Versão | 0.4.3 (2026-05-19) |
| Esquema | `release-gate-assessment/2.0.0` |

**Histórico de qualidade — o filtro de liberação de 7 eixos.** O conjunto de dados é fornecido com um filtro de liberação que distingue a passagem baseada em evidências da passagem saturada pelo limite. Os eixos 1 a 6 são de bloqueio (piso absoluto, margem composta, taxa de uso de ferramentas, correto após a ferramenta, contagem de interpretações incorretas, piso de camada); o eixo 7 é de relatório enriquecido versus não enriquecido. Os eixos 2 e 6 admitem um "bucket" de `ceiling_saturated_pass` para que os registros que obtêm 1,000 em condições de texto apenas / inspeção por ferramenta / MIDI aleatório não diluam as camadas mais difíceis. A linha de base do Slice 22 **PASSA** o filtro revisado. A linha de base do Slice 19 ainda **FALHA** nele — mantida como um diagnóstico de regressão para que o filtro tenha "dentes".

**Reprodutibilidade.** Um novo colaborador em qualquer plataforma (Windows nativo, macOS, Linux, WSL) pode verificar o pacote e reproduzir o veredicto canônico de PASS em menos de um minuto:

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions && pnpm install
pnpm exec tsx scripts/verify-public-package-checksums.ts        # 273 entries, ~2s
pnpm exec tsx scripts/check-release-gate.ts \
  datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json
# → "Verdict: PASS"
```

`.gitattributes` define que os finais de linha devem ser LF para os arquivos `*.sha256` e para a estrutura de dados pública, garantindo que o verificador de checksum funcione em todas as plataformas. A ferramenta de linha de comando `release-gate` é estritamente posicional (rejeita argumentos posicionais desconhecidos ou múltiplos), o que impede que os colaboradores iniciantes a utilizem incorretamente.

**Onde encontrar.** O arquivo completo do conjunto de dados está em [`datasets/jam-actions-v0-public/README.md`](datasets/jam-actions-v0-public/README.md). Os metadados de depósito no Zenodo estão em [`zenodo-metadata.json`](datasets/jam-actions-v0-public/zenodo-metadata.json), os metadados de citação estão em [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff) e as notas de lançamento estão em [`RELEASE_NOTES.md`](datasets/jam-actions-v0-public/RELEASE_NOTES.md). O processo de construção, desde o rascunho inicial do corpus até a correção de erros, a correção de problemas relacionados a Schumann, a revisão da porta de lançamento e a auditoria de uso individual, está documentado em [`docs/`](docs/).

> As harmonias MIDI foram criadas por Bernd Krueger (piano-midi.de) e estão licenciadas sob a licença CC-BY-SA-3.0-DE. As anotações, os rastros e os artefatos de avaliação foram criados pela equipe AI Jam Sessions e estão disponíveis sob a mesma licença, para garantir a continuidade da política de compartilhamento.

## Instalação

```bash
npm install -g ai-jam-sessions
```

Requer **Node.js 18+**. Não requer drivers MIDI, portas virtuais ou software externo.

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

41 ferramentas e 3 modelos de prompt, divididos em seis categorias:

### Aprender

| Ferramenta | O que ela faz |
|------|--------------|
| `list_songs` | Navegue por gênero, dificuldade ou palavra-chave |
| `song_info` | Análise musical completa: estrutura, momentos-chave, objetivos de ensino, dicas de estilo |
| `registry_stats` | Estatísticas gerais da biblioteca: número total de músicas, gêneros, níveis de dificuldade |
| `list_measures` | Notas, dinâmica e anotações de ensino para cada compasso |
| `teaching_note` | Análise detalhada de um único compasso: digitação, dinâmica, contexto |
| `suggest_song` | Recomendação com base em gênero, dificuldade e músicas que você já ouviu |
| `practice_setup` | Velocidade, modo, configurações de voz e comando de linha de comando recomendados para uma música |
| `compare_songs` | Reconhecimento de padrões entre gêneros: relações de acordes, similaridade de notas/intervalos, formas comuns, conexões de ensino |
| `annotation_progress` | Avaliação da qualidade das anotações em toda a biblioteca: pontuações, notas e sugestões de melhoria |
| `server_info` | Versão do servidor, estatísticas da biblioteca, lista de engines, sessão ativa |

### Tocar

| Ferramenta | O que ela faz |
|------|--------------|
| `play_song` | Reprodução através de alto-falantes: músicas da biblioteca ou arquivos .mid brutos. Qualquer engine, velocidade, modo, intervalo de compassos. |
| `stop_playback` | Parar |
| `pause_playback` | Pausar ou retomar |
| `set_speed` | Alterar a velocidade durante a reprodução (0,1×–4,0×) |
| `playback_status` | Captura em tempo real: compasso atual, andamento, velocidade, voz do teclado, estado |
| `view_piano_roll` | Renderizar como SVG (cores sólidas ou arco cromático por classe de altura) |
| `score_performance` | Avaliação da execução de uma peça MIDI: precisão da altura, ritmo, completude, com feedback graduado |
| `mute_hand` | Silenciar ou ativar a mão esquerda/direita durante a prática — isole uma mão de cada vez |
| `preview_teaching_cues` | Ver todas as anotações de ensino e momentos-chave antes de tocar |

### Cantar

| Ferramenta | O que ela faz |
|------|--------------|
| `sing_along` | Texto cantável: nomes das notas, solfegio, contorno ou sílabas. Com ou sem acompanhamento de piano. |
| `ai_jam_sessions` | Gerar um resumo para improvisação: progressão de acordes, esboço da melodia e dicas de estilo para reinterpretação |

### Guitarra

| Ferramenta | O que ela faz |
|------|--------------|
| `view_guitar_tab` | Renderizar tablaturas interativas de guitarra como HTML — edição com um clique, cursor de reprodução, atalhos de teclado |
| `list_guitar_voices` | Presets de voz de guitarra disponíveis |
| `list_guitar_tunings` | Sistemas de afinação de guitarra disponíveis (padrão, drop-D, open G, DADGAD, etc.) |
| `tune_guitar` | Ajustar qualquer parâmetro de qualquer voz de guitarra. As configurações são persistentes entre as sessões. |
| `get_guitar_config` | Configuração atual da voz de guitarra em comparação com as configurações padrão de fábrica |
| `reset_guitar` | Restaurar as configurações padrão de uma voz de guitarra |

### Construir

| Ferramenta | O que ela faz |
|------|--------------|
| `add_song` | Adicionar uma nova música como JSON |
| `import_midi` | Importar um arquivo .mid com metadados |
| `annotate_song` | Escrever a linguagem musical para uma música básica e transformá-la em uma música completa. |
| `save_practice_note` | Registro de diário com dados da sessão capturados automaticamente. |
| `read_practice_journal` | Carregar as entradas mais recentes para fornecer contexto. |
| `list_keyboards` | Vozes de teclado disponíveis. |
| `tune_keyboard` | Ajustar qualquer parâmetro de qualquer voz de teclado. As configurações são mantidas entre as sessões. |
| `get_keyboard_config` | Configuração atual versus configurações padrão de fábrica. |
| `reset_keyboard` | Restaurar uma voz de teclado para as configurações de fábrica. |
| `score_annotation` | Avaliação da qualidade da anotação em 5 dimensões: completude, profundidade, especificidade, valor didático, vocabulário. |
| `validate_song_entry` | Validar um arquivo JSON de música em relação ao esquema antes de adicioná-lo. |
| `transpose_song` | Transpor uma música para cima ou para baixo em semitons — nova tonalidade, novas notas. |
| `list_sections` | Visualizar as seções estruturais de uma música (Introdução, Verso, Refrão, etc.). |
| `add_section` | Adicionar um marcador de seção a uma música para navegação estrutural. |

### Sugestões (Prompts) MCP

Três modelos de sugestão para fluxos de trabalho de ensino estruturados:

| Sugestão (Prompt). | O que ela faz |
|--------|--------------|
| `annotate_song` | Fluxo de trabalho de anotação guiado — estudar um exemplo, escrever a linguagem musical para uma música básica. |
| `practice_plan` | Criar um plano de prática estruturado com base no gênero, dificuldade e objetivos. |
| `performance_review` | Revisar uma sessão concluída — o que funcionou bem, em que focar a seguir. |

## Interface de Linha de Comando (CLI)

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

## Status

v1.4.1. Seis engines de som, 41 ferramentas MCP, 3 modelos de sugestão, 120 músicas em 12 gêneros com exemplos ricamente anotados. Transposição de músicas, marcadores de seção, mudo/solo por mão para prática focada. Editor interativo de tablaturas de guitarra. Painel de navegador com 20 predefinições vocais, 10 vozes de instrumentos, 7 sistemas de afinação e uma API de partitura voltada para LLM. Visualização de piano roll em dois modos de cor. Diário de prática para aprendizado contínuo. Persistência do estado da sessão entre as reinicializações do servidor. Partitura MIDI para tocar junto, avaliação da qualidade da anotação e reconhecimento de padrões entre gêneros.

Também disponibiliza **[jam-actions-v0](#training-dataset)** — um conjunto de dados de treinamento com 115 registros de rastreamentos de uso de ferramentas MCP em piano clássico, com um sistema de aprovação de 7 eixos, reprodutibilidade desde o início e metadados Zenodo + CITATION.cff completos (CC-BY-SA-3.0-DE). 1513 testes aprovados no servidor MCP + pacotes de dados + estruturas de avaliação + validador de aprovação. Todos os arquivos MIDI estão presentes — a biblioteca cresce à medida que a IA aprende, e agora há um corpus desse aprendizado incluído.

## Segurança e Privacidade

**Dados acessados:** biblioteca de músicas (JSON + MIDI), diretório de músicas do usuário (`~/.ai-jam-sessions/songs/`), configurações de afinação de guitarra, entradas do diário de prática, dispositivo de saída de áudio local.

**Dados NÃO acessados:** nenhuma API na nuvem, nenhuma credencial de usuário, nenhum dado de navegação, nenhum arquivo do sistema fora do diretório de músicas do usuário. Nenhuma telemetria é coletada ou enviada.

**Permissões:** O servidor MCP usa apenas o transporte stdio (sem HTTP). A CLI acessa o sistema de arquivos local e os dispositivos de áudio. Consulte [SECURITY.md](SECURITY.md) para a política completa.

## Licença

MIT.
