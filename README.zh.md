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
  108 annotated songs across 12 genres. Six sound engines. Interactive guitar tablature.<br/>
  A browser cockpit with vocal synthesizer. A practice journal that remembers everything.
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions"><img src="https://img.shields.io/npm/v/@mcptoolshop/ai-jam-sessions" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/songs-108_across_12_genres-blue" alt="Songs"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/annotated-108%2F108-green" alt="Ready"></a>
  <a href="datasets/jam-actions-v0-public/README.md"><img src="https://img.shields.io/badge/dataset-jam--actions--v0%20(115_records)-8b5cf6" alt="Training dataset"></a>
  <a href="https://doi.org/10.5281/zenodo.20279918"><img src="https://zenodo.org/badge/DOI/10.5281/zenodo.20279918.svg" alt="DOI"></a>
</p>

---

## 这是什么？

一台钢琴和一把吉他，AI通过学习来演奏。它不是合成器，也不是 MIDI 库——而是一种教学乐器。

大型语言模型 (LLM) 可以阅读和书写文本，但它无法像我们一样体验音乐。它没有耳朵，也没有手指，也没有肌肉记忆。AI Jam Sessions 通过赋予模型可以实际使用的感官来弥合这一差距：

- **阅读**——带有深入音乐注释的真实 MIDI 乐谱。不是手写的近似版本——而是经过解析、分析和解释的版本。
- **聆听**——六个音频引擎（振荡器钢琴、采样钢琴、人声采样、物理人声声道、加法人声合成器、物理建模吉他），通过扬声器播放，使房间里的人成为人工智能的“耳朵”。现在，该模型也有了自己的“耳朵”，而且是双重的：它可以事后测量录音（参见[聆听](#聆听）），并且可以在**音乐仍在播放时**观察乐队（参见[现场合奏](#现场合奏））。
- **观看**——一个钢琴卷帘，它将播放的内容渲染为 SVG，模型可以读取并验证。一个交互式吉他谱编辑器。一个带有视觉键盘、双模式音符编辑器和调音实验室的浏览器控制面板。
- **记忆**——一个练习日志，可以跨会话保存，因此学习效果会随着时间的推移而累积。
- **演唱**——带有 20 种人声预设的人声声道合成，从歌剧女高音到电子合唱。带有音阶、轮廓和音节叙述的合唱模式。以及在钢琴时钟上进行真实的演唱：一种基于歌曲 MIDI 驱动的、在时序（40 毫秒）和音高（50 分）上进行门控的、在您听到之前进行评分的歌手（参见[演唱](#演唱））。

现在，所有 120 首歌曲都已完全注释——历史背景、逐小节的结构分析、关键时刻、教学目标和演奏技巧，涵盖所有 12 个流派。早期版本的 README 中提到，原始歌曲“正在等待 AI 吸收模式、演奏音乐并编写自己的注释”。而这正是发生的事情：这些注释是由 AI 根据每首歌曲的确定性分析（和弦、重复结构、乐段边界、经过内容验证的调性）编写的，并且受到质量标准的约束，并通过对抗性的方式逐条进行事实核查——所有度数、和弦窗口和结构计数都与实际 MIDI 进行验证，然后再发布。

基于相同的工作，我们还发布了 **[jam-actions-v0](#training-dataset)** ——一个公共数据集，包含 115 个关于真实古典钢琴的多轮 MCP 工具使用轨迹。它教会 LLM 如何进行*基于符号音乐的实际工具使用*，而不仅仅是文本生成，并且附带了一个 7 轴发布门控机制，用于区分“传递证据”和“因为任务很简单而通过”。有关完整信息，请参阅下面的 [训练数据集](#training-dataset)。

## 聆听

在很长一段时间里，这个服务器可以发出声音，但无法对其进行分析。模型播放，人类聆听，模型接受他们的判断。现在，这个差距已经弥合。

将其指向一个 WAV 文件，它会测量其中的内容。不是通过查看图像并进行猜测——而是通过将信号传递到它已经用于乐谱的相同类型的工具：

- **`analyze_audio`**——起音、音高轮廓和音量。音高以音符名称返回，并带有半音偏差，而不是原始频率。
- **`transcribe_audio`**——将录音转换为音符：音高、起始时间、持续时间和每个音符与标准音高的距离。
- **`score_audio_take`**——通过“耳朵”对库中的歌曲进行性能评估。它转录录音，将其与乐谱匹配，并报告哪些音符播放正确，哪些音符偏离，以及哪些音符遗漏。然后，`view_scored_piano_roll`将结果绘制在乐谱上，就像它对捕获的 MIDI 录音一样。这就是评估真实乐器、演唱录音或任何没有 MIDI 录音的材料的方式。
- **`view_spectrogram`**——查看声音。一个恒定 Q 值的频谱图，左侧边缘带有钢琴键盘，因此可以一目了然地读取音高，并且可以根据要求在上面绘制歌曲的预期音符。

**它不会告诉您什么。**图像用于查找*哪里*出了问题；每个数字都来自信号处理，而不是来自模型读取图像。转录器一次处理一行，因此和弦或完整的混音会产生一个确定的错误结果，并且会明确指出。在最先进的技术中，起音检测的准确率约为 F1 0.88，因此“遗漏”的音符可能只是转录器无法听到的音符，而不是您没有播放的音符——这些工具会在其自身的输出中包含这一警告，而不是将其隐藏在这里。

整个表面都是无依赖的：转换、音高跟踪器、起音检测器、WAV 解码器和 PNG 编码器都位于此存储库中，并且它们在 Node 和浏览器中产生相同的数字。

## 现场合奏

聆听是在录音完成后对其进行评估。这是另一部分：询问每种乐器**现在**正在做什么，即在演奏过程中。

```
ensemble_now()
```

它会回答每种乐器保持的音符、每个音符保持了多长时间，以及整个合奏中组合成的和弦。在二重奏中，两个声音会分别报告，因此您可以看到钢琴保持一个三和弦，而合成器在其上方演奏旋律。

### 两个通道，而且廉价的那个是准确的那个

这是值得理解的部分，因为它决定了要信任哪个数字。

**意图——每个引擎被告知要播放的内容。**当模型是演奏者时，这不是一个估计值。钢琴和弦不是要进行转录的东西；而是发送的三组音符。这些音符是准确的、直接的和即时的。

**声学——实际发出的声音。**每个引擎可以将它的输出发送到私有分析总线，因此每种乐器都在源头进行测量，没有任何分离和歧义。这个通道是**验证，而不是发现**：它是了解人声偏离时钟、录音被截断或引擎在仍然发送音符时停止播放的方式。

当两者不一致时，这只是关于渲染的事实，而不是对音符的更正。

### 它需要多少资源

观察一种乐器大约需要**9 微秒的音频回调时间**，对应于 42.67 毫秒的音频块，这大约是音频预算的 0.02%，并且在零丢弃样本的情况下进行测量。没有附加观察器的乐器根本不需要任何资源。

### 它不会告诉您什么

声学通道存在延迟，并且会说明延迟了多少：大约 23 毫秒用于音高，70 毫秒用于确认的起音，因为在接收到其后的音频之前，无法确认起音。接近该边缘的起音会被保留而不是报告，然后稍后被撤回。

声学跟踪器一次处理一行，因此它不会命名和弦中的音符——并且它不会假装这样做。它无法解析的和弦是其已知的局限性，而不是一个发现，并且合奏会对此保持沉默，而不是在钢琴演奏的每个和弦时都发出警告。

## 钢琴卷帘图

钢琴卷帘图是 AI 观察音乐的方式。它将任何歌曲渲染为 SVG 格式——蓝色表示右手，珊瑚色表示左手，并带有节拍网格、动态和乐段边界：

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

两种颜色模式：**手部**（蓝/珊瑚）或 **音级**（彩虹色——每个 C 都是红色，每个 F# 都是青色）。SVG 格式意味着模型既可以查看图像，又可以读取标记以验证音高、节奏和手的独立性。

## 控制面板

一个基于浏览器的作曲工作室，位于此仓库的 [`apps/cockpit`](apps/cockpit) 中——并且可以在 **[mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)** 上实时运行。无需插件、DAW 或安装；所有内容都保留在您的浏览器中（您的工作会自动本地保存）。您更喜欢对其进行修改吗？

```bash
cd apps/cockpit && npm install && npm run dev   # Vite dev server, opens in your browser
```

- **默认情况下，采用采样的大型音乐会钢琴**——该软件内置一个精简的 Salamander Grand 音色包（90 个 OGG 文件，8 MB），在您首次使用时加载，并通过与合成音色相同的输出链播放；在加载之前（或离线状态下），经过调整的振荡器钢琴音色无缝衔接。采样来自 [Alexander Holm](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html)，CC-BY 3.0 许可。
- **面板模式——聆听室**——对作曲引擎的各种音色进行盲选双向 A/B 对比测试，使用真实的库中的旋律：通过真实的音色路径渲染并匹配响度的音频片段，随机播放经过筛选的试听样本（其中包含隐藏的最低标准），采用 Bradley-Terry 排名和 Bootstrap 置信区间，并得出客观的结果（在每个对比组合达到其投票数量之前为“临时”状态；当无法达到最低鉴别标准时，结果将不可解释）。第二个子模式使用本地 LLM 模型进行相同的排名，此外还包括两种运行方式的历史记录以及一个比较视图（Kendall τ + 引擎排名匹配），用于评估廉价的代理音色是否能够准确反映人类的真实感受。
- **精确的节拍同步**——音符以音乐时间为基础，因此 BPM 控制实际上会重新调整播放速度；带有拖动功能的点击定位时间尺，可设置**循环区域**；自动滚动功能跟随播放头移动。
- **录音模式捕捉**——使用 QWERTY 键盘、屏幕键盘或 Web MIDI 设备进行演奏，乐谱将被记录：1 小节的预备音，类似于循环器的循环过奏（或替换模式），原始演奏时间在量化视图下得以保留，每次演奏都是一个可撤销的操作。
- **完整的撤销/重做**——包括“清除”和“导入”在内的所有编辑操作均可逆转（Ctrl+Z），拖动手势的合并方式与真实的编辑器相同。
- **多选 + 剪贴板**——在“选择/绘制”工具之间切换，使用平台标准的修饰键点击，复制/剪切/粘贴到播放头位置，复制。
- **触控 + 无障碍功能**——每个表面都具有指针事件和捕捉功能，通过轻击进行重新定位，作为非拖动操作的替代方案，键盘音符编辑，色彩盲友好的乐谱叠加层。
- **双模式钢琴卷帘**——在乐器模式（半音阶色调颜色）和人声模式（音符按元音形状着色：/a/ /e/ /i/ /o/ /u/）之间切换。
- **虚拟键盘**——从 C4 开始的两个八度音，映射到您的 QWERTY 键盘上。点击或输入。
- **20 个音色预设**——15 个 Kokoro 音色（Aoede、Heart、Jessica、Sky、Eric、Fenrir、Liam、Onyx、Alice、Emma、Isabella、George、Lewis，以及合唱和合成人声），4 个基于声道映射的音色，和一个合成合唱部分。
- **10 个乐器预设**——6 个服务器端钢琴音色，以及合成垫音、管风琴、铃铛和弦乐。
- **音符检查器**——点击任何音符以编辑力度、元音和柔和度。
- **7 种调律系统**——平均律、纯律（大调/小调）、毕达哥拉斯音阶、四分音差平均律、韦克迈斯特 III 音阶，或自定义半音偏移。可调节的 A4 参考音（392–494 Hz）。
- **调律审计**——频率表、带有节拍频率分析的音程测试器，以及调律导出/导入功能。
- **乐谱导入/导出**——将整个乐谱序列化为 JSON 格式并加载回来。
- **LLM 对接 API**——`window.__cockpit` 公开了 `exportScore()`、`importScore()`、`addNote()`、`play()`、`stop()`、`panic()`、`setMode()` 和 `getScore()`，以便 LLM 可以以编程方式进行作曲、编排和播放。

## 学习循环

<p align="center">
  <img src="docs/learning-loop.svg" alt="The learning loop: Read (MIDI + annotations) → Play (six sound engines) → See (piano roll · guitar tab) → Reflect (practice journal), with the journal persisting so the next session picks up where the last left off" width="100%" />
</p>

## 歌曲库

120 首歌曲，涵盖 12 个流派，均基于真实的 MIDI 文件构建。每个流派都有一首深度注释的范例——包含历史背景、逐小节的和声分析、关键时刻、教学目标和演奏技巧（包括人声指导）。这些范例作为模板：AI 研究其中一个，然后对其他歌曲进行注释。

**What ships, and what you fetch.** The annotations are ours and ship with every song. The MIDI files were downloaded from public MIDI sites when the library was built, and a per-file provenance audit ([`docs/findings/library-provenance-audit.md`](docs/findings/library-provenance-audit.md)) found that only 14 of them carry a licence that permits redistribution — Bernd Krueger's piano-midi.de arrangements (CC-BY-SA-3.0-DE) and the Mutopia Project's public-domain typesettings. Those 14 are in the npm package. The other 94 are not: their `.json` ships, with a `provenance` block naming the source, its terms and the file's SHA-256, and `ai-jam-sessions library fetch --accept-source-terms` downloads each one from the site that published it, under that site's terms, refusing any file whose hash no longer matches what the annotations were verified against. Twelve files that turned out to be a different piece than their name were quarantined, which is why the count is 108 and not the 120 earlier versions claimed. Versions before this one shipped all 120 MIDI files; that was a mistake, and it is corrected here rather than papered over.

| 流派 | 范例 | 调性 | 它所教授的内容 |
|-------|----------|-----|-----------------|
| 布鲁斯 | 《The Thrill Is Gone》（B.B. King） | B 小调 | 小调布鲁斯结构、呼应乐句、在节拍之后演奏 |
| 古典音乐 | 《致爱丽丝》（贝多芬） | A 小调 | 回旋曲形式、触感差异、踏板技巧 |
| 电影配乐 | 《另一个夏天的圆舞曲》（Tiersen） | E 小调 | 琶音织体，没有和声变化时的动态结构 |
| 民谣 | 《Greensleeves》 | E 小调 | 3/4 华尔兹节奏、模态混合、文艺复兴时期的演唱风格 |
| 爵士乐 | 《秋叶》（Kosma） | G 小调 | ii-V-I 进程、引导音、摇摆八分音符、无根音和弦 |
| 拉丁音乐 | 《来自伊帕内玛的女孩》（Jobim） | F 大调 | 波萨诺瓦节奏、半音调制、人声克制 |
| 新世纪音乐 | 《河流流淌》（Yiruma） | A 大调 | I-V-vi-IV 识别、流畅的琶音、自由节奏 |
| 流行音乐 | 《Imagine》（列侬） | C 大调 | 琶音伴奏、克制、真诚的人声 |
| 拉格泰姆 | 《娱乐者》（Joplin） | C 大调 | “Oom-pah” 贝斯、切分音、多段式结构、节奏控制 |
| R&B | 《Superstition》（史蒂夫·旺达） | Eb 小调 | 16 分音符放克、打击乐键盘、幽灵音符 |
| 摇滚乐 | 《Your Song》（埃尔顿·约翰） | Eb 大调 | 钢琴抒情曲的声部进行、转位、对话式的演唱 |
| 灵魂乐 | 《Lean on Me》（比尔·威瑟斯） | C 大调 | 纯正旋律、福音伴奏、呼应乐句 |

歌曲的流程为：从**原始**（仅 MIDI）→ **注释** → **准备就绪**（完全可播放，具有音乐语言）。AI 通过研究歌曲并使用 `annotate_song` 编写注释来提升歌曲。

## 声音引擎

六个引擎，再加上一个分层组合器，可以同时运行任意两个引擎：

| 引擎 | 类型 | 声音特点 |
|--------|------|---------------------|
| **Oscillator Piano** | 加法合成 | 带有琴槌噪音、非谐音程、速度感应的明亮度、48声部复调和立体声效果的多重泛音钢琴。没有外部依赖。 |
| **Sample Piano** | 样本回放 | Salamander Grand Piano——真正的钢琴声音。**当安装一个音色包时，这是默认引擎**（`samples/AccurateSalamander` 或 `AI_JAM_SAMPLES_DIR`）；npm tarball 不包含任何样本，因此您需要提供 [Salamander](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html) 的下载文件。浏览器界面自带经过精简的 8 MB 音色包（90 个 OGG 文件，CC-BY 3.0 Alexander Holm），在网络上无需任何设置。 |
| **Vocal (Sample)** | 音高偏移样本 | 带有滑音和连音模式的持续元音音调。 |
| **Vocal Tract** | 物理模型 | Pink Trombone——通过 44 个单元的数字波导管，输出低频声门波形。四个预设：女高音、中音、男高音、男低音。 |
| **Vocal Synth** | 加法合成 | 15 个 Kokoro 人声音色预设，带有共鸣峰调整、柔和度、颤音。确定性（基于种子值的随机数生成器）。 |
| **Guitar** | 加法合成 | 物理建模的拨弦乐器——4 个预设（钢制原声吉他、尼龙古典吉他、爵士拱顶吉他、十二弦吉他），8 种调音，17 个可调节参数。 |
| **Layered** | 组合器 | 将两个引擎组合在一起，并将每个 MIDI 事件发送到这两个引擎——钢琴+合成器、人声+合成器等。 |

### 键盘音色

六个可调节的钢琴音色，每个音色都可以单独调整参数（明亮度、衰减、琴槌硬度、失谐度、立体声宽度等）：

| 音色 | 特点 |
|-------|-----------|
| 音乐会大钢琴 | 丰富、饱满、古典 |
| 立式钢琴 | 温暖、亲切、民谣风格 |
| 电钢琴 | 丝滑、爵士乐风格，类似 Fender Rhodes 电子琴的音色 |
| 酒吧钢琴 | 失谐、拉格泰姆风格、沙龙音乐风格 |
| 八音盒 | 水晶般清澈、空灵 |
| 明亮大钢琴 | 清晰、现代、流行 |

### 吉他音色

四个吉他音色预设，带有物理建模的弦乐合成，每个音色都有 17 个可调节参数（明亮度、琴体共鸣、拨弦位置、弦阻尼等）：

| 音色 | 特点 |
|-------|-----------|
| 钢制原声吉他 | 明亮、平衡、经典的音色 |
| 尼龙古典吉他 | 温暖、柔和、圆润 |
| 爵士拱顶吉他 | 柔和、木质感、干净 |
| 十二弦吉他 | 闪耀、双音效果、类似合唱的效果 |

## 练习日志

每次会话结束后，服务器都会记录发生的事情——演奏了哪首曲子、速度是多少、有多少小节、持续了多长时间。人工智能还会添加自己的评论：它注意到了什么、识别出了哪些模式、接下来应该尝试什么。

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

每天生成一个 Markdown 文件，存储在 `~/.ai-jam-sessions/journal/` 中。可读性强，仅追加内容。下一次会话时，人工智能会读取其日志并从上次中断的地方继续。

## 训练数据集

**jam-actions-v0**——一个公共数据集，包含基于真实的古典钢琴 MIDI 的多轮 MCP 工具使用轨迹。该数据集是从服务器用于教学的同一个库构建而来，它教导大型语言模型进行**基于符号音乐的工具使用**——而不仅仅是文本生成。

每个记录都将一个 4 小节的乐句窗口与注释后的教学目标和*目标轨迹*配对——这是一个逐轮会话，其中助手使用上述 MCP 工具（`get_events_in_measure`、`get_events_in_hand`、`count_distinct_pitch_classes` 以及其余 9 个 MIDI 检测工具）来读取、分析和讨论该乐句。

| | |
|---|---|
| **DOI** | [**`10.5281/zenodo.20279918`**](https://doi.org/10.5281/zenodo.20279918) — concept DOI, resolves to the latest published version (v0.5.0: [`10.5281/zenodo.21313954`](https://doi.org/10.5281/zenodo.21313954), published 2026-07-11) |
| 记录 | 115 个（公共子集） |
| 规范基准 | 16 条修复后的 E3 记录 |
| 乐曲 | 来自 6 位作曲家的 8 首古典钢琴作品（巴赫、贝多芬、肖邦、德彪西、莫扎特、舒曼） |
| 原始 MIDI | piano-midi.de——Bernd Krueger 的改编版本 |
| 许可 | CC-BY-SA-3.0-DE（改编作品），基于公共领域的乐曲 |
| 版本 | 0.5.0（2026-07-11）——巴赫 BWV 846 校正版发布，包含错误修复 001 和 002 |
| 模式 | `release-gate-assessment/2.0.0` |

**质量故事——七轴发布门。** 该数据集附带一个发布门，用于区分基于证据的通过和达到上限的通过。轴 1-6 是阻碍性的（绝对下限、边际复合值、工具使用率、工具使用后的正确性、误解次数、分层下限）；轴 7 是丰富与非丰富的报告。轴 2 和 6 允许存在一个 `ceiling_saturated_pass` 分类，因此在仅文本/工具检查/随机 MIDI 条件下得分达到 1.000 的记录不会降低更严格的分层的标准。Slice 22 基准**通过**了修订后的门。Slice 19 基准仍然**未能通过**——保留作为回归诊断，以确保该门具有实际意义。

**可重复性。** 在任何平台上（Windows 原生、macOS、Linux、WSL）的新贡献者都可以验证软件包并在一分钟内重现规范的 PASS 结果：

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

`.gitattributes` 为 `*.sha256` 和公共数据集树固定了 LF 行尾，因此校验和验证器可以在所有平台上工作。发布门 CLI 是严格的位置参数（拒绝未知的/多个位置参数），因此初次使用的贡献者无法意外地错误调用它。

**在哪里可以找到它。** Zenodo 的记录位于概念 DOI [`10.5281/zenodo.20279918`](https://doi.org/10.5281/zenodo.20279918) 下（始终是最新版本；v0.5.0 于 2026-07-11 发布，网址为 https://zenodo.org/records/21313954），数据集在 Hugging Face 上进行了镜像，地址为 [`mcp-tool-shop/jam-actions-v0`](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0)，供 `load_dataset()` 用户使用。完整的 dataset card 位于 [`datasets/jam-actions-v0-public/README.md`](datasets/jam-actions-v0-public/README.md)。Zenodo 的元数据位于 [`zenodo-metadata.json`](datasets/jam-actions-v0-public/zenodo-metadata.json)，引用元数据位于 [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff)，出版凭证位于 [`publication-receipt.json`](datasets/jam-actions-v0-public/publication-receipt.json)，发布说明位于 [`RELEASE_NOTES.md`](datasets/jam-actions-v0-public/RELEASE_NOTES.md)。包含 25 个切片的构建流程——从初始语料草案到通过一次修复、舒曼修正、RC-gate 版本修订、操作者独立性审核以及最终的出版执行——位于 [`docs/`](docs/)。

**引用它。** `mcp-tool-shop-org & Krueger, B. (2026). AI Jam Sessions — Tool-Use Traces v0 (Public Subset). Zenodo. https://doi.org/10.5281/zenodo.20279918`

**它是否真的可以训练任何东西？——微调凭证，三个流程。** 数据集的声明以一种严格的方式进行测试：预先注册的微调模型与密封基线模型进行比较，并且在任何训练开始之前就冻结了诚实规则。**v0**（仅包含 78 个 jam 音轨）返回了一个*诚实的否定结果*——基于工具的问答系统从 0.661 下降到 0.601 ([报告](docs/finetune-arc-eval-report.md))。**v1**（一个包含 494 个示例的数据集，增加了经过执行验证和具有良好结构化的音轨）将相同的指标提高了 +0.202，所有五个种子都高于基线——但仍然发布为“方向上更好，但效果不佳”，因为 16/16 对比中，有 12 个未能达到预先注册的 ≥13/16 标准，只差一个；没有从接近成功的模型中发布适配器 ([报告](docs/finetune-arc-v1-eval-report.md))。**B-1** 然后重新测试了*冻结的* v1 构件，使用了预先注册的包含 36 个记录的样本集，其中大部分是保留的材料：0.678 → **0.890**（+0.212，与预期的 24/34 标准相比，有 29/36 的对比结果更好，p < 0.0001，并且在从未使用过的音乐中，有 10/12 个结果更好）——这是一个*成功的模型*，同时保留了诚实的警告：仅使用散文的表面效果仍然低于基线 ([报告](docs/finetune-arc-v2-b1-eval-report.md))。五个种子适配器已发布在 [`mcp-tool-shop/jam-ft-v1-qwen25`](https://huggingface.co/mcp-tool-shop/jam-ft-v1-qwen25)，声明与所有种子的平均值相关联——没有选择最佳的种子。所有三个流程、锁定、修订以及每个种子的凭证都位于 [`experiments/`](experiments/) 中——重点在于这种方法。

> MIDI 乐曲由 Bernd Krueger (piano-midi.de) 提供，采用 CC-BY-SA-3.0-DE 许可。注释、音轨和评估构件由 AI Jam Sessions 团队提供，并以相同的许可发布，因此可以保留端到端的共享链。**许可范围：**仓库的 MIT 许可涵盖代码；所有位于 `datasets/` 下的内容均采用 CC-BY-SA-3.0-DE 许可。位于 `datasets/jam-actions-v0/` 的工作语料库还包含两首作品（萨蒂《吉姆诺佩迪》第一号，德彪西《阿拉伯舞曲》第一号），这些作品*不包括*在已发布的子集中，因为无法验证其编曲来源——请参阅 [`datasets/jam-actions-v0/PROVENANCE-NOTE.md`](datasets/jam-actions-v0/PROVENANCE-NOTE.md)。

### 声学语料库

**jam-actions-acoustic-v0**——这是上述轨迹的对应版本，处理的是**音频**而非符号音乐。包含 108 条记录，每条记录都将一个经过故意扰动的公共领域乐句的合成渲染与分析工具实际返回的判断结果配对，因此，每个标签都针对乐器进行检查，而不仅仅是针对其自身进行检查。

| | |
|---|---|
| 记录 | 108 — 3 个乐句 × 9 种扰动类型 × 4 个目标音符 |
| 保留 | 按**乐句**（《致爱丽丝》）划分，而不是按记录划分，因此，相同旋律的扰动版本不会泄露。 |
| 类别 | 匹配、音高错误/警告、时序错误/通过、遗漏、额外、音准颤音、无评级静音 |
| 音频 | 没有分发——每条记录都包含一个确定性的配方和它产生的波形的 SHA-256 校验值。 |
| 模式 | `jam-actions-acoustic-v0/1.0.0` |

这九个类别中有两个是存在的，因为一个简单的模型会自信且错误地回答它们：一个音准颤音，其正确的判断结果是*音准*，以及一段静音，其正确的判断结果是*无需评级*。所有判断结果所依赖的阈值都复制到记录中，因为它们在构建过程中都发生过一次变化。

该语料库可以从这个仓库中重现。重新生成它会生成所有 115 个已发布的文件和一个字节完全相同的 `checksums.sha256`，并且一个测试会精确地验证这一点，而无需写入已发布的树。

**一个需要注意的点，是实际测量而不是假设。** 每个记录都包含 `wav_sha256`，即其配方生成的波形的哈希值，并且渲染器会为每个样本调用 `Math.pow` 和 `Math.sin`。两者都不需要正确地进行四舍五入，并且 V8 的结果在 Node 22 和 Node 24 之间发生了变化：在这 27,869 个不同的 `Math.pow(2, x)` 参数中，有 253 个返回不同的双精度浮点数。其中大部分在 16 位量化下都会消失，但 **108 个记录中的 2 个**——都是《致爱丽丝》的 `extra` 扰动，其主题位于半音比例本身不同的音高——在 Node 24 上的哈希值不同。每个记录的每个其他字段在任何引擎上都会重现，并且仓库会分别测试这两个声明。如果您重新渲染并看到这两个不匹配，那是因为这个原因，而不是下载文件损坏。使波形具有比特可移植性意味着替换超越函数，这将改变每个哈希值，因此需要新的模式版本。

### 构建你自己的

语料库运行的基础框架可供你进行自己的实验。
[`experiments/_template/`](experiments/_template/) 是一个可用的示例，你可以复制它：声明一个任务，你将获得 SFT 格式、按类别评分、基于你声明的判断结果集的简单基准，以及一个检查，以确保没有保留单元跨越分割。

[协议](experiments/_template/README.md) 是值得阅读的部分。真实数据是可构建的，而不是手动编写的，标签会根据工具的测量结果进行验证，你按泄露单元进行分割，并报告基准和基础模型以及任何结果。
这些规则中的每一条都需要付出一定的学习成本。

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
| `practice_setup` | 推荐的速度、模式、声音设置和 CLI 命令，用于一首歌曲 |
| `compare_songs` | 跨流派的模式识别——关键关系、音高/间隔相似性、共享形式、教学联系 |
| `annotation_progress` | 跟踪整个库中的注释质量——分数、等级和改进建议 |
| `server_info` | 服务器版本、库统计信息、引擎列表、活动会话 |

### 播放

| 工具 | 它能做什么 |
|------|--------------|
| `play_song` | 通过扬声器播放——库中的歌曲或原始 .mid 文件。四种引擎（钢琴、人声、声道、吉他），任何速度、模式、小节范围——以及一个带有预备音和 `record` 标志的节拍器，该标志可以捕获会话以进行评分。合成和分层引擎仅适用于 CLI。 |
| `stop_playback` | 停止 |
| `pause_playback` | 暂停或恢复 |
| `set_speed` | 在播放过程中更改速度（0.1 倍 – 4.0 倍） |
| `playback_status` | 实时快照：当前小节、节奏、速度、键盘声音、状态 |
| `view_piano_roll` | 渲染为 SVG（手部颜色或音高类色调彩虹） |
| `score_performance` | 对 MIDI 伴奏进行评分——音高准确性、时机、完整性，并提供分级反馈 |
| `mute_hand` | 在练习期间静音或取消静音左/右手——一次隔离一只手 |
| `detect_chord` | 从当前播放的 MIDI 音符集中识别和弦（例如，`[60,64,67]` → C） |
| `preview_teaching_cues` | 在播放之前查看所有教学说明和关键时刻 |

### 练习

| 工具 | 它能做什么 |
|------|--------------|
| `practice_loop` | 真正的老师会布置这样的练习：循环演奏第 5-8 小节，速度放慢，并且只有在*干净地*完成之后，节奏才会加快（+5%）——每次播放都会被记录、评分和总结 |
| `practice_status` | 练习的进度：当前播放次数、速度以及上次播放的每个小节的诊断信息 |
| `score_last_take` | 对最近录制的播放进行评分——音高准确性、时机、完整性，以及每个音符的判断结果 |
| `view_scored_piano_roll` | 所有老师都会使用的标记乐谱：钢琴卷帘叠加了使用无色盲安全调色板（实线 = 正确，虚线 = 时机问题，✕ = 遗漏）的每个音符的判断结果 |

### 唱歌

| 工具 | 它能做什么 |
|------|--------------|
| `sing_along` | 可演唱的文本——音符名称、唱名、旋律走向或音节。可以有钢琴伴奏，也可以没有。 |
| `ai_jam_sessions` | 生成即兴创作概要——和弦进行、旋律轮廓以及风格提示，用于重新诠释。 |
| `verify_harmony` | 制作者循环的验证门控：平台自身的确定性工具会检查提出的新的和声编排——和弦准确性（和弦引擎必须检测到每个预期的和弦）、旋律和谐度（音调/张力/半音阶）、低音声部进行、调式归属。 |
| `auto_reharmonize` | 在一个循环中完成制作者循环——本地模型提出新的和声编排，`verify_harmony`的确定性门控检查每个配音，选择最佳方案，直到返回经过验证的诠释结果。 |
| `compose_panel` | 对任何歌曲运行声部进行作曲面板：四个系统生成伴奏，盲测跨家族LLM模型对其进行排名，Bradley-Terry算法进行聚合——并设置一个判别阈值门控，以排除无法解释的结果（仅方向性信号，绝不提供质量评分）。该过程需要几分钟，并在运行过程中显示进度通知。 |

**时钟上的演唱乐句——人声路径。** 任何库中的歌曲都可以包含一首真实的演唱乐句，并与钢琴同步：一个**乐谱时钟**（`scripts/build-score-clock.mjs`）从歌曲的 MIDI 中提取每个音节的音高、起始时间和持续时间，并将其应用于播放器的自己的时间轴；一个本地的、Apache-2.0 许可的、受乐谱影响的歌手（[SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer)）根据该时钟进行演唱；并且两个门限会测量音频，然后再将其混合——**时间**：每个元音的起始时间与乐谱的偏差在 40 毫秒以内；**音高**：每个音符的偏差在 50 厘以内，全局偏移在 20 厘以内。音节从一组录音中选择，并且仅在单词边界处使用交叉淡入淡出进行连接。控制参数：`--track`（哪个 MIDI 音轨是旋律；`--list-tracks`用于查看），`--lyrics "A-ma-zing grace …"`（每个音符一个令牌，音节由`-`连接），`--measures`，提示片段（人声），录音数量以及门限值——每个参数都有其引用出处在`scripts/vocal_clock.py`中。路径、控制参数和结果：[手册 → 人声](https://mcp-tool-shop-org.github.io/ai-jam-sessions/handbook/vocals/)，[`docs/vocal-clock.md`](docs/vocal-clock.md)；研究的背景：[`docs/vocal-singing-study-2026-09.md`](docs/vocal-singing-study-2026-09.md)。

### 吉他

| 工具 | 它能做什么 |
|------|--------------|
| `view_guitar_tab` | 将交互式吉他谱渲染为HTML——点击编辑、播放光标、键盘快捷键。 |
| `list_guitar_voices` | 可用的吉他音色预设 |
| `list_guitar_tunings` | 可用的吉他调弦系统（标准、降D、开放G、DADGAD等） |
| `tune_guitar` | 调整任何吉他音色的任何参数。设置会跨会话保存。 |
| `get_guitar_config` | 当前吉他音色配置与工厂默认值对比 |
| `reset_guitar` | 将吉他音色重置为工厂默认值 |

### 构建

| 工具 | 它能做什么 |
|------|--------------|
| `add_song` | 以JSON格式添加一首新歌 |
| `import_midi` | 导入带有元数据的.mid文件 |
| `annotate_song` | 编写原始歌曲的音乐语言，并将其提升为“已准备好”状态 |
| `save_practice_note` | 包含自动捕获会话数据的日志条目 |
| `read_practice_journal` | 加载最近的条目以提供上下文 |
| `list_keyboards` | 可用的键盘音色 |
| `tune_keyboard` | 调整任何键盘音色的任何参数。设置会跨会话保存。 |
| `get_keyboard_config` | 当前配置与工厂默认值对比 |
| `reset_keyboard` | 将键盘音色重置为工厂默认值 |
| `score_annotation` | 乐谱注释质量，涵盖5个维度——完整性、深度、具体性、教学价值、词汇量。 |
| `validate_song_entry` | 在添加歌曲之前，根据模式验证歌曲JSON。 |
| `transpose_song` | 将歌曲向上或向下转调半音——新的调式，新的音符。 |
| `list_sections` | 查看歌曲的结构部分（引子、主歌、副歌等）。 |
| `add_section` | 为歌曲添加一个章节标记，以便进行结构导航。 |

### 评分

| 工具 | 它能做什么 |
|------|--------------|
| `score_performance` | 对 MIDI 伴奏与库歌曲进行评分——音高、时序、完整性，并提供分级反馈。 |
| `score_annotation` | 对 5 个维度的注释质量进行评分。 |

### 收听

测量录制的音频。单声道：它们一次跟随一条线，因此，和弦或完整的混音会产生令人信服的无意义结果。每个数字都来自信号处理，而不是来自模型读取图像。

| 工具 | 它能做什么 |
|------|--------------|
| `analyze_audio` | 测量一个 WAV 文件——起始时间、音高轮廓（以音符名称和半音为单位）和音量。 |
| `transcribe_audio` | 将一个单声道录音转换为音符，并记录每个音符与标准音高的偏差。省略跟踪器无法跟随的音符，而不是猜测。 |
| `score_audio_take` | 通过**听觉**对表演与库歌曲进行评分，然后将结果传递给 `view_scored_piano_roll`。 |
| `view_spectrogram` | 查看声音——在钢琴键盘轴上显示一个恒定 Q 值的声谱图，可以选择叠加预期的音符。默认情况下，会隐藏声音。 |
| `ensemble_now` | 每个乐器**现在正在演奏什么**，在演奏过程中。音符来自已发送的内容，因此它们是精确的，而不是估计的。 |

### MCP提示

四个用于结构化教学流程的提示模板：

| 提示 | 它能做什么 |
|--------|--------------|
| `annotate_song` | 引导式注释工作流程——研究一个范例，为原始歌曲编写音乐语言。 |
| `practice_plan` | 基于流派、难度和目标构建结构化的练习计划。 |
| `performance_review` | 回顾已完成的会话——哪些方面做得好，接下来应该关注什么。 |
| `maker_loop` | 完整地执行制作者循环——提出新的和声编排，使用平台的确定性工具对其进行验证，然后添加并播放经过验证的结果。 |

## CLI（命令行界面）

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

**v2.5.0——模型可以观看乐队演奏的版本（参见 [CHANGELOG](CHANGELOG.md)）。**
`ensemble_now` 报告每个乐器在音乐播放时正在做什么：每个乐器保持的音符、每个音符保持了多长时间以及组合的和弦。它运行在两个通道上，并且廉价的通道是准确的通道——当此服务器执行时，它确切地知道它发送了什么，因此，一个和弦是三个音符，而不是转录问题，而一个单独的声学传感器会测量每个引擎**在源头**进行验证。测量的成本约为**每个音频回调 9 微秒**；延迟是明确说明的，而不是暗示的（~23 毫秒音高，~70 毫秒确认的起始时间）；并且限制已记录，因为它们是可以操作的——跟踪器是单声道的，分层子项是单独跟踪的，而不是作为混合进行跟踪，并且没有传感器的乐器不是静音乐器。
在同一个版本中，数据集机制被转换为一个协议，任何人都可以对其进行声明，并提供了一个可用的模板，因此用户可以构建自己的语料库，并针对相同的标准训练自己的适配器。在此过程中，发现声学语料库的可重现性门控覆盖了其 115 个已发布路径中的 109 个，并且它遗漏的六个路径中的三个根本没有由生成器发出——重新生成会删除它们。现在，完全重新生成可以重现每个文件和校验和清单中的每个字节。实时界面包含**54 个工具和 4 个提示模板**，并且**165 个文件中有 3,389 个测试通过（1 个跳过）**。

之前在 v2.4.0 中——模型获得了“耳朵”的版本。四个工具弥合了音频渲染和音频检查之间的差距：`analyze_audio` 用于起始时间、音高轮廓和音量；
`transcribe_audio` 用于将单声道录音转换为音符；`score_audio_take` 用于通过听觉对表演进行评分，并将结果传递给现有的已评分钢琴卷帘，而无需更改；以及 `view_spectrogram` 用于在恒定 Q 值、钢琴键盘轴上查看声音。所有这些都是无依赖性的信号处理，用这个仓库中的代码编写——它自己的 FFT、窗口、梅尔和恒定 Q 变换、起始时间检测和音高跟踪——因为模型不能可靠地通过眼睛来观察图像，并且确定性查询比推理更适合于具有精确答案的问题。该版本还发布了
**jam-actions-acoustic-v0**，108 条可构建的黄金记录，用于对音频进行工具使用。

**v2.3.0——乐器学会时钟上演唱的发布版本**（请参见[CHANGELOG](CHANGELOG.md)）。现在，任何库中的歌曲都可以包含一首真实的演唱乐句，并与钢琴同步：一个**乐谱时钟**从歌曲的 MIDI 中提取每个音节的音高、起始时间和持续时间，并将其应用于播放器的自己的时间轴；一个本地的、Apache-2.0 许可的、受乐谱影响的歌手（[SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer)）根据该时钟进行演唱；并且两个门限会测量音频，然后再将其混合——时间（每个元音与乐谱的偏差在 40 毫秒以内）和音高（每个音符的偏差在 50 厘以内）。已发布的《奇异恩典》的测试结果显示，最差时间偏差为 6 毫秒，全局音高偏差为 -2.7 厘，并且已记录结果；着陆页以诚实的状态呈现，并标明了剩余的缺陷（即开头的拼接部分）。路径、控制参数及其背后的研究（五个研究方向，均有引用）均在[手册](https://mcp-tool-shop-org.github.io/ai-jam-sessions/handbook/vocals/)和[`docs/`](docs/)中。现场界面保持不变，为**49 个工具和 4 个提示模板**，并且**3,080 个测试通过（1 个跳过）**，此外还有人声乐器的 pytest 测试套件。**发布状态：**已发布——[`@mcptoolshop/ai-jam-sessions@2.3.0`](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions) 在 npm 上，并已证明其来源。

**v2.2.0——乐器真正“听”到声音并拥有“聆听室”的版本**（参见[CHANGELOG](CHANGELOG.md)）。驾驶舱中的默认钢琴现在是**采样 Concert Grand**——一个精简的Salamander音色包，在您进行第一次操作时加载，并在准备就绪之前回退到调谐振荡器合成器——并且服务器会在安装完整的音色包时自动选择采样引擎。在其之上是**作曲面板**：一个盲测、响度匹配的A/B聆听室，其中人类对作曲引擎的配音进行排名，并与理论上有效和无效的基准进行比较（Bootstrap CIs 的 Bradley-Terry 算法，一种 MUSHRA 式的判别阈值，PROVISIONAL 和 UNINTERPRETABLE 作为第一类结果），旁边还有一个本地模型面板，它使用跨家族 LLM 模型进行相同的排名，以及一个“比较”视图（Kendall τ），用于确定廉价的代理是否跟踪了人类的真实判断。

相同的发布版本还包含一个构成引擎，该引擎为面板提供支持（`src/compose/`：一个具有命名风格预设的确定性人声引导门限，基于构建的成员关系的人声规范，一次处理一个乐器的优化器），以及完整的健康检查（修复了 45 个问题——安全性、人性化的字符串、保留视觉效果的视觉修改），来自已记录的 Mutopia 公有领域字节的重新资源化的萨蒂和德彪西库条目，以及一个陌生人测试的强化：描述性的验证错误、结构化的`{code, message, hint}`错误信封、精选的 tarball、长时间工具的进度通知以及 CLI 错误语法。该版本以[`@mcptoolshop/ai-jam-sessions@2.2.0`](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions)的形式发布，包含 49 个工具、4 个提示模板和 3,033 个测试。

在v2.1.0版本中——分析师变成了**制作者**。制作者循环作为产品推出：模型提出对任何库歌曲进行新的和声编排，然后平台的确定性工具对其进行门控——和弦引擎必须确认每个预期的配音（`verify_harmony`），每个旋律音符都根据新的和声进行标记，并且只有经过验证的诠释结果才会进入`add_song`→`play_song`→`view_piano_roll`。通过构造验证生成——没有评分标准，也没有自我评估；与编写即兴创作概要相同的`inferChord`是评审者。`maker_loop`提示模板引导完成整个循环。

在 v2.0.0 版本中——该版本证明了数据集的有效性。**重大更新：Node.js 的最低版本现在是 22**（`node-web-audio-api` 2.0）；工具本身没有变化——六个声音引擎、47 个 MCP 工具、3 个提示模板，以及一个**完全注释的库：涵盖 12 个流派的 120/120 首歌曲**（本版本中，12 个关键字段已更正为基于内容检测的键）。教学循环是完整的端到端流程：节拍器带倒计时 → 实时录音 → 每音符评分 → 标记后的钢琴乐谱 → 练习循环，只有在干净地完成之后才会提高速度。浏览器界面是一个真正的作曲工具——精确的节拍控制和循环区域、录音功能、完整的撤销/重做、多选和剪贴板、触摸支持——[可在网络上使用](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)。

同时发布 **[jam-actions-v0](#training-dataset)** ——一个包含 115 条记录的训练数据集，用于对古典钢琴进行多轮 MCP 工具使用跟踪，具有 7 轴发布门控、冷启动可重复性以及完整的 Zenodo + CITATION.cff 元数据（CC-BY-SA-3.0-DE），并镜像到 [Hugging Face](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0)，现在还包含**双向的经过验证的微调结果**：一个诚实的负面示例（v0）和一个遵守预注册规范的正面示例，该示例在达到自身胜利标准之前，仅差一次配对获胜（v1）——请参阅[微调记录](#training-dataset)。此版本还修复了巴赫乐曲中的错误（工作集修订版 r001/r002 包含勘误表），此前 v1 流水线执行门控检测到已发布的窗口超出了 BWV 846 的实际 62 小节。MCP 服务器 + 界面 + 数据集打包器 + 评估框架 + 发布门控验证器共通过了 2506 个测试。所有 MIDI 文件都包含在内，每首歌曲都可以用于教学，并且该学习语料库也随附其中。

## 安全与隐私

**涉及的数据：** 歌曲库（JSON + MIDI）、用户歌曲目录（`~/.ai-jam-sessions/songs/`）、吉他调音配置、练习日志条目、本地音频输出设备。

**未涉及的数据（默认路径）：** MCP 服务器和 CLI 不会进行任何网络调用，不会读取任何凭据，也不会触及用户歌曲目录之外的任何系统文件。不收集或发送任何遥测数据。与软件包一起提供的**可选数据集/评估工具**（`scripts/run-llm-eval.ts`、来源验证器）是唯一的例外：当您明确调用它时，它可以调用 LLM API（从您的环境中读取 `ANTHROPIC_API_KEY`，但绝不会存储），并获取来源 URL。它永远不会作为服务器、CLI 或安装的一部分运行。

**权限：** MCP 服务器仅使用 stdio 进行传输（不使用 HTTP）。CLI 访问本地文件系统和音频设备。有关完整策略，请参阅 [SECURITY.md](SECURITY.md)。

## 许可

MIT
