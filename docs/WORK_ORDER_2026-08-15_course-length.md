# 作業指示書 — コース長をコースごとに変えられるようにする

作成日: 2026-08-15
状態: **未着手。**`docs/WORK_ORDER_2026-08-15_editor-mobile-2.md` の次に着手する。

## 所長の要望

> いまコース長をコースごとに変えることは可能？難しければ別にいいが、簡単に可変にできるならやっときたい

**可能。配管の変更は小さい。**ただし「長さを変える」は数字1個の話ではないので、意味を決めてから実装する。

---

## 1. いまの構造

全コースの横位置が、共有の定数1個から決まっている。

```js
// src/course-layout.js
xOffset: index * layout.courseLength,   // ← 全コース同じ長さ前提
```

**各コースのデータは既に自分の `world.width` を持っている**（`data/course-0N-objects.json`、現在3本とも `11216`）。つまり「累積和にする」だけで可変になる。

### `courseLength` を使っている箇所（全部）

| 場所 | 用途 |
|---|---|
| `src/course-layout.js` transforms | 各コースのxOffset ← **核心** |
| `src/stage-editor.js:387` | `courseTransform()` のx |
| `src/stage-editor.js:696` | ミニマップの横倍率 |
| `src/main.js:301 / 324 / 333` | デバッグ用のワープ先 |
| `tools/validate_course_layout.mjs` | 3箇所の検査 |

### 手で書いているが、本当は導出できる値

`data/course-layout.json` の次は**書き値をやめて導出する**。

- `courseLength`（削除）
- `world.width`（= 各コースの `world.width` の合計）
- `courses[].xStart` / `xEnd`（= 累積和）

---

## 2. 作業A — 配管を可変にする

```js
let running = 0;
const transforms = courseStages.map((course, index) => {
  const transform = {
    prefix: index === 0 ? 'c1-' : index === 2 ? 'c3-' : '',
    xOffset: running,
    yOffset: index * layout.courseVerticalOffset,
  };
  running += course.world.width;
  return transform;
});
```

- `stage.world.width` = `running`（合計）
- `stage.courses[i].xStart` = `transforms[i].xOffset`、`xEnd` = `xStart + courseStages[i].world.width`
- **`course-layout.json` 側の `xStart` / `xEnd` / `world.width` は削除する。**両方にあると必ず食い違う（静かに壊れる）
- `courseVerticalOffset`（縦の沈み）は**今回は共通のまま**。所長の要望は横の長さのみ

### 呼び出し側の直し

- `stage-editor.js` の `courseTransform()` と ミニマップ倍率 → `stage.courses[index]` の `xStart` と `xEnd - xStart` から取る
- `main.js` のデバッグワープ → `stage.courses[n].xStart + オフセット` に書き換える
- `validate_course_layout.mjs` → 「全コースが `courseLength` と一致」ではなく、**「`courses[i].xEnd - xStart` が `course-0N-objects.json` の `world.width` と一致」「境界が連続」「合計が `stage.world.width` と一致」**を見る形へ

**現在は3本とも11216なので、この作業だけでは画面が1ミリも変わらない。**変わらないことが検収条件。

---

## 3. 作業B — エディタから長さを変えられるようにする

配管だけ直しても、所長がJSONを開かないと長さを変えられない。**エディタに口をつける。**

- 場所: 上部バー、コースタブの隣に「コースの長さ」入力（8px刻み）
- 変更はundo可能

### 伸ばすとき

**床が足りなくなるので、自動で継ぎ足す。**

- 最後の `floorBand` の `xEnd` を新しい終端まで延ばす
- 最後の `section` の `xEnd` も同じく延ばす
- 通し床（`floorBands` の最下段）が途切れないこと。途切れると落ちる場所ができる

### 縮めるとき

**はみ出したパーツがあるときは、縮めずに止める。**

- 新しい終端より右にあるパーツを数え、「◯個がはみ出します。先に消すか動かしてください」と出す
- **勝手に消さない。**消していい判断は所長のもの
- はみ出しが無ければ、最終 `floorBand` と `section` の `xEnd` を詰めて実行

### 出口リフトの追従

各コースの終端にある出口リフト（`exit-lift-01` / `c1-` / `c3-`）と肉球スイッチは、コース終端を基準に置かれている。**長さを変えたら一緒に動かす**か、動かせない場合は警告する。

---

## 4. 検収条件

- **作業Aだけを入れた時点で、画面・進行・`npm run validate` の結果が変わらない**
- コース1の長さを 11216 → 14000 に変えたとき
  - コース2・3が右へずれる
  - 床が終端まで途切れない
  - 出口リフトが新しい終端に付いてくる
  - `npm run validate` と `npm run build` が通る
- コース1を、はみ出すパーツがある状態で縮めようとすると、件数付きで止まる
- `course-layout.json` に `courseLength` / `world.width` / `xStart` / `xEnd` が残っていない

## 5. 守ること

- **同じ値を2箇所に持たない。**長さの正本は `data/course-0N-objects.json` の `world.width` 1箇所
- 縮めるときにパーツを自動削除しない
- 見た目の良し悪しを自動検査しない
- PCの操作を変えない
