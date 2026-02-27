<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
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

Um LLM (Large Language Model - Modelo de Linguagem Grande) pode ler e escrever texto, mas não pode experimentar a música da mesma forma que nós. Não tem ouvidos, dedos, nem memória muscular. O AI Jam Sessions (Sessões de Música com IA) fecha essa lacuna, fornecendo ao modelo sentidos que ele realmente pode usar:

- **Leitura** — partituras MIDI reais com anotações musicais detalhadas. Não são aproximações manuscritas — são analisadas, interpretadas e explicadas.
- **Audição** — seis motores de áudio (piano oscilador, piano de amostras, amostras vocais, trato vocal físico, sintetizador vocal aditivo, guitarra modelada fisicamente) que tocam pelos seus alto-falantes, permitindo que os humanos no ambiente se tornem os "ouvidos" da IA.
- **Visualização** — uma representação gráfica do piano que renderiza o que foi tocado em formato SVG, que o modelo pode ler e verificar. Um editor de tablaturas de guitarra interativo. Um painel de controle na web com um teclado visual, editor de notas em dois modos e um laboratório de afinação.
- **Memória** — um diário de prática que persiste entre as sessões, permitindo que o aprendizado se acumule ao longo do tempo.
- **Canto** — síntese do trato vocal com 20 predefinições de voz, desde soprano lírico até coral eletrônico. Modo de acompanhamento com narração de solfegios, contornos e sílabas.

Cada um dos 12 gêneros possui um exemplo ricamente anotado — uma peça de referência que a IA estuda primeiro, com contexto histórico, análise estrutural detalhada, momentos-chave, objetivos de aprendizado e dicas de performance. As outras 96 músicas são arquivos MIDI brutos, esperando que a IA absorva os padrões, toque a música e escreva suas próprias anotações.

## A Representação Gráfica do Piano

A representação gráfica do piano é como a IA "vê" a música. Ela renderiza qualquer música em formato SVG — azul para a mão direita, coral para a mão esquerda, com grades de tempo, dinâmica e limites de compasso:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Dois modos de cores: **mão** (azul/coral) ou **classe de afinação** (arco-íris cromático — todo o Dó é vermelho, todo o F# é ciano). O formato SVG permite que o modelo tanto veja a imagem quanto leia a estrutura para verificar a afinação, o ritmo e a independência das mãos.

## O Painel de Controle

Um estúdio de instrumentos e voz baseado em navegador que é aberto junto com o servidor MCP. Não requer plugins, nem DAWs (Digital Audio Workstations) — apenas uma página da web com um piano.

- **Rolagem de piano em modo duplo** — alterne entre o modo de instrumento (cores cromáticas das notas) e o modo vocal (notas coloridas de acordo com a forma da vogal: /a/ /e/ /i/ /o/ /u/).
- **Teclado visual** — duas oitavas a partir do D4, mapeadas para o seu teclado QWERTY. Clique ou digite.
- **20 presets de voz** — 15 vozes mapeadas para o Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, além de coral e voz sintetizada), 4 vozes mapeadas para faixas, e uma seção de coral sintetizado.
- **10 presets de instrumento** — as 6 vozes de piano do servidor, além de sintetizador, órgão, sino e cordas.
- **Inspetor de notas** — clique em qualquer nota para editar a velocidade, a vogal e a intensidade.
- **7 sistemas de afinação** — Temperamento igual, afinação justa (maior/menor), afinação pitagórica, afinação com quarto de comma, Werckmeister III, ou ajustes personalizados em cents. Referência A4 ajustável (392–494 Hz).
- **Auditoria de afinação** — tabela de frequências, testador de intervalos com análise de batidas, e importação/exportação de afinação.
- **Importação/exportação de partitura** — serialize a partitura inteira como JSON e carregue-a de volta.
- **API para LLM** — `window.__cockpit` expõe `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` e `getScore()`, permitindo que um LLM componha, organize e reproduza músicas programaticamente.

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

120 músicas em 12 gêneros, criadas a partir de arquivos MIDI reais. Cada gênero possui um exemplo detalhadamente anotado — com contexto histórico, análise harmônica detalhada por compasso, momentos-chave, objetivos de aprendizado e dicas de performance (incluindo orientação vocal). Esses exemplos servem como modelos: a IA estuda um, e então anota os demais.

| Gênero | Exemplo | Tom | O que ensina |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | Mi menor | Estrutura de blues menor, resposta e chamada, tocar fora do ritmo. |
| Clássico | Für Elise (Beethoven) | Mi menor | Forma de rondo, diferenciação de toque, disciplina de pedal. |
| Trilha Sonora | Comptine d'un autre été (Tiersen) | Mi menor | Texturas arpejadas, arquitetura dinâmica sem mudança harmônica. |
| Folk | Greensleeves | Mi menor | 3/4, mistura modal, estilo vocal renascentista. |
| Jazz | Autumn Leaves (Kosma) | Mi menor | Progressões ii-V-I, tons guias, oitavas com swing, voicings sem fundamental. |
| Música Latina | The Girl from Ipanema (Jobim) | Mi maior | Ritmo de bossa nova, modulação cromática, restrição vocal. |
| New-Age | River Flows in You (Yiruma) | Mi maior | Reconhecimento de I-V-vi-IV, arpejos fluidos, rubato. |
| Pop | Imagine (Lennon) | Dó maior | Acompanhamento arpejado, restrição, sinceridade vocal. |
| Ragtime | The Entertainer (Joplin) | Dó maior | Oom-pah baixo, síncope, forma com várias partes, disciplina de tempo. |
| R&B | Superstition (Stevie Wonder) | Mi menor | Funk em 16ª nota, teclado percussivo, notas fantasma. |
| Rock | Your Song (Elton John) | Mi maior | Voz de piano, inversões, canto conversacional. |
| Soul | Lean on Me (Bill Withers) | Dó maior | Melodia diatônica, acompanhamento gospel, resposta e chamada. |

As músicas progridem de **crua** (apenas MIDI) → **anotada** → **pronta** (totalmente reproduzível com linguagem musical). A IA promove músicas estudando-as e escrevendo anotações com `annotate_song`.

## Sound Engines

Seis motores, além de um combinador em camadas que executa qualquer um deles simultaneamente:

| Motor | Tipo | Como soa |
|--------|------|---------------------|
| **Oscillator Piano** | Síntese aditiva | Piano multi-harmônico com ruído de martelo, inarmonicidade, polifonia de 48 vozes, imagem estéreo. Sem dependências. |
| **Sample Piano** | Reprodução de arquivos WAV | Piano de cauda Salamander — 480 amostras, 16 camadas de velocidade, 88 teclas. O verdadeiro. |
| **Vocal (Sample)** | Amostras com afinação alterada | Tons de vogais sustentados com portamento e modo legato. |
| **Vocal Tract** | Modelo físico | Trombone Pink — Onda sonora glotal através de um guia de onda digital de 44 células. Quatro predefinições: soprano, alto, tenor, baixo. |
| **Vocal Synth** | Síntese aditiva | 15 predefinições de voz Kokoro com modelagem de formantes, respiração, vibrato. Determinístico (gerador de números aleatórios com semente). |
| **Guitar** | Síntese aditiva | Cordas dedilhadas modeladas fisicamente — 4 predefinições (dreadnought de aço, clássica de nylon, archtop de jazz, de 12 cordas), 8 afinações, 17 parâmetros ajustáveis. |
| **Layered** | Combinador | Combina dois motores e envia todos os eventos MIDI para ambos — piano + sintetizador, voz + sintetizador, etc. |

### Vozes de teclado

Seis vozes de piano ajustáveis, cada uma com parâmetros individuais (brilho, decaimento, dureza do martelo, desafinação, largura estéreo e muito mais):

| Voz | Característica |
|-------|-----------|
| Piano de cauda | Rico, cheio, clássico |
| Piano vertical | Quente, íntimo, folk |
| Piano elétrico | Sedoso, jazzístico, sensação Fender Rhodes |
| Honky-Tonk | Desafinado, ragtime, saloon |
| Caixa de música | Cristalino, etéreo |
| Piano brilhante | Brilhante, contemporâneo, pop |

### Vozes de guitarra

Quatro predefinições de voz de guitarra com síntese de cordas modeladas fisicamente, cada uma com 17 parâmetros ajustáveis (brilho, ressonância do corpo, posição de dedilhado, amortecimento da corda e muito mais):

| Voz | Característica |
|-------|-----------|
| Dreadnought de aço | Brilhante, equilibrado, acústico clássico |
| Clássica de nylon | Quente, suave, arredondado |
| Archtop de jazz | Suave, amadeirado, limpo |
| De 12 cordas | Brilhante, duplo, semelhante a um chorus |

## O Diário de Prática

Após cada sessão, o servidor registra o que aconteceu — qual música, qual velocidade, quantas medidas, quanto tempo. A IA adiciona suas próprias reflexões: o que observou, quais padrões reconheceu, o que tentar a seguir.

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

31 ferramentas em quatro categorias:

### Aprender

| Ferramenta | O que ela faz |
|------|--------------|
| `list_songs` | Navegue por gênero, dificuldade ou palavra-chave |
| `song_info` | Análise musical completa — estrutura, momentos-chave, objetivos de ensino, dicas de estilo |
| `registry_stats` | Estatísticas da biblioteca: número total de músicas, gêneros, dificuldades |
| `library_progress` | Status de anotação em todos os gêneros |
| `list_measures` | Notas, dinâmica e notas de ensino de cada compasso |
| `teaching_note` | Análise detalhada de um único compasso — digitação, dinâmica, contexto |
| `suggest_song` | Recomendação com base em gênero, dificuldade e o que você já tocou |
| `practice_setup` | Velocidade, modo, configurações de voz e comando de linha de comando recomendados para uma música |

### Tocar

| Ferramenta | O que ela faz |
|------|--------------|
| `play_song` | Toque através de alto-falantes — músicas da biblioteca ou arquivos .mid brutos. Qualquer motor, velocidade, modo, intervalo de compassos. |
| `stop_playback` | Parar |
| `pause_playback` | Pausar ou retomar. |
| `set_speed` | Alterar a velocidade durante a reprodução (0,1x – 4,0x). |
| `playback_status` | Captura instantânea em tempo real: medida atual, tempo, velocidade, timbre do teclado, estado. |
| `view_piano_roll` | Renderizar como SVG (cores manuais ou arco-íris cromático por classe de afinação). |

### Cantar

| Ferramenta | O que ela faz |
|------|--------------|
| `sing_along` | Texto cantável — nomes das notas, solfeggio, contorno ou sílabas. Com ou sem acompanhamento de piano. |
| `ai_jam_sessions` | Gerar um resumo para improvisação — progressão de acordes, esboço da melodia e dicas de estilo para reinterpretação. |

### Guitarra

| Ferramenta | O que ela faz |
|------|--------------|
| `view_guitar_tab` | Renderizar partitura de guitarra interativa como HTML — edição por clique, cursor de reprodução, atalhos de teclado. |
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
| `annotate_song` | Escrever a linguagem musical para uma música e promovê-la para um estado pronto. |
| `save_practice_note` | Entrada no diário com dados da sessão capturados automaticamente. |
| `read_practice_journal` | Carregar as entradas recentes para contexto. |
| `list_keyboards` | Timbre de teclado disponíveis. |
| `tune_keyboard` | Ajustar qualquer parâmetro de qualquer timbre de teclado. As configurações são mantidas entre as sessões. |
| `get_keyboard_config` | Configuração atual versus configurações padrão de fábrica. |
| `reset_keyboard` | Restaurar as configurações padrão de fábrica de um timbre de teclado. |

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

v0.3.0. Seis engines de som, 31 ferramentas MCP, 120 músicas em 12 gêneros com exemplos detalhadamente anotados. Editor de partitura de guitarra interativa. Painel de controle para navegador com 20 presets vocais, 10 timbres de instrumentos, 7 sistemas de afinação e uma API de partitura voltada para modelos de linguagem. Visualização de piano roll em dois modos de cor. Diário de prática para aprendizado contínuo. Todos os arquivos MIDI estão presentes — a biblioteca cresce à medida que a IA aprende.

## Segurança e Privacidade

**Dados acessados:** biblioteca de músicas (JSON + MIDI), diretório de músicas do usuário (`~/.ai-jam-sessions/songs/`), configurações de afinação de guitarra, entradas do diário de prática, dispositivo de saída de áudio local.

**Dados NÃO acessados:** nenhuma API na nuvem, nenhuma credencial do usuário, nenhum dado de navegação, nenhum arquivo do sistema fora do diretório de músicas do usuário. Nenhuma telemetria é coletada ou enviada.

**Permissões:** O servidor MCP usa apenas o transporte stdio (sem HTTP). A interface de linha de comando acessa o sistema de arquivos local e dispositivos de áudio. Consulte [SECURITY.md](SECURITY.md) para a política completa.

## Licença

MIT.
