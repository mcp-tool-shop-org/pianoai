<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <strong>中文</strong> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo-banner.png" alt="AI Jam Sessions" width="520" />
</p>

<p align="center">
  <em>用老办法做机器学习</em>
</p>

<p align="center">
  一个教AI弹钢琴、弹吉他和唱歌的MCP服务器。<br/>
  12种风格120首曲目。六个音频引擎。交互式吉他谱。<br/>
  带声乐合成器的浏览器控制台。一本记住一切的练习日记。
</p>

[![CI](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@mcptoolshop/ai-jam-sessions)](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions)
[![Songs](https://img.shields.io/badge/songs-120_across_12_genres-blue)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)
[![Ready](https://img.shields.io/badge/annotated-24-green)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)

---

## 这是什么？

一架AI学着弹的钢琴和吉他。不是合成器，不是MIDI库——是一件教学乐器。

LLM可以读写文本，但无法像我们一样体验音乐。没有耳朵，没有手指，没有肌肉记忆。AI Jam Sessions通过赋予模型可以实际使用的感官来弥补这个差距：

- **阅读** — 带有深度音乐注释的真实MIDI乐谱。不是手写的近似——而是经过解析、分析和解说的。
- **聊听** — 六个音频引擎（振荡器钢琴、采样钢琴、声乐采样、物理声道模型、加法合成声乐、物理建模吉他）通过扬声器播放。房间里的人类成为AI的耳朵。
- **观看** — 将演奏内容渲染为SVG的钢琴卷帘，模型可以回读并验证。交互式吉他谱编辑器。带可视键盘、双模式音符编辑器和调音实验室的浏览器控制台。
- **记忆** — 跨会话持久化的练习日记，学习效果不断积累。
- **歌唱** — 声道合成，20种声音预设，从歌剧女高音到电子合唱。带有唱名、轮廓和音节叙述的跟唱模式。

12种风格中每种都有一首详细注释的范例曲——AI首先学习的参考曲目，包含历史背景、逐小节结构分析、关键时刻、教学目标和演奏提示。其余96首是原始MIDI，等待AI吸收模式、演奏音乐，并编写自己的注释。

## 钢琴卷帘

钢琴卷帘是AI观察音乐的方式。它将任何曲目渲染为SVG——右手蓝色、左手珊瑚色，带有节拍网格、力度标记和小节边界：

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="致爱丽丝1-8小节的钢琴卷帘" width="100%" />
</p>

<p align="center"><em>致爱丽丝，第1–8小节 — 蓝色的E5-D#5颤音，珊瑚色的低音伴奏</em></p>

两种颜色模式：**手**（蓝/珊瑚）或**音级**（色彩虹谱——所有C是红色，所有F#是青色）。SVG格式意味着模型既能看到图像，也能读取标记来验证音高、节奏和双手独立性。

## 控制台

与MCP服务器并行打开的基于浏览器的乐器和声乐工作室。无需插件，无需DAW——只是一个带钢琴的网页。

- **双模式钢琴卷帘** — 在乐器模式（色彩音级颜色）和声乐模式（按元音形状着色：/a/ /e/ /i/ /o/ /u/）之间切换
- **可视化键盘** — 从C4开始的两个八度，映射到QWERTY键盘。点击或键入。
- **20种声音预设** — 15种Kokoro映射声音（Aoede、Heart、Jessica、Sky、Eric、Fenrir、Liam、Onyx、Alice、Emma、Isabella、George、Lewis、choir、synth-vox）、4种声道映射声音和合成合唱组
- **10种乐器预设** — 服务器端6种钢琴音色加上synth-pad、organ、bell和strings
- **音符检查器** — 点击任意音符编辑力度、元音和气息度
- **7种调律系统** — 十二平均律、纯律（大调/小调）、毕达哥拉斯、四分之一逗号中庸律、韦克迈斯特III、自定义音分偏移。可调A4参考音（392–494 Hz）。
- **调律审计** — 频率表、带拍频分析的音程测试器、调律导入/导出
- **乐谱导入/导出** — 将整个乐谱序列化为JSON并重新加载
- **LLM接口API** — `window.__cockpit`暴露`exportScore()`、`importScore()`、`addNote()`、`play()`、`stop()`、`panic()`、`setMode()`和`getScore()`，让LLM可以编程式地作曲、编曲和回放

## 学习循环

```
 阅读                演奏                观看                反思
┌──────────┐     ┌───────────┐     ┌────────────┐     ┌──────────────┐
│ 学习范例  │     │ 以任意速度 │     │ 查看钢琴   │     │ 将所学写入   │
│ 曲的分析  │ ──▶ │ 演奏曲目   │ ──▶ │ 卷帘验证   │ ──▶ │ 练习日记     │
│           │     │           │     │           │     │              │
└──────────┘     └───────────┘     └────────────┘     └──────┬───────┘
                                                             │
                                                             ▼
                                                    ┌──────────────┐
                                                    │ 下次从这里   │
                                                    │ 继续          │
                                                    └──────────────┘
```

## 曲库

12种风格120首曲目，基于真实MIDI文件构建。每种风格有一首深度注释的范例曲——包含历史背景、逐小节和声分析、关键时刻、教学目标和演奏提示（含声乐指导）。这些范例曲作为模板：AI学习一首，然后为其余曲目编写注释。

| 风格 | 范例曲 | 调性 | 教学内容 |
|------|--------|------|---------|
| 布鲁斯 | The Thrill Is Gone (B.B. King) | B小调 | 小调布鲁斯曲式、呼应、落后于节拍 |
| 古典 | 致爱丽丝 (贝多芬) | A小调 | 回旋曲式、触键分化、踏板纪律 |
| 电影 | Comptine d'un autre été (蒂尔森) | E小调 | 琶音织体、无和声变化的力度构建 |
| 民谣 | 绿袖子 | E小调 | 3/4华尔兹律动、调式混合、文艺复兴声乐风格 |
| 爵士 | 秋叶 (科斯马) | G小调 | ii-V-I进行、引导音、摇摆八分音符、无根音和弦配置 |
| 拉丁 | 伊帕内玛女孩 (若宾) | F大调 | 波萨诺瓦节奏、半音转调、声乐的克制 |
| 新世纪 | River Flows in You (李闰珉) | A大调 | I-V-vi-IV识别、流动琶音、自由节拍 |
| 流行 | Imagine (列侬) | C大调 | 琶音伴奏、克制、声乐的真诚 |
| 拉格泰姆 | The Entertainer (乔普林) | C大调 | 嗡啪低音、切分、多段体曲式、节奏纪律 |
| R&B | Superstition (史蒂维·旺德) | Eb小调 | 十六分音符放克、打击式键盘、幽灵音 |
| 摇滚 | Your Song (艾尔顿·约翰) | Eb大调 | 钢琴叙事曲的声部进行、转位、对话式歌唱 |
| 灵魂乐 | Lean on Me (比尔·威瑟斯) | C大调 | 自然音阶旋律、福音伴奏、呼应 |

曲目从**raw**（仅MIDI）→ **annotated** → **ready**（带音乐语言，完全可演奏）逐步推进。AI通过学习曲目并用`annotate_song`编写注释来提升曲目状态。

## 音频引擎

六个引擎，加上一个可同时运行任意两个的分层组合器：

| 引擎 | 类型 | 音色 |
|------|------|------|
| **振荡器钢琴** | 加法合成 | 带有锤击噪声、非谐性、48声复音、立体声成像的多谐波钢琴。零依赖。 |
| **采样钢琴** | WAV回放 | Salamander Grand Piano — 480个采样、16个力度层、88键。真实钢琴。 |
| **声乐（采样）** | 音高偏移采样 | 带有滑音和连奏模式的持续元音音调。 |
| **声道** | 物理模型 | Pink Trombone — LF声门波形通过44单元数字波导管。四个预设：女高音、女中音、男高音、男低音。 |
| **声乐合成** | 加法合成 | 15种Kokoro声音预设。共振峰塑形、气息度、颤音。确定性（种子RNG）。 |
| **分层** | 组合器 | 包装两个引擎并将每个MIDI事件分发给两者——piano+synth、vocal+synth等。 |

### 键盘音色

六种可调钢琴音色，每个参数均可调节（亮度、衰减、锤击硬度、失谐、立体声宽度等）：

| 音色 | 特点 |
|------|------|
| Concert Grand | 丰满、饱满、古典 |
| Upright | 温暖、亲密、民谣 |
| Electric Piano | 丝滑、爵士、Fender Rhodes风格 |
| Honky-Tonk | 失谐、拉格泰姆、沙龙 |
| Music Box | 水晶般透明、空灵 |
| Bright Grand | 明亮、现代、流行 |

### 吉他音色

四种吉他音色预设，物理建模弦合成，每种有17个可调参数（亮度、琴体共鸣、拨弦位置、弦阻尼等）：

| 音色 | 特征 |
|------|------|
| Steel Dreadnought | 明亮、均衡、经典原声 |
| Nylon Classical | 温暖、柔和、圆润 |
| Jazz Archtop | 柔和、木质感、干净 |
| Twelve-String | 闪烁、双音、合唱效果 |

## 练习日记

每次会话后，服务器记录发生了什么——哪首曲子、什么速度、多少小节、多长时间。AI添加自己的反思：注意到了什么、识别了什么模式、下次尝试什么。

```markdown
---
### 14:32 — 秋叶
**jazz** | intermediate | G小调 | 69 BPM × 0.7 | 32/32小节 | 45秒

第5-8小节的ii-V-I (Cm7-F7-BbMaj7) 和The Thrill Is Gone的V-i
有同样的引力，只是解决到大调。布鲁斯和爵士的共同点
比风格标签暗示的要多。

下次：全速尝试。将伊帕内玛的桥段转调与此对比。
---
```

每天一个markdown文件，存储在`~/.ai-jam-sessions/journal/`。人类可读，只追加。下次会话，AI读取日记并从上次中断处继续。

## 安装

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

需要**Node.js 18+**。无需MIDI驱动、虚拟端口或外部软件。

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

## MCP工具

5个类别31个工具：

### 学习

| 工具 | 功能 |
|------|------|
| `list_songs` | 按风格、难度或关键词浏览 |
| `song_info` | 完整音乐分析——结构、关键时刻、教学目标、风格提示 |
| `registry_stats` | 全库统计：总曲数、风格、难度 |
| `library_progress` | 所有风格的注释状态 |
| `list_measures` | 每小节的音符、力度和教学笔记 |
| `teaching_note` | 单小节深入——指法、力度、上下文 |
| `suggest_song` | 基于风格、难度和演奏历史的推荐 |
| `practice_setup` | 推荐速度、模式、音色设置和CLI命令 |

### 演奏

| 工具 | 功能 |
|------|------|
| `play_song` | 通过扬声器播放——曲库曲目或.mid文件。任意引擎、速度、模式、小节范围 |
| `stop_playback` | 停止 |
| `pause_playback` | 暂停或恢复 |
| `set_speed` | 播放中变速（0.1×–4.0×） |
| `playback_status` | 实时快照：当前小节、节拍速度、倍速、键盘音色、状态 |
| `view_piano_roll` | 渲染为SVG（手部颜色或音级色彩虹谱） |

### 歌唱

| 工具 | 功能 |
|------|------|
| `sing_along` | 可唱文本——音名、唱名、轮廓或音节。可选钢琴伴奏 |
| `ai_jam_sessions` | 生成即兴简报——和弦进行、旋律大纲和风格提示 |

### 吉他

| 工具 | 功能 |
|------|------|
| `view_guitar_tab` | 将交互式吉他谱渲染为HTML — 点击编辑、播放光标、键盘快捷键 |
| `list_guitar_voices` | 可用的吉他音色预设 |
| `list_guitar_tunings` | 可用的吉他调音系统（标准、drop-D、open G、DADGAD等） |
| `tune_guitar` | 调整吉他音色的任何参数。会话间保持 |
| `get_guitar_config` | 吉他音色当前配置 vs 出厂默认值 |
| `reset_guitar` | 将吉他音色恢复出厂设置 |

### 构建

| 工具 | 功能 |
|------|------|
| `add_song` | 以JSON添加新曲 |
| `import_midi` | 带元数据导入.mid文件 |
| `annotate_song` | 为原始曲目编写音乐语言并提升为ready |
| `save_practice_note` | 自动捕获会话数据的日记条目 |
| `read_practice_journal` | 加载最近的条目 |
| `list_keyboards` | 可用的键盘音色 |
| `tune_keyboard` | 调节键盘音色的任意参数。跨会话持久化 |
| `get_keyboard_config` | 当前配置 vs 出厂默认值 |
| `reset_keyboard` | 将键盘音色恢复出厂设置 |

## CLI

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

v0.3.0。六个音频引擎，31个MCP工具，12种风格120首曲目（含深度注释范例曲）。交互式吉他谱编辑器。浏览器控制台含20种声乐预设、10种乐器音色、7种调音系统和LLM向乐谱API。两色模式钢琴卷帘可视化。持久练习日记。MIDI已完备 — 曲库随AI学习而增长。浏览器控制台带20种声乐预设、10种乐器音色、7种调律系统和LLM接口乐谱API。两种颜色模式的钢琴卷帘。持久化练习日记。MIDI已全部就绪——曲库随AI学习而成长。

## 许可证

MIT
