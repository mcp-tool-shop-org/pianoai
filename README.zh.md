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
  <a href="https://codecov.io/gh/mcp-tool-shop-org/ai-jam-sessions"><img src="https://codecov.io/gh/mcp-tool-shop-org/ai-jam-sessions/branch/main/graph/badge.svg" alt="codecov"></a>
  <a href="https://www.npmjs.com/package/ai-jam-sessions"><img src="https://img.shields.io/npm/v/ai-jam-sessions" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/songs-120_across_12_genres-blue" alt="Songs"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/annotated-24-green" alt="Ready"></a>
  <a href="datasets/jam-actions-v0-public/README.md"><img src="https://img.shields.io/badge/dataset-jam--actions--v0%20(115_records)-8b5cf6" alt="Training dataset"></a>
</p>

---

## 这是什么？

一种人工智能学习演奏的钢琴和吉他。它不是合成器，也不是 MIDI 库，而是一种教学工具。

大型语言模型（LLM）可以阅读和书写文本，但它无法像人类一样体验音乐。它没有耳朵，没有手指，也没有肌肉记忆。AI Jam Sessions 通过赋予模型它实际可以使用的感官来弥补这一差距：

- **阅读**：带有丰富音乐注释的真实 MIDI 音符。不是手工书写的近似值，而是经过解析、分析和解释的内容。
- **听觉**：六个音频引擎（钢琴振荡器、采样钢琴、人声样本、物理人声声道、加法人声合成器、物理建模吉他），通过您的扬声器播放，让房间里的“人类”成为人工智能的“耳朵”。
- **视觉**：钢琴卷轴，它以 SVG 格式呈现已演奏的内容，模型可以读取并验证。一个交互式的吉他指法编辑器。一个带有可视化键盘、双模式音符编辑器和调音实验室的浏览器界面。
- **记忆**：一个练习记录，它在各个会话之间持续存在，从而随着时间的推移积累学习成果。
- **歌唱**：带有 20 种预设人声的声道合成，从歌剧女高音到电子合唱。带伴奏模式，带有音阶、音调和音节的讲解。

每个 12 个流派中的每个示例都带有丰富的注释，作为人工智能首先研究的参考作品，包括历史背景、逐小节的结构分析、关键时刻、教学目标和演奏技巧。其他 96 首歌曲是原始 MIDI 文件，等待人工智能吸收模式、演奏音乐并编写自己的注释。

我们还在此基础上发布了 **[jam-actions-v0](#training-dataset)**，这是一个包含 115 个多轮 MCP 工具使用轨迹的公共数据集，这些轨迹是在真实的古典钢琴上采集的。它教会大型语言模型进行*基于符号音乐的工具使用*，而不仅仅是文本生成，并且包含一个 7 轴的发布闸门，用于区分“提供证据”和“因为任务过于简单而完成”的情况。有关完整信息，请参阅下面的“训练数据集”。

## 钢琴卷轴

钢琴卷轴是人工智能感知音乐的方式。它将任何歌曲渲染为 SVG 格式，蓝色表示右手，珊瑚色表示左手，并带有节拍网格、力度变化和小节边界：

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

有两种颜色模式：**手部**（蓝色/珊瑚色）或**音阶**（彩色光谱——每个 C 都是红色，每个 F# 都是青色）。SVG 格式意味着模型既可以查看图像，也可以读取标记以验证音高、节奏和手部独立性。

## 控制面板

一个基于浏览器的乐器和人声工作室，它与 MCP 服务器并行打开。没有插件，没有数字音频工作站（DAW），而是一个带有钢琴的网页。

- **双模式钢琴卷轴**：在乐器模式（彩色音阶）和人声模式（音符按元音形状着色：/a/ /e/ /i/ /o/ /u/）之间切换。
- **可视化键盘**：从 C4 开始的两个八度，映射到您的 QWERTY 键盘。单击或键入。
- **20 种人声预设**：15 种 Kokoro 映射的人声（Aoede、Heart、Jessica、Sky、Eric、Fenrir、Liam、Onyx、Alice、Emma、Isabella、George、Lewis，以及合唱和合成人声），4 种声道映射的人声，以及一个合成合唱部分。
- **10 种乐器预设**：6 种服务器端的钢琴声音，以及合成垫、风琴、铃铛和弦乐。
- **音符检查器**：单击任何音符以编辑力度、元音和呼吸感。
- **7 种调音系统**：等温调音、纯调音（大调/小调）、毕达哥拉斯调音、四度音程平均律、韦克迈斯特三号调音，或自定义的音高偏移量。可调节的 A4 参考音（392–494 Hz）。
- **调音审计**：频率表、音程测试器（带有拍频分析），以及调音导出/导入功能。
- **乐谱导入/导出**：将整个乐谱序列化为 JSON 格式，并将其加载回来。
- **面向 LLM 的 API**：`window.__cockpit` 暴露了 `exportScore()`、`importScore()`、`addNote()`、`play()`、`stop()`、`panic()`、`setMode()` 和 `getScore()` 函数，以便大型语言模型可以编程地进行作曲、编排和播放。

## 学习循环

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

## 歌曲库

包含12个流派，共120首歌曲，均基于真实的MIDI文件构建。每个流派都有一首经过深入注释的示范曲，内容包括历史背景、逐小节的和声分析、关键点、教学目标以及演奏技巧（包括人声指导）。这些示范曲作为模板：人工智能系统会学习一首示范曲，然后对其他歌曲进行注释。

| 流派 | 示范曲 | 调性 | 教学内容 |
|-------|----------|-----|-----------------|
| 布鲁斯 | The Thrill Is Gone (B.B. King) | 降B小调 | 小调布鲁斯形式，呼应，节奏略微滞后 |
| 古典 | Für Elise (Beethoven) | 降A小调 | 回旋曲形式，触键技巧，踏板控制 |
| 电影配乐 | Comptine d'un autre été (Tiersen) | 降E小调 | 琶音织体，动态架构，不改变和声 |
| 民谣 | Greensleeves | 降E小调 | 3/4 华尔兹节奏，调式混合，文艺复兴时期的人声风格 |
| 爵士乐 | Autumn Leaves (Kosma) | 降G小调 | ii-V-I 和弦进行，导音，切分八分音符，无根音的伴奏 |
| 拉丁 | The Girl from Ipanema (Jobim) | 升F大调 | 桑巴节奏，色彩性调性变化，人声的克制 |
| 新世纪 | River Flows in You (Yiruma) | 升A大调 | I-V-vi-IV 和弦识别，流畅的琶音，弹性节奏 |
| 流行 | Imagine (Lennon) | 升C大调 | 琶音伴奏，克制，人声的真诚 |
| 拉格音乐 | The Entertainer (Joplin) | 升C大调 | 低音“oom-pah”，切分音，多乐段形式，节奏控制 |
| R&B | Superstition (Stevie Wonder) | 降E♭小调 | 16分音符的放克，打击乐键盘，弱音 |
| 摇滚 | Your Song (Elton John) | 降E♭大调 | 钢琴抒情曲的声部进行，转位，对话式演唱 |
| 灵魂乐 | Lean on Me (Bill Withers) | 升C大调 | 自然音阶的旋律，福音音乐的伴奏，呼应 |

歌曲从**原始状态**（仅MIDI）→ **已注释** → **已完成**（可完整演奏，包含音乐术语）进行演变。人工智能系统通过学习歌曲并使用`annotate_song`函数进行注释来推广歌曲。

## 声音引擎

六个引擎，以及一个分层组合器，可以同时运行任意两个引擎：

| 引擎 | 类型 | 声音效果 |
|--------|------|---------------------|
| **Oscillator Piano** | 加成合成 | 带锤击声的复音钢琴，非谐性，48声部复音，立体声成像。无任何依赖。 |
| **Sample Piano** | WAV 采样 | Salamander Grand Piano — 480 个采样，16 个力度层，88 个琴键。真实的声音。 |
| **Vocal (Sample)** | 移调采样 | 带有滑音和连奏模式的持续元音。 |
| **Vocal Tract** | 物理模型 | Pink Trombone — 通过 44 个数字波导的 LF 喉音波形。四个预设：高音、中音、男高音、低音。 |
| **Vocal Synth** | 加成合成 | 15 个 Kokoro 语音预设，带有音色塑造、呼吸感、颤音。确定性（带种子随机数生成器）。 |
| **Guitar** | 加成合成 | 物理建模拨弦乐器 — 4 个预设（钢弦原声吉他、尼龙古典吉他、爵士拱琴、12 弦吉他），8 种调弦，17 个可调参数。 |
| **Layered** | 组合器 | 将两个引擎组合在一起，并将每个 MIDI 事件发送到两个引擎 — 钢琴+合成器，人声+合成器，等等。 |

### 键盘音色

六种可调节的钢琴音色，每种音色都可以单独调整参数，包括明亮度、衰减、琴槌硬度、音高微调、立体声宽度等等。

| 声音。 | 角色；性格；品质。 |
|-------|-----------|
| 三角钢琴 (指大型三角钢琴) | 丰富、醇厚、典雅。 |
| 正直的；笔直的；端正的。 | 温馨、亲密、民俗风格。 |
| 电钢琴。 | 丝滑、充满爵士风情的 Fender Rhodes 琴音。 |
| 乡村音乐酒吧。 | 失调的、拉格泰姆风格的、酒馆。 |
| 音乐盒 | 晶莹剔透，如梦似幻。 |
| 百利光电 (Baili Optoelectronics) | 前卫、现代、流行。 |

### 吉他之声

四个吉他音色预设，采用物理建模弦乐合成技术，每个预设包含17个可调节参数，包括明亮度、共鸣、拨弦位置、弦的阻尼等。

| 声音。 | 角色；性格；品质。 |
|-------|-----------|
| 钢铁战列舰 | 明亮、均衡、经典的音质。 |
| 尼龙古典系列。 | 温暖、柔软、圆润。 |
| 爵士乐原声吉他 (或：拱形琴身爵士乐吉他) | 柔和、木质、清新。 |
| 十二弦。 | 闪耀、重复、如同合唱。 |

## 实践期刊

每次练习结束后，服务器会记录下所有信息，包括播放的歌曲、速度、节拍数以及时长。人工智能系统会在此基础上进行分析，记录其观察到的内容、识别出的模式，并给出下一步的建议。

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

每天生成一个 Markdown 文件，存储在 `~/.ai-jam-sessions/journal/` 目录下。文件内容可读，且只能追加内容，不能修改。在下一次会话中，人工智能会读取其日记，并从上次停止的地方继续。

## 训练数据集

**jam-actions-v0** 是一个公开的数据集，其中包含基于真实古典钢琴MIDI数据的多轮交互式机器学习工具使用轨迹。该数据集与服务器上用于教学的库相同，旨在训练大型语言模型，使其能够进行**基于符号音乐的工具使用**，而不仅仅是文本生成。

每个记录都将一个包含四个小节的乐句片段与一个标注的教学目标以及一个“目标轨迹”相关联。“目标轨迹”是指一个循序渐进的环节，在这个环节中，一位助手会使用上述 MCP 工具（包括 `get_events_in_measure`、`get_events_in_hand`、`count_distinct_pitch_classes` 以及其他 9 个 MIDI 检查工具）来阅读、分析和讨论该乐句。

| | |
|---|---|
| 记录。 | 115 (公共子集) |
| 标准基准线。 | E3 型号，维修后记录 16 条数据。 |
| 作品集。 | 8首古典钢琴作品（贝多芬、巴赫、舒伯特、舒曼、莫扎特、门德尔松、柴可夫斯基）。 |
| 源MIDI数据。 | piano-midi.de - Bernd Krueger 的乐谱编排作品。 |
| 许可。 | CC-BY-SA-3.0-DE (改编版)，基于公共领域的乐曲。 |
| 版本。 | 0.4.3 (2026-05-19) |
| 模式；结构图；框架。 | `release-gate-assessment/2.0.0` |

**高质量评估——七轴发布门禁。** 该数据集包含一个发布门禁，用于区分基于证据的合格结果和达到上限的合格结果。轴 1-6 用于进行限制性评估（绝对下限、误差范围、工具使用率、工具使用后正确率、错误解释次数、分层下限）；轴 7 用于评估报告的丰富程度与未报告情况。轴 2 和 6 包含一个 `ceiling_saturated_pass` 分类，以防止在仅使用文本/使用工具检查/随机 MIDI 条件下得分达到 1.000 的记录，从而稀释更难的分层。Slice 22 的基准测试**通过**了修订后的门禁。Slice 19 的基准测试仍然**未通过**，但保留该测试作为回归诊断，以确保门禁具有一定的严格性。

**可重复性。** 任何平台的（包括 Windows 本地环境、macOS、Linux 以及 WSL）新用户都可以验证该软件包，并在一分钟内复现标准的“通过”结果：

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions && pnpm install
pnpm exec tsx scripts/verify-public-package-checksums.ts        # 273 entries, ~2s
pnpm exec tsx scripts/check-release-gate.ts \
  datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json
# → "Verdict: PASS"
```

`.gitattributes` 文件强制使用 LF 换行符，适用于 `*.sha256` 文件和公共数据集目录，以确保校验和验证器在所有平台上都能正常工作。`release-gate` 命令行工具采用严格的位置参数，以防止初级贡献者错误地使用该工具。

**查找位置。** 完整的数据集卡片位于 [`datasets/jam-actions-v0-public/README.md`](datasets/jam-actions-v0-public/README.md)。Zenodo 的元数据位于 [`zenodo-metadata.json`](datasets/jam-actions-v0-public/zenodo-metadata.json)，引文元数据位于 [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff)，发布说明位于 [`RELEASE_NOTES.md`](datasets/jam-actions-v0-public/RELEASE_NOTES.md)。从初始语料库草稿到修复、Schumann 修复、RC 门禁修订以及操作员独立性审计的整个构建过程记录在 [`docs/`](docs/) 目录中。

> MIDI 编排由 Bernd Krueger (piano-midi.de) 完成，采用 CC-BY-SA-3.0-DE 许可协议。注释、跟踪和评估数据由 AI Jam Sessions 团队提供，并采用相同的许可协议发布，以确保整个共享链的完整性。

## 安装

```bash
npm install -g ai-jam-sessions
```

需要 **Node.js 18+**。不支持 MIDI 驱动程序、虚拟端口或外部软件。

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

包含 41 个工具和 3 个提示模板，分布在六个类别中：

### 学习

| 工具 | 功能 |
|------|--------------|
| `list_songs` | 按流派、难度或关键词浏览 |
| `song_info` | 完整的乐曲分析：结构、关键部分、教学目标、风格技巧 |
| `registry_stats` | 整个库的统计数据：总歌曲数、流派、难度 |
| `list_measures` | 每个音符的音高、力度和教学提示 |
| `teaching_note` | 深入了解单个音符：指法、力度、上下文 |
| `suggest_song` | 基于流派、难度和您已演奏过的歌曲的推荐 |
| `practice_setup` | 推荐的节拍、模式、音色设置以及用于歌曲的命令行指令 |
| `compare_songs` | 跨流派的模式识别：关键关系、音高/音程相似性、共享结构、教学关联 |
| `annotation_progress` | 跟踪整个库的注释质量：评分、等级和改进建议 |
| `server_info` | 服务器版本、库统计数据、引擎列表、活动会话 |

### 播放

| 工具 | 功能 |
|------|--------------|
| `play_song` | 通过扬声器播放：库中的歌曲或原始 .mid 文件。支持任何引擎、节拍、模式和音符范围。 |
| `stop_playback` | 停止 |
| `pause_playback` | 暂停或恢复 |
| `set_speed` | 在播放过程中更改节拍（0.1×–4.0×） |
| `playback_status` | 实时快照：当前音符、节拍、速度、键盘音色、状态 |
| `view_piano_roll` | 以 SVG 格式渲染（彩色或音阶色轮） |
| `score_performance` | 对 MIDI 伴奏进行评分：音高准确性、节奏、完整性，并提供分级反馈 |
| `mute_hand` | 练习时，可以静音或取消静音左手/右手，以便一次隔离一只手 |
| `preview_teaching_cues` | 在播放之前查看所有教学提示和关键部分 |

### 唱歌

| 工具 | 功能 |
|------|--------------|
| `sing_along` | 可演唱的文本：音符名称、音阶、轮廓或音节。可以选择带有或不带有钢琴伴奏。 |
| `ai_jam_sessions` | 生成即兴演奏提示：和弦进行、旋律框架和风格提示，用于重新演绎 |

### 吉他

| 工具 | 功能 |
|------|--------------|
| `view_guitar_tab` | 以 HTML 格式渲染交互式吉他谱：可点击编辑、播放光标、键盘快捷键 |
| `list_guitar_voices` | 可用的吉他音色预设 |
| `list_guitar_tunings` | 可用的吉他调弦系统（标准、Drop-D、开放 G、DADGAD 等） |
| `tune_guitar` | 调整任何吉他音色的任何参数。参数在会话之间保持不变。 |
| `get_guitar_config` | 当前吉他音色配置与默认配置的比较 |
| `reset_guitar` | 重置吉他音色为默认值 |

### 构建

| 工具 | 功能 |
|------|--------------|
| `add_song` | 以 JSON 格式添加新歌曲 |
| `import_midi` | 导入包含元数据的 .mid 文件 |
| `annotate_song` | 为一首未完成的歌曲编写乐谱，并将其完善。 |
| `save_practice_note` | 带有自动捕获会话数据的日记条目。 |
| `read_practice_journal` | 加载最近的条目，用于参考。 |
| `list_keyboards` | 可用的键盘音色。 |
| `tune_keyboard` | 调整任何键盘音色的任何参数。 这些设置会跨会话保存。 |
| `get_keyboard_config` | 当前配置与出厂默认设置的比较。 |
| `reset_keyboard` | 将键盘音色恢复到出厂设置。 |
| `score_annotation` | 从五个维度评估乐谱的质量：完整性、深度、具体性、教学价值、词汇量。 |
| `validate_song_entry` | 在添加歌曲 JSON 文件之前，对其进行验证，以确保其符合 schema。 |
| `transpose_song` | 将歌曲的调性升高或降低半音——改变主音，改变音符。 |
| `list_sections` | 查看歌曲的结构部分（引子、主歌、副歌等）。 |
| `add_section` | 为歌曲添加结构标记，以便进行结构导航。 |

### MCP 提示

三个用于结构化教学工作流程的提示模板：

| 提示。 | 功能 |
|--------|--------------|
| `annotate_song` | 引导式乐谱编写工作流程：学习范例，为一首未完成的歌曲编写乐谱。 |
| `practice_plan` | 基于流派、难度和目标，构建结构化的练习计划。 |
| `performance_review` | 回顾已完成的会话：哪些方面做得好，下一步应该关注哪些方面。 |

## 命令行界面

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

## 状态

v1.4.1。 包含六个音源引擎，41 个 MCP 工具，3 个提示模板，12 个流派的 120 首歌曲，以及带有详细注释的范例。 支持歌曲调性转换、添加结构标记，以及针对每个手的静音/独奏，用于专注练习。 包含交互式吉他谱编辑器。 浏览器控制面板，提供 20 种人声预设、10 种乐器音色、7 种调音系统，以及一个面向 LLM 的乐谱 API。 提供钢琴滚筒可视化，支持两种颜色模式。 练习日记，用于持续学习。 会话状态在服务器重启后仍然有效。 支持 MIDI 伴奏评分、乐谱质量评估以及跨流派的模式识别。

还发布了 **[jam-actions-v0](#training-dataset)**，这是一个包含 115 条记录的训练数据集，记录了使用多轮 MCP 工具的古典钢琴演奏过程，具有 7 轴的发布门控、冷启动可重复性，以及完整的 Zenodo + CITATION.cff 元数据（CC-BY-SA-3.0-DE）。 MCP 服务器、数据集打包工具、评估框架和发布门控验证器共有 1513 个测试用例通过。 MIDI 数据全部包含在内——随着 AI 的学习，库也在不断增长，现在，这些学习成果也已包含在其中。

## 安全与隐私

**访问的数据：** 歌曲库（JSON + MIDI）、用户歌曲目录（`~/.ai-jam-sessions/songs/`）、吉他调音配置、练习日记条目、本地音频输出设备。

**未访问的数据：** 不使用任何云 API，不涉及任何用户凭据，不收集任何浏览数据，不访问用户歌曲目录之外的任何系统文件。 不会收集或发送任何遥测数据。

**权限：** MCP 服务器仅使用标准输入/输出（不使用 HTTP）。 命令行界面访问本地文件系统和音频设备。 详细的权限策略请参见 [SECURITY.md](SECURITY.md)。

## 许可

MIT 许可证。
