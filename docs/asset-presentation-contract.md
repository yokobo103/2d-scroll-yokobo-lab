# アセット表示契約

Stage 01は横スクロール用の正投影を基準にする。見た目の自然さとコースの読みやすさを同じデータで管理する。

## 必須メタデータ

ステージで使用する各Prefabの `presentation` に以下を持たせる。

- `cameraView`: プレイ面は `orthographic-side`、壁設備は `front-elevation`
- `mount`: `floor` / `wall` / `air`
- `depthRole`: `background` / `midground` / `gameplay`
- `semanticRole`: 何として読ませるか
- `gameplaySignal`: 触れたとき、または見たときの意味
- `anchor`: `floor-contact` / `wall-center` / `world-center` など
- `opacity`: 可視Prefabは常に`1`。半透明化で奥行きを偽装しない
- `scrollFactor`: `midground`では必須。`0以上1未満`

## Stage 01の運用

- 警告灯と注意サインは壁面の `hazard-warning`。`signalTargetId` が必須で、対象の予告・作動状態と点滅を同期する。意味があるため不透明な`gameplay`層に置く。
- 試験管ラック、モニター、ケーブルリール、案内／チュートリアルパネルは不透明な`midground`の壁付け設備。`scrollFactor: 0.27`で足場より遅く流れ、足場より先に描画する。
- 無効果の物を `gameplay` 層へ置かない。進行路に置きたい場合は衝突、ダメージ、警告、収集、起動のいずれかを実装する。
- 床物は下端を実在する足場面へ合わせる。壁物は`mountSupportId`で登録済み壁面を参照し、素材内にも背板・ブラケットを持たせる。
- 空中物は`visibleSupportOrMotion: true`を必須とし、浮遊・飛行・移動などの根拠を明示する。
- PC 1536×864とスマホ390×844の両方で、キャラクターと合成したスクリーンショットを保存する。

## 検証

`npm run validate:presentation` は次を失敗にする。

- 使用Prefabに `presentation` がない
- `gameplay` 層なのにゲーム上の意味がない
- 可視Prefabの`opacity`が`1`ではない
- `midground`の`scrollFactor`がない、または`1`以上
- 床物に接触幅のある足場面がない、壁物に有効な`mountSupportId`がない、空中物に支持／運動根拠がない
- `background`または`midground`に許可外の配置型がある
- 警告灯に対象IDがない、対象が存在しない、対象から離れすぎている
- 横スクロールのゲームプレイ物が斜め俯瞰・アイソメ視点

意図的な半透明Prefabを拒否した受入証跡は`docs/qa/midground-opacity-baseline-failure.txt`に保存する。
