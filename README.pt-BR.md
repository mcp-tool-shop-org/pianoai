<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <strong>Português</strong>
</p>

<p align="center">
  <img src="logo.png" alt="AI Jam Session logo" width="180" />
</p>

<h1 align="center">AI Jam Session</h1>

<p align="center">
  <em>Machine Learning do Jeito Antigo</em>
</p>

<p align="center">
  Um servidor MCP que ensina IA a tocar piano.<br/>
  120 músicas. 12 gêneros. MIDI real. Um diário de prática que lembra de tudo.
</p>

[![Songs](https://img.shields.io/badge/songs-120_across_12_genres-blue)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)
[![Ready](https://img.shields.io/badge/ready_to_play-24-green)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)

---

## O que é isso?

Um piano que a IA aprende a tocar. Não é um sintetizador, não é uma biblioteca MIDI -- é um instrumento de ensino.

Cada gênero tem uma música modelo anotada -- uma peça de referência com análise musical, objetivos pedagógicos e orientação de estilo. As outras 96 músicas são MIDI bruto, esperando a IA estudar o modelo, tocar as músicas brutas e escrever suas próprias anotações. Cada sessão continua de onde a anterior parou através de um diário de prática que persiste entre conversas.

O LLM não apenas *toca* música. Ele aprende a *ler* música, *ver* o que toca em um piano roll, *ouvir* o resultado pelos alto-falantes, e *escrever* o que aprendeu. Esse é o ciclo.

## O Ciclo de Aprendizado

```
 Estudar            Tocar              Ver                 Refletir
┌─────────┐     ┌───────────┐     ┌────────────┐     ┌──────────────┐
│ Ler a    │     │ Tocar a   │     │ Ver o      │     │ Escrever o   │
│ análise  │ ──▶ │ música em │ ──▶ │ piano roll │ ──▶ │ que aprendeu │
│ modelo   │     │ qualquer  │     │ (SVG)      │     │ no diário    │
│          │     │ velocidade│     │            │     │              │
└─────────┘     └───────────┘     └────────────┘     └──────┬───────┘
                                                            │
                                                            ▼
                                                   ┌──────────────┐
                                                   │ A próxima    │
                                                   │ sessão       │
                                                   │ continua aqui│
                                                   └──────────────┘
```

## A Biblioteca de Músicas

120 músicas em 12 gêneros, construídas a partir de arquivos MIDI reais. Cada gênero tem um modelo totalmente anotado -- uma peça de referência que a IA estuda antes de enfrentar o resto.

| Gênero | Músicas | Modelo |
|--------|---------|--------|
| Clássico | 10 prontas | Für Elise, Clair de Lune, Moonlight Sonata... |
| R&B | 4 prontas | Superstition (Stevie Wonder) |
| Jazz | 1 pronta | Autumn Leaves |
| Blues | 1 pronta | The Thrill Is Gone (B.B. King) |
| Pop | 1 pronta | Imagine (John Lennon) |
| Rock | 1 pronta | Your Song (Elton John) |
| Soul | 1 pronta | Lean on Me (Bill Withers) |
| Latin | 1 pronta | The Girl from Ipanema |
| Cinema | 1 pronta | Comptine d'un autre été (Yann Tiersen) |
| Ragtime | 1 pronta | The Entertainer (Scott Joplin) |
| New-Age | 1 pronta | River Flows in You (Yiruma) |
| Folk | 1 pronta | Greensleeves |

As músicas progridem de **raw** (apenas MIDI) para **ready** (totalmente anotadas e reproduzíveis). A IA promove músicas estudando-as e escrevendo anotações com `annotate_song`.

## O Diário de Prática

O diário é a memória da IA. Depois de tocar uma música, o servidor registra o que aconteceu -- qual música, em que velocidade, quantos compassos, quanto tempo. A IA adiciona suas próprias reflexões: quais padrões notou, o que reconheceu, o que tentar em seguida.

```markdown
---
### 14:32 — Autumn Leaves
**jazz** | intermediate | G minor | 69 BPM x 0.7x | 32/32 measures | 45s

O ii-V-I nos compassos 5-8 (Cm7-F7-BbMaj7) tem a mesma gravidade que
o V-i em The Thrill Is Gone, só que em maior. Blues e jazz compartilham
mais do que os rótulos de gênero sugerem.

Próxima vez: tentar em velocidade máxima. Comparar a modulação da
ponte de Ipanema com esta.
---
```

Um arquivo markdown por dia, armazenado em `~/.pianoai/journal/`. Legível por humanos, apenas adição. Na próxima sessão, a IA lê seu diário e continua de onde parou.

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

### Aprender

| Ferramenta | Função |
|------------|--------|
| `list_songs` | Navegar por gênero, dificuldade ou palavra-chave |
| `song_info` | Análise musical, objetivos pedagógicos, dicas de estilo |
| `library_progress` | Status de anotação em todos os gêneros |
| `list_measures` | Notas e anotações de ensino de cada compasso |
| `teaching_note` | Análise profunda de um compasso individual |

### Tocar

| Ferramenta | Função |
|------------|--------|
| `play_song` | Reproduzir pelos alto-falantes (velocidade, modo, intervalo de compassos) |
| `stop_playback` | Parar a música atual |
| `pause_playback` | Pausar ou retomar |
| `set_speed` | Alterar velocidade durante a reprodução |
| `view_piano_roll` | Renderizar música como piano roll SVG |

### Lembrar

| Ferramenta | Função |
|------------|--------|
| `save_practice_note` | Escrever uma entrada no diário (dados da sessão capturados automaticamente) |
| `read_practice_journal` | Carregar entradas recentes para contexto |
| `annotate_song` | Promover uma música bruta para pronta (a lição de casa da IA) |

## CLI

```
pianoai list [--genre <genre>] [--difficulty <level>]
pianoai play <song-id> [--speed <mult>] [--mode <mode>]
pianoai view <song-id> [--measures <start-end>] [--out <file.svg>]
pianoai info <song-id>
pianoai library
```

## Status

v0.1.0. 120 arquivos MIDI em 12 gêneros. 24 músicas totalmente anotadas e reproduzíveis (um modelo por gênero + 10 clássicas + 4 R&B). Diário de prática para aprendizado persistente entre sessões. Seis vozes de teclado (grand, upright, electric, honkytonk, musicbox, bright). Todo o MIDI está pronto -- a biblioteca cresce conforme a IA aprende.

## Licença

MIT
