# Dr.よこぼ 操作仕様

操作値は `data/player-movement.json` に集約する。ステージや描画コードへ速度・猶予時間を直書きしない。

## 実装済み

- コヨーテタイム: 足場を離れてから短時間はジャンプ可能
- ジャンプバッファ: 着地直前の入力を着地時に消費
- 可変ジャンプ: ボタンを早く離すと低く、押し続けると高く跳ぶ
- 足場端補正: 接地可能範囲からわずかに外れた場合だけ足元を床内へ寄せる
- 状態: `idle` / `run` / `jump` / `fall` / `land` / `slide`
- 一方向床: 上から横切ったときだけ接地

## 調整の原則

- ジャンプの高さは `jumpVelocity` と `gravity` を一緒に見る。
- 短押しとの差は `jumpCutGravityMultiplier` で調整する。
- 操作猶予は `coyoteTime` と `jumpBufferTime`。まず 0.08〜0.14 秒の範囲に留める。
- `landingTolerance` と `cornerCorrection` は当たり判定の救済値であり、見た目の床幅を増やす用途には使わない。
- 接地面、主人公の足元アンカー、Prefab衝突面の規格は変更しない。

検証は `npm run validate:movement` を使用する。
