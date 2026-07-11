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
  <a href="https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions"><img src="https://img.shields.io/npm/v/@mcptoolshop/ai-jam-sessions" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/songs-120_across_12_genres-blue" alt="Songs"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/annotated-120%2F120-green" alt="Ready"></a>
  <a href="datasets/jam-actions-v0-public/README.md"><img src="https://img.shields.io/badge/dataset-jam--actions--v0%20(115_records)-8b5cf6" alt="Training dataset"></a>
  <a href="https://doi.org/10.5281/zenodo.20279919"><img src="https://zenodo.org/badge/DOI/10.5281/zenodo.20279919.svg" alt="DOI"></a>
</p>

---

## O que é isto?

Um piano e uma guitarra que a IA aprende a tocar. Não é um sintetizador, nem uma biblioteca MIDI — é um instrumento de ensino.

Um LLM pode ler e escrever texto, mas não consegue vivenciar a música da maneira como nós fazemos. Sem ouvidos, sem dedos, sem memória muscular. O AI Jam Sessions preenche essa lacuna, fornecendo ao modelo sentidos que ele realmente pode usar:

- **Leitura** — partituras MIDI reais com anotações musicais detalhadas. Não são aproximações manuscritas — são analisadas, interpretadas e explicadas.
- **Audição** — seis motores de áudio (piano oscilador, piano sampleado, samples vocais, trato vocal físico, sintetizador vocal aditivo, guitarra modelada fisicamente) que tocam através dos seus alto-falantes, para que as pessoas na sala se tornem os ouvidos da IA.
- **Visão** — um rolo de piano que renderiza o que foi tocado como SVG, que o modelo pode ler e verificar. Um editor interativo de tablaturas de guitarra. Uma interface de navegador com um teclado visual, editor de notas em modo duplo e laboratório de afinação.
- **Memória** — um diário de prática que persiste ao longo das sessões, para que o aprendizado se acumule com o tempo.
- **Canto** — síntese do trato vocal com 20 predefinições de voz, desde soprano operístico até coral eletrônico. Modo de acompanhamento com solfejo, contorno e narração silábica.

Cada uma das 120 músicas agora está totalmente anotada — contexto histórico, análise estrutural barra a barra, momentos-chave, objetivos de ensino e dicas de desempenho, em todos os 12 gêneros. Uma versão anterior deste arquivo README dizia que as músicas originais estavam "aguardando que a IA absorvesse os padrões, tocasse a música e escrevesse suas próprias anotações". É exatamente isso que aconteceu: as anotações foram escritas pela IA com base em uma análise determinística por música (acordes, estrutura de repetição, limites das seções, tonalidades verificadas), sujeitas a um critério de qualidade e verificadas adversariamente, afirmação por afirmação — números das barras, intervalos de acordes e contagens estruturais, tudo verificado em relação ao MIDI real antes que qualquer coisa fosse lançada.

A partir deste mesmo trabalho, também publicamos **[jam-actions-v0](#training-dataset)** — um conjunto de dados público de 115 rastreamentos de uso de ferramentas MCP em várias etapas sobre piano clássico real. Ele ensina LLMs a realizar *o uso prático de ferramentas sobre música simbólica*, e não apenas geração de texto, e vem com um portão de lançamento de 7 eixos que distingue "transmitir evidências" de "transmitir porque a tarefa é trivial". Consulte [Conjunto de dados de treinamento](#training-dataset) abaixo para obter a história completa.

## O Rolo de Piano

O rolo de piano é como a IA vê a música. Ele renderiza qualquer música como SVG — azul para a mão direita, coral para a esquerda, com grades de compasso, dinâmica e limites das barras:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Dois modos de cor: **mão** (azul/coral) ou **classe tonal** (arco-íris cromático — cada Dó é vermelho, cada Fá sustenido é ciano). O formato SVG significa que o modelo pode ver a imagem e ler a marcação para verificar a altura, o ritmo e a independência das mãos.

## A Cabine de Comando

Um estúdio de composição baseado em navegador que está neste repositório em [`apps/cockpit`](apps/cockpit) — e funciona ao vivo em **[mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)**. Sem plugins, sem DAW, sem instalação; tudo permanece no seu navegador (seu trabalho é salvo automaticamente localmente). Prefere modificá-lo?

```bash
cd apps/cockpit && npm install && npm run dev   # Vite dev server, opens in your browser
```

- **Transporte preciso ao compasso** — as notas existem em tempo musical, portanto, o controle de BPM realmente altera a reprodução; uma régua de tempo com clique para avançar, com arrastar para definir **regiões de loop**; rolagem automática que acompanha a cabeça de reprodução.
- **Captura com gravação ativada** — toque nas teclas QWERTY, no teclado na tela ou em um dispositivo Web MIDI e ele será inserido na partitura: contagem inicial de 1 compasso, sobregravação no estilo looper ao longo dos ciclos de loop (ou modo de substituição), tempo de desempenho bruto preservado sob uma visualização quantizada, cada passagem é uma unidade que pode ser desfeita.
- **Desfazer/refazer completo** — todas as edições, incluindo Limpar e Importar, são reversíveis (Ctrl+Z), com gestos de arrastar que se combinam da maneira que os editores reais fazem.
- **Seleção múltipla + área de transferência** — seleção em forma de retângulo sob uma alternância de ferramenta Selecionar/Desenhar, cliques modificadores padrão da plataforma, copiar/cortar/colar na cabeça de reprodução, Duplicar.
- **Toque + acessibilidade** — eventos de ponteiro com captura em cada superfície, toque para relocalizar como uma alternativa não de arrastar, edição de notas por teclado, sobreposições de partituras seguras para daltônicos.
- **Rolo de piano em modo duplo** — alterne entre o modo Instrumento (cores cromáticas) e o modo Vocal (notas coloridas pela forma da vogal: /a/ /e/ /i/ /o/ /u/).
- **Teclado visual** — duas oitavas a partir de Dó 4, mapeadas para o seu teclado QWERTY. Clique ou digite.
- **20 predefinições de voz** — 15 vozes mapeadas por Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, mais coral e sintetizador vocal), 4 vozes mapeadas para o trato vocal e uma seção de coral sintético.
- **10 predefinições de instrumento** — as 6 vozes de piano do lado do servidor, mais pad de sintetizador, órgão, sino e cordas.
- **Inspetor de notas** — clique em qualquer nota para editar a velocidade, vogal e aspereza.
- **7 sistemas de afinação** — temperamento igual, entonação justa (maior/menor), pitagórico, meio tom de vírgula, Werckmeister III ou deslocamentos de centavos personalizados. Referência A4 ajustável (392–494 Hz).
- **Auditoria de afinação** — tabela de frequência, testador de intervalo com análise de frequência de batimento e exportação/importação de afinação.
- **Importação/exportação de partitura** — serialize toda a partitura como JSON e carregue-a novamente.
- **API voltada para LLM** — `window.__cockpit` expõe `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` e `getScore()` para que um LLM possa compor, organizar e reproduzir programaticamente.

## O Ciclo de Aprendizagem

<p align="center">
  <img src="docs/learning-loop.svg" alt="The learning loop: Read (MIDI + annotations) → Play (six sound engines) → See (piano roll · guitar tab) → Reflect (practice journal), with the journal persisting so the next session picks up where the last left off" width="100%" />
</p>

## A Biblioteca de Músicas

120 músicas em 12 gêneros, criadas a partir de arquivos MIDI reais. Cada gênero tem um exemplo profundamente anotado — com contexto histórico, análise harmônica barra a barra, momentos-chave, objetivos de ensino e dicas de desempenho (incluindo orientação vocal). Esses exemplos servem como modelos: a IA estuda um e, em seguida, anota o restante.

| Gênero | Exemplar | Chave | O que ensina |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | Si menor | Forma de blues menor, chamada e resposta, tocar fora do ritmo |
| Clássico | Für Elise (Beethoven) | La menor | Forma de rondó, diferenciação de toque, disciplina no uso do pedal |
| Filme | Comptine d'un autre été (Tiersen) | Mi menor | Texturas em arpejo, arquitetura dinâmica sem mudança harmônica |
| Folk | Greensleeves | Mi menor | Sensação de valsa em 3/4, mistura modal, estilo vocal renascentista |
| Jazz | Autumn Leaves (Kosma) | Sol menor | Progressões ii-V-I, tons guia, oitavas em swing, acordes sem a fundamental |
| Latino | The Girl from Ipanema (Jobim) | Fá maior | Ritmo de bossa nova, modulação cromática, contenção vocal |
| New-Age | River Flows in You (Yiruma) | Lá maior | Reconhecimento I-V-vi-IV, arpejos fluidos, rubato |
| Pop | Imagine (Lennon) | Dó maior | Acompanhamento em arpejo, contenção, sinceridade vocal |
| Ragtime | The Entertainer (Joplin) | Dó maior | Baixo "oom-pah", síncope, forma multi-estrofe, disciplina de tempo |
| R&B | Superstition (Stevie Wonder) | Mi bemol menor | Funk em semicolcheias, teclado percussivo, notas fantasmas |
| Rock | Your Song (Elton John) | Mi bemol maior | Condução de voz em balada para piano, inversões, canto conversacional |
| Soul | Lean on Me (Bill Withers) | Dó maior | Melodia diatônica, acompanhamento gospel, chamada e resposta |

As músicas progridem de **cru** (apenas MIDI) → **anotadas** → **prontas** (totalmente reproduzíveis com linguagem musical). A IA promove as músicas estudando-as e escrevendo anotações com `annotate_song`.

## Motores de Som

Seis motores, mais um combinador em camadas que executa qualquer dois simultaneamente:

| Motor | Tipo | Como soa |
|--------|------|---------------------|
| **Oscillator Piano** | Síntese aditiva | Piano multi-harmônico com ruído de martelo, inarmonicidade, polifonia de 48 vozes, imagem estéreo. Sem dependências. |
| **Sample Piano** | Reprodução WAV | Salamander Grand Piano — 480 amostras, 16 camadas de velocidade, 88 teclas. O som real. *Apenas API programática: as amostras não são enviadas (você fornece o download do [Salamander](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html)); ainda não está conectado às listas de motores CLI/MCP.* |
| **Vocal (Sample)** | Amostras com mudança de tom | Tons vocálicos sustentados com portamento e modo legato. |
| **Vocal Tract** | Modelo físico | Pink Trombone — forma de onda glotal LF através de um guia de ondas digital de 44 células. Quatro predefinições: soprano, alto, tenor, baixo. |
| **Vocal Synth** | Síntese aditiva | 15 predefinições de voz Kokoro com modelagem de formantes, aspereza, vibrato. Determinístico (RNG com semente). |
| **Guitar** | Síntese aditiva | Cordas dedilhadas modeladas fisicamente — 4 predefinições (dreadnought de aço, clássico de nylon, jazz archtop, de doze cordas), 8 afinações, 17 parâmetros ajustáveis. |
| **Layered** | Combinador | Envolve dois motores e envia cada evento MIDI para ambos — piano+synth, vocal+synth, etc. |

### Vozes de Teclado

Seis vozes de piano ajustáveis, cada uma com parâmetros ajustáveis (brilho, decaimento, dureza do martelo, desafinação, largura estéreo e muito mais):

| Voz | Característica |
|-------|-----------|
| Concert Grand | Rico, cheio, clássico |
| Upright | Quente, íntimo, folk |
| Electric Piano | Sedoso, jazzístico, com a sensação de um Fender Rhodes |
| Honky-Tonk | Desafinado, ragtime, saloon |
| Music Box | Cristalino, etéreo |
| Bright Grand | Vibrante, contemporâneo, pop |

### Vozes de Guitarra

Quatro predefinições de voz de guitarra com síntese de cordas modelada fisicamente, cada uma com 17 parâmetros ajustáveis (brilho, ressonância do corpo, posição de dedilhado, amortecimento das cordas e muito mais):

| Voz | Característica |
|-------|-----------|
| Steel Dreadnought | Brilhante, equilibrado, acústico clássico |
| Nylon Classical | Quente, suave, arredondado |
| Jazz Archtop | Suave, amadeirado, limpo |
| Twelve-String | Cintilante, dobrado, semelhante a um chorus |

## O Diário de Prática

Após cada sessão, o servidor captura o que aconteceu — qual música, qual velocidade, quantas compassos, quanto tempo. A IA adiciona suas próprias reflexões: o que notou, quais padrões reconheceu, o que tentar em seguida.

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

Um arquivo markdown por dia, armazenado em `~/.ai-jam-sessions/journal/`. Legível por humanos, apenas anexação. Na próxima sessão, a IA lê seu diário e retoma de onde parou.

## Conjunto de Dados de Treinamento

**jam-actions-v0** — um conjunto de dados público de rastreamentos de uso de ferramentas MCP em várias etapas, fundamentado em MIDI real de piano clássico. Construído a partir da mesma biblioteca que este servidor usa para ensinar, o conjunto de dados ensina aos LLMs a realizar **uso de ferramentas fundamentado em música simbólica** — e não apenas geração de texto.

Cada registro associa um trecho de 4 compassos a um objetivo de ensino anotado e a um *registro do objetivo* — uma sessão passo a passo na qual um assistente usa as ferramentas MCP mencionadas acima (`get_events_in_measure`, `get_events_in_hand`, `count_distinct_pitch_classes` e o restante da interface MIDI com 9 ferramentas) para ler, analisar e discutir o trecho.

| | |
|---|---|
| **DOI** | [**`10.5281/zenodo.20279919`**](https://doi.org/10.5281/zenodo.20279919) — Zenodo, publicado em 19 de maio de 2026 |
| Registros | 115 (subconjunto público) |
| Linha de base canônica | E3 pós-correção com 16 registros |
| Composições | 8 obras clássicas para piano, de 6 compositores (Bach, Beethoven, Chopin, Debussy, Mozart, Schumann) |
| Fonte MIDI | piano-midi.de — arranjos de Bernd Krueger |
| Licença | CC-BY-SA-3.0-DE (arranjos) sobre composições de domínio público |
| Versão | 0.4.3 (2026-05-19) |
| Esquema | `release-gate-assessment/2.0.0` |

**História da qualidade — o portão de liberação de 7 eixos.** O conjunto de dados é fornecido com um portão de liberação que distingue entre passagens baseadas em evidências e passagens com desempenho insatisfatório. Os eixos 1 a 6 são restritivos (limite absoluto, composto de margem, taxa de uso de ferramentas, correção após o uso da ferramenta, contagem de interpretações errôneas, limite inferior do estrato); o eixo 7 é enriquecido versus não relatado. Os eixos 2 e 6 permitem um bucket `ceiling_saturated_pass`, para que os registros que obtêm uma pontuação de 1,000 em condições apenas de texto / inspecionadas por ferramentas / MIDI aleatórias não diluam os estratos mais difíceis. A linha de base do Slice 22 **PASSA** pelo portão revisado. A linha de base do Slice 19 ainda **FALHA** — mantida como um diagnóstico de regressão para que o portão seja eficaz.

**Reprodutibilidade.** Um novo colaborador em qualquer plataforma (Windows nativo, macOS, Linux, WSL) pode verificar o pacote e reproduzir o resultado PASS canônico em menos de um minuto:

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions && pnpm install
pnpm exec tsx scripts/verify-public-package-checksums.ts        # 274 entries, ~2s
pnpm exec tsx scripts/check-release-gate.ts \
  datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json
# → "Aggregate: PASS" (exit 0)
```

`.gitattributes` define os terminadores de linha LF para `*.sha256` e a árvore do conjunto de dados público, para que o verificador de checksum funcione em todas as plataformas. A CLI do portão de liberação é estritamente posicional (rejeita argumentos posicionais desconhecidos / múltiplos), para que os colaboradores iniciantes não o invoquem incorretamente sem saber.

**Onde encontrá-lo.** O registro publicado no Zenodo está em https://zenodo.org/records/20279919 (DOI: [`10.5281/zenodo.20279919`](https://doi.org/10.5281/zenodo.20279919)), e o conjunto de dados é espelhado no Hugging Face em [`mcp-tool-shop/jam-actions-v0`](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0) para consumidores de `load_dataset()`. O cartão completo do conjunto de dados está em [`datasets/jam-actions-v0-public/README.md`](datasets/jam-actions-v0-public/README.md). Os metadados de depósito do Zenodo estão em [`zenodo-metadata.json`](datasets/jam-actions-v0-public/zenodo-metadata.json), os metadados de citação em [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff), o comprovante de publicação em [`publication-receipt.json`](datasets/jam-actions-v0-public/publication-receipt.json) e as notas de lançamento em [`RELEASE_NOTES.md`](datasets/jam-actions-v0-public/RELEASE_NOTES.md). O arco de construção com 25 fatias — desde o rascunho inicial do corpus até a correção, a remediação de Schumann, a revisão do portão RC, a auditoria de operador único e a execução da publicação — está em [`docs/`](docs/).

**Cite-o.** `mcp-tool-shop-org & Krueger, B. (2026). AI Jam Sessions — Tool-Use Traces v0 (Public Subset). Zenodo. https://doi.org/10.5281/zenodo.20279919`

**Realmente treina alguma coisa? — os resultados do ajuste fino.** As alegações do conjunto de dados são testadas da maneira mais rigorosa: ajustes finos pré-registrados são avaliados em relação à sua própria linha de base selada, com as regras de honestidade definidas antes de qualquer treinamento. **v0** (apenas as 78 sequências) retornou um *resultado negativo honesto* — o sistema de perguntas e respostas baseado em ferramentas apresentou uma queda de 0,661 para 0,601 ([relatório](docs/finetune-arc-eval-report.md)). **v1** (um conjunto de dados de 494 exemplos que adiciona sequências verificadas por execução e formatadas para o contexto) moveu a mesma métrica de 0,661 para **0,863** (+0,202, permutação p = 0,0043, todas as cinco sementes acima da linha de base, a música não vista +0,433) — e ainda é lançado como *"melhor em termos de direção, mas com desempenho limitado"* porque 12/16 vitórias em pares não atingiram o limite pré-registrado de ≥13/16 ([relatório](docs/finetune-arc-v1-eval-report.md)). Nenhum adaptador é publicado a partir de um resultado quase perfeito. Ambos os conjuntos de dados, as configurações, as alterações e os resultados por semente estão disponíveis em [`experiments/`](experiments/) — a disciplina é o ponto principal.

> Os arranjos MIDI são de Bernd Krueger (piano-midi.de), licenciados sob CC-BY-SA-3.0-DE. As anotações, os registros e os artefatos de avaliação são da equipe AI Jam Sessions, lançados sob a mesma licença para que a cadeia de compartilhamento seja preservada de ponta a ponta. **Limite de licença:** a licença MIT do repositório cobre o código; tudo em `datasets/` é CC-BY-SA-3.0-DE. O corpus de trabalho em `datasets/jam-actions-v0/` contém, adicionalmente, duas obras (Satie Gymnopédie No. 1, Debussy Arabesque No. 1) que são *excluídas* do subconjunto publicado porque a proveniência do arranjo não pôde ser verificada — consulte [`datasets/jam-actions-v0/PROVENANCE-NOTE.md`](datasets/jam-actions-v0/PROVENANCE-NOTE.md).

## Instale

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

Requer **Node.js 22+** (a v2.0.0 aumentou o requisito mínimo com `node-web-audio-api` 2.0). Sem drivers MIDI, sem portas virtuais, sem software externo.

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

46 ferramentas e 3 modelos de prompt em sete categorias:

### Aprenda

| Ferramenta | O que ela faz |
|------|--------------|
| `list_songs` | Navegue por gênero, dificuldade ou palavra-chave |
| `song_info` | Análise musical completa — estrutura, momentos-chave, objetivos de ensino, dicas de estilo |
| `registry_stats` | Estatísticas em toda a biblioteca: número total de músicas, gêneros, dificuldades |
| `list_measures` | Notas, dinâmica e notas de ensino de cada compasso |
| `teaching_note` | Análise detalhada de um único compasso — dedilhado, dinâmica, contexto |
| `suggest_song` | Recomendação com base no gênero, dificuldade e no que você tocou |
| `practice_setup` | Velocidade, modo, configurações de voz e comando CLI recomendados para uma música |
| `compare_songs` | Reconhecimento de padrões entre gêneros — relações-chave, similaridade de tom/intervalo, formas compartilhadas, conexões de ensino |
| `annotation_progress` | Acompanhe a qualidade da anotação em toda a biblioteca — pontuações, classificações e sugestões de melhoria |
| `server_info` | Versão do servidor, estatísticas da biblioteca, lista de mecanismos, sessão ativa |

### Reproduzir

| Ferramenta | O que ela faz |
|------|--------------|
| `play_song` | Reproduza o áudio pelos alto-falantes — músicas da biblioteca ou arquivos .mid brutos. Quatro motores (piano, vocal, harmonia, guitarra), qualquer velocidade, modo, faixa de compasso — mais um metrônomo com contagem inicial e uma flag `record` que captura a sessão para avaliação. O sintetizador e os motores em camadas são apenas acessíveis via linha de comando. |
| `stop_playback` | Parar |
| `pause_playback` | Pausar ou retomar |
| `set_speed` | Alterar a velocidade durante a reprodução (0,1×–4,0×) |
| `playback_status` | Captura em tempo real: compasso atual, andamento, velocidade, voz do teclado, estado |
| `view_piano_roll` | Renderizar como SVG (cor da mão ou arco-íris cromático de classe tonal) |
| `score_performance` | Avaliar uma peça MIDI para acompanhamento — precisão da afinação, ritmo, completude, com feedback graduado |
| `mute_hand` | Silenciar ou ativar a mão esquerda/direita durante a prática — isolar uma mão por vez |
| `detect_chord` | Identificar o acorde a partir de um conjunto de notas MIDI que estão soando (por exemplo, `[60,64,67]` → Dó) |
| `preview_teaching_cues` | Ver todas as anotações e momentos-chave antes de tocar |

### Praticar

| Ferramenta | O que ela faz |
|------|--------------|
| `practice_loop` | O exercício que um professor real atribui: repetir os compassos 5–8 mais lentamente, e o andamento aumenta (+5%) somente após uma execução *limpa* — cada execução é gravada, avaliada e resumida |
| `practice_status` | Em que ponto está o exercício: execução atual, velocidade e um diagnóstico por compasso da última tentativa |
| `score_last_take` | Avaliar a tentativa mais recente gravada — precisão da afinação, ritmo, completude, avaliação por nota |
| `view_scored_piano_roll` | A partitura anotada que todos os professores usam: o teclado é sobreposto com avaliações por nota em uma paleta segura para daltônicos (sólido = correto, tracejado = ritmo, ✕ = nota errada) |

### Cantar

| Ferramenta | O que ela faz |
|------|--------------|
| `sing_along` | Texto cantável — nomes das notas, solfejo, contorno ou sílabas. Com ou sem acompanhamento de piano. |
| `ai_jam_sessions` | Gerar um resumo para improvisação — progressão de acordes, esboço da melodia e dicas de estilo para reinterpretação |

### Guitarra

| Ferramenta | O que ela faz |
|------|--------------|
| `view_guitar_tab` | Renderizar a tablatura interativa da guitarra como HTML — clique para editar, cursor de reprodução, atalhos de teclado |
| `list_guitar_voices` | Presets de voz de guitarra disponíveis |
| `list_guitar_tunings` | Sistemas de afinação de guitarra disponíveis (padrão, Drop-D, Open G, DADGAD, etc.) |
| `tune_guitar` | Ajustar qualquer parâmetro de qualquer voz de guitarra. Persiste entre as sessões. |
| `get_guitar_config` | Configuração atual da voz de guitarra em comparação com os valores padrão de fábrica |
| `reset_guitar` | Restaurar os valores padrão de fábrica de uma voz de guitarra |

### Construir

| Ferramenta | O que ela faz |
|------|--------------|
| `add_song` | Adicionar uma nova música como JSON |
| `import_midi` | Importar um arquivo .mid com metadados |
| `annotate_song` | Escrever a linguagem musical para uma música bruta e promovê-la para o estado "pronta" |
| `save_practice_note` | Entrada do diário com dados da sessão capturados automaticamente |
| `read_practice_journal` | Carregar entradas recentes para contexto |
| `list_keyboards` | Vozes de teclado disponíveis |
| `tune_keyboard` | Ajustar qualquer parâmetro de qualquer voz de teclado. Persiste entre as sessões. |
| `get_keyboard_config` | Configuração atual em comparação com os valores padrão de fábrica |
| `reset_keyboard` | Restaurar os valores padrão de fábrica de uma voz de teclado |
| `score_annotation` | Qualidade da anotação da partitura em 5 dimensões — completude, profundidade, especificidade, valor didático, vocabulário |
| `validate_song_entry` | Validar um arquivo JSON de música em relação ao esquema antes de adicionar |
| `transpose_song` | Transpor uma música para cima ou para baixo em semitons — nova tonalidade, novas notas |
| `list_sections` | Visualizar as seções estruturais de uma música (Introdução, Verso, Refrão, etc.) |
| `add_section` | Adicionar um marcador de seção a uma música para navegação estrutural |

### Sugestões do MCP

Três modelos de sugestão para fluxos de trabalho didáticos estruturados:

| Sugestão | O que ela faz |
|--------|--------------|
| `annotate_song` | Fluxo de trabalho guiado de anotação — estudar um exemplo, escrever a linguagem musical para uma música bruta |
| `practice_plan` | Construir um plano de prática estruturado com base no gênero, dificuldade e objetivos |
| `performance_review` | Revisar uma sessão concluída — o que funcionou bem, em que focar a seguir |

## Linha de comando

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

## Status

v2.0.0 — a versão em que o conjunto de dados provou sua disciplina (veja [CHANGELOG](CHANGELOG.md)). **Alteração importante: o requisito mínimo do Node.js agora é 22** (`node-web-audio-api` 2.0); a própria ferramenta não foi alterada — seis mecanismos de som, 46 ferramentas MCP, 3 modelos de prompt e uma **biblioteca totalmente anotada: 120/120 músicas em 12 gêneros** (12 campos-chave corrigidos para as tonalidades detectadas no conteúdo nesta versão). O ciclo de aprendizado é fechado de ponta a ponta: metrônomo com contagem regressiva → gravação ao vivo → avaliação por nota → o teclado marcado com as notas → ciclos de prática que aumentam o tempo apenas após passagens bem-sucedidas. A interface do navegador é uma ferramenta real de composição — transporte preciso em relação ao ritmo, com regiões de loop, captura com ativação de gravação, desfazer/refazer completo, seleção múltipla e área de transferência, suporte a toque — [disponível na web](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/).

Também publica **[jam-actions-v0](#training-dataset)** — um conjunto de dados de treinamento de 115 registros com sequências de uso de ferramentas MCP em várias etapas, sobre piano clássico, com um limite de lançamento de 7 eixos, reprodutibilidade em condições iniciais e metadados completos do Zenodo + CITATION.cff (CC-BY-SA-3.0-DE) — espelhado no [Hugging Face](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0), e agora contém **resultados de ajuste fino em ambas as direções**: um resultado negativo honesto (v0) e um resultado positivo com disciplina de pré-registro que ficou a uma vitória de atingir seu próprio limite (v1) — veja os [resultados do ajuste fino](#training-dataset). Esta versão também corrige os registros de Bach na fonte (revisões do conjunto de trabalho r001/r002 com erratas) após o portão de execução do pipeline v1 ter detectado que a janela publicada excedeu as 62 medidas reais de BWV 846. 2506 testes aprovados em todo o servidor MCP + interface + empacotadores de conjunto de dados + ferramentas de avaliação + validador do portão de lançamento. O MIDI está tudo lá, cada música pode ensinar e o corpus desse aprendizado é lançado junto com ela.

## Segurança e Privacidade

**Dados acessados:** biblioteca de músicas (JSON + MIDI), diretório de músicas do usuário (`~/.ai-jam-sessions/songs/`), configurações de afinação de guitarra, entradas do diário de prática, dispositivo de saída de áudio local.

**Dados NÃO acessados (caminhos padrão):** o servidor MCP e a linha de comando não fazem chamadas de rede, não leem credenciais e não acessam arquivos do sistema fora do diretório de músicas do usuário. Nenhum telemetria é coletado ou enviado. A **ferramenta opcional de conjunto de dados/avaliação** incluída no mesmo pacote (`scripts/run-llm-eval.ts`, verificador de proveniência) é a única exceção: quando você a invoca explicitamente, ela pode chamar APIs LLM (lê `ANTHROPIC_API_KEY` do seu ambiente, nunca o armazena) e buscar URLs de proveniência. Ela nunca é executada como parte do servidor, da linha de comando ou da instalação.

**Permissões:** O servidor MCP utiliza apenas o protocolo de transporte stdio (sem HTTP). A interface de linha de comando (CLI) acessa o sistema de arquivos local e os dispositivos de áudio. Consulte [SECURITY.md](SECURITY.md) para obter a política completa.

## Licença

MIT
