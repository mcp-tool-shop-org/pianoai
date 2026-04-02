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

[![CI](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/mcp-tool-shop-org/ai-jam-sessions/branch/main/graph/badge.svg)](https://codecov.io/gh/mcp-tool-shop-org/ai-jam-sessions)
[![npm](https://img.shields.io/npm/v/@mcptoolshop/ai-jam-sessions)](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions)
[![Songs](https://img.shields.io/badge/songs-120_across_12_genres-blue)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)
[![Ready](https://img.shields.io/badge/annotated-24-green)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)

---

## 这是什么？

这是一种人工智能学习演奏的钢琴和吉他。它不是合成器，也不是 MIDI 库，而是一种教学工具。

大型语言模型（LLM）可以阅读和书写文本，但它无法像我们一样体验音乐。它没有耳朵，没有手指，也没有肌肉记忆。AI Jam Sessions 通过赋予模型它实际可以使用的感官来弥补这一差距：

- **阅读**：真正的 MIDI 乐谱，带有详细的音乐注释。不是手写的近似值，而是经过解析、分析和解释的内容。
- **听觉**：六个音频引擎（振荡器钢琴、采样钢琴、人声样本、物理人声声道、加法人声合成器、物理建模吉他），通过您的扬声器播放，让房间里的人类成为人工智能的“耳朵”。
- **视觉**：钢琴卷轴，以 SVG 格式呈现已演奏的内容，模型可以读取并验证。一个交互式的吉他指法编辑器。一个浏览器控制面板，带有可视化键盘、双模式音符编辑器和调音实验室。
- **记忆**：一个练习日志，可以在不同会话之间持续保存，从而随着时间的推移积累学习成果。
- **歌唱**：带有 20 种预设的人声声道合成，从歌剧女高音到电子合唱。带有音阶、轮廓和音节叙述的合唱模式。

每个 12 个流派中的每个示例都带有丰富的注释，作为人工智能首先研究的参考作品，包括历史背景、逐小节的结构分析、关键时刻、教学目标和演奏技巧。其他 96 首歌曲是原始 MIDI 文件，等待人工智能吸收模式、演奏音乐并编写自己的注释。

## 钢琴卷轴

钢琴卷轴是人工智能观察音乐的方式。它将任何歌曲以 SVG 格式呈现，蓝色表示右手，珊瑚色表示左手，并带有节拍网格、力度变化和小节边界：

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

有两种颜色模式：**手部**（蓝色/珊瑚色）或**音高类别**（彩色光谱——每个 C 音都是红色，每个 F# 音都是青色）。SVG 格式意味着模型既可以查看图像，也可以读取标记以验证音高、节奏和手部独立性。

## 控制面板

一个基于浏览器的乐器和人声工作室，与 MCP 服务器并行打开。无需插件，无需 DAW，只需一个带有钢琴的网页。

- **双模式钢琴卷帘**：可在乐器模式（使用色块表示音高）和人声模式（使用颜色表示元音：/a/ /e/ /i/ /o/ /u/）之间切换。
- **可视化键盘**：显示C4音的两个八度，映射到您的QWERTY键盘。点击或输入即可。
- **20种音色预设**：15种与Kokoro关联的音色（Aoede、Heart、Jessica、Sky、Eric、Fenrir、Liam、Onyx、Alice、Emma、Isabella、George、Lewis，以及合唱和合成人声），4种与音轨关联的音色，以及一个合成合唱部分。
- **10种乐器预设**：6种服务器端的钢琴音色，以及合成垫音、管风琴、钟声和弦乐。
- **音符检查器**：点击任意音符以编辑力度、元音和呼吸感。
- **7种调音系统**：等律、纯律（大调/小调）、毕达哥拉斯调音、四度音程平均律、韦克迈斯特三号调音，或自定义的音高偏移量。可调节A4参考音高（392–494 Hz）。
- **调音审计**：频率表、音程测试（包含拍频分析），以及调音导出/导入功能。
- **乐谱导入/导出**：将整个乐谱序列化为JSON格式，并将其加载回来。
- **面向LLM的API**：`window.__cockpit` 暴露了 `exportScore()`、`importScore()`、`addNote()`、`play()`、`stop()`、`panic()`、`setMode()` 和 `getScore()` 函数，以便LLM可以编程地进行作曲、编排和播放。

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

包含12个流派的120首歌曲，由真实的MIDI文件构建。每个流派都有一首经过深入注释的示例，包括历史背景、逐小节的和声分析、关键时刻、教学目标和演奏技巧（包括人声指导）。这些示例作为模板：AI会研究其中一首，然后对其他歌曲进行注释。

| 流派 | 示例 | 调性 | 所教授的内容 |
|-------|----------|-----|-----------------|
| 布鲁斯 | The Thrill Is Gone (B.B. King) | B小调 | 小调布鲁斯形式、呼应、在节拍后演奏 |
| 古典 | Für Elise (Beethoven) | A小调 | 回旋曲形式、触键区分、踏板技巧 |
| 电影配乐 | Comptine d'un autre été (Tiersen) | E小调 | 琶音织体、动态架构，不改变和声 |
| 民谣 | Greensleeves | E小调 | 3/4华尔兹节奏、调式混合、文艺复兴时期的人声风格 |
| 爵士乐 | Autumn Leaves (Kosma) | G小调 | ii-V-I进行、导音、切分八分音符、无根音的伴奏 |
| 拉丁 | The Girl from Ipanema (Jobim) | F大调 | 波萨诺瓦节奏、色彩性调性变化、人声克制 |
| 新世纪音乐 | River Flows in You (Yiruma) | A大调 | I-V-vi-IV识别、流畅的琶音、弹性节奏 |
| 流行音乐 | Imagine (Lennon) | C大调 | 琶音伴奏、克制、人声真诚 |
| 拉格泰姆 | The Entertainer (Joplin) | C大调 | Oom-pah低音、切分音、多段式结构、节奏控制 |
| 节奏蓝调 | Superstition (Stevie Wonder) | Eb小调 | 16分音符放克、打击乐键盘、附点音符 |
| 摇滚乐 | Your Song (Elton John) | Eb大调 | 钢琴抒情曲的声部进行、转位、对话式演唱 |
| 灵魂乐 | Lean on Me (Bill Withers) | C大调 | 全音阶旋律、福音伴奏、呼应 |

歌曲从**原始**（仅MIDI）→ **已注释** → **已准备好**（完全可演奏，包含音乐语言）进行演变。AI通过研究歌曲并使用`annotate_song`编写注释来推广歌曲。

## Sound Engines

六个音源，以及一个分层组合器，可以同时运行任意两个音源：

| 音源 | 类型 | 声音特点 |
|--------|------|---------------------|
| **Oscillator Piano** | 加法合成 | 多谐钢琴，带有锤击声、失谐，48声部复音，立体声效果。无外部依赖。 |
| **Sample Piano** | WAV 播放 | Salamander 钢琴 — 480 个采样，16 个力度层，88 个琴键。真实的声音。 |
| **Vocal (Sample)** | 音高偏移的采样 | 带有滑音和连奏模式的持续元音。 |
| **Vocal Tract** | 物理建模 | Pink 小号 — 通过 44 个单元的数字波导，产生 LF 喉音波形。四个预设：高音、中音、男高音、低音。 |
| **Vocal Synth** | 加法合成 | 15 个 Kokoro 音色预设，带有共振峰整形、呼吸感、颤音。确定性（带种子数的随机数生成器）。 |
| **Guitar** | 加法合成 | 物理建模拨弦乐器 — 4 个预设（原声民谣吉他、尼龙古典吉他、爵士拱琴、12 弦吉他），8 种调音，17 个可调参数。 |
| **Layered** | 组合器 | 将两个音源组合在一起，并将每个 MIDI 事件发送到两个音源 — 钢琴+合成器，人声+合成器，等等。 |

### 键盘音色

六个可调钢琴音色，每个音色可以独立调整参数（明亮度、衰减、锤击力度、失谐、立体声宽度等）：

| 音色 | 特点 |
|-------|-----------|
| 三角钢琴 | 丰富、浑厚、古典 |
| 立式钢琴 | 温暖、亲密、民谣 |
| 电钢琴 | 丝滑、爵士、Fender Rhodes 风格 |
| 碰击钢琴 | 失谐、ragtime、酒吧 |
| 音乐盒 | 晶莹、空灵 |
| 明亮三角钢琴 | 清晰、现代、流行 |

### 吉他音色

四个吉他音色预设，采用物理建模的弦乐合成，每个预设有 17 个可调参数（明亮度、箱体共振、拨弦位置、弦阻尼等）：

| 音色 | 特点 |
|-------|-----------|
| 原声民谣吉他 | 明亮、平衡、经典原声 |
| 尼龙古典吉他 | 温暖、柔和、圆润 |
| 爵士拱琴 | 柔和、木质、干净 |
| 12 弦吉他 | 闪耀、双倍、合唱效果 |

## 练习日志

每次练习后，服务器会记录发生的情况 — 播放的歌曲、速度、小节数、时长。AI 会添加自己的见解：它注意到了什么、识别出了什么模式、建议尝试什么。

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

每天生成一个 Markdown 文件，存储在 `~/.ai-jam-sessions/journal/` 目录下。可读性强，只允许追加。下次练习时，AI 会读取其日志，并从上次停止的地方继续。

## 安装

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

需要 **Node.js 18+**。不需要 MIDI 驱动程序、虚拟端口或外部软件。

### Claude 桌面版 / Claude 代码

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

五个类别中的 34 个工具：

### 学习

| 工具 | 功能 |
|------|--------------|
| `list_songs` | 按流派、难度或关键字浏览 |
| `song_info` | 完整的乐曲分析 — 结构、关键时刻、教学目标、风格技巧 |
| `registry_stats` | 整个库的统计数据：总歌曲数、流派、难度 |
| `list_measures` | 每个小节的音符、力度和教学提示 |
| `teaching_note` | 深入了解单个小节 — 指法、力度、上下文 |
| `suggest_song` | 基于流派、难度和您已播放的内容的推荐 |
| `practice_setup` | 为一首歌曲推荐的速度、调式、音色设置和 CLI 命令 |
| `compare_songs` | 跨流派的模式识别 — 关键关系、音高/音程相似性、共享形式、教学关联 |
| `annotation_progress` | 跟踪整个库的标注质量，包括评分、等级和改进建议。 |

### 播放

| 工具 | 功能 |
|------|--------------|
| `play_song` | 通过扬声器播放：库中的歌曲或原始的.mid文件。支持任何引擎、速度、模式和音符范围。 |
| `stop_playback` | 停止 |
| `pause_playback` | 暂停或继续 |
| `set_speed` | 在播放过程中更改速度（0.1倍–4.0倍） |
| `playback_status` | 实时快照：当前音符、节拍、速度、键盘音色、状态 |
| `view_piano_roll` | 以SVG格式渲染（可手动上色或按音高和音阶的彩虹色） |
| `score_performance` | 对MIDI伴奏进行评分：音高准确度、节奏、完整性，并提供分级反馈。 |

### 唱歌

| 工具 | 功能 |
|------|--------------|
| `sing_along` | 可演唱的文本：音符名称、音阶、旋律走向或音节。可带或不带钢琴伴奏。 |
| `ai_jam_sessions` | 生成即兴演奏提示：和弦进行、旋律框架和风格提示，用于重新演绎。 |

### 吉他

| 工具 | 功能 |
|------|--------------|
| `view_guitar_tab` | 以HTML格式渲染交互式吉他谱：可点击编辑、播放光标、键盘快捷键。 |
| `list_guitar_voices` | 可用的吉他音色预设 |
| `list_guitar_tunings` | 可用的吉他调弦系统（标准调、降D调、开放G调、DADGAD调等） |
| `tune_guitar` | 调整任何吉他音色的任何参数。参数设置在不同会话中保持不变。 |
| `get_guitar_config` | 当前吉他音色配置与默认设置的比较 |
| `reset_guitar` | 恢复吉他音色的默认设置 |

### 构建

| 工具 | 功能 |
|------|--------------|
| `add_song` | 以JSON格式添加新的歌曲 |
| `import_midi` | 导入带有元数据的.mid文件 |
| `annotate_song` | 为原始歌曲编写音乐语言，并将其转换为可用的状态。 |
| `save_practice_note` | 带有自动捕获会话数据的日记条目 |
| `read_practice_journal` | 加载最近的条目，用于参考 |
| `list_keyboards` | 可用的键盘音色 |
| `tune_keyboard` | 调整任何键盘音色的任何参数。参数设置在不同会话中保持不变。 |
| `get_keyboard_config` | 当前配置与默认设置的比较 |
| `reset_keyboard` | 恢复键盘音色的默认设置 |
| `score_annotation` | 从5个维度评估标注质量：完整性、深度、具体性、教学价值、词汇量 |

## 命令行界面

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

## 状态

v1.1.0。包含6个音源引擎、34个MCP工具、12个风格共120首歌曲，并带有详细的标注示例。交互式吉他谱编辑器。浏览器界面，包含20个人声预设、10种乐器音色、7种调弦系统，以及面向LLM的评分API。提供钢琴滚轮的可视化，支持两种颜色模式。练习日记，用于持续学习。支持MIDI伴奏评分、标注质量评估以及跨风格的模式识别。MIDI文件全部包含在内，随着AI的学习，库会不断增长。

## 安全与隐私

**涉及的数据：** 歌曲库（JSON + MIDI）、用户歌曲目录（`~/.ai-jam-sessions/songs/`）、吉他调弦配置、练习日记条目、本地音频输出设备。

**未涉及的数据：** 不使用任何云API、不涉及任何用户凭据、不收集任何浏览数据、不访问系统文件（仅限于用户歌曲目录）。不收集或发送任何遥测数据。

**权限：** MCP服务器仅使用标准输入/输出（不使用HTTP）。命令行界面访问本地文件系统和音频设备。请参阅[SECURITY.md](SECURITY.md)以获取完整策略。

## 许可证

MIT
