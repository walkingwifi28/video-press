# Video Press Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox syntax for tracking.

**Goal:** DADSに基づく日本語Windowsアプリで複数動画を安全に変換する。

**Architecture:** Reactが入力・設定と進捗を管理し、TauriコマンドからRustの解析・設定計算・バッチ処理を呼ぶ。ffmpeg/ffprobeはPATHから起動し、引数配列を使う。

**Tech Stack:** Tauri 2, React, TypeScript, Vite, Rust, serde, tokio, ffmpeg.

## Chunk 1: アプリと検証

### Task 0: 環境と契約

Files: `.gitignore`, `src-tauri/tauri.conf.json`, `src-tauri/src/model.rs`。

- [ ] インストール済みNode実体のパスを使い、既存のグローバル設定を変更せずに実行する。Rust・Windows SDK・ffmpeg・ネットワーク依存取得を確認する。
- [ ] 最小Tauri設定とHTMLを用意してビルド時のアセット不足を防ぐ。開発用ウィンドウは標準タイトルバーを使用する。
- [ ] IPC契約をRustのserde型で確定してフロントエンドに伝える。入力はpath、表示寸法、duration、FPS有理数、音声有無、idを含む。解析結果は成功かエラーの区別を持つ。設定はcodec/container/crf/resolution/fps/preset。
- [ ] バッチIDはフロントエンドで開始前に生成しstart_batchの引数で渡す。イベントはbatchId/fileId/status/progress/outputPath/errorを含み、最終イベントは全体完了を表す。開始前にリスナーを登録し、イベントが開始応答より先に届いても保持する。

### Task 1: バックエンド

Files: `src-tauri/Cargo.toml`, `build.rs`, `tauri.conf.json`, `capabilities/default.json`, `src/{main,lib,model,probe,encoding,batch}.rs`, `tests/encoding.rs`, `tests/ffmpeg.rs`.

- [ ] 純粋な設定計算と互換性の失敗テストを先に追加して実行。横縦・回転・SAR・入力FPS制限・未知FPS・CRF範囲・不正コンテナを含める。
- [ ] 型付き設定、ffprobe解析、エンコーダー検出、寸法と引数計算を実装しテストを成功させる。
- [ ] Tauriコマンド `get_environment`, `probe_files`, `start_batch`, `cancel_batch` を公開する。dialogプラグインでパス選択、`batch-progress`イベントで進捗を送る。
- [ ] バッチを直列実行し、キャンセル・ウィンドウ終了時に子プロセスを終了する。出力はcreate_newで確保した一時ファイルを使い、上書きなしの最終化を行う。
- [ ] 実ffmpegで日本語パス、音声なし、異なる入力寸法、変換失敗後継続、キャンセル、衝突時の非上書きを検証する。
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` と `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` が成功することを確認する。

### Task 2: DADS UI

Files: `package.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`, `src/{main,App,types,settings}.tsx/ts`, `src/styles.css`, `src/components/*.tsx`, `src/settings.test.ts`, `LICENSES/DADS.md`.

- [ ] 公式DADSのトークン・フォーム・ボタン仕様とライセンスを確認し、出典を記録する。
- [ ] 解像度候補と選択消失時のリセットについて振る舞いテストを先に追加し、失敗を確認する。
- [ ] バックエンドの型付き契約に合わせ、複数選択とドラッグ＆ドロップ、解析一覧、設定、保存先、実行、キャンセル、進捗、エラー詳細を実装する。
- [ ] コーデックに応じて形式・CRF・Presetを更新。無効設定と処理中の編集を禁止。遅延解析とイベントの競合を防ぐ。
- [ ] 白と青を基調にDADS仕様の文字・余白・フォーム・フォーカスを適用する。狭いウィンドウと拡大表示でも操作可能にする。
- [ ] `npm test -- --run` と `npm run build` が成功することを確認する。

### Task 3: 統合・配布

Files: `README.md`, `.gitignore`, `scripts/*`（必要な場合）、上記の統合修正。

- [ ] 開発用Node環境とRust/Windowsビルド依存を確認し、ネットワークや権限の不足は具体的な失敗として記録する。
- [ ] 本番Tauriアプリをビルドし、可能ならウィンドウで入力・設定・実変換・キャンセルを確認する。ブラウザだけのUIを実変換検証の代替にしない。
- [ ] `npm run tauri build` が成功しWindows実行ファイルが生成されたことを確認する。
- [ ] READMEに起動・配布・PATH設定・対応設定・制約・検証結果を記載する。
- [ ] 設計適合レビュー、続いてコード品質レビューの指摘を修正し再検証する。

## 検証基準

入力は保存前後で同一、出力は指定サイズ以下・偶数寸法・選択コーデックで再生可能。処理終了後にffmpegが残らず、キャンセルした出力が完成ファイルとして現れない。選択解像度が消えた場合は元サイズに戻る。全テスト・本番フロントエンドビルド・Rustチェック・Windowsビルドの結果を最終報告に反映する。
