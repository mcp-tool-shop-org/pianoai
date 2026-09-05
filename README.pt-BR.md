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
  <a href="https://doi.org/10.5281/zenodo.20279918"><img src="https://zenodo.org/badge/DOI/10.5281/zenodo.20279918.svg" alt="DOI"></a>
</p>

---

## O que é isto?

Um piano e uma guitarra que a IA aprende a tocar. Não é um sintetizador, nem uma biblioteca MIDI — é um instrumento de ensino.

Um LLM pode ler e escrever texto, mas não consegue vivenciar a música da maneira como nós fazemos. Sem ouvidos, sem dedos, sem memória muscular. O AI Jam Sessions preenche essa lacuna, fornecendo ao modelo sentidos que ele realmente pode usar:

- **Leitura** — partituras MIDI reais com anotações musicais detalhadas. Não são aproximações manuscritas — são analisadas, interpretadas e explicadas.
- **Audição** — seis motores de áudio (piano oscilador, piano de amostra, amostras vocais, trato vocal físico, sintetizador vocal aditivo, guitarra modelada fisicamente) que reproduzem o som através dos seus alto-falantes, transformando os ouvintes em ouvidos da IA.
- **Visualização** — um piano roll que renderiza o que foi tocado como SVG, permitindo que o modelo o leia e verifique. Um editor interativo de tablaturas de guitarra. Um painel de controle com um teclado visual, editor de notas de modo duplo e laboratório de afinação.
- **Memorização** — um diário de prática que persiste entre as sessões, para que o aprendizado se acumule com o tempo.
- **Canto** — síntese do trato vocal com 20 predefinições de voz, desde soprano lírico até coral eletrônico. Modo de acompanhamento com solfejo, contorno e narração de sílabas. E uma linha vocal real no ritmo do piano: uma partitura que condiciona o cantor, impulsionada pelo MIDI da música, com limiares de tempo (40 ms) e afinação (50 cents) antes que você a ouça — veja [Sing](#sing).

Cada uma das 120 músicas agora está totalmente anotada — contexto histórico, análise estrutural barra a barra, momentos-chave, objetivos de ensino e dicas de desempenho, em todos os 12 gêneros. Uma versão anterior deste arquivo README dizia que as músicas originais estavam "aguardando que a IA absorvesse os padrões, tocasse a música e escrevesse suas próprias anotações". É exatamente isso que aconteceu: as anotações foram escritas pela IA com base em uma análise determinística por música (acordes, estrutura de repetição, limites de seção, tonalidades verificadas), sujeitas a um critério de qualidade e verificadas adversariamente, afirmação por afirmação — números das barras, intervalos de acordes e contagens estruturais, tudo verificado em relação ao MIDI real antes que qualquer coisa fosse lançada.

A partir deste mesmo trabalho, também publicamos **[jam-actions-v0](#training-dataset)** — um conjunto de dados público de 115 rastreamentos de uso de ferramentas MCP em várias etapas sobre piano clássico real. Ele ensina LLMs a realizar *uso de ferramentas fundamentado em música simbólica*, e não apenas geração de texto, e vem com um portão de lançamento de 7 eixos que distingue "transmitir evidências" de "transmitir porque a tarefa é trivial". Consulte [Conjunto de dados de treinamento](#training-dataset) abaixo para obter a história completa.

## O Rolo de Piano

O rolo de piano é como a IA vê a música. Ele renderiza qualquer música como SVG — azul para a mão direita, coral para a esquerda, com grades de compasso, dinâmica e limites de compasso:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Dois modos de cor: **mão** (azul/coral) ou **classe de altura** (arco-íris cromático — cada Dó é vermelho, cada Fá sustenido é ciano). O formato SVG significa que o modelo pode ver a imagem e ler a marcação para verificar a altura, o ritmo e a independência das mãos.

## A Cabine de Comando

Um estúdio de composição baseado em navegador que está neste repositório em [`apps/cockpit`](apps/cockpit) — e funciona ao vivo em **[mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)**. Sem plugins, sem DAW, sem instalação; tudo permanece no seu navegador (seu trabalho é salvo automaticamente localmente). Prefere modificá-lo?

```bash
cd apps/cockpit && npm install && npm run dev   # Vite dev server, opens in your browser
```

- **Piano de concerto amostrado por padrão** — o painel de controle carrega um pacote Salamander Grand reduzido (90 arquivos OGG, 8 MB) que é carregado na sua primeira interação e reproduz através da mesma cadeia de saída das vozes do sintetizador; antes de ser carregado (ou offline), os pianos osciladores afinados cobrem perfeitamente. Amostras por [Alexander Holm](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html), CC-BY 3.0.
- **Modo de painel — a sala de audição** — testes A/B cegos e comparativos das opções do motor de composição em relação às melodias reais da biblioteca: clipes com volume igualizado, renderizados offline através do caminho real da voz, tentativas aleatórias com testes ocultos no limite inferior, classificações Bradley-Terry com intervalos de confiança bootstrap e resultados honestos (PROVISÓRIOS até que cada par atinja seu orçamento de votos; NÃO INTERPRETÁVEIS quando o limite inferior da discriminação falha). Um segundo submodo executa a mesma classificação com juízes LLM locais, além do histórico em ambos os tipos de execução e uma visualização de comparação (Kendall τ + correspondência de classificação do motor) que pergunta se as faixas proxy mais baratas refletem a verdade humana.
- **Transporte preciso ao ritmo** — as notas existem no tempo musical, portanto, o controle de BPM realmente ajusta a reprodução; uma régua de tempo com clique para busca e arraste para definir **regiões de loop**; rolagem automática que acompanha a cabeça de reprodução.
- **Captura com ativação de gravação** — toque nas teclas QWERTY, no teclado na tela ou em um dispositivo Web MIDI e elas serão gravadas na partitura: contagem inicial de 1 compasso, sobregravação no estilo looper ao longo dos ciclos do loop (ou modo de substituição), preservação da temporização bruta da performance sob uma visualização quantizada, cada passagem é uma unidade que pode ser desfeita.
- **Desfazer/Refazer completo** — todas as edições, incluindo Limpar e Importar, são reversíveis (Ctrl+Z), com gestos de arrastar que se combinam da mesma forma que os editores reais fazem.
- **Seleção múltipla + área de transferência** — seleção em formato de retângulo sob uma alternância da ferramenta Selecionar/Desenhar, cliques com modificadores padrão da plataforma, copiar/recortar/colar na cabeça de reprodução, Duplicar.
- **Toque + acessibilidade** — eventos de ponteiro com captura em todas as superfícies, toque para reposicionar como uma alternativa que não exige arrastar, edição de notas por teclado, sobreposições de partituras seguras para daltônicos.
- **Piano roll de modo duplo** — alterne entre o modo Instrumento (cores da classe cromática) e o modo Vocal (notas coloridas pela forma da vogal: /a/ /e/ /i/ /o/ /u/).
- **Teclado visual** — duas oitavas a partir de C4, mapeadas para o seu teclado QWERTY. Clique ou digite.
- **20 predefinições de voz** — 15 vozes mapeadas por Kokoro (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, mais coro e voz de sintetizador), 4 vozes mapeadas para o trato vocal e uma seção de coro sintético.
- **10 predefinições de instrumento** — as 6 vozes de piano do lado do servidor, mais pad de sintetizador, órgão, sino e cordas.
- **Inspetor de notas** — clique em qualquer nota para editar a velocidade, vogal e aspereza.
- **7 sistemas de afinação** — Temperamento igual, entonação justa (maior/menor), pitagórico, meio tom de vírgula, Werckmeister III ou deslocamentos personalizados em centavos. Referência A4 ajustável (392–494 Hz).
- **Auditoria de afinação** — tabela de frequência, testador de intervalo com análise da frequência de batimento e exportação/importação de afinação.
- **Importação/exportação de partitura** — serialize toda a partitura como JSON e carregue-a novamente.
- **API voltada para LLM** — `window.__cockpit` expõe `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()` e `getScore()` para que um LLM possa compor, organizar e reproduzir programaticamente.

## O Ciclo de Aprendizagem

<p align="center">
  <img src="docs/learning-loop.svg" alt="The learning loop: Read (MIDI + annotations) → Play (six sound engines) → See (piano roll · guitar tab) → Reflect (practice journal), with the journal persisting so the next session picks up where the last left off" width="100%" />
</p>

## A Biblioteca de Músicas

120 músicas em 12 gêneros, criadas a partir de arquivos MIDI reais. Cada gênero tem um exemplo profundamente anotado — com contexto histórico, análise harmônica barra a barra, momentos-chave, objetivos de ensino e dicas de desempenho (incluindo orientação vocal). Esses exemplos servem como modelos: a IA estuda um e, em seguida, anota o restante.

| Gênero | Exemplo | Tonalidade | O que ensina |
|-------|----------|-----|-----------------|
| Blues | A Melodia Desvaneceu (B.B. King) | Si menor | Forma de blues menor, chamada e resposta, tocando fora do ritmo |
| Clássico | Para Elisa (Beethoven) | La menor | Forma de rondó, diferenciação de toque, disciplina no uso do pedal |
| Filme | Comptine d'un autre été (Tiersen) | Mi menor | Texturas em arpejo, arquitetura dinâmica sem mudança harmônica |
| Folk | Greensleeves | Mi menor | Sensação de valsa em 3/4, mistura modal, estilo vocal renascentista |
| Jazz | Autumn Leaves (Kosma) | Sol menor | Progressões ii-V-I, tons guia, oitavas em swing, acordes sem a fundamental |
| Latino | The Girl from Ipanema (Jobim) | Fá maior | Ritmo de bossa nova, modulação cromática, contenção vocal |
| New-Age | River Flows in You (Yiruma) | Lá maior | Reconhecimento I-V-vi-IV, arpejos fluidos, rubato |
| Pop | Imagine (Lennon) | Dó maior | Acompanhamento em arpejo, contenção, sinceridade vocal |
| Ragtime | The Entertainer (Joplin) | Dó maior | Baixo "oom-pah", síncope, forma multiestrófica, disciplina de tempo |
| R&B | Superstition (Stevie Wonder) | Mi bemol menor | Funk em semicolcheias, teclado percussivo, notas fantasmas |
| Rock | Your Song (Elton John) | Mi bemol maior | Condução de voz em balada para piano, inversões, canto conversacional |
| Soul | Lean on Me (Bill Withers) | Dó maior | Melodia diatônica, acompanhamento gospel, chamada e resposta |

As músicas progridem de **cru** (apenas MIDI) → **anotadas** → **prontas** (totalmente reproduzíveis com linguagem musical). A IA promove as músicas estudando-as e escrevendo anotações com `annotate_song`.

## Motores de Som

Seis motores, mais um combinador em camadas que executa qualquer dois simultaneamente:

| Motor | Tipo | Como soa |
|--------|------|---------------------|
| **Oscillator Piano** | Síntese aditiva | Piano multi-harmônico com ruído de martelo, inarmonicidade, brilho moldado pela velocidade, polifonia de 48 vozes, imagem estéreo. Sem dependências. |
| **Sample Piano** | Reprodução de amostras. | Piano Salamander Grand — o verdadeiro. **O motor padrão sempre que um pacote é instalado** (`samples/AccurateSalamander` ou `AI_JAM_SAMPLES_DIR`); o arquivo tar do npm permanece livre de amostras, então você fornece o download do [Salamander](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html). O painel de controle do navegador carrega seu próprio pacote reduzido de 8 MB (90 arquivos OGG, CC-BY 3.0 Alexander Holm) — sem configuração na web. |
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
| Bright Grand | Marcante, contemporâneo, pop |

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

**jam-actions-v0** — um conjunto de dados público de rastreamentos de uso de ferramentas MCP em várias etapas, fundamentado em MIDI real de piano clássico. Construído a partir da mesma biblioteca com a qual este servidor ensina, o conjunto de dados ensina LLMs a realizar **uso de ferramentas fundamentado em música simbólica** — e não apenas geração de texto.

Cada registro emparelha uma janela de frase de 4 compassos com um alvo de ensino anotado e um *rastreamento de destino* — uma sessão passo a passo na qual um assistente usa as ferramentas MCP acima (`get_events_in_measure`, `get_events_in_hand`, `count_distinct_pitch_classes` e o restante das 9 ferramentas da superfície de inspeção MIDI) para ler, analisar e discutir a frase.

| | |
|---|---|
| **DOI** | [**`10.5281/zenodo.20279918`**](https://doi.org/10.5281/zenodo.20279918) — concept DOI, resolves to the latest published version (v0.5.0: [`10.5281/zenodo.21313954`](https://doi.org/10.5281/zenodo.21313954), published 2026-07-11) |
| Registros | 115 (subconjunto público) |
| Linha de base canônica | E3 pós-reparo de 16 registros |
| Composições | 8 obras clássicas para piano de 6 compositores (Bach, Beethoven, Chopin, Debussy, Mozart, Schumann) |
| Fonte MIDI | piano-midi.de — Arranjos de Bernd Krueger |
| Licença | CC-BY-SA-3.0-DE (arranjos) sobre composições de domínio público |
| Versão | 0.5.0 (11 de julho de 2026) — Lançamento com correção de Bach BWV 846, errata 001 + 002 |
| Esquema | `release-gate-assessment/2.0.0` |

**História de qualidade – o portão de lançamento de 7 eixos.** O conjunto de dados vem com um portão de lançamento que distingue a avaliação baseada em evidências da avaliação saturada. Os eixos 1–6 são de bloqueio (limite absoluto, composto marginal, taxa de uso de ferramentas, correção após o uso da ferramenta, contagem de interpretações errôneas, limite do estrato); o eixo 7 é enriquecido versus não relatado. Os eixos 2 e 6 permitem um bucket `ceiling_saturated_pass` para que os registros que obtêm uma pontuação de 1.000 em condições apenas de texto / inspecionadas por ferramentas / MIDI aleatórias não diluam os estratos mais difíceis. A linha de base Slice 22 **PASSA** pelo portão revisado. A linha de base Slice 19 ainda **FALHA** – mantida como um diagnóstico de regressão para que o portão tenha eficácia.

**Reprodutibilidade.** Um novo colaborador em qualquer plataforma (Windows nativo, macOS, Linux, WSL) pode verificar o pacote e reproduzir o resultado PASS canônico em menos de um minuto:

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions && pnpm install
pnpm exec tsx scripts/verify-public-package-checksums.ts        # 274 entries, ~2s
pnpm build && pnpm exec tsx scripts/verify-public-package-execution.ts
# → "VERDICT: PASS" — every frozen tool call replays live (needs an audio device)
git show jam-actions-v0-feature-marketed-2026-05-19:datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json > /tmp/b.json
pnpm exec tsx scripts/check-release-gate.ts /tmp/b.json
# → "Aggregate: PASS" (exit 0) — the sealed baseline ships in the v0.4.3 deposit; v0.5.0 restores it from git history
```

`.gitattributes` define os finais de linha LF para `*.sha256` e a árvore do conjunto de dados público para que o verificador de checksum funcione em todas as plataformas. A CLI do portão de lançamento é estritamente posicional (rejeita argumentos posicionais desconhecidos / múltiplos) para que os colaboradores iniciantes não o invoquem silenciosamente de forma incorreta.

**Onde encontrá-lo.** O registro Zenodo está localizado sob o DOI do conceito [`10.5281/zenodo.20279918`](https://doi.org/10.5281/zenodo.20279918) (sempre a versão mais recente; v0.5.0 publicado em 11 de julho de 2026 em https://zenodo.org/records/21313954), e o conjunto de dados é espelhado no Hugging Face em [`mcp-tool-shop/jam-actions-v0`](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0) para consumidores `load_dataset()`. O cartão completo do conjunto de dados está em [`datasets/jam-actions-v0-public/README.md`](datasets/jam-actions-v0-public/README.md). Os metadados de depósito Zenodo estão em [`zenodo-metadata.json`](datasets/jam-actions-v0-public/zenodo-metadata.json), os metadados de citação em [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff), o comprovante de publicação em [`publication-receipt.json`](datasets/jam-actions-v0-public/publication-receipt.json) e as notas de lançamento em [`RELEASE_NOTES.md`](datasets/jam-actions-v0-public/RELEASE_NOTES.md). O arco de construção de 25 fatias — desde o rascunho inicial do corpus até a correção, a remediação de Schumann, a revisão do portão RC, a auditoria de operador único e a execução da publicação — está em [`docs/`](docs/).

**Cite-o.** `mcp-tool-shop-org & Krueger, B. (2026). AI Jam Sessions — Tool-Use Traces v0 (Public Subset). Zenodo. https://doi.org/10.5281/zenodo.20279918`

**Ele realmente treina alguma coisa? – os comprovantes de ajuste fino, três arcos.** As alegações do conjunto de dados são testadas da maneira mais difícil: ajustes finos pré-registrados pontuados em relação às linhas de base seladas, com as regras de honestidade congeladas antes de qualquer treinamento. **v0** (as 78 trilhas jam sozinhas) retornou um *negativo honesto* — a avaliação baseada em ferramentas caiu de 0,661 para 0,601 ([relatório](docs/finetune-arc-eval-report.md)). **v1** (um conjunto de dados de 494 exemplos adicionando trilhas verificadas por execução e com formato de fundamentação) moveu a mesma métrica +0,202 com todas as cinco sementes acima da linha de base — e ainda foi lançado como *"direcionalmente melhor, subdimensionado"* porque 12/16 vitórias pareadas não atingiram a barra pré-registrada de ≥13/16 por um; nenhum adaptador publicado de uma quase vitória ([relatório](docs/finetune-arc-v1-eval-report.md)). **B-1** então retestou os artefatos *congelados* v1 em um grupo pré-registrado de 36 registros, dominado por material retido: 0,678 → **0,890** (+0,212, 29/36 vitórias pareadas contra a barra ex ante de 24/34, p < 0,0001 e 10/12 em música nunca treinada) — uma **vitória poderosa**, com a ressalva honesta intacta: as superfícies apenas em prosa permanecem abaixo da linha de base ([relatório](docs/finetune-arc-v2-b1-eval-report.md)). Os cinco adaptadores de sementes são publicados em [`mcp-tool-shop/jam-ft-v1-qwen25`](https://huggingface.co/mcp-tool-shop/jam-ft-v1-qwen25) com a alegação vinculada à média de todas as sementes — nenhuma das melhores sementes. Todos os três arcos, bloqueios, alterações e comprovantes por semente estão em [`experiments/`](experiments/) — a disciplina é o ponto.

> Os arranjos MIDI são de Bernd Krueger (piano-midi.de), licenciados sob CC-BY-SA-3.0-DE. As anotações, trilhas e artefatos de avaliação são da equipe AI Jam Sessions, lançados sob a mesma licença para que a cadeia de compartilhamento seja preservada de ponta a ponta. **Limite de licença:** a licença MIT do repositório cobre o código; tudo em `datasets/` é CC-BY-SA-3.0-DE. O corpus de trabalho em `datasets/jam-actions-v0/` contém adicionalmente duas obras (Satie Gymnopédie No. 1, Debussy Arabesque No. 1) que são *excluídas* do subconjunto publicado porque a proveniência de seus arranjos não pôde ser verificada — veja [`datasets/jam-actions-v0/PROVENANCE-NOTE.md`](datasets/jam-actions-v0/PROVENANCE-NOTE.md).

## Instalar

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

Requer **Node.js 22+** (v2.0.0 aumentou o limite com `node-web-audio-api` 2.0). Sem drivers MIDI, sem portas virtuais, sem software externo.

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

49 ferramentas e 4 modelos de prompt em sete categorias:

### Aprender

| Ferramenta | O que ela faz |
|------|--------------|
| `list_songs` | Navegar por gênero, dificuldade ou palavra-chave |
| `song_info` | Análise musical completa — estrutura, momentos-chave, objetivos de ensino, dicas de estilo |
| `registry_stats` | Estatísticas em toda a biblioteca: número total de músicas, gêneros, dificuldades |
| `list_measures` | Notas, dinâmica e notas de ensino de cada compasso |
| `teaching_note` | Análise detalhada de um único compasso — dedilhado, dinâmica, contexto |
| `suggest_song` | Recomendação com base no gênero, dificuldade e no que você tocou |
| `practice_setup` | Velocidade recomendada, modo, configurações de voz e comando CLI para uma música |
| `compare_songs` | Reconhecimento de padrões entre gêneros — relacionamentos-chave, similaridade de tom/intervalo, formas compartilhadas, conexões de ensino |
| `annotation_progress` | Rastreamento da qualidade da anotação em toda a biblioteca — pontuações, classificações e sugestões de melhoria |
| `server_info` | Versão do servidor, estatísticas da biblioteca, lista de mecanismos, sessão ativa |

### Tocar

| Ferramenta | O que ela faz |
|------|--------------|
| `play_song` | Reproduza através de alto-falantes — músicas da biblioteca ou arquivos .mid brutos. Quatro motores (piano, vocal, harmonia, guitarra), qualquer velocidade, modo, faixa de compasso — mais um metrônomo com contagem inicial e uma flag `record` que registra a sessão para avaliação. O sintetizador e os motores em camadas são apenas acessíveis via linha de comando. |
| `stop_playback` | Parar |
| `pause_playback` | Pausar ou retomar |
| `set_speed` | Alterar a velocidade durante a reprodução (0,1×–4,0×) |
| `playback_status` | Instantâneo em tempo real: compasso atual, andamento, velocidade, voz do teclado, estado |
| `view_piano_roll` | Renderizar como SVG (cor da mão ou arco-íris cromático de classe tonal) |
| `score_performance` | Avaliar uma peça MIDI para acompanhamento — precisão da afinação, ritmo, completude, com feedback graduado |
| `mute_hand` | Silenciar ou ativar a mão esquerda/direita durante a prática — isolar uma mão por vez |
| `detect_chord` | Identificar o acorde a partir de um conjunto de notas MIDI que estão soando (por exemplo, `[60,64,67]` → Dó) |
| `preview_teaching_cues` | Ver todas as anotações e momentos-chave antes de tocar |

### Praticar

| Ferramenta | O que ela faz |
|------|--------------|
| `practice_loop` | O exercício que um professor real atribui: repetir os compassos 5–8 mais lentamente, e o andamento aumenta (+5%) apenas após uma execução *limpa* — cada execução é registrada, avaliada e resumida |
| `practice_status` | Em que ponto está o exercício: execução atual, velocidade e um diagnóstico por compasso da última tentativa |
| `score_last_take` | Avaliar a tentativa mais recente gravada — precisão da afinação, ritmo, completude, veredictos por nota |
| `view_scored_piano_roll` | A partitura anotada que todos os professores usam: o teclado de piano sobreposto com veredictos por nota em uma paleta segura para daltônicos (sólido = correto, tracejado = ritmo, ✕ = perdido) |

### Cantar

| Ferramenta | O que ela faz |
|------|--------------|
| `sing_along` | Texto cantável — nomes das notas, solfejo, contorno ou sílabas. Com ou sem acompanhamento de piano. |
| `ai_jam_sessions` | Gerar um resumo para improvisação — progressão de acordes, esboço da melodia e dicas de estilo para reinterpretação |
| `verify_harmony` | O portão de verificação do ciclo de criação: uma proposta de reharmonização é verificada pelas próprias ferramentas determinísticas da plataforma — fidelidade do acorde (o motor de acordes deve detectar cada acorde pretendido), consonância da melodia (tom/tensão/cromático), condução das vozes do baixo, pertencimento à tonalidade |
| `auto_reharmonize` | O ciclo de criação em uma única chamada — um modelo local propõe uma reharmonização, o portão determinístico `verify_harmony` verifica cada voz, a melhor de n até que uma interpretação verificada seja obtida |
| `compose_panel` | Execute o painel de composição de condução de vozes em qualquer música: quatro sistemas realizam acompanhamentos, juízes LLM cegos e de diferentes famílias classificam-nos, Bradley-Terry agrega — com um portão do limite inferior da discriminação que invalida execuções não interpretáveis (sinal direcional apenas, nunca uma pontuação de qualidade). Executa por minutos e transmite notificações de progresso enquanto trabalha. |

**Uma linha cantada no ritmo — a rota vocal.** Qualquer música da biblioteca pode conter uma linha vocal real que se encaixa no piano: um **relógio de partitura** (`scripts/build-score-clock.mjs`) deriva o tom, o início e a duração de cada sílaba do MIDI da música na linha do tempo do reprodutor; um cantor local, Apache-2.0, condicionado pela partitura ([SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer)) canta a partir desse relógio na sua GPU; e dois limitadores medem o resultado antes que algo seja considerado uma mixagem — **tempo**: cada início de vogal dentro de 40 ms da partitura; **afinação**: cada nota dentro de 50 cents, deslocamento global dentro de 20. As palavras são selecionadas de um conjunto de gravações e unidas apenas nos limites das palavras com transições suaves. Controles: `--track` (qual faixa MIDI é a melodia; `--list-tracks` para visualizar), `--lyrics "A-ma-zing grace …"` (um token por nota, sílabas unidas por `-`), `--measures`, o clipe de prompt (a voz), quantas gravações e os limiares do limitador — cada um com sua citação em `scripts/vocal_clock.py`. Rota, controles e comprovantes: [manual → Vocais](https://mcp-tool-shop-org.github.io/ai-jam-sessions/handbook/vocals/), [`docs/vocal-clock.md`](docs/vocal-clock.md); a pesquisa por trás das escolhas: [`docs/vocal-singing-study-2026-09.md`](docs/vocal-singing-study-2026-09.md).

### Guitarra

| Ferramenta | O que ela faz |
|------|--------------|
| `view_guitar_tab` | Renderizar tablaturas interativas de guitarra como HTML — clique para editar, cursor de reprodução, atalhos de teclado |
| `list_guitar_voices` | Presets de voz de guitarra disponíveis |
| `list_guitar_tunings` | Sistemas de afinação de guitarra disponíveis (padrão, Drop-D, Open G, DADGAD, etc.) |
| `tune_guitar` | Ajustar qualquer parâmetro de qualquer voz de guitarra. Persiste entre as sessões. |
| `get_guitar_config` | Configuração atual da voz de guitarra em comparação com os valores padrão de fábrica |
| `reset_guitar` | Restaurar os valores padrão de fábrica de uma voz de guitarra |

### Criar

| Ferramenta | O que ela faz |
|------|--------------|
| `add_song` | Adicionar uma nova música como JSON |
| `import_midi` | Importar um arquivo .mid com metadados |
| `annotate_song` | Escrever linguagem musical para uma música bruta e promovê-la ao estado "pronta" |
| `save_practice_note` | Entrada de diário com dados da sessão capturados automaticamente |
| `read_practice_journal` | Carregar entradas recentes para contexto |
| `list_keyboards` | Vozes de teclado disponíveis |
| `tune_keyboard` | Ajustar qualquer parâmetro de qualquer voz de teclado. Persiste entre as sessões. |
| `get_keyboard_config` | Configuração atual em comparação com os valores padrão de fábrica |
| `reset_keyboard` | Restaurar os valores padrão de fábrica de uma voz de teclado |
| `score_annotation` | Qualidade da anotação da partitura em 5 dimensões — completude, profundidade, especificidade, valor didático, vocabulário |
| `validate_song_entry` | Validar um JSON de música em relação ao esquema antes de adicionar |
| `transpose_song` | Transpor uma música para cima ou para baixo por semitons — nova tonalidade, novas notas |
| `list_sections` | Visualizar as seções estruturais de uma música (Introdução, Verso, Refrão, etc.) |
| `add_section` | Adicionar um marcador de seção a uma música para navegação estrutural |

### Prompts do MCP

Quatro modelos de prompt para fluxos de trabalho de ensino estruturados:

| Prompt | O que ela faz |
|--------|--------------|
| `annotate_song` | Fluxo de trabalho guiado de anotação — estudar um exemplo, escrever linguagem musical para uma música bruta |
| `practice_plan` | Criar um plano de prática estruturado com base no gênero, dificuldade e objetivos |
| `performance_review` | Revisar uma sessão concluída — o que funcionou bem, em que focar a seguir |
| `maker_loop` | Percorrer todo o ciclo de criação — propor uma reharmonização, verificá-la com as ferramentas determinísticas da plataforma e, em seguida, adicionar e reproduzir o resultado verificado |

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

## Status

**v2.3.0 — a versão em que o instrumento aprendeu a cantar no ritmo** (veja [CHANGELOG](CHANGELOG.md)). Agora, qualquer música da biblioteca pode conter uma linha vocal real que se encaixa no piano: um **relógio de partitura** deriva o tom, o início e a duração de cada sílaba do MIDI da música na linha do tempo do reprodutor; um cantor local, Apache-2.0, condicionado pela partitura ([SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer)) canta a partir dele; e dois limitadores medem o resultado antes que algo seja considerado uma mixagem — tempo (cada vogal dentro de 40 ms da partitura) e afinação (cada nota dentro de 50 cents). A execução de Amazing Grace incluída mede 6 ms no pior tempo e -2,7 cents na afinação global, com comprovantes registrados; a página inicial a apresenta como um estado honesto, com o único defeito restante nomeado (a emenda de abertura, repassada). A rota, seus controles e a pesquisa por trás de cada escolha (cinco linhas de estudo, citadas) estão no [manual](https://mcp-tool-shop-org.github.io/ai-jam-sessions/handbook/vocals/) e [`docs/`](docs/). A interface ao vivo permanece inalterada em **49 ferramentas e 4 modelos de prompt**, com **3.080 testes aprovados (1 ignorado)**, além do próprio conjunto de testes pytest do instrumento vocal. **Estado de publicação:** publicado — [`@mcptoolshop/ai-jam-sessions@2.3.0`](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions) no npm, com rastreabilidade comprovada.

**v2.2.0 — a versão em que o instrumento ganhou ouvidos reais e uma sala de audição** (veja [CHANGELOG](CHANGELOG.md)). O piano padrão do painel de controle agora é um **piano de concerto amostrado** — um pacote Salamander reduzido que é carregado na sua primeira ação e retorna ao sintetizador oscilador afinado até estar pronto — e o servidor seleciona automaticamente o motor de amostra sempre que um pacote completo é instalado. No topo, está o **Painel de Composição**: uma sala de audição A/B cega e com volume igualizado, onde um humano classifica as opções do motor de composição em relação a âncoras teoricamente válidas e inválidas (Bradley-Terry com intervalos de confiança bootstrap, um limite inferior de discriminação no estilo MUSHRA, PROVISÓRIO e NÃO INTERPRETÁVEL como resultados de primeira classe), ao lado de um painel de modelos locais que executa a mesma classificação com juízes LLM de diferentes famílias e uma visualização de comparação (Kendall τ) que pergunta se as faixas proxy mais baratas refletem a verdade humana.

A mesma versão inclui o motor de composição que alimenta o painel (`src/compose/`: um limitador determinístico de condução de voz com predefinições de estilo nomeadas, especificações de voz por construção, um refinador parte a parte), uma avaliação completa de saúde (45 problemas corrigidos — moeda de segurança, strings humanizadas, uma alteração visual que preserva a aparência), entradas da biblioteca de Satie e Debussy reestruturadas a partir de bytes de domínio público com comprovante da Mutopia, e uma fase de reforço de testes com estranhos: erros de validação descritivos, envelopes de erro estruturados `{code, message, hint}`, um arquivo tar selecionado, notificações de progresso em ferramentas longas e gramática de erro da CLI. Essa versão foi lançada como [`@mcptoolshop/ai-jam-sessions@2.2.0`](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions) com 49 ferramentas, 4 modelos de prompt e 3.033 testes.

v2.1.0 — a versão em que o analista se tornou um **criador** (veja [CHANGELOG](CHANGELOG.md)). O ciclo de criação é lançado como produto: um modelo propõe uma reharmonização de qualquer música da biblioteca, e as próprias ferramentas determinísticas da plataforma validam-na — o motor de acordes deve confirmar cada voz pretendida (`verify_harmony`), cada nota da melodia é rotulada em relação à nova harmonia e apenas uma interpretação verificada prossegue para `add_song` → `play_song` → `view_piano_roll`. Geração verificada por construção — sem rubrica, sem autoavaliação; o mesmo `inferChord` que escreve resumos de improvisação é o avaliador. O modelo de prompt `maker_loop` percorre todo o ciclo.

Anteriormente na versão 2.0.0 — a versão em que o conjunto de dados demonstrou sua eficácia. **Importante: o limite do Node.js agora é 22** (`node-web-audio-api` 2.0); a própria ferramenta permanece inalterada — seis motores de som, 47 ferramentas MCP, 3 modelos de prompt e uma **biblioteca totalmente anotada: 120/120 músicas em 12 gêneros** (12 campos-chave corrigidos para corresponder às chaves detectadas no conteúdo nesta versão). O ciclo de aprendizado é completo: metrônomo com contagem regressiva → gravação ao vivo → pontuação por nota → o rolo de piano marcado → ciclos de prática que aumentam o tempo apenas após execuções limpas. O painel do navegador é uma ferramenta real de composição — transporte preciso, com regiões de loop, captura com ativação de gravação, desfazer/refazer completo, seleção múltipla e área de transferência, suporte a toque — [disponível na web](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/).

Também publica **[jam-actions-v0](#training-dataset)** — um conjunto de dados de treinamento com 115 registros de rastreamentos de uso de ferramentas MCP em várias etapas, aplicado a peças clássicas para piano, com um gatilho de liberação de 7 eixos, reprodutibilidade em condições de inicialização fria e metadados completos do Zenodo + CITATION.cff (CC-BY-SA-3.0-DE) — espelhado no [Hugging Face](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0), e agora com **resultados de ajuste fino documentados em ambas as direções**: um resultado negativo honesto (v0) e um resultado positivo disciplinado por pré-registro que parou uma vitória antes de atingir sua própria meta (v1) — veja os [documentos de ajuste fino](#training-dataset). Esta versão também corrige os registros de Bach na fonte (revisões do conjunto de trabalho r001/r002 com erratas) após o gatilho de execução do pipeline v1 ter detectado que a janela publicada excedeu as 62 medidas reais de BWV 846. 2506 testes aprovados em todo o servidor MCP + painel + empacotadores de conjunto de dados + ferramentas de avaliação + validador de gatilho de liberação. O MIDI está tudo lá, cada música pode ensinar e o corpus desse aprendizado é enviado junto com ela.

## Segurança e Privacidade

**Dados acessados:** biblioteca de músicas (JSON + MIDI), diretório de músicas do usuário (`~/.ai-jam-sessions/songs/`), configurações de afinação de guitarra, entradas do diário de prática, dispositivo de saída de áudio local.

**Dados NÃO acessados (caminhos padrão):** o servidor e a CLI MCP não fazem chamadas de rede, não leem credenciais e não acessam arquivos do sistema fora do diretório de músicas do usuário. Nenhum dado de telemetria é coletado ou enviado. A **ferramenta/conjunto de dados opcional** incluída no mesmo pacote (`scripts/run-llm-eval.ts`, verificador de proveniência) é a única exceção: quando você a invoca explicitamente, ela pode chamar APIs LLM (lê `ANTHROPIC_API_KEY` do seu ambiente, nunca o armazena) e buscar URLs de proveniência. Ela nunca é executada como parte do servidor, CLI ou instalação.

**Permissões:** O servidor MCP usa apenas transporte stdio (sem HTTP). A CLI acessa o sistema de arquivos local e dispositivos de áudio. Consulte [SECURITY.md](SECURITY.md) para a política completa.

## Licença

MIT
