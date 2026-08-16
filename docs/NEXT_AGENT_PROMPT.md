# 次のエージェントへ渡す文面

`C:\Users\Yokob\playground\20260810_ニャビットの暴走実験室`の作業を引き継いでください。

最初に次を順番に読んでください。

1. `C:\Users\Yokob\playground\AGENTS.md`
2. プロジェクト直下の`AGENTS.md`
3. `docs/HANDOFF_2026-08-11.md`
4. `docs/floors/1f/CANON.md`
5. `docs/floors/1f/COURSE_NOTES.md`
6. `docs/floors/1f/dialogue.md`
6. `docs/asset-presentation-contract.md`
7. `docs/ai-stage-authoring.md`

## 現在の状態

**アクティブな作業指示書は2本。この順で着手すること。**着手前に設計の根拠 `docs/EDITOR_PLAN.md` を読むこと。

1. `docs/WORK_ORDER_2026-08-16_boss-joint-seam.md`（ボスの肩の継ぎ目。所長の実機指摘）
2. `docs/WORK_ORDER_2026-08-15_course-length.md`（コース長をコースごとに可変化）

`docs/archive/work-orders/` にある2026-08-15の指示書（エディタ フェーズ1＋2、スマホ対応、スマホUI作り直し、ボス部位分け）はすべて実装済み。再着手しないこと。

2026-08-11〜08-15の作業指示は完了し、`docs/archive/work-orders/`へ移動済みです。そちらへは再着手しないでください。

所長の追加指示により、結晶テーマのギミックは実装済みです。

- `crystal-spikes-v1`: `LEFT / MID_A / MID_B / MID_C / RIGHT`で任意長に組む、大中の透明アメジスト柱による常設ハザード
- `crystal-growth-vertical-v1`: 4個の自然な小群晶が0.12秒間隔で上へ析出し、成長先端と当たり判定が同期する
- `crystal-growth-horizontal-v1`: 所長提供の「AIラボ式 横向きクリスタル足場アセット設計」を基準にした逆三角形コア型。床ノズルから巨大な中央コアが立ち上がり、その上の薄い歩行プレートが中央から左右へ成長する
- 旧来の浅い横長結晶ブロック／厚い均一スラブは不採用。完成形は「薄い平面＋ノズルまで深く伸びる中央コア＋両端へ小さくなる側面結晶」。表示幅とコリジョン幅を中央基準で同期し、安定後は青のまま減光→白濁→亀裂→振動→透明破片となる
- 生成・崩壊は専用6フレームずつの`inverted-core-growth-*`／`inverted-core-collapse-*`を使用する。旧完成絵のクリップ＋コード製亀裂だけの表現へ戻さない
- 細い縦結晶ギミック／縦用ノズルは所長判断で実配置から撤去済み。遠隔スイッチのセンサーは`insetX:24 / insetTop:72`で下部本体だけを覆い、上のWi-Fi表示へ触れても起動しない
- 起動は別置きの`crystal-remote-switch-v1`から行う。`activateTargetIds`で1スイッチから複数の`crystal-growth-nozzle-v1`を同時起動できる。旧培養タンク型は不採用
- `direction / length / growthSpeed / activeDuration / collapseDuration / segmentSpacing`は制約付きエディターで調整可能
- `lab-switch-v1`（肉球）は出口エレベーター専用
- QA入口: `?debug-growth=active`
- 専用検証: `npm run validate:growth`

次に必要なのは所長の判断です。`screenshots/silhouette-1f-devices.png`と`-mobile.png`にある装置候補1〜12について、**採用／除外／作り直し**を待ってください。所長が番号を選ぶまでは、装置スプライトを生成したりゲームへ配置したりしません。

候補の内訳:

- 1〜2: 除塵ブロワー
- 3〜4: 試料搬送アーム
- 5〜6: 床磨きローラー
- 7〜8: 圧着プレス
- 9〜10: 逆走コンベア
- 11〜12: 自動隔壁

採否反映には`tools/apply_catalog_decision.mjs --floor 1f --kind device-silhouette`を使えます。理由付きの除外／作り直しは1F正本の「避けること」に反映されます。

## 完了済みの重要事項

- 掲示3種、旧出口ゲート、旧スライムロボはPrefab・配置・asset manifest・本番ビルドから撤去済み。
- `energy-vent-v1`はPrefabだけ残し、1F実配置から撤去済み。供給源と流れを描ける2F・5Fで再検討する。
- 旧S噴出口案6種は`assets/prototypes/floor-silhouettes/1f/decision-manifest.json`で2F保留扱い。
- `energy-spill-v1`は搬送装置の副産物として`moving-bridge-a`近傍に残す。
- チュートリアルは掲示ではなく、装置ID近傍で一度だけ発火するDr.よこぼの話者付きセリフへ移行済み。
- 装置候補は本体Mと可動部Sへ分離し、可動部の外形と赤枠を一致させている。
- `npm run validate`と`npm run build`は成功済み。PC／390×844でも話者表示を確認済み。
- 任意T7（品目別収集半径）は未着手。所長の明示合意なしに変更しない。

## 守ること

- 実装上の正は`data/*.json`、`src/`、`tools/`。変更前後に`npm run validate`と`npm run build`を通す。
- 見た目の良し悪しを自動検査しない。検査するのは参照・寸法など静かに壊れるものだけ。
- 新しい可視2Dアセットは、所長がシルエットを採用した後に限り`generate2dsprite`で制作する。
- 横スクロール面へ斜め俯瞰・アイソメ素材を置かない。効果のない物は背景／中景へ退かせる。
- Dr.よこぼが装置の作者だと作中で明示しない。詳しい規則は`docs/floors/1f/dialogue.md`を正とする。

歴史的な経緯が必要な場合だけ、`docs/archive/work-orders/`と`docs/archive/obsolete/PROTOTYPE_hazard-grammar.md`を参照してください。
