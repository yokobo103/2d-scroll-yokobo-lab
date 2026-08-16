# ステージPrefab拡張計画

今回は計画のみ。制作時は `side_scroll_mode`、`parallax_layers + platform_objects + interactive_scene_objects + scene_hooks`、`precise_shapes` を維持する。背景画像から衝突を推測しない。

## P0: コース構築の基本セット

### 1. `lab-platform-narrow-v1`

- 用途: 浮遊床、着地練習、上ルート
- 生成: generate2dspriteの `platform_strip_1x3`
- 内訳: 左端／反復中央／右端
- 編集許可: `x`, `y`, `modules`, `pattern`
- 衝突: surface固定の一方向矩形

### 2. `lab-bridge-v1`

- 用途: 長い床の視覚変化、壊れかけ区間
- 生成: generate2dspriteの `platform_strip_1x4`
- 内訳: 左端／反復中央／右端／損傷中央
- 損傷版も床面は途切れさせず、穴が必要な場合はPrefab自体を分割配置する
- 衝突: surface固定の一方向矩形

### 3. `lab-support-v1`

- 用途: 浮いた床を壁・支柱・天井へ視覚的に接続
- 生成: 重要な縦長パーツとして一個ずつ生成
- 編集許可: `x`, `y`, `variant`
- 衝突: なし。背景装飾であることをレジストリへ明記

## P1: 遊びを作るセット

### 4. `lab-moving-platform-v1`

- 既存の床画像を再利用し、動作をデータで追加
- 編集許可: `x`, `y`, `axis`, `distance`, `period`, `phase`
- `axis` は水平または垂直のみ
- 乗っている間は主人公を床の移動量だけ追従させる

### 5. `energy-vent-v1`

- 用途: 周期的に噴き出す研究所ギミック
- 本体と噴出FXを別アセットにする
- 本体: 一個ずつ生成。FX: generate2dspriteの2x2アニメーション
- 当たり判定は警告→危険→停止の状態に連動

### 6. `pickup-pattern-v1`

- 画像追加なし。既存結晶を配置データで展開
- パターン: 弧、階段、着地点誘導、危険物の上、上下ルート分岐
- 編集許可: 起点、間隔、個数、反転

## P2: 密度と世界観

### 7. `lab-decoration-pack-v1`

- 小型警告灯、瓶、壁面パネル、ケーブル束などの小物
- コンパクトな小物だけをgenerate2dspriteの2x2パックで生成
- 衝突なし、描画レイヤーと壁／床アンカーを指定

### 8. `lab-wall-connection-v1`

- 床端、壁際、天井接続部の隙間を埋める
- 横長・縦長は正方形パックへ混在させず、一個ずつまたは専用の横長セルで生成
- 衝突は原則なし。ゲームプレイ上の壁が必要になった時だけsolid矩形Prefabを別登録

## 制作時の受け入れ条件

- すべての生画像はgenerate2dspriteと組み込みimage generationから作る
- 背景とランタイム制御オブジェクトを分離する
- 衝突付き横長部品を正方形の小物パックへ詰めない
- 左端・中央・右端の接続部が拡張後も自然につながる
- 接地面は既存のsurface規格へ正規化する
- 倍率と回転は編集不可。許可項目だけPrefabレジストリへ列挙する
- PC横画面とスマホ縦画面の両方でQAする
