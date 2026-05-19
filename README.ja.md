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

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://codecov.io/gh/mcp-tool-shop-org/ai-jam-sessions"><img src="https://codecov.io/gh/mcp-tool-shop-org/ai-jam-sessions/branch/main/graph/badge.svg" alt="codecov"></a>
  <a href="https://www.npmjs.com/package/ai-jam-sessions"><img src="https://img.shields.io/npm/v/ai-jam-sessions" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/songs-120_across_12_genres-blue" alt="Songs"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/annotated-24-green" alt="Ready"></a>
  <a href="datasets/jam-actions-v0-public/README.md"><img src="https://img.shields.io/badge/dataset-jam--actions--v0%20(115_records)-8b5cf6" alt="Training dataset"></a>
</p>

---

## これは何ですか？

AIが演奏を学習するためのピアノとギター。シンセサイザーでも、MIDIライブラリでもありません。これは、学習のための楽器です。

LLMはテキストを読み書きできますが、私たちが音楽を体験する方法を理解することはできません。耳も指も、筋肉の記憶もありません。AI Jam Sessionsは、モデルが実際に利用できる感覚を与えることで、このギャップを埋めます。

- **読み込み:** 実際のMIDI楽譜で、詳細な音楽的注釈が付いています。手書きの近似ではなく、解析され、分析され、説明されています。
- **聴覚:** 6つのオーディオエンジン（オシレーターピアノ、サンプルピアノ、ボーカルサンプル、物理モデルによる声帯、加算合成ボーカル、物理モデルによるギター）がスピーカーから音を出し、部屋にいる人がAIの「耳」となります。
- **視覚:** 演奏内容をSVG形式で表示するピアノロール。モデルが読み込んで検証できるインタラクティブなギタータブ譜エディター。視覚的なキーボード、デュアルモードのノートエディター、チューニングラボを備えたブラウザベースのインターフェース。
- **記憶:** 練習記録をセッション間で保持し、学習効果を積み重ねることができます。
- **歌唱:** 20種類のボーカルプリセットを備えた声帯合成（オペラソプラノからエレクトリックコーラスまで）。ソルフェージュ、メロディー、音節のナレーション機能付きのカラオケモード。

12のジャンルごとに、詳細な注釈が付いたサンプル楽曲（リファレンス楽曲）が用意されています。これは、AIが最初に学習するもので、歴史的背景、小節ごとの構造分析、重要なポイント、学習目標、演奏のヒントなどが含まれています。残りの96曲は生のMIDIデータで、AIがパターンを学習し、音楽を演奏し、独自の注釈を付けるのを待っています。

このプロジェクトに関連して、**[jam-actions-v0](#training-dataset)** という、115のマルチターン型MCP（Music Creation Pipeline）ツール使用のデータセットを公開しています。これは、実際のクラシックピアノの演奏データに基づいています。このデータセットは、LLMにテキスト生成だけでなく、*記号音楽に対するツール使用*を学習させます。また、タスクが単純な場合に「証拠を提示する」ことと「単にタスクが簡単だから提示する」ことを区別する、7軸のリリースゲートが付属しています。詳細については、以下の[Training Dataset](#training-dataset)をご覧ください。

## ピアノロール

ピアノロールは、AIが音楽をどのように認識するかを表しています。どの曲もSVG形式で表示され、右手が青、左手がコーラル色で、拍子、ダイナミクス、小節の区切り線が表示されます。

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

2つのカラーモードがあります。**楽器**モード（青/コーラル）と、**音階**モード（色付きの虹色。すべてのドは赤、すべてのファ#はシアン）。SVG形式であるため、モデルは画像を見ることができるだけでなく、音程、リズム、左右の手の独立性を検証するために、マークアップを読み込むことができます。

## コックピット

MCPサーバーと並行して開くことができる、ブラウザベースの楽器およびボーカルスタジオです。プラグインも、DAW（デジタルオーディオワークステーション）も必要ありません。単にピアノが配置されたウェブページです。

- **デュアルモードピアノロール:** 楽器モード（音階の色付き表示）とボーカルモード（母音の形によって色分け：/a/ /e/ /i/ /o/ /u/）を切り替えられます。
- **視覚的なキーボード:** C4から2オクターブの範囲を、QWERTYキーボードにマッピング。クリックするか、キーボードで入力します。
- **20種類のボーカルプリセット:** Kokoroによってマッピングされた15種類の音声（Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis）、4種類の声帯マッピングされた音声、および合成コーラスセクション。
- **10種類の楽器プリセット:** サーバーサイドの6種類のピアノ音色に加え、シンセパッド、オルガン、ベル、ストリングス。
- **ノートインスペクター:** 任意のノートをクリックすると、ベロシティ、母音、息の量を編集できます。
- **7種類のチューニングシステム:** イコールテンパー、純正律（長調/短調）、ピタゴラス、四度調、ヴェルクマイスターIII、またはカスタムのセントオフセット。A4の基準音を調整可能（392–494 Hz）。
- **チューニング監査:** 周波数テーブル、ビート周波数分析によるインターバルトレーナー、チューニングのエクスポート/インポート機能。
- **スコアのインポート/エクスポート:** スコア全体をJSON形式でシリアライズし、読み込むことができます。
- **LLM向けのAPI:** `window.__cockpit`には、`exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()`, `getScore()`などの関数が公開されており、LLMがプログラム的に作曲、編曲、再生することができます。

## The Learning Loop

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

## The Song Library

12のジャンルにまたがる120曲。すべて、実際のMIDIファイルから作成されています。各ジャンルには、詳細な注釈が付された代表曲が1つあります。これには、歴史的背景、小節ごとのハーモニー分析、重要なポイント、教育目標、演奏のヒント（ボーカルガイドを含む）が含まれています。これらの代表曲はテンプレートとして機能します。AIは1つの曲を学習し、その後、残りの曲を注釈付けします。

| ジャンル | 代表曲 | キー | 学習内容 |
|-------|----------|-----|-----------------|
| ブルース | The Thrill Is Gone (B.B. King) | イ短調 | マイナーブルースの形式、コール・アンド・レスポンス、ビートの遅れ |
| クラシック | Für Elise (ベートーヴェン) | ハ短調 | ロンド形式、タッチの差別化、ペダリングの技術 |
| 映画音楽 | Comptine d'un autre été (ティエルセン) | ヘ短調 | アルペジオのテクスチャ、ハーモニーの変化のないダイナミックな構成 |
| フォーク | Greensleeves | ヘ短調 | 3/4のワルツのリズム、モーダル・ミキシング、ルネサンス時代のボーカルスタイル |
| ジャズ | Autumn Leaves (コスマ) | ロ短調 | ii-V-Iの進行、ガイドトーン、スイングエイト、ルートレス・ボイシング |
| ラテン | The Girl from Ipanema (ジョビン) | ホ長調 | ボサノバのリズム、クロマチックな転調、ボーカルの抑制 |
| ニューエイジ | River Flows in You (Yiruma) | ハ長調 | I-V-vi-IVの認識、流れるようなアルペジオ、ルバート |
| ポップ | Imagine (レノン) | ハ長調 | アルペジオの伴奏、抑制、ボーカルの誠実さ |
| ラグタイム | The Entertainer (ジョプリン) | ハ長調 | Oom-pahベース、シンコペーション、マルチストレイン形式、テンポの安定性 |
| R&B | Superstition (スティービー・ワンダー) | ヘ短調 | 16分音符のファンク、パーカッシブなキーボード、ゴーストノート |
| ロック | Your Song (エルトン・ジョン) | ヘ長調 | ピアノバラードのボイスリーディング、転回、会話のような歌い方 |
| ソウル | Lean on Me (ビル・ウィザース) | ハ長調 | ダイアトニックなメロディー、ゴスペル風の伴奏、コール・アンド・レスポンス |

楽曲は、**未加工**（MIDIのみ）→ **注釈付き** → **完成**（音楽的な表現で完全に演奏可能）という流れで進化します。AIは楽曲を学習し、`annotate_song`を用いて注釈を付加することで、楽曲の進化を促進します。

## サウンドエンジン

6つのエンジンに加え、任意の2つを同時に実行できるレイヤード・コンビネーターがあります。

| エンジン | タイプ | 音色 |
|--------|------|---------------------|
| **Oscillator Piano** | 加算合成 | ハンマーノイズ、非調和性を持つマルチハーモニックピアノ、48ボイスのポリフォニー、ステレオイメージング。依存関係なし。 |
| **Sample Piano** | WAV再生 | Salamander Grand Piano — 480サンプル、16のベロシティレイヤー、88鍵。本物に近い音。 |
| **Vocal (Sample)** | ピッチシフトされたサンプル | ポルタメントとレガートモードを持つ、持続的な母音。 |
| **Vocal Tract** | 物理モデル | Pink Trombone — 44セルのデジタル波管を介したLFグロタル波形。ソプラノ、アルト、テナー、ベースの4つのプリセット。 |
| **Vocal Synth** | 加算合成 | フォルマント整形、息の音、ビブラートを持つ15のKokoroボイスプリセット。決定論的（シードされた乱数生成器）。 |
| **Guitar** | 加算合成 | 物理モデルに基づいた撥弦楽器 — 4つのプリセット（スチールドレッドノート、ナイロンクラシック、ジャズアーチトップ、12弦）、8つのチューニング、17の調整可能なパラメータ。 |
| **Layered** | コンビネーター | 2つのエンジンを組み合わせ、すべてのMIDIイベントを両方に送信します。ピアノ+シンセ、ボーカル+シンセなど。 |

### キーボード音源

六種類のピアノ音色があり、それぞれ個々のパラメータ（明るさ、減衰、ハンマーの硬さ、チューニングずれ、ステレオ幅など）を調整できます。

| 音色 | 特徴 |
|-------|-----------|
| コンサートグランドピアノ | 豊かで、深みがあり、クラシック |
| アップライトピアノ | 暖かく、親しみやすく、フォーク |
| エレキピアノ | シルキーで、ジャジー、フェンダーローズのような響き |
| ホンキーートンクピアノ | チューニングが狂っていて、ラグタイム、酒場のような雰囲気 |
| オルゴール | 透明感があり、幻想的 |
| ブライトグランドピアノ | シャープで、現代的、ポップ |

### ギター音色

物理モデルによる弦の合成を用いた4種類のギター音色があり、それぞれ17個の調整可能なパラメータ（明るさ、ボディの共鳴、ピッキング位置、弦のダンピングなど）を備えています。

| 音色 | 特徴 |
|-------|-----------|
| スチールドレッドノート | 明るく、バランスが良く、クラシックなアコースティックギター |
| ナイロンクラシックギター | 暖かく、柔らかく、丸みのある音 |
| ジャズ・アーチトップギター | メロウで、木質感があり、クリアな音 |
| 12弦ギター | きらびやかで、倍音豊かで、コーラスのような響き |

## 練習ジャーナル

セッション後、サーバーは発生した内容を記録します。使用した曲、テンポ、小節数、演奏時間など。AIは独自の考察を追加します。気づいたこと、認識したパターン、次に試すべきことなど。

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

## トレーニングデータセット

**jam-actions-v0**：実際のクラシックピアノのMIDIデータに基づいた、マルチターン型のMCPツール使用のトレースをまとめた公開データセットです。このサーバーが使用するライブラリと同じものから作成されており、LLM（大規模言語モデル）が**記号音楽に対するツール使用**を学習できるように設計されています。これは、単なるテキスト生成とは異なります。

各レコードは、4小節のフレーズと、教師用ターゲット、および*ターゲットトレース*（アシスタントが上記のMCPツール（`get_events_in_measure`、`get_events_in_hand`、`count_distinct_pitch_classes`など、9つのMIDIインスペクターツール）を使用して、フレーズを読み込み、分析し、議論する一連の操作）で構成されています。

| | |
|---|---|
| レコード数 | 115件（公開サブセット） |
| 基準となる結果 | 16件のレコード（E3、修正後） |
| 楽曲 | 8つのクラシックピアノ作品（ベートーヴェン、バッハ、シューベルト、シューマン、モーツァルト、メンデルスゾーン、チャイコフスキー） |
| MIDIデータ | piano-midi.de - Bernd Kruegerのアレンジ |
| ライセンス | CC-BY-SA-3.0-DE（アレンジ）およびパブリックドメインの楽曲 |
| バージョン | 0.4.3 (2026-05-19) |
| スキーマ | `release-gate-assessment/2.0.0` |

**品質基準：7つの軸によるリリースゲート。** このデータセットには、根拠のある結果と、基準を満たしていない結果を区別するリリースゲートが付属しています。軸1〜6は、絶対的な基準値、許容範囲、ツール使用率、ツール使用後の修正、誤解釈の数、および最低限の基準値を表します。軸7は、詳細なレポートの有無を表します。軸2と6には、テキストのみ、ツールによる分析、およびランダムなMIDI条件でそれぞれ1.000のスコアを獲得するレコードを含めることで、より厳しい基準を満たすレコードが希薄になるのを防ぎます。Slice 22の基準は、この改訂されたゲートに**合格**しています。Slice 19の基準は、依然として**不合格**であり、これは回帰診断のためのもので、ゲートの有効性を確認するためのものです。

**再現性。** Windows、macOS、Linux、WSLなど、どのプラットフォームでも、新しいユーザーがパッケージを検証し、基準となる「合格」の結果を1分以内に再現できます。

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions && pnpm install
pnpm exec tsx scripts/verify-public-package-checksums.ts        # 273 entries, ~2s
pnpm exec tsx scripts/check-release-gate.ts \
  datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json
# → "Verdict: PASS"
```

`.gitattributes`ファイルでは、`*.sha256`ファイルと公開データセットのディレクトリに対して、LF（Line Feed）改行コードを強制することで、どのプラットフォームでもチェックサム検証が機能するようにしています。また、`release-gate`コマンドラインツールは、位置引数のみを受け付けるように設計されており（未知の引数や複数の位置引数を拒否）、初心者でも誤って実行してしまうことを防ぎます。

**場所:** データセット全体の詳細は、[`datasets/jam-actions-v0-public/README.md`](datasets/jam-actions-v0-public/README.md)で確認できます。Zenodoへのメタデータは[`zenodo-metadata.json`](datasets/jam-actions-v0-public/zenodo-metadata.json)、引用メタデータは[`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff)、リリースノートは[`RELEASE_NOTES.md`](datasets/jam-actions-v0-public/RELEASE_NOTES.md)にあります。初期のコーパス草稿から、修正、Schumannによる改善、RC版の修正、そしてオペレーターの単独での検証までの一連のプロセスは、[`docs/`](docs/)に記録されています。

> MIDIアレンジは、Bernd Krueger氏（piano-midi.de）によるもので、CC-BY-SA-3.0-DEライセンスで提供されています。アノテーション、トレース、および評価データは、AI Jam Sessionsチームによって作成され、同じライセンスで公開されており、共有可能なチェーンが維持されるようにしています。

## インストール

```bash
npm install -g ai-jam-sessions
```

**Node.js 18以上**が必要です。MIDIドライバ、仮想ポート、外部ソフトウェアは不要です。

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

6つのカテゴリに分類された41のツールと3つのプロンプトテンプレート。

### 学習

| ツール | 機能 |
|------|--------------|
| `list_songs` | ジャンル、難易度、またはキーワードで検索 |
| `song_info` | 楽曲全体の分析：構成、重要な部分、教育目標、演奏のヒント |
| `registry_stats` | ライブラリ全体の統計：総楽曲数、ジャンル数、難易度数 |
| `list_measures` | 各小節の音符、強弱記号、および教育用メモ |
| `teaching_note` | 特定の小節の詳細：運指、強弱記号、文脈 |
| `suggest_song` | ジャンル、難易度、および過去に演奏した楽曲に基づいてのおすすめ |
| `practice_setup` | 楽曲のおすすめテンポ、演奏モード、音色設定、およびコマンドラインコマンド |
| `compare_songs` | ジャンルを越えたパターン認識：キーの関係、音程/インターバルの類似性、共通の形式、教育的な関連性 |
| `annotation_progress` | ライブラリ全体の評価品質：スコア、評価、および改善提案 |
| `server_info` | サーバーのバージョン、ライブラリの統計、エンジンの一覧、アクティブなセッション |

### 演奏

| ツール | 機能 |
|------|--------------|
| `play_song` | スピーカーから再生：ライブラリの楽曲または生の.midファイル。任意のエンジン、テンポ、モード、小節範囲。 |
| `stop_playback` | 停止 |
| `pause_playback` | 一時停止または再開 |
| `set_speed` | 再生中にテンポを変更（0.1倍～4.0倍） |
| `playback_status` | リアルタイムのスナップショット：現在の小節、テンポ、速度、キーボードの音色、状態 |
| `view_piano_roll` | SVG形式でレンダリング（手描き風カラーまたは音階ごとの虹色） |
| `score_performance` | MIDIの演奏を評価：音程の正確さ、タイミング、完全性、および段階的なフィードバック |
| `mute_hand` | 練習中に左手または右手をミュート：片手ずつ集中して練習 |
| `preview_teaching_cues` | 演奏前にすべての教育用メモと重要な部分を表示 |

### 歌

| ツール | 機能 |
|------|--------------|
| `sing_along` | 歌える歌詞：音名、ソルフェージュ、メロディーの輪郭、または音節。ピアノ伴奏ありまたはなし。 |
| `ai_jam_sessions` | ジャムのアイデアを生成：コード進行、メロディーの概要、およびスタイルに関するヒント |

### ギター

| ツール | 機能 |
|------|--------------|
| `view_guitar_tab` | インタラクティブなギタータブ譜をHTML形式でレンダリング：クリックして編集、再生カーソル、キーボードショートカット |
| `list_guitar_voices` | 利用可能なギターの音色プリセット |
| `list_guitar_tunings` | 利用可能なギターのチューニングシステム（標準、ドロップD、オープンG、DADGADなど） |
| `tune_guitar` | 任意のギターの音色のパラメータを調整。セッション間で保持されます。 |
| `get_guitar_config` | 現在のギターの音色設定と工場出荷時のデフォルト設定の比較 |
| `reset_guitar` | ギターの音色を工場出荷時の状態にリセット |

### ビルド

| ツール | 機能 |
|------|--------------|
| `add_song` | JSON形式で新しい楽曲を追加 |
| `import_midi` | メタデータ付きの.midファイルをインポート |
| `annotate_song` | 未完成の楽曲に対して音楽的な表現を記述し、それを完成品にする。 |
| `save_practice_note` | 自動で記録されたセッションデータを記録する。 |
| `read_practice_journal` | 文脈のために、最近の記録を読み込む。 |
| `list_keyboards` | 利用可能なキーボード音色。 |
| `tune_keyboard` | 任意のキーボード音色のパラメータを調整可能。設定はセッション間で保持される。 |
| `get_keyboard_config` | 現在の設定と工場出荷時のデフォルト設定の比較。 |
| `reset_keyboard` | キーボード音色を工場出荷時の状態にリセットする。 |
| `score_annotation` | 楽曲の評価項目は、5つの次元（網羅性、深さ、具体性、教育的価値、語彙）から評価する。 |
| `validate_song_entry` | 楽曲のJSONデータを追加する前に、スキーマとの整合性を検証する。 |
| `transpose_song` | 楽曲のキーを半音単位で上げたり下げたりする（新しいキー、新しい音符）。 |
| `list_sections` | 楽曲の構成要素（イントロ、ヴァース、コーラスなど）を表示する。 |
| `add_section` | 楽曲の構成要素を示すマーカーを追加する。 |

### MCPプロンプト

構造化された学習ワークフローのための3つのプロンプトテンプレート。

| プロンプト。 | 機能 |
|--------|--------------|
| `annotate_song` | ガイド付きのアノテーションワークフロー：サンプルを学習し、未完成の楽曲に対して音楽的な表現を記述する。 |
| `practice_plan` | ジャンル、難易度、目標に基づいて、構造化された練習プランを作成する。 |
| `performance_review` | 完了したセッションをレビューする：何がうまくいったか、次に何を重点的に行うべきか。 |

## コマンドラインインターフェース (CLI)

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

## ステータス

バージョン1.4.1。6つのサウンドエンジン、41個のMCPツール、3つのプロンプトテンプレート、12のジャンルにまたがる120曲。各楽曲には詳細なアノテーションが施されています。楽曲の移調、セクションマーカー、パートごとのミュート/ソロ機能による集中練習。インタラクティブなギタータブ譜エディター。20種類のボーカルプリセット、10種類の楽器音色、7種類のチューニングシステム、およびLLM向けのスコアAPIを備えたブラウザインターフェース。2つのカラーモードで表示可能なピアノロール。継続的な学習のための練習記録。サーバー再起動後もセッションの状態が保持されます。MIDIによる合奏、アノテーションの品質評価、およびクロスジャンルのパターン認識。

また、**[jam-actions-v0](#training-dataset)** も公開しています。これは、クラシックピアノのマルチターンMCPツール使用の追跡データを含む、115件のトレーニングデータセットです。7軸のリリースゲート、コールドスタート時の再現性、および完全なZenodo + CITATION.cffメタデータ（CC-BY-SA-3.0-DE）を備えています。MCPサーバー、データパッケージャー、評価環境、およびリリースゲートバリデーターの1513件のテストが合格しています。MIDIデータはすべて含まれており、ライブラリはAIが学習するにつれて成長し、その学習結果がパッケージとして提供されます。

## セキュリティとプライバシー

**アクセスするデータ:** 楽曲ライブラリ（JSON + MIDI）、ユーザー楽曲ディレクトリ（`~/.ai-jam-sessions/songs/`）、ギターのチューニング設定、練習記録。

**アクセスしないデータ:** クラウドAPI、ユーザー認証情報、閲覧履歴、ユーザー楽曲ディレクトリ以外のシステムファイル。テレメトリーデータは収集も送信もされません。

**権限:** MCPサーバーはstdioトランスポートのみを使用します（HTTPは使用しません）。CLIはローカルファイルシステムとオーディオデバイスにアクセスします。詳細については、[SECURITY.md](SECURITY.md) を参照してください。

## ライセンス

MITライセンス。
