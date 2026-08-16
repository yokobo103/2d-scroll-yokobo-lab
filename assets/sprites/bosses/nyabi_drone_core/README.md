# ニャビドローン・コア 腕回転アニメーション

ユーザー提供の正面ボス画像を正本として、全身一体絵の6コマを2系統作成した。

- `arm_up/`: 両腕を水平から上60度へ回す
- `arm_down/`: 両腕を水平から下60度へ回す
- 各系統の5コマ目は警告光、6コマ目は発射口の白熱
- レーザー線そのものは絵へ焼き込まず、実ゲーム側が各コマの実測発射口から描画する

## ランタイム同期

警告1.0秒で0〜4コマ、射撃0.72秒で5コマ目を保持、回復1.15秒で4〜0コマを逆再生する。攻撃は下向き・上向きを交互に使う。

旧`parts_v2`の胴体・前腕分割画像と関節回転コードはランタイムから外した。旧素材は履歴確認用に残しているが、読み込みも描画も行わない。

## 生成・後処理

各フォルダの`raw-sheet.png`が組版前の生成結果、`raw-sheet-safe.png`がセル境界を安全化した入力、`processed/`に透過済みフレーム・GIF・シート・メタデータがある。使用プロンプトは各フォルダの`prompt-used.txt`。

`tools/prepare_boss_arm_sheet.py`で生成時のセル区切りを除去し、`generate2dsprite.py process`で背景除去、中心合わせ、共有スケール、端接触検査を行った。両シートとも`edge_touch_frames: []`。

## QA

- `artifacts/boss-arm-animation/boss-laser-firing-pc.png`: PC 1536×864、発射口と実レーザーの接続
- Presentation Contract: front-elevation / air / gameplay / damage / world-center
