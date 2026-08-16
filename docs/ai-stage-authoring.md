# Codex／Claude向けステージ編集ガイド

## 基本方針

ステージの主編集者はAIです。人がF3調整モードで行う変更は、主にアイテムや既存プレハブ全体の位置調整です。

AIは次のファイルを優先して読みます。

1. `data/crystal-lab-objects.json`: コース区間と配置データ
2. `data/prefab-registry.json`: 許可された編集項目と当たり判定生成規則
3. `assets/objects/platform_modular/module-spec.json`: 足場の接地・幅規格
4. `docs/asset-contact-contract.md`: 接地素材の制作規格

## 「ここがつまらない」と言われた場合

`sections` から対象区間を特定します。各区間には `id`、横範囲、狙いがあります。

- `intro-runway`: 導入
- `jump-tutorial`: ジャンプ練習
- `crystal-assay`: 紫の危険結晶と安全な結晶装置の色分け
- `checkpoint-run`: 中盤の回収テンポ
- `gate-approach`: 移動床を越えて追加区画へ
- `drone-gallery`: ドローンのレーザー回避
- `final-descent`: 最下段への降下
- `reboot-corridor`: 延長部の助走と棚の導入
- `spike-garden`: 床の紫結晶か、上の棚かの選択
- `crystal-relay`: 培養装置2基で上段へ渡る
- `conveyor-yard`: 移動床の乗り継ぎ
- `specimen-shelf`: 最上段に大きい取り分
- `exit-hall`: 危険なしで出口リフトへ

対象区間と前後450px程度の要素を読み、修正前後で次を確認します。

- 次の着地点がPC／縦スマホの双方で読めるか
- 同じ操作が長時間続いていないか
- 上下ルート、危険回避、回収のいずれかに選択があるか
- 接地面、プレハブ倍率、接続規格を変更していないか
- 区間の狙いを壊していないか

## 許可される変更

- プレハブ全体の `x` / `y`
- 足場の `modules` と同じ長さの `pattern`
- 登録済みプレハブの追加・削除
- 区間の狙い、境界、配置構成の変更

## 禁止される変更

- ステージデータへの `scale`、`rotation`、画像パスの追加
- `surfaceY` や `footBaseline` のステージ単位上書き
- 画像と当たり判定を別々に移動する設定
- 未登録プレハブの正式ステージ投入
- 足場幅 `w` の直接指定。幅はモジュール数から導出する

## F3調整モードの安全な使い方

- 初期状態は「アイテムだけ（かんたん）」。取得物以外は選択もドラッグもできない。
- 床、ギミック、装飾を触る場合だけ「コース全体（詳細）」へ切り替える。
- 詳細モードでも、プレハブ登録された項目以外の拡大縮小・回転・画像変更はできない。
- 位置変更は即座にローカル差分へ保存され、最大60段階のUndo/Redoに対応する。
- `Ctrl+Z` で元に戻す。`Ctrl+Y` または `Ctrl+Shift+Z` でやり直す。

## F3差分の反映

F3調整モードが出力するJSONは、元ステージへ反映するための差分です。

```json
{
  "patchVersion": 1,
  "stageId": "crystal-lab-stage-01",
  "sectionId": "jump-tutorial",
  "note": "2個目の結晶を着地後に見える位置へ移動",
  "changes": {
    "crystal-02": { "x": 842, "y": 462 }
  }
}
```

AIはIDで対象を探し、許可された項目だけを `data/crystal-lab-objects.json` へ反映します。反映後、ローカル下書きは破棄します。

## 必須検査

```powershell
npm run assets:normalize
npm run validate:contact
npm run validate
npm run build
```

`npm run validate` は、プレハブ仕様、スポーンとチェックポイントの接地、出口前の安全域、必要アイテム数、移動床の可動範囲、プレイヤー移動をまとめて検査する。

最後にPC横画面と縦スマホ画面で、対象区間の視認性と操作可能性を確認します。
