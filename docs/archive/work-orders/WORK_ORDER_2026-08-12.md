# 作業指示書 — 縦構造への移行と1Fの語彙

発行日: 2026-08-12
対象: `20260810_ニャビットの暴走実験室`
前提資料: `docs/FLOOR_DESIGN.md`（**先に読むこと。今回の判断根拠はすべてここ**）、`docs/HANDOFF_2026-08-11.md`、`AGENTS.md`、`../AGENTS.md`
前回の指示書: `docs/archive/work-orders/WORK_ORDER_2026-08-11.md`（T1〜T6完了済み。再着手しない）

## 0. この指示書の位置づけ

所長のレビューで、ゲームの構造方針が決まった。

> **奥へ進む＝下へ降りる。降り方そのものを階ごとに変える。**

`docs/FLOOR_DESIGN.md` が5階層の設計正本である。本指示書は、そのうち**装置（縦カメラ・中景層・危険物規格）と1Fの語彙（昇降リフト・起動スイッチ）**を実装する。

タスクは T1〜T5 の5件。**T1 → T2 → T3 → T4 → T5 の順に、1件ずつ**着手する。

### 全タスク共通の禁止事項

- 可視2Dアセットの新規生成は `generate2dsprite` を使う。コード描画の仮素材で代用しない
- 横スクロールのゲームプレイ面へ斜め俯瞰・アイソメ素材を置かない
- 接地契約（`footBaseline: 287` / `surfaceY: 6`）を変更しない
- Prefabの倍率・回転を変更しない。ステージエディターの許可項目を勝手に増やさない
- **半透明で層を作らない**（§T5の規則。今回から全面禁止）

### 全タスク共通の完了条件

```powershell
npm run assets:normalize
npm run validate
npm run build
```

すべて成功すること。PC横画面（1536×864）と スマホ縦画面（390×844）の両方で確認し、`screenshots/` に保存する。

---

## T1. 危険物の見た目規格をつくる

### 現状の問題

所長から「ダメージを受けるギミックのデザインが直感的にわかりにくい」との指摘。対象は `energy-vent-v1`（噴出口）と `energy-spill-v1`（液だまり）。

原因は**危険色が報酬色と同じ**であること。シアンは結晶・シールド・足場ライト・HUDに使われている「良いもの」の色で、その同じシアンで噴出と液だまりを描いている。噴出口はきれいな噴水に、液だまりは水たまりに見える。

そしてこの問題は既に一度解いている。`docs/HANDOFF_2026-08-11.md` §12 に記録がある。

> 明るい背景では加算発光だけだと白く薄まる。危険物は暗い輪郭を併用する。

ニャビドローンのレーザーはこれで直した（暗赤の輪郭＋オレンジ外光＋白い芯）。**同じ学びが噴出口と液だまりに適用されていない。**学びが1件の修正で止まり、規格になっていない。今回それを規格にする。

### やること

#### 1-1. 規格文書を作る

`docs/hazard-visual-contract.md` を新設する。内容は最低限これを含む。

- **色相**: 危険はオレンジ〜赤に固定。**シアン・水色・緑を危険の主色に使わない**
- **輪郭**: 暗色アウトライン必須（明るい背景で溶けないため）
- **形**: 触ると痛い形（トゲ・噴出・稲妻）。丸く滑らかな器や水たまりの形を使わない
- **床ハザード**: 床面に警告帯（斜めストライプ）を敷き、危険範囲を床に描く
- **周期ハザード**: idle / warning / active が**光量ではなく色**で区別できること
- **環境色との関係**: 3F冷凍室・4Fバイオラボのように環境色が寒色・緑系の階でも、危険物そのものはオレンジ〜赤の要素を必ず持つ。環境色と危険色を混ぜない（根拠: `docs/FLOOR_DESIGN.md` §3-1）

#### 1-2. Prefabに必須項目を足す

`data/prefab-registry.json` の `presentation` に `hazardVisual` を追加する。`semanticRole: "hazard"` の全Prefabで必須にする。

```json
"hazardVisual": {
  "dangerHue": "orange-red",
  "hasDarkOutline": true,
  "hasFloorWarningBand": true,
  "stateColorShift": true
}
```

#### 1-3. 噴出口と液だまりを作り直す

`generate2dsprite` で再生成する。規格に沿わせること。

- **energy-vent（噴出口）**: シアンの噴水をやめ、オレンジ〜赤の高温噴出にする。台座に暗色の輪郭。idle / warning / active の3状態が色で分かること（現行は4フレームあるが、warningが弱く明るい背景で判別できない）
- **energy-spill（液だまり）**: 水たまりの形をやめる。危険な漏出物として、床に警告帯を伴う形にする。暗色の縁を必ず持たせる

再生成後は `npm run assets:normalize` と `npm run validate:contact` を通す。

#### 1-4. 画素で検査する（このタスクの本体）

**規格を文章で書くだけでは守られない。**生成済みPNGを機械的に測る検査を作る。

`tools/validate_hazard_visuals.py` を新設し、`package.json` に `validate:hazard` として登録、`validate` の連鎖に加える。`tools/` には既にPILを使うスクリプトがあるので同じ流儀で書く。

検査項目:

1. `presentation.semanticRole === "hazard"` の Prefab が参照する runtime PNG について、**不透明画素の支配色相がオレンジ〜赤の帯（HSV色相 0〜45° または 340〜360°）にある**こと
2. **明度0.25未満の暗色画素**が、不透明画素の外周部に一定割合以上あること（暗色アウトラインの存在確認）
3. 周期ハザードは、**warning フレームと active フレームの平均色の差**が閾値以上あること
4. `semanticRole: "hazard"` の Prefab に `hazardVisual` が定義されていること

閾値は実際の素材で調整してよいが、**現行のシアンの噴出口が確実に落ちる値**にすること。検査を作ったら、まず現行素材で落ちることを確認してから新素材を通すこと。

### 完了条件

- 現行のシアン素材で `npm run validate:hazard` が**失敗する**ことを確認したログを残す
- 新素材で成功する
- 噴出口と液だまりが、明るい背景の上で「触ると痛そう」に見える
- スクリーンショット `screenshots/hazard-visual-pc.png`、`screenshots/hazard-visual-mobile.png`

---

## T2. 縦カメラを入れる

### 現状の問題

**`cameraY` が存在しない。**`view.top` は固定値（横画面0 / 縦画面-176）で、描画変換は `ctx.setTransform(scale, 0, 0, scale, 0, -view.top * scale)` のみ。

その結果:

- `world.height` 864 = 横画面の `view.height` 864。**世界の縦＝画面の縦**
- 足場のy分布は 410〜714 の **304px** しかない。ジャンプ高166pxの1.8倍が縦の全語彙
- 足場を2段積んだら天井

高低差を語彙にするには、ここを外すのが前提になる。

### やること

#### 2-1. 最小変更経路を使う

**`view.top` を「カメラのワールド上端」と定義し直し、固定値から追従値に変える。**これが最も影響範囲の小さい経路である。理由は、既存コードが `view.top` を既にその意味で使っているため。

この定義にすると、次はすべて**変更不要**になる。

| 箇所 | 理由 |
|---|---|
| `render()` の `setTransform` | `-view.top * scale` がそのままカメラY offsetになる |
| vignette / flash / `drawAtmosphere` | `fillRect(0, view.top, view.width, view.height)` が画面全面を指し続ける |
| `stage-editor.js:241` の screen→world 変換 | `view.top + (clientY - rect.top) / rect.height * view.height` がそのまま正しい |
| `stageEditor.drawOverlay` | 内部で `view.top` を使っているため追従する |

**変更が必要なのは次だけ。**

1. `view.top` を毎フレーム更新する（後述のデッドゾーン追従）
2. `resizeCanvas()` から `view.top = ... portraitTop` の固定代入を外す
3. `drawParallax` の縦方向（後述 2-3）
4. `killY`（後述 2-4）

#### 2-2. 追従の仕様

横（`cameraX`）は現行の仕様を維持する。縦は挙動を変える。

- **デッドゾーン方式**にする。プレイヤーが画面中央の縦バンド（`view.height` の 35%〜60% あたり）の内側にいる間は `view.top` を動かさない。ジャンプのたびに画面が揺れるのを防ぐため
- バンドを外れたら、外れた分だけ追従する。追従の減衰は横と同じ `1 - Math.pow(.00005, dt)` を使ってよい
- **落下時は先読みする。**`player.vy` が一定以上のとき、デッドゾーンの下端を上げて、着地点が見えるようにする。下が見えないと降りられない
- `view.top` は世界の上下端でクランプする（`0` 〜 `stage.world.height - view.height`）

`data/crystal-lab-objects.json` の `responsiveCamera` を更新する。

- `portraitTop` を**削除**する（固定オフセットは役目を終える）
- `playerScreenAnchorPortrait` / `playerScreenAnchorLandscape`（横）はそのまま
- 縦用に `verticalDeadzoneTop` / `verticalDeadzoneBottom` / `fallLookAheadSpeed` / `fallLookAheadAmount` を追加する

**縦画面の扱いに注意。**縦画面は `view.height` 1040 に対し `view.width` が約480しかなく、横画面より縦方向に広い。同じデッドゾーン比率で問題ないか、必ず390×844で確認すること。

#### 2-3. パララックスに縦を持たせる

現行の `drawParallax` は `ctx.drawImage(image, x, view.top, plateWidth, plateHeight)` で、**画像を常に画面上端に貼っている**。つまり縦視差がゼロで、カメラが下がっても背景が一緒に下がる。降りた感じが出ない。

`data/crystal-lab-objects.json` の各 parallax レイヤーに `scrollFactorY` を追加し、描画Yを `view.top * (1 - scrollFactorY)` 相当の式で求める。値の目安は横の `scrollFactor` と同じ比率から始め、実際に見て調整する。

**縦の絵が足りない問題**: 現行のパララックス素材は 1536×864 の1枚で、縦に伸ばす余地がない。今回は**素材を作り直さず**、レイヤーを縦にわずかに動かすだけに留める。区間別・階層別の背景素材づくりは別タスクとする（本指示書の範囲外）。

#### 2-4. killY をワールドの底へ

`data/crystal-lab-collision.json` の `killY: 940` は、`world.height` 864 前提の固定値。T3で世界が縦に伸びるため、**最下段の床より下**へ移す。値はT3で確定する。

### 完了条件

- 縦に長いステージでカメラが追従し、上下端で止まる
- ジャンプのたびに画面が揺れない（デッドゾーンが効いている）
- 落下時に着地点が見える
- F3エディターでの掴み位置がズレない（`stage-editor.js:241` の変換が正しく効いているか、実際にアイテムをドラッグして確認すること）
- 390×844 で画面外に主要素が出ない
- スクリーンショット `screenshots/vertical-camera-pc.png`、`screenshots/vertical-camera-mobile.png`

---

## T3. Stage 01 を降下構造へ改修する

### 設計方針

1F 通常ラボは `docs/FLOOR_DESIGN.md` §2 で「**安全であることを見せる階**」と定めた。したがって**降下は控えめにする**。ドラマは末尾の昇降リフト（T4）が担当する。

### やること

#### 3-1. 世界を縦に伸ばす

`data/crystal-lab-objects.json`:

- `world.height`: `864` → `1560`

`data/crystal-lab-collision.json`:

- `killY`: `940` → `1420`（最下段の床 1274 より下）

#### 3-2. 降下点を4か所つくる

区間ごとに床を下げるのではなく、**明示的な降下点**を置く。段差は各 **+140px**（ジャンプ高166pxより小さいので、戻ることもできる。一方通行の罠を作らない）。

| 降下点 | x | 床y（前→後） |
|---|---|---|
| A | 1700 | 714 → 854 |
| B | 3000 | 854 → 994 |
| C | 4000 | 994 → 1134 |
| D | 4850 | 1134 → 1274 |

既存の足場・取得物・敵・オブジェクトのyを、それぞれが属する帯に合わせて一括で下げる。相対的な高さ関係（上ルート・移動床の高さ）は維持すること。

**重要な制約: 降下点をまたぐ足場を作らない。**現行の `ground-d` は x 2330〜3930 で、降下点B（x=3000）をまたぐ。**分割すること。**同様に他の足場も確認する。

`data/crystal-lab-objects.json` に降下点を明示的に持たせる。

```json
"descentPoints": [
  { "id": "descent-a", "x": 1700, "drop": 140 },
  ...
]
```

#### 3-3. 区間名を直す

`final-ascent` は降下構造と矛盾する。`final-descent` へ改名し、`label` と `intent` も更新する。

参照箇所を漏れなく追う: `data/crystal-lab-objects.json` の `sections`、`tools/audit_course.mjs`、`docs/*`。

**注意**: 区間IDを変えると、ブラウザのローカル下書き（`nyabbit-stage-patch:*`）が部分的に効かなくなる可能性がある。README かエディタUIに「区間IDが変わったので下書きをクリアすること」を1行出すこと。

#### 3-4. 監査に規則を足す

`tools/audit_course.mjs` に追加する。

1. **降下点をまたぐ足場が存在しない**
2. 各降下点の段差が、`data/player-movement.json` から計算したジャンプ最高到達点**未満**である（戻れることの保証。一方通行の罠を作らない）
3. 各帯の床が連続している（降下点以外に落下穴を勝手に作らない）
4. `killY` が最下段の床より下にある
5. すべての結晶が、`world.height` 拡張後も到達可能である（前回T3で入れた到達可能性検査を、新しい床yで再計算すること）

### 完了条件

- スタートからゴールまで通しでプレイでき、4段階で降りていくのが体感できる
- どの段差もジャンプで戻れる
- 結晶12個すべてが取得可能（監査で保証）
- `npm run validate:course` 成功
- スクリーンショット `screenshots/descent-overview-pc.png`（各降下点で1枚ずつ、計4枚も可）

---

## T4. 昇降リフトと起動スイッチをつくる

### 設計方針

`docs/FLOOR_DESIGN.md` §2 の 1F の主役ギミックは **装置の起動スイッチ**である。「研究所で働く行為がそのまま遊びになる」ため。昇降リフトは**降り方の基準**を教える役割で、2F以降でも使い回す基本語彙になる。

### やること

#### 4-1. 起動スイッチ Prefab

`lab-switch-v1` を `data/prefab-registry.json` に追加する。

- `category: "object"`、`semanticRole: "interactable"`、`gameplaySignal: "activate"`
- `activateTargetId` を必須にする（対象がないスイッチを置けないようにする）
- 押されると対象の状態を `active` に変える。押す方法は**踏む or 触れる**（新しい入力を増やさない）
- 見た目に **off / on の2状態**を持つ。押した結果が対象に起きることが分かるよう、既存の `warning-lamp` と同じ「対象IDと状態同期」の仕組みに乗せる

既に `lab-warning-lamp-v1` が `signalTargetId` で状態同期を実装している。**同じ仕組みを使うこと。**新しい仕組みを作らない。

#### 4-2. 昇降リフト Prefab

`lab-lift-v1` を追加する。`lab-moving-platform-v1` とは役割が異なるので別Prefabにする。

- 既定は停止。`activatedBy`（スイッチのID）で作動する
- 作動すると縦に長距離（数百px）移動する。`lab-moving-platform-v1` の周期往復とは別物
- 乗っているプレイヤーを運ぶ（既存の `updateRuntimePrefabs` の移動床追従ロジックを使う）
- 監査で「`activatedBy` が実在するスイッチを指している」ことを検査する

#### 4-3. 1Fに配置する

- 起動スイッチ＋それで作動する装置を、**最低1か所は必須経路に置く**。押さないと進めない場所にする（`docs/FLOOR_DESIGN.md` §4-2 の基準「坂で代用できない」を満たすため）
- 区間は `gate-approach` か `drone-gallery` が適当。既存の移動床と役割が被らないよう配置する

#### 4-4. 出口を昇降リフトに置き換える

現行の `exit-gate-v1` を、**2Fへ降りる昇降リフト**に置き換える。ここが「奥へ進む＝下へ降りる」を最初に体感させる場所になる。

- プレイヤーが乗ってスイッチを押すと、リフトが**下降**する
- カメラがリフトを追って下がる（T2の縦カメラがここで効く）
- 画面が暗くなり、クリアパネルを表示する
- クリアパネルの文言を「次の区画」から「**2F 電気室へ**」に変え、階層構造を示す

**ゲートは常時開放のまま**（前回T3の決定）。結晶数で乗れる／乗れないを分けない。

### 完了条件

- スイッチを押さないと進めない箇所が1か所以上ある
- 出口でリフトが下降し、カメラが追い、クリアに繋がる
- `activateTargetId` / `activatedBy` の参照切れが監査で検出される
- `npm run validate` 成功
- スクリーンショット `screenshots/lift-descent-pc.png`、`screenshots/switch-activate-pc.png`

---

## T5. 中景オブジェクト層と情報パネル

### 現状の問題

所長から「宙に浮いたセットがイマイチ、文脈を感じない」との指摘。対象は `bottle-rack-01/02`、`wall-panel-01/02`、`cable-coil-01`。

**真因は透明度ではなく視差だった。**

- `near.webp` の `scrollFactor` は **0.27**
- 背景デコレーションは `object.x - cameraX` で描かれている ＝ **scrollFactor 1.0**

つまり「背景」と宣言された小物が、プレイヤーが歩く床と**まったく同じ速度で流れている**。奥行きの知覚は視差が支配するため、`opacity: 0.52〜0.58` に落としても位置は直らない。半透明はそれを弱く見せるだけである。

**奥行きは視差で作る。透明度で作らない。**

### やること

#### 5-1. 中景オブジェクト層を新設する

`presentation` に `scrollFactor` を追加し、`depthRole: "midground"` を新設する。

- 描画は `object.x * scrollFactor - cameraX * scrollFactor` 相当（近景パララックスと同じ速度で動く）
- **不透明で描く**（`opacity` を使わない）
- 描画順は パララックス → **中景オブジェクト** → 足場 → 取得物 → ゲームプレイオブジェクト
- エディタで移動可能にする（`editor.allowed` に `x`, `y`）

#### 5-2. 半透明を禁止する

`tools/audit_asset_presentation.mjs` に検査を追加する。

1. **可視オブジェクトPrefabの `presentation.opacity` が 1 未満なら失敗**
2. `mount: "floor"` / `"wall"` のオブジェクトは、その座標に支持体（足場の面、または中景の柱・壁Prefab）が実在すること
3. `mount: "air"` は `visibleSupportOrMotion: true` が必須（既存フィールド）
4. `depthRole: "midground"` は `scrollFactor` が必須で、値が 1 未満であること

#### 5-3. 既存の5個を移す

- `bottle-rack` ×2、`wall-panel` ×2、`cable-coil` ×1 を `depthRole: "midground"` へ移し、**不透明**にする
- `warning-lamp` ×2 は対象IDと状態同期していて意味があるので、**ゲームプレイ層へ上げて不透明にする**（実機画像で確認したところ、このランプは既に読みやすい。正しい姿はこちら）

#### 5-4. 情報パネルを置く

デザインシート（`docs/references/stage01-normal-lab-design-sheet.jpg`）に「情報パネル・サイン例」の行があるが未実装である。**世界観を画面内で語る器**として、ここで実装する。

`generate2dsprite` で3種を作る。

- **研究エリア案内** — 区間に名前と役割を与える（例: 「第2搬送区画」）
- **注意サイン** — 危険物の手前に置く。T1の危険物規格と色を揃える
- **操作チュートリアル** — 序盤に1枚だけ

配置は中景層。**ただし注意サインだけはゲームプレイ層**に置く（危険と結びついた意味があるため）。

文面は所長の確認対象なので、**仮の文面で実装し、`docs/` に文面一覧を出力すること**。所長が読んで直せる形にする。

### 完了条件

- 中景の小物が、床より遅く流れる（実際に動かして視差が見えること）
- 半透明の可視オブジェクトが1つも残っていない
- 監査が半透明を検出して落とせる（一時的に `opacity: 0.5` を入れて確認し、元に戻す）
- 情報パネルが読める大きさで置かれている（390×844で確認）
- 文面一覧が `docs/` に出ている
- スクリーンショット `screenshots/midground-parallax-pc.png`、`screenshots/info-panel-mobile.png`

---

## 本指示書の範囲外（今回やらないこと）

次は別タスクとする。着手しないこと。

- **区間別・階層別のパララックス素材づくり** — 現行素材は 1536×864 の1枚で、ステージ全体を通して1周もしない（near の移動量は最大1,097px）。作り直す価値は高いが、生成量が読めないため分離する
- **Stage 02（電気室）の実装** — 設計は `docs/FLOOR_DESIGN.md` §2 にあるが、`stageId` でのステージロードが未実装のため、まだ着手できない
- **`stageId` でのステージロード／ステージ選択画面** — T1〜T5完了後の次バッチ
- **T7 品目別収集半径**（`WORK_ORDER_2026-08-11.md` の任意項目）— 所長の明示合意なしに変更しない

## 完了後にやること

- `docs/HANDOFF_2026-08-11.md` を更新する。特に「ワールド: 5600×864」「7区間」「ゴール条件」の記述が古くなる
- `README.md` の確認用スクリーンショット参照を、現行の見た目に合ったものへ更新する
- `docs/NEXT_AGENT_PROMPT.md` の参照先を本指示書に切り替える
