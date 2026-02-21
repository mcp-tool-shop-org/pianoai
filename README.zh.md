<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <strong>中文</strong> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.png" alt="AI Jam Session 标志" width="180" />
</p>

<h1 align="center">AI Jam Session</h1>

<p align="center">
  <em>用老办法做机器学习</em>
</p>

<p align="center">
  教AI弹钢琴的MCP服务器。<br/>
  120首歌曲。12种风格。真实MIDI。记住一切的练习日记。
</p>

[![Songs](https://img.shields.io/badge/songs-120_across_12_genres-blue)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)
[![Ready](https://img.shields.io/badge/ready_to_play-24-green)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)

---

## 这是什么？

一架AI学习弹奏的钢琴。不是合成器，不是MIDI库——是一件教学乐器。

每种风格有一首标注好的范例曲——包含音乐分析、教学目标和风格指导的参考作品。其余96首是原始MIDI，等待AI学习范例、演奏原始曲目，并自己编写标注。每次会话都通过跨对话持久化的练习日记延续上次的进度。

LLM不仅仅是*演奏*音乐。它学会*阅读*乐谱，在钢琴卷帘上*看到*演奏内容，通过扬声器*听到*结果，并*写下*所学。这就是循环。

## 学习循环

```
 学习              演奏              查看              反思
┌─────────┐     ┌───────────┐     ┌────────────┐     ┌──────────────┐
│ 阅读范例 │     │ 以任意速度 │     │ 查看钢琴   │     │ 将所学写入   │
│ 曲的分析 │ ──▶ │ 演奏曲目   │ ──▶ │ 卷帘(SVG)  │ ──▶ │ 练习日记     │
│          │     │           │     │            │     │              │
└─────────┘     └───────────┘     └────────────┘     └──────┬───────┘
                                                            │
                                                            ▼
                                                   ┌──────────────┐
                                                   │ 下次会话从   │
                                                   │ 这里继续     │
                                                   └──────────────┘
```

## 歌曲库

12种风格120首歌曲，基于真实MIDI文件构建。每种风格有一首完整标注的范例曲——AI在处理其余曲目前先学习它。

| 风格 | 歌曲数 | 范例曲 |
|------|--------|--------|
| 古典 | 10首就绪 | 致爱丽丝、月光、月光奏鸣曲... |
| R&B | 4首就绪 | Superstition (史蒂维·旺德) |
| 爵士 | 1首就绪 | 秋叶 |
| 布鲁斯 | 1首就绪 | The Thrill Is Gone (B.B. King) |
| 流行 | 1首就绪 | Imagine (约翰·列侬) |
| 摇滚 | 1首就绪 | Your Song (艾尔顿·约翰) |
| 灵魂乐 | 1首就绪 | Lean on Me (比尔·威瑟斯) |
| 拉丁 | 1首就绪 | 伊帕内玛女孩 |
| 电影 | 1首就绪 | Comptine d'un autre ete (扬·提尔森) |
| 拉格泰姆 | 1首就绪 | 演艺人 (斯科特·乔普林) |
| 新世纪 | 1首就绪 | River Flows in You (李闰珉) |
| 民谣 | 1首就绪 | 绿袖子 |

歌曲从**raw**（仅MIDI）进展到**ready**（完整标注，可演奏）。AI通过学习曲目并用`annotate_song`编写标注来提升歌曲状态。

## 练习日记

日记是AI的记忆。演奏一首歌后，服务器记录发生了什么——哪首歌、什么速度、多少小节、多长时间。AI添加自己的反思：注意到的模式、认识到的规律、下次要尝试的内容。

```markdown
---
### 14:32 — 秋叶
**jazz** | intermediate | G minor | 69 BPM x 0.7x | 32/32 measures | 45s

第5-8小节的ii-V-I（Cm7-F7-BbMaj7）与The Thrill Is Gone中V-i的引力
相同，只是在大调中。布鲁斯和爵士的共同点比风格标签显示的更多。

下次：尝试全速。将伊帕内玛的桥段转调与此比较。
---
```

每天一个markdown文件，存储在`~/.pianoai/journal/`。可读性强，仅追加。下次会话时AI读取日记，从上次停下的地方继续。

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

### 学习

| 工具 | 功能 |
|------|------|
| `list_songs` | 按风格、难度或关键词浏览 |
| `song_info` | 音乐分析、教学目标、风格提示 |
| `library_progress` | 所有风格的标注进度 |
| `list_measures` | 每个小节的音符和教学笔记 |
| `teaching_note` | 深入分析单个小节 |

### 演奏

| 工具 | 功能 |
|------|------|
| `play_song` | 通过扬声器播放（速度、模式、小节范围） |
| `stop_playback` | 停止当前曲目 |
| `pause_playback` | 暂停或继续 |
| `set_speed` | 播放中更改速度 |
| `view_piano_roll` | 将曲目渲染为SVG钢琴卷帘 |

### 记忆

| 工具 | 功能 |
|------|------|
| `save_practice_note` | 写日记条目（会话数据自动捕获） |
| `read_practice_journal` | 加载最近条目以获取上下文 |
| `annotate_song` | 将原始曲目提升为就绪状态（AI的作业） |

## CLI

```
pianoai list [--genre <genre>] [--difficulty <level>]
pianoai play <song-id> [--speed <mult>] [--mode <mode>]
pianoai view <song-id> [--measures <start-end>] [--out <file.svg>]
pianoai info <song-id>
pianoai library
```

## 状态

v0.1.0。12种风格120个MIDI文件。24首歌曲完整标注可演奏（每种风格1首范例曲 + 10首古典 + 4首R&B）。跨会话持久学习的练习日记。六种键盘音色（三角钢琴、立式钢琴、电钢琴、酒吧钢琴、音乐盒、明亮）。所有MIDI已就位——随着AI的学习，曲库不断增长。

## 许可证

MIT
