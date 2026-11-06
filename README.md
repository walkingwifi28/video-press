# Video Press

複数動画をPC内で変換するWindowsアプリです。日本語UIにデジタル庁デザインシステム（DADS）の仕様と公式デザイントークンを使用します。

## 必要なもの

- Windows 10/11（64ビット）とMicrosoft Edge WebView2 Runtime
- `ffmpeg.exe` と `ffprobe.exe` を事前にインストールし、PATHに追加してください。追加後はアプリを再起動してください。
- H.264にlibx264、H.265にlibx265、VP9にlibvpx-vp9が必要です。利用できるエンコーダーは起動時に確認します。

## 使い方

1. ［動画を追加］またはドラッグ＆ドロップで動画を複数追加します。
2. コーデック、出力形式、CRF、解像度、FPS、Presetを選びます。
3. 保存先フォルダーを指定し［出力］を押します。
4. 順番に変換されます。進捗と出力先を一覧で確認できます。［キャンセル］で処理を停止できます。

設定は全動画共通ですが、寸法とFPSは各入力に合わせて上限を適用します。縦横比は維持し、拡大とフレーム補間は行いません。解像度候補は入力動画に応じて変化します。入力を追加・削除して選択候補がなくなった場合は「元サイズ」に戻ります。

出力名は元の名前に `_converted` を付けます。同名があれば連番にし、既存ファイルと元動画を上書きしません。変換失敗時も残りのファイルを続行します。

## 対応設定

| コーデック | 形式 | CRF | 速度設定 |
|---|---|---|---|
| H.264 | MP4 / MKV | 0–51（初期23） | ultrafast〜veryslow |
| H.265 | MP4 / MKV | 0–51（初期28） | ultrafast〜veryslow |
| VP9 | WebM / MKV | 0–63（初期32） | cpu-used 0〜5 |

CRFは小さいほど高画質で、通常はファイルが大きくなります。VP9は速度設定の数字が大きいほど高速です。音声はMP4/MKVではAAC、WebMではOpusに変換します。最初の動画と最初の音声を対象とし、字幕・添付データは出力しません。ハードウェアエンコード、結合、動画別の設定、並列変換は対象外です。

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

フロントエンド9件、Rust単体6件、実ffmpeg統合3件が成功しています。Windows画面から横・縦動画を選択し、H.264・H.265・VP9で実出力しました。詳しくは [検証結果](docs/verification.md) を参照してください。

## デザインの出典

- https://design.digital.go.jp/dads/
- https://github.com/digital-go-jp/design-system-example-components-react
- https://github.com/digital-go-jp/design-tokens

デジタル庁が提供する公式アプリではありません。ライセンス情報は `LICENSES/` を参照してください。
