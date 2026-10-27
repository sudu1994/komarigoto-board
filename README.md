# 困りごとボード

AI駆動開発チーム② 初回MTG用のアイデア出しボード。スマホで書く → 会議室モニターにライブ表示。

| ページ | 使う人 | URL |
|---|---|---|
| 参加 | メンバーのスマホ | `/join?r=<ROOM_CODE>`（モニターのQRから） |
| モニター | 会議室の画面 | `/screen?r=<ROOM_CODE>` |
| 管理 | リーダー | `/admin?k=<ADMIN_KEY>` |
| デモ（データなしで見た目確認） | だれでも | `/join?demo=1&phase=react`、`/screen?demo=1&phase=free`（phase: lobby/post/react/vote/free/themes） |

## 流れ
ロビー → 投稿タイム（匿名・10分）→ わかる！タイム（名前つき・10分）→ 投票タイム（3票・5分）→ フリータイム（1on1中：解決案💡スレッド）→ テーマ発表（AIでまとめ）

各タイムは「全員が完了を押す」か「タイマー0」で自動で次へ。管理画面で延長・スキップ可。

## セットアップ（初回だけ）
1. **Supabase**：SQL Editor で `supabase/schema.sql` を実行
2. **Vercel**：このリポジトリをImport → Environment Variables に `.env.example` の項目を設定
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_KEY`（publishable / anon）
   - `SUPABASE_SECRET_KEY`（secret / service_role・サーバーのみ）
   - `ROOM_CODE`（QRに入る合言葉）、`ADMIN_KEY`（長いランダム文字列）
   - `ANTHROPIC_API_KEY`（任意。なければ投票ランキング表示）
3. Deploy → `/admin?k=...` を開く → 「モニター」リンクを会議室の画面で開き「クリックで音をオン」

## 匿名について
困りごと（posts）には投稿者IDを保存しません。消すための鍵は投稿したスマホだけが持ちます（2分以内）。投稿タイム中は管理画面以外から本文が見えず、終了時にまとめて公開。並び順もランダムです。
※7人だと書き方で推測できることはあります。

## 本番前チェック
- iPhone と Android で各1台、同時に投稿してみる
- モニター：全画面・音の出力先・スリープ無効
- 予備：紙の付箋とペン
