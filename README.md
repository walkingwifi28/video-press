# Video Press

複数動画をPC内で変換するWindowsアプリです。日本語UIにデジタル庁デザインシステム（DADS）の仕様と公式デザイントークンを使用します。

## 必要なもの

- Windows 10/11（64ビット）とMicrosoft Edge WebView2 Runtime
- `ffmpeg.exe` と `ffprobe.exe` を事前にインストールし、PATHに追加してください。追加後はアプリを再起動してください。
- H.264にlibx264、H.265にlibx265、VP9にlibvpx-vp9、AV1にlibsvtav1が必要です。利用できるエンコーダーは起動時に確認します。

## 使い方

1. ［動画を追加］またはドラッグ＆ドロップで動画を複数追加します。
2. 各動画の行でコーデック、出力形式、CRF、解像度、FPS、Presetを選びます。
3. 保存先フォルダーを指定し［出力］を押します。
4. 順番に変換されます。進捗と出力先を一覧で確認できます。［キャンセル］で処理を停止できます。

設定は動画ごとに指定します。寸法とFPSは各入力に合わせて上限を適用します。縦横比は維持し、拡大とフレーム補間は行いません。解像度候補は各動画に応じて表示します。

出力名は元の名前に `_converted` を付けます。同名があれば連番にし、既存ファイルと元動画を上書きしません。変換失敗時も残りのファイルを続行します。

## 対応設定

| コーデック | 形式 | CRF | 速度設定 |
|---|---|---|---|
| H.264 | MP4 / MKV | 0–51（初期23） | ultrafast〜veryslow |
| H.265 | MP4 / MKV | 0–51（初期28） | ultrafast〜veryslow |
| VP9 | WebM / MKV | 0–63（初期32） | cpu-used 0〜5 |
| AV1（SVT-AV1） | MP4 / MKV / WebM | 0–63（初期32） | Preset 0〜13（初期6） |

CRFは小さいほど高画質で、通常はファイルが大きくなります。VP9とAV1は速度設定の数字が大きいほど高速です。音声はMP4/MKVではAAC、WebMではOpusに変換します。最初の動画と最初の音声を対象とし、字幕・添付データは出力しません。ハードウェアエンコード、結合、並列変換は対象外です。

## 開発

Node.js 22以上、Rust stable、Visual Studio Build Toolsの「C++によるデスクトップ開発」とWindows SDKが必要です。

```powershell
npm ci
npm run tauri dev
```

ブラウザ向けの`npm run dev`では外観のみ確認できます。ファイル解析・変換にはTauriでの起動が必要です。

```powershell
npm test -- --run
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

Windows実行ファイルとインストーラーは `src-tauri/target/release/` 以下に出力されます。ffmpegはアプリに同梱しません。

初回ビルドではTauriが公式NSIS配布ツールを取得するため、インターネット接続が必要です。npmとCargoのロックファイルを維持してください。TauriのJavaScript側とRust側は同じマイナーバージョン系列を使用します。

## 検証

フロントエンド13件、Rust単体7件、実ffmpeg統合5件が成功しています。動画別設定は、同一バッチ内で異なる形式・解像度・FPSを指定した実変換で検証しています。AV1はMP4・MKV・WebMの実変換を検証しています。動画別設定の画面操作は未検証です。従来の検証については [検証結果](docs/verification.md) を参照してください。

## デザインの出典

- https://design.digital.go.jp/dads/
- https://github.com/digital-go-jp/design-system-example-components-react
- https://github.com/digital-go-jp/design-tokens

デジタル庁が提供する公式アプリではありません。ライセンス情報は `LICENSES/` を参照してください。
