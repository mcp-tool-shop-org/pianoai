<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

## 这是什么？

一台钢琴和一把吉他，AI学习如何演奏。它不是合成器，也不是 MIDI 库——而是一种教学乐器。

大型语言模型可以阅读和书写文本，但它无法像我们一样体验音乐。没有耳朵，没有手指，也没有肌肉记忆。AI 即兴演奏会通过赋予模型实际可用的感官来弥补这一差距：

- **阅读**——真实的 MIDI 乐谱，包含深入的音乐注释。不是手写的近似版本——而是经过解析、分析和解释的版本。
- **听觉**——六个音频引擎（振荡器钢琴、采样钢琴、人声样本、物理人声声道、加法合成人声、基于物理模型的吉他），通过您的扬声器播放，让房间里的人成为 AI 的耳朵。
- **视觉**——一个钢琴卷帘，以 SVG 格式呈现所演奏的内容，模型可以读取并验证。一个交互式吉他谱编辑器。一个浏览器控制面板，包含可视化键盘、双模式音符编辑器和调音实验室。
- **记忆**——一个练习日志，在不同的会话中保留，因此学习效果会随着时间的推移而累积。
- **歌唱**——具有 20 种人声预设的声道合成器，从歌剧女高音到电子合唱。带有音阶、轮廓和音节叙述的伴唱模式。

现在，这 120 首歌曲中的每一首都已完全注释——历史背景、逐小节的结构分析、关键时刻、教学目标和演奏技巧，涵盖所有 12 个流派。早期版本的 README 中提到，原始歌曲“正在等待 AI 吸收模式、演奏音乐并编写自己的注释”。而这正是发生的事情：这些注释是由 AI 根据每首歌曲的确定性分析（和弦、重复结构、小节边界、经过内容验证的调）编写的，并通过质量标准进行筛选，并且对每个声明都进行了对抗性的事实核查——所有乐谱编号、和弦窗口和结构计数均与实际 MIDI 文件进行验证，然后才发布。

基于相同的工作，我们还发布了 **[jam-actions-v0](#training-dataset)**——一个包含 115 个多轮 MCP 工具使用轨迹的公共数据集，这些数据来自真实的古典钢琴曲。它教会大型语言模型如何在符号音乐上进行*有依据的工具使用*，而不仅仅是文本生成，并且附带了一个 7 轴发布门控机制，用于区分“传递证据”和“因为任务很简单而通过”。有关完整信息，请参阅下方的 [训练数据集](#training-dataset)。

## 钢琴卷帘

钢琴卷帘是 AI 观察音乐的方式。它将任何歌曲渲染为 SVG 格式——蓝色表示右手，珊瑚色表示左手，并带有节拍网格、力度和小节边界：

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

两种颜色模式：**乐器**（蓝/珊瑚）或**音高等级**（彩虹色——每个 C 都是红色，每个 F# 都是青色）。SVG 格式意味着模型既可以查看图像，又可以读取标记以验证音高、节奏和手部独立性。

## 控制面板

一个基于浏览器的作曲工作室，位于此存储库中，地址为 [`apps/cockpit`](apps/cockpit)——并且可以在 **[mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)** 上实时运行。无需插件、DAW 或安装；所有内容都保留在您的浏览器中（您的工作会自动本地保存）。您更喜欢对其进行修改吗？

```bash
cd apps/cockpit && npm install && npm run dev   # Vite dev server, opens in your browser
```

- **精确的节拍控制**——音符存在于音乐时间中，因此 BPM 控制实际上会重新调整播放速度；一个点击以查找的时间标尺，带有拖动以设置**循环区域**的功能；自动滚动功能可跟随播放头。
- **录音臂捕获**——演奏 QWERTY 键、屏幕键盘或 Web MIDI 设备，它将出现在乐谱中：1 小节的倒计时、类似于循环器的跨循环循环叠加（或替换模式），原始性能时间在量化视图下保留，每次通过都是一个可撤销的单元。
- **完整的撤消/重做**——包括“清除”和“导入”在内的所有编辑都可以撤销（Ctrl+Z），拖动手势会像真实的编辑器一样合并。
- **多选 + 剪贴板**——在“选择/绘制”工具切换下进行区域选择，平台标准的修饰符单击，复制/剪切/粘贴到播放头处，复制。
- **触控 + 可访问性**——每个表面的指针事件都具有捕获功能，点击以重新定位作为非拖动替代方案，键盘音符编辑，色彩盲安全的分数叠加层。
- **双模式钢琴卷帘**——在乐器模式（彩色音高等级）和人声模式（音符按元音形状着色：/a/ /e/ /i/ /o/ /u/）之间切换。
- **可视化键盘**——从 C4 开始的两个八度音阶，映射到您的 QWERTY 键盘。单击或键入。
- **20 种人声预设**——15 种 Kokoro 映射的人声（Aoede、Heart、Jessica、Sky、Eric、Fenrir、Liam、Onyx、Alice、Emma、Isabella、George、Lewis，以及合唱和合成人声），4 种声道映射的人声和一个合成合唱部分。
- **10 种乐器预设**——6 种服务器端钢琴音色加上合成垫、管风琴、铃铛和小提琴。
- **音符检查器**——单击任何音符以编辑力度、元音和柔和度。
- **7 种调音系统**——十二平均律、纯正律（大/小调）、毕达哥拉斯音阶、四分音差平均律、韦克迈斯特 III 音阶或自定义半音偏移。可调节的 A4 参考音（392–494 Hz）。
- **调音审计**——频率表、带有节拍频率分析的间隔测试器以及调音导出/导入。
- **乐谱导入/导出**——将整个乐谱序列化为 JSON 并将其加载回来。
- **面向大型语言模型的 API**——`window.__cockpit` 公开了 `exportScore()`、`importScore()`、`addNote()`、`play()`、`stop()`、`panic()`、`setMode()` 和 `getScore()`，以便大型语言模型可以以编程方式进行作曲、编排和播放。

## 学习循环

<p align="center">
  <img src="docs/learning-loop.svg" alt="The learning loop: Read (MIDI + annotations) → Play (six sound engines) → See (piano roll · guitar tab) → Reflect (practice journal), with the journal persisting so the next session picks up where the last left off" width="100%" />
</p>

## 歌曲库

120 首歌曲，涵盖 12 个流派，由真实的 MIDI 文件构建而成。每个流派都有一首深度注释的示例曲——包含历史背景、逐小节的和声分析、关键时刻、教学目标和演奏技巧（包括人声指导）。这些示例曲用作模板：AI 研究一首歌曲，然后注释其余歌曲。

| 流派 | 示例曲 | 调 | 它所教授的内容 |
|-------|----------|-----|-----------------|
| 布鲁斯 | 《激情已逝》（B.B. King） | b 小调 | 小调布鲁斯形式，呼应式，伴随节奏演奏 |
| 古典音乐 | 《致爱丽丝》（贝多芬） | a 小调 | 回旋曲形式，触键差异化，踏板技巧 |
| 电影配乐 | 《另一个夏天的圆舞曲》（蒂尔森） | e 小调 | 琶音织体，动态的架构，没有和声变化 |
| 民谣 | 《绿袖子》 | e 小调 | 3/4 华尔兹节奏，调式混合，文艺复兴时期的声乐风格 |
| 爵士乐 | 《秋叶》（科斯玛） | g 小调 | ii-V-I 级进行，引导音，摇摆八分音符，无根音的和弦 |
| 拉丁音乐 | 《伊帕内玛的女孩》（若比姆） | F 大调 | 波萨诺瓦节奏，半音转调，声乐克制 |
| 新世纪音乐 | 《河流在你心中流淌》（Yiruma） | A 大调 | I-V-vi-IV 识别，流畅的琶音，自由节奏 |
| 流行音乐 | 《想象》（列侬） | C 大调 | 琶音伴奏，克制，真诚的声乐 |
| 拉格泰姆 | 《娱乐者》（乔普林） | C 大调 | “咚-啪”低音，切分音，多段式结构，节奏控制 |
| R&B 音乐 | 《迷信》（史蒂夫·旺达） | Eb 小调 | 十六分音符放克，打击乐键盘，幽灵音符 |
| 摇滚乐 | 《你的歌》（埃尔顿·约翰） | Eb 大调 | 钢琴叙事曲的声部进行，转位，对话式的演唱 |
| 灵魂乐 | 《依靠我》（比尔·惠瑟斯） | C 大调 | 纯正旋律，福音伴奏，呼应式 |

歌曲的进展是从 **原始**（仅 MIDI）→ **注释** → **准备就绪**（完全可播放，具有音乐语言）。人工智能通过研究歌曲并编写带有 `annotate_song` 的注释来推广歌曲。

## 声音引擎

六个引擎，以及一个分层组合器，可以同时运行任意两个：

| 引擎 | 类型 | 听起来像什么 |
|--------|------|---------------------|
| **Oscillator Piano** | 加法合成 | 具有锤击噪音、非谐音、48 声部复调和立体声效果的多重谐波钢琴。没有依赖项。 |
| **Sample Piano** | WAV 播放 | Salamander 大钢琴——480 个采样，16 个力度层，88 个琴键。真正的声音。*仅程序化 API：不提供采样（您需要提供 [Salamander](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html) 下载）；尚未连接到 CLI/MCP 引擎列表。* |
| **Vocal (Sample)** | 音高偏移的采样 | 具有滑音和连奏模式的持续元音音色。 |
| **Vocal Tract** | 物理模型 | 粉红色长号——通过 44 个单元数字波导传递的低频声门波形。四个预设：女高音、中音、男高音、男低音。 |
| **Vocal Synth** | 加法合成 | 15 个 Kokoro 声音预设，具有音色塑形、气息感和颤音。确定性（基于种子随机数生成器）。 |
| **Guitar** | 加法合成 | 物理建模的拨弦乐器——4 个预设（钢制原声吉他、尼龙古典吉他、爵士拱顶吉他、十二弦吉他），8 种调音，17 个可调节参数。 |
| **Layered** | 组合器 | 将两个引擎包围起来，并将每个 MIDI 事件都发送到这两个引擎——钢琴+合成器、声乐+合成器等。 |

### 键盘音色

六个可调节的钢琴音色，每个音色都可以单独调整参数（亮度、衰减、锤击力度、失谐、立体声宽度等）：

| 音色 | 特性 |
|-------|-----------|
| 音乐会大钢琴 | 丰富、饱满、古典 |
| 立式钢琴 | 温暖、亲切、民谣风格 |
| 电钢琴 | 丝滑、爵士乐，类似 Fender Rhodes 的音色 |
| 酒吧钢琴 | 失谐、拉格泰姆、沙龙风格 |
| 音乐盒 | 水晶般清澈、空灵 |
| 明亮的大钢琴 | 锐利、现代、流行 |

### 吉他音色

四个吉他音色预设，具有物理建模的弦合成，每个音色都有 17 个可调节参数（亮度、箱体共鸣、拨弦位置、弦阻尼等）：

| 音色 | 特性 |
|-------|-----------|
| 钢制原声吉他 | 明亮、平衡、经典的音色 |
| 尼龙古典吉他 | 温暖、柔和、圆润 |
| 爵士拱顶吉他 | 柔和、木质、干净 |
| 十二弦吉他 | 闪烁、双音，类似合唱的效果 |

## 练习日志

每次会话之后，服务器都会记录发生的事情——哪首歌曲、速度如何、有多少小节、持续了多长时间。人工智能还会添加自己的想法：它注意到什么、识别出哪些模式、接下来应该尝试什么。

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

每天一个 Markdown 文件，存储在 `~/.ai-jam-sessions/journal/` 中。人类可读，仅追加。下一次会话时，人工智能会读取其日志并从上次停止的地方继续。

## 训练数据集

**jam-actions-v0**——一个公共数据集，包含基于真实的古典钢琴 MIDI 的多轮 MCP 工具使用轨迹。该数据集是从服务器用于教学的相同库构建而来，它教导大型语言模型进行 **基于符号音乐的工具使用**——而不仅仅是文本生成。

每个记录都将 4 小节的乐句窗口与注释后的教学目标和 *目标轨迹* 配对——一个逐轮会话，其中助手使用上述 MCP 工具（`get_events_in_measure`、`get_events_in_hand`、`count_distinct_pitch_classes` 以及其余 9 个 MIDI 检查器工具）来读取、分析和讨论该乐句。

| | |
|---|---|
| **DOI** | [**`10.5281/zenodo.20279918`**](https://doi.org/10.5281/zenodo.20279918) — concept DOI, resolves to the latest published version (v0.5.0: [`10.5281/zenodo.21313954`](https://doi.org/10.5281/zenodo.21313954), published 2026-07-11) |
| 记录 | 115 个（公共子集） |
| 规范基准 | 16 条记录，经过修复后的 E3 |
| 作品集 | 6位作曲家创作的8首古典钢琴曲（巴赫、贝多芬、肖邦、德彪西、莫扎特、舒曼） |
| 原始 MIDI 文件 | piano-midi.de — Bernd Krueger 编排 |
| 许可协议 | CC-BY-SA-3.0-DE（针对公共领域作品的改编） |
| 版本 | 0.5.0（2026-07-11）— 修复巴赫 BWV 846，错误 001 + 002 |
| 架构 | `release-gate-assessment/2.0.0` |

**高质量评估——七轴发布门控。** 该数据集包含一个发布门控，用于区分基于证据的有效结果和过度饱和的结果。轴 1-6 是阻碍因素（绝对最低值、边际复合值、工具使用率、工具后修正、误解次数、分层最低值）；轴 7 是丰富与非丰富报告的对比。轴 2 和 6 允许存在一个 `ceiling_saturated_pass` 分类，因此在仅文本/工具检查/随机 MIDI 条件下得分达到 1.000 的记录不会降低更难的分层标准。Slice 22 基线 **通过** 了修订后的门控。Slice 19 基线仍然 **未能通过**——保留作为回归诊断，以确保门控具有有效性。

**可重复性。** 任何平台（Windows 本机、macOS、Linux、WSL）的新贡献者可以在一分钟内验证软件包并重现规范的 PASS 结果：

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

`.gitattributes` 为 `*.sha256` 和公共数据集树固定了 LF 行尾，因此校验和验证器在所有平台上都能正常工作。发布门控 CLI 具有严格的位置参数（拒绝未知的/多个位置参数），因此初次使用的贡献者无法意外地错误调用它。

**查找方式。** Zenodo 记录位于概念 DOI [`10.5281/zenodo.20279918`](https://doi.org/10.5281/zenodo.20279918)（始终是最新版本；v0.5.0 于 2026-07-11 发布，网址为 https://zenodo.org/records/21313954），数据集在 Hugging Face 上进行了镜像，网址为 [`mcp-tool-shop/jam-actions-v0`](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0)，供 `load_dataset()` 用户使用。完整的 Dataset Card 位于 [`datasets/jam-actions-v0-public/README.md`](datasets/jam-actions-v0-public/README.md)。Zenodo 存储库元数据位于 [`zenodo-metadata.json`](datasets/jam-actions-v0-public/zenodo-metadata.json)，引用元数据位于 [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff)，出版凭证位于 [`publication-receipt.json`](datasets/jam-actions-v0-public/publication-receipt.json），发布说明位于 [`RELEASE_NOTES.md`](datasets/jam-actions-v0-public/RELEASE_NOTES.md)。包含 25 个切片的构建过程——从初始语料草稿到一次性修复、舒曼的改进、RC-gate 的修订、独立操作员审计以及出版执行——位于 [`docs/`](docs/)。

**引用方式。** `mcp-tool-shop-org & Krueger, B. (2026). AI Jam Sessions — Tool-Use Traces v0 (Public Subset). Zenodo. https://doi.org/10.5281/zenodo.20279918`

**它是否真的可以训练任何东西？——微调结果，三个阶段。** 该数据集的声明以一种严格的方式进行测试：预先注册的微调模型与密封的基线模型进行比较，并且在任何训练之前就冻结了诚实规则。**v0**（仅包含 78 个 jam 音轨）返回了一个*诚实的否定结果*——基于工具的问答系统下降了 0.661 → 0.601 ([报告](docs/finetune-arc-eval-report.md))。**v1**（添加了 494 个示例数据，这些数据经过执行验证并具有基于证据的特征）将相同的指标提高了 +0.202，所有五个种子都高于基线——但仍然发布为“方向上更好，但效果不佳”，因为 16/16 对中，有 12 次未能达到预先注册的 ≥13/16 标准；没有从接近成功的模型中发布适配器 ([报告](docs/finetune-arc-v1-eval-report.md))。**B-1** 然后重新测试了*冻结的* v1 工件，使用了预先注册的 36 条记录，其中大部分是保留的材料：0.678 → **0.890**（+0.212，与预期的 24/34 标准相比，有 29/36 对胜出，p < 0.0001，并且在从未使用过的音乐中，有 10/12 个胜出）——这是一个*成功的模型*，但保留了诚实的警告：仅文本的表面仍然低于基线 ([报告](docs/finetune-arc-v2-b1-eval-report.md))。五个种子适配器已发布在 [`mcp-tool-shop/jam-ft-v1-qwen25`](https://huggingface.co/mcp-tool-shop/jam-ft-v1-qwen25)，声明与所有种子的平均值相关联——没有选择最佳的种子。所有三个阶段、锁定、修订和每个种子的结果都位于 [`experiments/`](experiments/) 中——重点在于这种纪律性。

> MIDI 编排由 Bernd Krueger (piano-midi.de) 提供，许可协议为 CC-BY-SA-3.0-DE。注释、音轨和评估工件由 AI Jam Sessions 团队提供，并使用相同的许可协议发布，以确保从头到尾都保留了共享许可链。**许可边界：**存储库的 MIT 许可涵盖代码；所有位于 `datasets/` 下的内容均采用 CC-BY-SA-3.0-DE 许可。在 `datasets/jam-actions-v0/` 中的工作语料库还包含两首作品（萨蒂《吉姆诺佩迪》第 1 号，德彪西《阿拉伯式舞曲》第 1 号），这些作品*不包括*在已发布的子集中，因为无法验证其编排来源——请参阅 [`datasets/jam-actions-v0/PROVENANCE-NOTE.md`](datasets/jam-actions-v0/PROVENANCE-NOTE.md)。

## 安装

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

需要 **Node.js 22+**（v2.0.0 将最低版本提高到 `node-web-audio-api` 2.0）。不需要 MIDI 驱动程序、虚拟端口或外部软件。

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

## MCP 工具

49 个工具和 7 个类别的 4 个提示模板：

### 学习

| 工具 | 它能做什么 |
|------|--------------|
| `list_songs` | 按流派、难度或关键字浏览 |
| `song_info` | 完整的音乐分析——结构、关键时刻、教学目标、风格技巧 |
| `registry_stats` | 整个库的统计数据：歌曲总数、流派、难度 |
| `list_measures` | 每个小节的音符、力度和教学说明 |
| `teaching_note` | 深入研究单个小节——指法、力度、上下文 |
| `suggest_song` | 基于流派、难度以及您已演奏的内容进行推荐 |
| `practice_setup` | 推荐的速度、模式、语音设置和 CLI 命令，用于播放一首歌曲 |
| `compare_songs` | 跨流派的模式识别——关键关系、音高/间隔相似性、共享形式、教学联系 |
| `annotation_progress` | 跟踪整个库中的注释质量——分数、等级和改进建议 |
| `server_info` | 服务器版本、库统计信息、引擎列表、活动会话 |

### 播放

| 工具 | 它能做什么 |
|------|--------------|
| `play_song` | 通过扬声器播放——库中的歌曲或原始的 .mid 文件。四个引擎（钢琴、人声、音轨、吉他），任意速度、模式、小节范围——以及一个带有预备和 `record` 标志的节拍器，用于捕捉会话以进行评分。合成器和分层引擎仅适用于命令行界面 (CLI)。 |
| `stop_playback` | 停止 |
| `pause_playback` | 暂停或恢复 |
| `set_speed` | 在播放过程中更改速度（0.1 倍 – 4.0 倍） |
| `playback_status` | 实时快照：当前小节、节奏、速度、键盘音色、状态 |
| `view_piano_roll` | 以 SVG 格式渲染（手部颜色或音高等级彩虹） |
| `score_performance` | 为 MIDI 伴奏进行评分——音高准确性、时值、完整性，并提供分级反馈 |
| `mute_hand` | 在练习期间静音或取消静音左/右手——一次隔离一只手 |
| `detect_chord` | 从当前正在播放的 MIDI 音符集中识别和弦（例如 `[60,64,67]` → C） |
| `preview_teaching_cues` | 在开始演奏之前查看所有教学笔记和关键时刻 |

### 练习

| 工具 | 它能做什么 |
|------|--------------|
| `practice_loop` | 一位真正的老师布置的练习：循环播放第 5-8 小节，速度放慢，并且只有在“干净”地完成一次后，节奏才会加快（+5%）——每次演奏都会被记录、评分和总结。 |
| `practice_status` | 练习进度：当前次数、速度以及上次演奏的每个小节的诊断结果 |
| `score_last_take` | 对最近录制的演奏进行评分——音高准确性、时值、完整性，以及每个音符的评估结果 |
| `view_scored_piano_roll` | 每位老师都会使用的带注释乐谱：钢琴卷帘叠加了每个音符的评估结果，使用一种适合色盲人群调色板（实线 = 正确，虚线 = 时值，✕ = 遗漏） |

### 唱歌

| 工具 | 它能做什么 |
|------|--------------|
| `sing_along` | 可演唱的文本——音名、唱名、旋律走向或音节。可以带钢琴伴奏，也可以不带。 |
| `ai_jam_sessions` | 生成即兴创作简报——和弦进行、旋律轮廓以及用于重新诠释的风格提示 |
| `verify_harmony` | 创作者循环的验证门：平台自身的确定性工具会检查提出的重新配器——和弦保真度（和弦引擎必须检测到每个预期的和弦）、旋律和谐度（音/张力/半音阶）、低音声部进行、调式成员关系。 |
| `auto_reharmonize` | 创作者循环，一次性完成：本地模型提出重新配器方案，`verify_harmony` 的确定性门检查每个声部配置，选择最佳的 n 个方案，直到返回经过验证的诠释结果。 |
| `compose_panel` | 对任何歌曲运行声部进行合成面板：四个系统生成伴奏，盲测跨家族 LLM 评估器对其进行排名，Bradley-Terry 方法进行聚合——并设置一个判别阈值门，以排除无法解释的演奏（仅提供方向性信号，绝不提供质量评分）。 |

### 吉他

| 工具 | 它能做什么 |
|------|--------------|
| `view_guitar_tab` | 将交互式吉他谱渲染为 HTML——点击编辑、播放光标、键盘快捷键。 |
| `list_guitar_voices` | 可用的吉他音色预设 |
| `list_guitar_tunings` | 可用的吉他调音系统（标准、降 D 调、开放 G 调、DADGAD 等） |
| `tune_guitar` | 调整任何吉他音色的任何参数。在会话之间保留。 |
| `get_guitar_config` | 当前吉他音色配置与工厂默认值对比 |
| `reset_guitar` | 将吉他音色重置为工厂设置 |

### 构建

| 工具 | 它能做什么 |
|------|--------------|
| `add_song` | 添加新的歌曲，格式为 JSON |
| `import_midi` | 导入带有元数据的 .mid 文件 |
| `annotate_song` | 编写原始歌曲的音乐语言，并将其提升到“已准备好”状态 |
| `save_practice_note` | 日记条目，其中包含自动捕获的会话数据 |
| `read_practice_journal` | 加载最近的条目以提供上下文 |
| `list_keyboards` | 可用的键盘音色 |
| `tune_keyboard` | 调整任何键盘音色的任何参数。在会话之间保留。 |
| `get_keyboard_config` | 当前配置与工厂默认值对比 |
| `reset_keyboard` | 将键盘音色重置为工厂设置 |
| `score_annotation` | 乐谱注释质量，分为 5 个维度——完整性、深度、具体性、教学价值、词汇量 |
| `validate_song_entry` | 在添加歌曲之前，根据模式验证歌曲 JSON |
| `transpose_song` | 将歌曲向上或向下转调半音——新的调式，新的音符 |
| `list_sections` | 查看歌曲的结构部分（引子、主歌、副歌等） |
| `add_section` | 为歌曲添加一个章节标记，以便进行结构导航 |

### MCP 提示

四个用于结构化教学工作流程的提示模板：

| 提示 | 它能做什么 |
|--------|--------------|
| `annotate_song` | 引导式注释工作流程——研究一个范例，为原始歌曲编写音乐语言 |
| `practice_plan` | 基于流派、难度和目标构建结构化的练习计划 |
| `performance_review` | 回顾已完成的会话——哪些方面做得好，接下来应该关注什么 |
| `maker_loop` | 执行完整的创作者循环——提出重新配器方案，使用平台的确定性工具对其进行验证，然后添加并播放经过验证的结果 |

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

## 状态

v2.1.0——分析师转变为“创作者”的版本（参见 [CHANGELOG](CHANGELOG.md)）。创作者循环作为产品发布：一个模型提出对任何库中歌曲的重新配器方案，平台自身的确定性工具对其进行验证——和弦引擎必须确认每个预期的声部配置（`verify_harmony`），每个旋律音符都根据新的和声进行标记，并且只有经过验证的诠释结果才会进入 `add_song` → `play_song` → `view_piano_roll`。通过构建来验证生成结果——没有评分标准，也没有自我评估；与编写即兴创作简报相同的 `inferChord` 也充当了评判者。`maker_loop` 提示模板指导整个循环。

自 2.1.0 版本发布以来，`main` 还扩展了合成引擎（`src/compose/`）：一个具有命名风格预设的确定性声部进行门、基于构建的成员关系声部配置规范、一次处理一个部分的优化器以及 `compose_panel` 工具，该工具运行盲测跨家族排名面板（仅提供方向性信号——无法解释和不确定的结果是第一类结果）。实时界面包含 **49 个工具和 4 个提示模板**，并且 **2930 个测试通过（跳过 1 个）**。**发布状态：**npm 的最新版本为 **2.0.0**——从 2.1.0 开始的所有内容都仅存在于 `main` 上；在下一次发布之前，请从克隆的版本运行。

在 v2.0.0 版本中——该版本证明了数据集的有效性。**重大更新：Node.js 的最低版本现在是 22** (`node-web-audio-api` 2.0)；工具本身没有变化——六个声音引擎、47 个 MCP 工具、3 个提示模板，以及一个**完全注释的库：涵盖 12 个流派的 120/120 首歌曲**（本版本中，12 个关键字段已更正为基于内容检测的键）。教学循环是完整的端到端流程：节拍器带倒计时 → 实时录音 → 每音符评分 → 标记后的钢琴乐谱 → 练习循环，只有在干净地完成之后才会提高速度。浏览器控制台是一个真正的作曲工具——精确的节拍传输、循环区域、录音激活、完整的撤销/重做、多选和剪贴板、触摸支持——[可在网上体验](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)。

同时发布 **[jam-actions-v0](#training-dataset)** ——一个包含 115 条记录的训练数据集，用于对古典钢琴中的多轮 MCP 工具使用进行跟踪，具有 7 轴发布门控、冷启动可重复性以及完整的 Zenodo + CITATION.cff 元数据（CC-BY-SA-3.0-DE），并镜像到 [Hugging Face](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0)，现在还包含**双向的经过验证的微调结果**：一个诚实的负面示例（v0）和一个遵守预注册规范的正面示例，该示例在达到自身胜利目标之前只差一次配对胜局（v1），请参阅[微调记录](#training-dataset)。此版本还修复了巴赫乐曲中的错误（工作集修订版 r001/r002 包含勘误表），此前 v1 流水线中的执行门控机制检测到已发布的窗口超出了 BWV 846 的实际 62 小节。MCP 服务器 + 控制台 + 数据集打包器 + 评估框架 + 发布门控验证器共通过了 2506 个测试。所有 MIDI 文件都包含在内，每首歌曲都可以用于教学，并且该学习语料库也随之提供。

## 安全与隐私

**涉及的数据：** 歌曲库（JSON + MIDI）、用户歌曲目录（`~/.ai-jam-sessions/songs/`）、吉他调音配置、练习日志条目、本地音频输出设备。

**未涉及的数据（默认路径）：** MCP 服务器和 CLI 不会进行任何网络调用，不会读取任何凭据，也不会触及用户歌曲目录之外的任何系统文件。不收集或发送任何遥测数据。与同一软件包中提供的**可选数据集/评估工具**（`scripts/run-llm-eval.ts`、来源验证器）是唯一的例外：当您明确调用它时，它可以调用 LLM API（从您的环境中读取 `ANTHROPIC_API_KEY`，但绝不会存储），并获取来源 URL。它永远不会作为服务器、CLI 或安装的一部分运行。

**权限：** MCP 服务器仅使用 stdio 传输（不使用 HTTP）。CLI 访问本地文件系统和音频设备。有关完整策略，请参阅 [SECURITY.md](SECURITY.md)。

## 许可协议

MIT
