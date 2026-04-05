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
</p>

---

## 这是什么？

一种人工智能学习演奏的钢琴和吉他。它不是合成器，也不是 MIDI 库，而是一种教学工具。

大型语言模型（LLM）可以阅读和书写文本，但它无法像人类一样体验音乐。它没有耳朵，没有手指，也没有肌肉记忆。AI Jam Sessions 通过赋予模型它实际可以使用的感官来弥补这一差距：

- **阅读**：真实的 MIDI 音符，带有详细的音乐注释。不是手工编写的近似值，而是经过解析、分析和解释的内容。
- **听觉**：六个音频引擎（钢琴音源、采样钢琴、人声样本、物理人声声道、加法人声合成器、物理建模吉他），通过您的扬声器播放，让房间里的“人类”成为人工智能的“耳朵”。
- **视觉**：钢琴卷轴，以 SVG 格式显示演奏的内容，模型可以读取并验证。一个交互式的吉他指法编辑器。一个带有可视化键盘、双模式音符编辑器和调音实验室的浏览器界面。
- **记忆**：一个练习记录，可以跨会话保存，从而随着时间的推移不断积累学习成果。
- **歌唱**：带有 20 种预设人声的物理人声合成，从歌剧女高音到电子合唱。带有音阶、旋律和音节叙述的合唱模式。

每个 12 个流派中的一个都包含一个经过丰富注释的示例——一个参考作品，人工智能首先研究，并包含历史背景、逐小节的结构分析、关键时刻、教学目标和演奏技巧。其他 96 首歌曲是原始 MIDI 文件，等待人工智能吸收模式、演奏音乐并编写自己的注释。

## 钢琴卷轴

钢琴卷轴是人工智能观察音乐的方式。它将任何歌曲都以 SVG 格式显示——蓝色表示右手，珊瑚色表示左手，并带有节拍网格、力度变化和小节边界：

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

有两种颜色模式：**手部**（蓝色/珊瑚色）或**音高类别**（彩色光谱——每个 C 是红色，每个 F# 是青色）。SVG 格式意味着模型既可以查看图像，也可以读取标记以验证音高、节奏和手部独立性。

## 控制面板

一个基于浏览器的乐器和人声工作室，它与 MCP 服务器并行打开。没有插件，没有数字音频工作站（DAW），而是一个带有钢琴的网页。

- **双模式钢琴卷轴**：在乐器模式（彩色音高类别）和人声模式（音符按元音形状着色：/a/ /e/ /i/ /o/ /u/）之间切换。
- **可视化键盘**：C4 的两个八度，映射到您的 QWERTY 键盘。单击或键入。
- **20 种人声预设**：15 种 Kokoro 映射的人声（Aoede、Heart、Jessica、Sky、Eric、Fenrir、Liam、Onyx、Alice、Emma、Isabella、George、Lewis，以及合唱和合成人声），4 种声道映射的人声，以及一个合成合唱部分。
- **10 种乐器预设**：6 种服务器端的钢琴音色，以及合成垫、风琴、钟声和弦乐。
- **音符检查器**：单击任何音符以编辑力度、元音和呼吸感。
- **7 种调音系统**：平均律、纯音律（大调/小调）、毕达哥拉斯、四度音程均音律、韦克迈斯特三号，或自定义的音高偏移量。可调节的 A4 参考音（392–494 Hz）。
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

包含 12 个流派的 120 首歌曲，全部来自真实的 MIDI 文件。每个流派都有一份经过详细注释的示例，包括历史背景、逐小节的和谐分析、关键时刻、教学目标和演奏技巧（包括人声指导）。这些示例作为模板：人工智能首先研究一个示例，然后对其他歌曲进行注释。

| 流派 | 示例 | 关键 | 它所教授的内容 |
|-------|----------|-----|-----------------|
| 布鲁斯 | 《The Thrill Is Gone》（B.B. King） | B小调 | 小调布鲁斯形式，呼应，在节拍之后演奏 |
| 古典 | 《致爱丽丝》（贝多芬） | A小调 | 回旋曲形式，触键技巧，踏板技巧 |
| 电影配乐 | 《Comptine d'un autre été》（蒂尔森） | E小调 | 琶音织体，动态的音响架构，不改变和声 |
| 民谣 | 《Greensleeves》 | E小调 | 3/4拍子的华尔兹节奏，调式混合，文艺复兴时期的声乐风格 |
| 爵士乐 | 《Autumn Leaves》（科斯玛） | G小调 | ii-V-I进行，导音，切分八分音符，无根音的伴奏 |
| 拉丁 | 《The Girl from Ipanema》（若林） | F大调 | 桑巴节奏，色彩变化，人声的克制 |
| 新世纪音乐 | 《River Flows in You》（Yiruma） | A大调 | I-V-vi-IV和弦识别，流畅的琶音，弹性节奏 |
| 流行音乐 | 《Imagine》（约翰·列侬） | C大调 | 琶音伴奏，克制，人声的真诚 |
| 拉格音乐 | 《The Entertainer》（乔普林） | C大调 | 低音“oom-pah”，切分音，多乐段形式，节奏控制 |
| R&B | 《Superstition》（史蒂夫·汪达） | Eb小调 | 16分音符的放克，打击乐键盘，弱音 |
| 摇滚乐 | 《Your Song》（埃尔顿·约翰） | Eb大调 | 钢琴抒情曲的声部进行，转位，对话式的演唱 |
| 灵魂乐 | 《Lean on Me》（比尔·惠特尼） | C大调 | 音阶旋律，福音风格的伴奏，呼应 |

歌曲从**原始**（仅MIDI）状态 → **已注释** → **已完成**（可完全使用音乐语言播放）状态进行转换。人工智能通过学习歌曲并使用`annotate_song`进行注释来推广歌曲。

## 声音引擎

六个引擎，以及一个分层组合器，可以同时运行任意两个：

| 引擎 | 类型 | 声音特点 |
|--------|------|---------------------|
| **Oscillator Piano** | 加法合成 | 带锤击声的复音钢琴，非谐性，48声部复音，立体声效果。无任何依赖。 |
| **Sample Piano** | WAV播放 | Salamander Grand Piano — 480个采样，16个力度层，88个琴键。真正的钢琴音色。 |
| **Vocal (Sample)** | 移调采样 | 带有滑音和连奏模式的持续元音。 |
| **Vocal Tract** | 物理建模 | Pink Trombone — 通过44个数字波导的LF声带波形。四个预设：高音、中音、次中音、低音。 |
| **Vocal Synth** | 加法合成 | 15个带有音色塑造、呼吸感、颤音的物理建模人声预设。确定性（带种子数的随机数生成器）。 |
| **Guitar** | 加法合成 | 物理建模拨弦乐器 — 4个预设（钢弦原声吉他、尼龙古典吉他、爵士拱琴、12弦吉他），8种调弦，17个可调参数。 |
| **Layered** | 组合器 | 将两个引擎组合在一起，并将每个MIDI事件发送到两个引擎 — 钢琴+合成器，人声+合成器，等等。 |

### 键盘音色

六个可调的钢琴音色，每个音色可以独立调整参数（明亮度、衰减、琴槌硬度、失谐、立体声宽度等）：

| 音色 | 特点 |
|-------|-----------|
| 大钢琴 | 丰富、饱满、古典 |
| 立式钢琴 | 温暖、亲密、民谣 |
| 电钢琴 | 丝滑、爵士、Fender Rhodes 风格 |
| 酒吧钢琴 | 失谐、拉格泰姆、酒馆 |
| 音乐盒 | 晶莹剔透、空灵 |
| 明亮的大钢琴 | 锐利、现代、流行 |

### 吉他音色

四种吉他音色预设，采用物理建模的弦乐合成技术，每个预设包含17个可调节参数（明亮度、共鸣、拨弦位置、弦阻尼等）：

| 音色 | 特点 |
|-------|-----------|
| 钢制大号吉他 | 明亮、平衡、经典原声 |
| 尼龙古典吉他 | 温暖、柔和、圆润 |
| 爵士拱琴 | 柔和、木质、干净 |
| 12弦吉他 | 闪耀、双倍、合唱效果 |

## 练习日记

每次练习结束后，服务器会记录发生的情况，包括歌曲、速度、节拍数、时长。人工智能会添加自己的见解：它注意到了什么、识别到了什么模式、以及接下来应该尝试什么。

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

每天生成一个Markdown文件，存储在`~/.ai-jam-sessions/journal/`目录下。可读性强，只允许追加。下次练习时，人工智能会读取日记，并从上次停止的地方继续。

## 安装

```bash
npm install -g ai-jam-sessions
```

需要**Node.js 18+**。不需要MIDI驱动程序、虚拟端口或外部软件。

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

## MCP 工具

包含41个工具和3个提示模板，分布在六个类别中：

### 学习

| 工具 | 功能 |
|------|--------------|
| `list_songs` | 按流派、难度或关键词浏览 |
| `song_info` | 完整的乐曲分析，包括结构、关键部分、教学目标、风格技巧 |
| `registry_stats` | 整个库的统计数据：歌曲总数、流派、难度 |
| `list_measures` | 每个音符的音高、力度和教学提示 |
| `teaching_note` | 深入分析单个音符：指法、力度、上下文 |
| `suggest_song` | 根据流派、难度以及您已演奏过的乐曲进行推荐 |
| `practice_setup` | 为一首歌曲推荐速度、调式、音色设置和命令行 |
| `compare_songs` | 跨流派的模式识别：关键关系、音高/音程相似性、共享结构、教学关联 |
| `annotation_progress` | 跟踪整个库的标注质量：评分、等级和改进建议 |
| `server_info` | 服务器版本、库统计数据、引擎列表、活动会话 |

### 播放

| 工具 | 功能 |
|------|--------------|
| `play_song` | 通过扬声器播放：库中的歌曲或原始.mid文件。可以使用任何引擎、速度、调式和节拍范围。 |
| `stop_playback` | 停止 |
| `pause_playback` | 暂停或继续 |
| `set_speed` | 在播放过程中更改速度（0.1×–4.0×） |
| `playback_status` | 实时快照：当前节拍、速度、音色、状态 |
| `view_piano_roll` | 渲染为SVG（可手动着色或音阶色轮） |
| `score_performance` | 对MIDI播放进行评分：音高准确性、节奏、完整性，并提供等级反馈 |
| `mute_hand` | 练习时，可以静音或取消静音左手/右手，以便一次隔离一只手 |
| `preview_teaching_cues` | 在播放之前，查看所有教学提示和关键部分 |

### 唱歌

| 工具 | 功能 |
|------|--------------|
| `sing_along` | 可演唱的文本：音符名称、音阶、音高轮廓或音节。可以带或不带钢琴伴奏。 |
| `ai_jam_sessions` | 生成即兴演奏提示：和弦进行、旋律框架和风格提示，用于重新演绎 |

### 吉他

| 工具 | 功能 |
|------|--------------|
| `view_guitar_tab` | 将交互式吉他谱以HTML形式渲染：可点击编辑、播放光标、键盘快捷键 |
| `list_guitar_voices` | 可用的吉他音色预设 |
| `list_guitar_tunings` | 可用的吉他调弦系统（标准调、降D调、开放G调、DADGAD调等） |
| `tune_guitar` | 调整任何吉他音色的任何参数。参数设置在不同会话中保持不变。 |
| `get_guitar_config` | 当前吉他音色的配置与默认设置的比较 |
| `reset_guitar` | 重置吉他音色的默认设置 |

### 构建

| 工具 | 功能 |
|------|--------------|
| `add_song` | 以JSON格式添加新的歌曲 |
| `import_midi` | 导入包含元数据的.mid文件 |
| `annotate_song` | 为一段未加工的歌曲编写音乐语言，并将其完善。 |
| `save_practice_note` | 带有自动捕获会话数据的日记条目。 |
| `read_practice_journal` | 加载最近的条目，用于参考。 |
| `list_keyboards` | 可用的键盘音色。 |
| `tune_keyboard` | 调整任何键盘音色的任何参数。 这些设置会跨会话保存。 |
| `get_keyboard_config` | 当前配置与出厂默认设置的比较。 |
| `reset_keyboard` | 将键盘音色恢复到出厂设置。 |
| `score_annotation` | 从五个维度评估乐谱标注的质量：完整性、深度、具体性、教学价值、词汇。 |
| `validate_song_entry` | 在添加歌曲之前，验证歌曲的 JSON 文件是否符合 schema。 |
| `transpose_song` | 将歌曲的调性升高或降低半音——改变主音，改变音符。 |
| `list_sections` | 查看歌曲的结构部分（引子、主歌、副歌等）。 |
| `add_section` | 为歌曲添加结构标记，用于结构化导航。 |

### MCP 提示

三个用于结构化教学工作流程的提示模板：

| 提示。 | 功能 |
|--------|--------------|
| `annotate_song` | 引导式乐谱标注工作流程：学习范例，为一段未加工的歌曲编写音乐语言。 |
| `practice_plan` | 基于流派、难度和目标，构建结构化的练习计划。 |
| `performance_review` | 回顾已完成的会话：哪些方面做得好，接下来应该关注哪些方面。 |

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

v1.4.0 版本：包含六个音源引擎，41 个 MCP 工具，3 个提示模板，12 个流派，共 120 首歌曲，并带有详细的范例乐谱。支持歌曲调性转换、添加结构标记，以及针对每只手的静音/独奏功能，用于专注练习。包含交互式吉他谱编辑器。浏览器界面包含 20 种人声预设、10 种乐器音色、7 种调音系统，以及一个面向 LLM 的乐谱 API。提供钢琴滚筒可视化，支持两种颜色模式。包含练习日记，用于持续学习。会话状态在服务器重启后仍然有效。支持 MIDI 伴奏、乐谱质量评估以及跨流派的模式识别。MIDI 数据已全部包含，随着 AI 的学习，库会不断扩展。

## 安全与隐私

**访问的数据：** 歌曲库（JSON + MIDI），用户歌曲目录（`~/.ai-jam-sessions/songs/`），吉他调音配置，练习日记条目，本地音频输出设备。

**未访问的数据：** 不使用任何云 API，不涉及任何用户凭据，不收集任何浏览数据，不访问用户歌曲目录之外的任何系统文件。 不会收集或发送任何遥测数据。

**权限：** MCP 服务器仅使用标准输入/输出（不使用 HTTP）。 命令行界面访问本地文件系统和音频设备。 详细的权限策略请参见 [SECURITY.md](SECURITY.md)。

## 许可证

MIT。
