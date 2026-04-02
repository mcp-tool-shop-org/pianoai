<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

## これは何ですか？

AIが演奏を学習するためのピアノとギターです。シンセサイザーでも、MIDIライブラリでもありません。学習用の楽器です。

LLM（大規模言語モデル）はテキストを読み書きできますが、私たちが音楽を体験するのと同じように音楽を感じることはできません。耳も指も、筋肉の記憶もありません。AI Jam Sessionsは、モデルが実際に利用できる感覚を与えることで、そのギャップを埋めます。

- **読み込み:** 実際のMIDI楽譜で、詳細な音楽的注釈が付いています。手書きの近似ではなく、解析され、分析され、説明されています。
- **聴覚:** 6つのオーディオエンジン（オシレーターピアノ、サンプルピアノ、ボーカルサンプル、物理的な声帯モデル、加算型ボーカルシンセサイザー、物理モデルギター）がスピーカーから音を出し、部屋にいる人間がAIの「耳」になります。
- **視覚:** 演奏内容をSVG形式で表示するピアノロール。インタラクティブなギタータブ譜エディター。視覚的なキーボード、デュアルモードのノートエディター、チューニングラボを備えたブラウザベースのインターフェース。
- **記憶:** 練習記録をセッション間で保持し、学習効果を時間とともに向上させます。
- **歌唱:** 20種類のボーカルプリセットを備えた声帯合成。オペラソプラノからエレクトリックコーラスまで。ソルフェージュ、メロディ、音節のナレーション機能付きのカラオケモード。

12のジャンルそれぞれに、詳細な注釈が付いたサンプル楽曲（リファレンスピース）があります。これは、AIが最初に学習するもので、歴史的背景、小節ごとの構造分析、重要なポイント、学習目標、演奏のヒントなどが含まれています。残りの96曲は、生のMIDIデータで、AIがパターンを学習し、音楽を演奏し、独自の注釈を書き込むのを待っています。

## ピアノロール

ピアノロールは、AIが音楽をどのように認識するかを示しています。どの曲もSVG形式で表示されます。右手が青色、左手がサンゴ色で、拍子、ダイナミクス、小節の区切り線が表示されます。

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

2つのカラーモードがあります。**手:**（青/サンゴ）、または**音階:**（すべてのCは赤、すべてのF#はシアン）。SVG形式であるため、モデルは画像を見ることができるだけでなく、ピッチ、リズム、左右の手の独立性を検証するために、マークアップを読み取ることができます。

## コックピット

MCPサーバーとともに開く、ブラウザベースの楽器およびボーカルスタジオです。プラグインも、DAW（デジタルオーディオワークステーション）も不要です。単にピアノが配置されたウェブページです。

- **デュアルモードピアノロール**：インストゥルメントモード（音階の色分け）とボーカルモード（母音の形状による音符の色分け：/a/ /e/ /i/ /o/ /u/）を切り替え可能。
- **ビジュアルキーボード**：C4から2オクターブ分のキーが、QWERTYキーボードにマッピングされています。クリックするか、キーボードで入力してください。
- **20種類のプリセット音**：15種類のKokoroにマッピングされた音（Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis）、4種類のトラックにマッピングされた音、そしてシンセサイザーの合唱パート。
- **10種類のインストゥルメントプリセット**：サーバー側のピアノ音6種類に加え、シンセパッド、オルガン、ベル、ストリングス。
- **音符インスペクター**：任意の音符をクリックすると、ベロシティ、母音、ビブラートを編集できます。
- **7種類のチューニングシステム**：均等調律、純正律（長調/短調）、ピタゴラス調、四度音階、ヴェルクマイスターIII、またはカスタムのセントオフセット。A4の基準音を調整可能（392–494 Hz）。
- **チューニング監査**：周波数テーブル、ビート周波数分析によるインターバルトレーナー、チューニングのエクスポート/インポート。
- **スコアのインポート/エクスポート**：スコア全体をJSON形式でシリアライズし、それを読み込むことができます。
- **LLM連携API**：`window.__cockpit` が `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()`, および `getScore()` を公開しており、LLMがプログラム的に作曲、編曲、再生を実行できます。

## 学習ループ

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

## 楽曲ライブラリ

12のジャンルに分けて120曲の楽曲が収録されており、すべて実際のMIDIファイルから作成されています。各ジャンルには、詳細な注釈が付いたサンプル楽曲が1つずつ含まれています。注釈には、歴史的背景、小節ごとのハーモニー分析、重要なポイント、教育目標、演奏のヒント（ボーカルガイドを含む）が記載されています。これらのサンプル楽曲はテンプレートとして機能し、AIは1つの楽曲を学習し、残りの楽曲を注釈付けます。

| ジャンル | サンプル楽曲 | キー | 学習内容 |
|-------|----------|-----|-----------------|
| ブルース | The Thrill Is Gone (B.B. King) | イ短調 | ブルースの形式、コール＆レスポンス、ビートの遅れ |
| クラシック | Für Elise (Beethoven) | ホ短調 | ロンド形式、タッチの差別化、ペダリングの技術 |
| 映画音楽 | Comptine d'un autre été (Tiersen) | ヘ短調 | アルペジオのテクスチャ、ハーモニーの変化のないダイナミックな構成 |
| フォーク | Greensleeves | ヘ短調 | 3/4のワルツ、モーダル混合、ルネサンス時代のボーカルスタイル |
| ジャズ | Autumn Leaves (Kosma) | ロ短調 | ii-V-I進行、ガイドトーン、スイングエイト、ルートレスボイシング |
| ラテン | The Girl from Ipanema (Jobim) | ト長調 | ボサノバのリズム、クロマチックな転調、ボーカルの抑制 |
| ニューエイジ | River Flows in You (Yiruma) | ト長調 | I-V-vi-IVの認識、流れるアルペジオ、ルバート |
| ポップ | Imagine (Lennon) | ハ長調 | アルペジオの伴奏、抑制、ボーカルの誠実さ |
| ラグタイム | The Entertainer (Joplin) | ハ長調 | Oom-pahベース、シンコペーション、マルチストレイン形式、テンポの安定性 |
| R&B | Superstition (Stevie Wonder) | ヘ短調 | 16分音符のファンク、パーカッシブなキーボード、ゴーストノート |
| ロック | Your Song (Elton John) | ヘ長調 | ピアノバラードのボイシング、転回、会話形式の歌い方 |
| ソウル | Lean on Me (Bill Withers) | ハ長調 | ダイアトニックなメロディー、ゴスペル風の伴奏、コール＆レスポンス |

楽曲は、**生（MIDIのみ）**の状態から、**注釈付き**の状態、そして**再生可能な状態（音楽的な表現を含む）**へと変化します。AIは楽曲を学習し、`annotate_song` を使用して注釈を書き込むことで、楽曲を促進します。

## Sound Engines

6つのエンジンに加え、レイヤー化されたコンビネーターがあり、これら2つを同時に動作させることができます。

| エンジン | タイプ | 音の特性 |
|--------|------|---------------------|
| **Oscillator Piano** | 加算合成 | ハンマーノイズ、非調和性を含むマルチハーモニックピアノ。48ボイスのポリフォニー、ステレオイメージング。依存関係なし。 |
| **Sample Piano** | WAV再生 | Salamander Grand Piano — 480サンプル、16のベロシティレイヤー、88鍵。本物に近い音。 |
| **Vocal (Sample)** | ピッチシフトされたサンプル | ポルタメントとレガートモードを備えた、持続的な母音音。 |
| **Vocal Tract** | 物理モデル | Pink Trombone — 44個のデジタル波管を介した、LFグロッタル波形。4つのプリセット：ソプラノ、アルト、テナー、ベース。 |
| **Vocal Synth** | 加算合成 | フォルマント整形、息の音、ビブラートを備えた、15のKokoroボイスプリセット。決定論的な（シードされた乱数生成器）。 |
| **Guitar** | 加算合成 | 物理モデルによるピッキングされた弦 — 4つのプリセット（スチールドレッドノート、ナイロンクラシック、ジャズアーチトップ、12弦）、8つのチューニング、17の調整可能なパラメータ。 |
| **Layered** | コンビネーター | 2つのエンジンを組み合わせ、すべてのMIDIイベントを両方に送信します。ピアノ+シンセ、ボーカル+シンセなど。 |

### キーボードボイス

6つの調整可能なピアノボイス。それぞれがパラメータごとに調整可能（明るさ、減衰、ハンマーの硬さ、チューニング、ステレオ幅など）。

| ボイス | 特徴 |
|-------|-----------|
| コンサートグランド | 豊かで、深みがあり、クラシックな響き |
| アップライト | 暖かく、親密で、フォークのような響き |
| エレクトリックピアノ | シルキーで、ジャジー、Fender Rhodesのような響き |
| ホンキーートンク | チューニングが狂っていて、ラグタイム、酒場のような響き |
| オルゴール | クリスタリンで、エフェメラルな響き |
| ブライトグランド | シャープで、現代的で、ポップな響き |

### ギターボイス

物理モデルによる弦合成を備えた、4つのギターボイスプリセット。それぞれが17の調整可能なパラメータ（明るさ、ボディの共鳴、ピッキング位置、弦のダンピングなど）を備えています。

| ボイス | 特徴 |
|-------|-----------|
| スチールドレッドノート | 明るく、バランスが良く、クラシックなアコースティックギターの響き |
| ナイロンクラシック | 暖かく、柔らかく、丸みのある響き |
| ジャズアーチトップ | メロウで、ウッド調で、クリアな響き |
| 12弦 | きらめく、倍音、コーラスのような響き |

## 練習ジャーナル

セッション後、サーバーは発生したことを記録します。使用した曲、テンポ、小節数、演奏時間。AIは独自の考察を追加します。気づいたこと、認識したパターン、次に試すべきこと。

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

毎日、1つのMarkdownファイルが`~/.ai-jam-sessions/journal/`に保存されます。人間が読める形式で、追記のみ可能です。次のセッションでは、AIがジャーナルを読み込み、中断した場所から再開します。

## インストール

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

**Node.js 18+**が必要です。MIDIドライバ、仮想ポート、外部ソフトウェアは不要です。

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

## MCP Tools

5つのカテゴリに分かれた、34のツール

### 学習

| ツール | 機能 |
|------|--------------|
| `list_songs` | ジャンル、難易度、またはキーワードで検索 |
| `song_info` | 楽曲全体の分析 — 構成、重要な部分、教育目標、スタイルに関するヒント |
| `registry_stats` | ライブラリ全体の統計：総楽曲数、ジャンル、難易度 |
| `list_measures` | 各小節の音符、ダイナミクス、教育用メモ |
| `teaching_note` | 単一の小節の詳細な分析 — 運指、ダイナミクス、文脈 |
| `suggest_song` | ジャンル、難易度、および過去に演奏した曲に基づいてのおすすめ |
| `practice_setup` | 楽曲に対する推奨テンポ、モード、ボイス設定、およびCLIコマンド |
| `compare_songs` | ジャンルを越えたパターン認識 — キーの関係、ピッチ/インターバルの類似性、共通の形式、教育的な関連性 |
| `annotation_progress` | ライブラリ全体の注釈品質を評価します。スコア、評価、改善提案を表示します。 |

### 再生

| ツール | 機能 |
|------|--------------|
| `play_song` | スピーカーで再生：ライブラリ内の楽曲、または生の.midファイル。エンジン、速度、モード、小節範囲を自由に設定できます。 |
| `stop_playback` | 停止 |
| `pause_playback` | 一時停止または再開 |
| `set_speed` | 再生中に速度を変更 (0.1倍～4.0倍) |
| `playback_status` | リアルタイム表示：現在の小節、テンポ、速度、キーボード音色、状態 |
| `view_piano_roll` | SVG形式でレンダリング (手動着色、またはピッチクラスごとのカラフルな虹) |
| `score_performance` | MIDI伴奏の演奏を評価：音程の正確さ、タイミング、完全性。評価結果を表示します。 |

### 歌う

| ツール | 機能 |
|------|--------------|
| `sing_along` | 歌えるテキスト：音名、ソルフェージュ、メロディーの輪郭、または音節。ピアノ伴奏あり/なしで利用可能。 |
| `ai_jam_sessions` | ジャムセッションの概要を生成：コード進行、メロディーの骨格、およびスタイルに関するヒントを提供します。 |

### ギター

| ツール | 機能 |
|------|--------------|
| `view_guitar_tab` | インタラクティブなギタータブ譜をHTML形式でレンダリング：クリックして編集、再生カーソル表示、キーボードショートカット対応。 |
| `list_guitar_voices` | 利用可能なギター音色プリセット |
| `list_guitar_tunings` | 利用可能なギターチューニングシステム (標準、ドロップD、オープンG、DADGADなど) |
| `tune_guitar` | 任意のギター音色のパラメータを調整できます。設定はセッション間で保持されます。 |
| `get_guitar_config` | 現在のギター音色設定と工場出荷時のデフォルト設定の比較 |
| `reset_guitar` | ギター音色を工場出荷時の状態にリセット |

### ビルド

| ツール | 機能 |
|------|--------------|
| `add_song` | JSON形式で新しい楽曲を追加 |
| `import_midi` | メタデータ付きの.midファイルをインポート |
| `annotate_song` | 生の楽曲に音楽言語を記述し、利用可能な状態にする |
| `save_practice_note` | セッションデータを自動的に記録したジャーナルエントリ |
| `read_practice_journal` | コンテキストのために、最近のエントリを読み込み |
| `list_keyboards` | 利用可能なキーボード音色 |
| `tune_keyboard` | 任意のキーボード音色のパラメータを調整できます。設定はセッション間で保持されます。 |
| `get_keyboard_config` | 現在の設定と工場出荷時のデフォルト設定の比較 |
| `reset_keyboard` | キーボード音色を工場出荷時の状態にリセット |
| `score_annotation` | 5つの次元（完全性、深さ、具体性、教育的価値、語彙）で注釈の品質を評価 |

## コマンドラインインターフェース

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

## 状態

バージョン1.1.0。6つのサウンドエンジン、34種類のMCPツール、12のジャンルにまたがる120曲。詳細な注釈が付いたサンプルが含まれています。インタラクティブなギタータブ譜エディター。20種類のボーカルプリセット、10種類の楽器音色、7種類のチューニングシステム、およびLLM連携スコアAPIを備えたブラウザベースのインターフェース。2つのカラーモードでピアノロールを可視化。継続的な学習のための練習ジャーナル。MIDI伴奏の評価、注釈品質の評価、およびクロスジャンルのパターン認識。MIDIデータはすべて含まれており、AIが学習するにつれてライブラリは拡張されます。

## セキュリティとプライバシー

**アクセスするデータ:** 楽曲ライブラリ (JSON + MIDI)、ユーザー楽曲ディレクトリ (`~/.ai-jam-sessions/songs/`)、ギターチューニング設定、練習ジャーナルエントリ、ローカルオーディオ出力デバイス。

**アクセスしないデータ:** クラウドAPI、ユーザー認証情報、閲覧履歴、ユーザー楽曲ディレクトリ以外のシステムファイル。テレメトリデータは収集または送信されません。

**権限:** MCPサーバーはstdioトランスポートのみを使用します (HTTP非対応)。CLIはローカルファイルシステムとオーディオデバイスにアクセスします。詳細については、[SECURITY.md](SECURITY.md) を参照してください。

## ライセンス

MIT
