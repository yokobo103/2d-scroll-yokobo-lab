# 作業指示書 — 目的の再定義・ライフ制・配信ビルド修復

発行日: 2026-08-11
対象: `20260810_ニャビットの暴走実験室`
前提資料: `docs/HANDOFF_2026-08-11.md`、`AGENTS.md`、`../AGENTS.md`、`docs/asset-presentation-contract.md`

## 0. この指示書の位置づけ

所長（よこぼ）とのレビューで、ゲームの目的設計が決まった。

> **クリアが背骨、収集は評価。ライフは体力。**

これに伴い、既存の「結晶7個でゲートが開く」という進行条件を撤廃する。あわせて、配信ビルドが成果物として壊れている問題を先に直す。

タスクは T1〜T6 の6件。**T1 から順に着手する**。T1 は他の全タスクの確認手段に関わるため、最初に完了させること。

### 全タスク共通の禁止事項

- 可視2Dアセットの新規生成は `generate2dsprite` を使う。本指示書の範囲では原則として新規生成は不要。
- 接地契約（`footBaseline: 287` / `surfaceY: 6`）を変更しない。
- Prefabの倍率・回転を変更しない。ステージエディターの許可項目を増やさない。
- 斜め俯瞰・アイソメ素材をゲームプレイ面へ置かない。
- 効果のない装飾をゲームプレイ層に追加しない。

### 全タスク共通の完了条件

```powershell
npm run assets:normalize
npm run validate:contact
npm run validate
npm run build
```

すべて成功すること。加えて、PC横画面（1536×864）と スマホ縦画面（390×844）の両方で該当箇所を確認し、`screenshots/` に保存する。

---

## T1. 配信ビルドの修復

### 現状の問題

`npm run build` は終了コード0で終わるが、`dist/` の中身は `index.html` と バンドルされた js / css の3ファイルだけになる。Viteの `publicDir` 既定は `public/` で、このプロジェクトには存在しないため、`data/` と `assets/` が一切同梱されない。

`src/main.js` は起動時に `fetch('/data/crystal-lab-objects.json')` をトップレベル `await` で呼ぶため、**distを配信するとローディング画面から進まない**。

さらに `vite.config.js` が無く `base` が `/` のままなので、GitHub Pages のようなサブパス配信でも全ての参照が壊れる。

### やること

#### 1-1. アセット台帳を1か所に集める

`src/asset-manifest.js` を新設し、実行時に必要なファイルの一覧をここへ集約する。

- `src/main.js` の `imagePaths` 定義をこのファイルへ移し、`export const imagePaths = {...}` にする。
- 起動時に `fetch` する JSON のパスも `export const dataPaths = [...]` として持つ。現状の5件（`crystal-lab-objects` / `crystal-lab-collision` / `crystal-lab-scene-hooks` / `prefab-registry` / `player-movement`）に加え、`module-spec.json` と `contact-spec.json` も含める。
- パララックス画像は `data/crystal-lab-objects.json` の `parallax[].src` から取るため、台帳には書かず、後述のコピースクリプトがJSONを読んで解決する。

**この台帳が、実装・同梱・検査の3者が参照する唯一の正本になる。**手で二重管理しないこと。

#### 1-2. base を相対パスにする

`vite.config.js` を新設する。

```js
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
});
```

そのうえで、`asset-manifest.js` の絶対パス（`/assets/...` `/data/...`）を実行時に解決するヘルパーを用意し、全ての `fetch` と `Image.src` をこれに通す。

```js
const runtimeBase = new URL(import.meta.env.BASE_URL, document.baseURI);
export const runtimeUrl = path => new URL(String(path).replace(/^\/+/, ''), runtimeBase).href;
```

`data/crystal-lab-objects.json` の `parallax[].src` も同じヘルパーを通すこと（`src/main.js` の `drawParallax` 用ロード箇所）。

#### 1-3. 実行時ファイルだけを dist へ同梱する

`assets/` は全体で148MBあるが、実行時に必要なのは約13MBだけ。全部コピーしてはいけない。

`tools/copy_runtime_assets.mjs` を新設する。

- `src/asset-manifest.js` を import し、`imagePaths` の値と `dataPaths` を対象にする。
- `data/crystal-lab-objects.json` を読み、`parallax[].src` を対象に加える。
- 対象ファイルを、リポジトリ相対のパス構造のまま `dist/` 以下へコピーする。
- **台帳に載っていないファイルはコピーしない。**除外リスト方式にしないこと（raw sheet や prompt.txt が紛れ込む）。
- 存在しないファイルが台帳にあった場合は、警告ではなく **異常終了**する。

`package.json` を更新する。

```json
"build": "vite build && node tools/copy_runtime_assets.mjs"
```

#### 1-4. 成果物の検査を追加する

`tools/validate_build_output.mjs` を新設し、`package.json` に `validate:build` として登録、`validate` の連鎖にも加える。

検査項目:

1. `dist/index.html` 内の `src` / `href` が `/` 始まりでないこと（相対パスであること）。
2. `asset-manifest.js` の全エントリが `dist/` 以下に実在すること。
3. パララックス4枚が `dist/` 以下に実在すること。
4. `dist/` の合計サイズが 20MB 未満であること（実測13MB前後。超えたら不要ファイルが混入している）。

`dist/` が存在しない場合は「先に `npm run build` を実行せよ」と明示して異常終了する。

### 完了条件

- `npm run build` 後、`npx vite preview` で起動してローディングが消え、Dr.よこぼを操作できる。
- `dist/` をサブディレクトリ配下（例: `http://localhost:PORT/sub/dir/`）で配信しても同様に動く。
- `npm run validate:build` が成功する。
- スクリーンショット `screenshots/build-preview-pc.png` を保存する。

---

## T2. 当たり判定を一元化し、スライド回避を成立させる

### 現状の問題

プレイヤーの当たり判定が2か所に別実装されている。

- `src/main.js` のハザード判定 — スライド時に矩形を縮める
- `src/enemy-controller.js` の敵・レーザー判定 — 固定値で、スライドを見ていない

その結果、UIの一等地にある SLIDE ボタンの効果が「最高速度 430→680」だけになっている。ドローンのレーザーは低い高さを通るので、本来はスライドでくぐれるはずの設計が実装で死んでいる。

### やること

#### 2-1. 判定を1本にする

`src/player-hitbox.js` を新設する。

```js
export const playerHitbox = (player, sliding) => (sliding
  ? { x: player.x + 18, y: player.y + 84, w: player.w - 36, h: 58 }
  : { x: player.x + 18, y: player.y + 24, w: player.w - 36, h: 114 });
```

- `src/main.js` のハザード判定をこれに置き換える。
- `src/enemy-controller.js` の `playerHitbox` 定義を削除し、`stepEnemies` の引数に `sliding` を追加してこれを使う。`sliding` は `stepPlayerController` の戻り値をそのまま渡す。

**スライド時の矩形は現行より低く・薄くしている**（現行 `y+72, h:68` → `y+84, h:58`）。スライド描画の高さが 142（立ち194）で実際に低い姿勢であること、および後述の回避余裕を確保するための変更。

#### 2-2. レーザー高度を調整する

現行値のままだと、レーザー下端とスライド判定上端の余裕が **2px しかない**。ドローンの上下動（bob）で簡単に反転するため、数値を決め直す。

`data/crystal-lab-scene-hooks.json` の `nyabi-drone-01`:

- `laser.muzzleOffsetY`: `84` → `80`

`data/prefab-registry.json` の `nyabi-drone-v1`:

- `behavior.bobHeight`: `10` → `8`

この値での成立範囲（プレイヤーが地上 y=714 に立っている場合、`player.y = 572`）:

| | 範囲 |
|---|---|
| レーザー矩形（bob最上〜最下） | y 600〜636 |
| 立ち判定 | y 596〜710 → **重なる（被弾）** 余裕24px |
| スライド判定 | y 656〜714 → **重ならない（回避）** 余裕20px |

#### 2-3. 不変条件を検査に固定する

`tools/validate_enemy_controller.mjs` に次を追加する。**数値を直接書かず、実際の判定関数と実際のJSON値から計算して検証すること。**

1. ドローンのbobが最上・最下・中間のいずれでも、レーザー矩形は立ち判定と重なる。
2. 同じく、いずれでもスライド判定と重ならない。
3. 上下いずれの余裕も 10px 以上ある。
4. 無敵中（`invincible > 0`）はレーザーでも敵本体でも被弾しない。

この検査があるので、以後 `muzzleOffsetY` や `bobHeight` を触っても静かに壊れない。

### 完了条件

- スライドしながらドローンのレーザーをくぐれる。
- 立って受けると被弾する。
- ジャンプでも回避できる（現行動作の維持）。
- `npm run validate:enemy` と `npm run validate:movement` が成功する。
- スクリーンショット `screenshots/slide-under-laser-pc.png`、`screenshots/slide-under-laser-mobile.png` を保存する。

---

## T3. 目的を「クリアが背骨、収集は評価」へ再定義する

### 現状の問題

クリア条件（出口に着く）と収集条件（結晶7個）が両方必須になっている。結晶9個はすべて `x < 3200` に配置されているため、**ステージの43%地点で目的が消える**。`drone-gallery` と `final-ascent` に進行目標が存在しない。

さらに `src/game-rules.js` の `displayedCrystalCount` が表示を7で打ち切るため、8個目以降は取っても画面上に現れない。

### やること

#### 3-1. ゲートを常時開放にする

- `src/game-rules.js` の `hasReachedExit` から `player.crystals < requiredCrystals` の条件を削除する。判定は矩形の重なりのみにする。
- `displayedCrystalCount` を削除し、収集数をそのまま表示する。
- `data/crystal-lab-scene-hooks.json` の `exitLink.requiresCrystals` を削除する。
- `src/main.js` で `requiresCrystals` を参照している全箇所を整理する（ゲートの施錠描画、`gate-message` トースト、ミッション文言、デバッグ起動時の `player.crystals` 初期値）。
- ゲートの施錠表現（`drawObjects` の `unlocked` 分岐と半透明の板）は削除する。**開いているゲートを閉じて見せない。**

#### 3-2. 結晶を全区間へ配置する

`data/crystal-lab-objects.json` の `pickups` に3個追加し、合計12個にする。既存の9個は動かさない。

| id | 座標 | 区間 | 到達手段 |
|---|---|---|---|
| `crystal-07` | x 3290, y 300 | gate-approach | `moving-bridge-b` の最上位置からのみ |
| `crystal-08` | x 4520, y 385 | drone-gallery | `drone-upper` の上からのみ |
| `crystal-09` | x 4860, y 320 | final-ascent | `moving-bridge-c` の最上位置、または `final-upper` の左端からのみ |

いずれも `prefab: "data-crystal-v1"`、`reward: true`、`route: "upper"` を付ける。

**設計意図**: 3個とも地上（y=714 の床）からのジャンプ最高到達点では届かない位置にある。これにより、これまで真下を歩いて迂回できてしまっていた `moving-bridge-b` と `moving-bridge-c` に、初めて乗る理由が生まれる。

配置後、実際にプレイして3個とも取得可能であることを確認すること。届かない場合は **y座標を下げる方向で調整し、地上から届く高さにはしない**。

#### 3-3. HUDとクリア画面に評価を出す

`player.itemScore` は加算されるだけで、`index.html` にも `src/main.js` にも表示先が存在しない。デザインシート（`docs/references/stage01-normal-lab-design-sheet.jpg`）の UI に合わせて表示する。

`index.html` の `.hud__meters` に追加する要素:

- `SCORE` — `player.itemScore`
- `COIN` — ラボコインの取得枚数（新規カウンタ）
- `DATA` — `n / 12`（総数は結晶の実配置数から算出し、ハードコードしない）
- `TIME` — 経過秒（`introTime` 経過後から計測開始、クリアで停止）

`clearPanel` に追加する項目:

- 結晶 `n / 12`
- コイン枚数
- スコア
- タイム
- ミス回数（T4で導入する `player.missCount`）
- ランク

ランクの判定:

| ランク | 条件 |
|---|---|
| S | 結晶が全数 かつ ミス0 |
| A | 結晶が全数の75%以上 かつ ミス2以下 |
| B | 結晶が全数の50%以上 |
| C | それ以外 |

閾値は結晶の実配置数からの比率で計算し、`12` や `9` を直接書かないこと。

**縦画面での注意**: 390×844 では HUD が横に入り切らない。`SCORE` と `COIN` は1行にまとめる等、縦画面専用のレイアウトを `src/style.css` のメディアクエリ側で調整し、必ず 390×844 で確認すること。

#### 3-4. 文言を合わせる

- ミッション文言 `結晶データを7個回収せよ` → `結晶データを集めて出口へ`
- 収集完了時のトースト `ゲート認証データが揃った！` → `結晶データを全部集めた！`
- `gate-message` トリガーの「認証データ不足：あとN個」を削除する。代わりに、未収集がある状態でゲート付近に来たら `結晶データ n / 12` のような残数表示にする（戻ることを強制しない、あくまで告知）。

#### 3-5. コース監査に規則を追加する

`tools/audit_course.mjs` に追加する。

1. 全7区間それぞれに結晶が1個以上ある。
2. `route: "upper"` の結晶は、地上床（`lab-platform-v1` の面）に立った状態からのジャンプ最高到達点で取得できない。ジャンプ高さは `data/player-movement.json` の `jumpVelocity` と `gravity` から計算し、収集半径も含めて判定する。
3. 結晶の総数と、クリア画面・HUD が使う総数の算出元が一致する（ハードコード検出）。
4. `exitLink` に `requiresCrystals` が残っていない。

### 完了条件

- 結晶0個でも出口に到達してクリアできる。
- 結晶12個すべてを取得でき、HUDが `12 / 12` を表示する。
- クリア画面にランクが出る。
- `npm run validate:course` と `npm run validate:stage` が成功する。
- スクリーンショット `screenshots/objective-hud-pc.png`、`screenshots/objective-hud-mobile.png`、`screenshots/clear-rank-pc.png` を保存する。

---

## T4. ライフを体力型へ変更する

### 現状の問題

`src/main.js` の `respawn()` は、被弾するたびにチェックポイントへ強制テレポートする。床がほぼ連続していて落下死がほとんど起きない構成なので、平地で敵に触れただけで大きく戻される。罰が原因に対して大きすぎる。

またライフ0のとき、ライフが黙って `3` に戻り、収集物・結晶・スコアは全部そのまま残る。トーストは「実験記録を復元しました」と出るが、実際には何も復元していない。ゲームオーバー画面も存在しない。

さらに `player.lives = 3` がハードコードされているため、**未来ハートで `maxLives` が5になっていても3にしか戻らず、アイテムの効果が静かに消える**。

### やること

#### 4-1. 被弾と復帰を分離する

`respawn()` を2つの関数に分ける。

**`takeDamage(source)`** — 敵・レーザー・ハザードに触れたとき

- `player.lives -= 1`
- `player.missCount += 1`
- ノックバック: `player.vx = knockDirection * 380`、`player.vy = -420`、`player.onGround = false`、`player.groundPlatformId = null`
  - `knockDirection` は プレイヤー中心 − 加害物中心 の符号。同値のときは `-player.facing`。
- `player.invincible = 1.2`
- **位置はリセットしない。**
- `player.lives === 0` になったら `returnToCheckpoint()` を呼ぶ。

**`returnToCheckpoint()`** — ライフ0、または落下（`player.y > collision.killY`）のとき

- 位置をチェックポイントへ、速度を0に、各タイマーを初期化（現行 `respawn()` の後半と同じ）
- `player.lives = player.maxLives` （**`3` を書かない**）
- `player.invincible = 1.8`
- `player.shieldTimer = 0`
- `resetEnemies(enemies)`
- 画面演出（`shake` / `flash` / 効果音）は現行を維持

落下時は `player.lives -= 1` と `missCount += 1` を行ってから `returnToCheckpoint()` を呼ぶ。ライフが0以下になった場合も同じ復帰処理でよい。

**ゲームオーバーは作らない。**コンティニュー無制限とし、失敗の代償はタイムとミス回数（＝ランク）に寄せる。

#### 4-2. 無敵を全ての判定で尊重する

現在 `player.invincible` は `src/main.js` 側でしか見ていない。ノックバック型にすると、無敵中に敵の内部へ入り込む場面が発生するため、`src/enemy-controller.js` の `stepEnemies` 冒頭でも判定する。

- `player.invincible > 0 || player.shieldTimer > 0` のとき、被弾判定（`events.hit`）を発生させない。
- ただし**踏みつけ判定（`events.stomped`）は無敵中でも成立させる**。無敵中に敵を倒せなくなると、ノックバック直後の着地が理不尽になる。

#### 4-3. 状態のリセット漏れを直す

- `restart()` に `missCount: 0` を追加し、タイム計測もリセットする。
- `maxLives` は `restart()` でのみ 3 に戻す（現行どおり）。`returnToCheckpoint()` では戻さない。

#### 4-4. 文言を直す

- 「実験記録を復元しました」→ 実際の挙動に合わせる（例: `チェックポイントから再開`）
- 「保護シールド損傷！」→ 残ライフが分かる表現にする（例: `ダメージ！ のこり ●●`）

#### 4-5. 検証を追加する

`tools/validate_player_controller.mjs`（または新設の `tools/validate_damage_model.mjs`）に追加する。

1. 被弾してもプレイヤーのx座標が checkpoint へ戻らない（ノックバック分のみ変化する）。
2. 無敵中は連続で被弾しない。
3. 無敵中でも踏みつけは成立する。
4. `lives` が0になったらチェックポイントへ戻り、`lives === maxLives` まで回復する。
5. `maxLives` が5のとき、復帰後の `lives` が5になる（3にならない）。
6. 落下でも `missCount` が増える。

### 完了条件

- 平地でニャビクリーンに触れても、その場でのけぞって進行を続けられる。
- 3回被弾するとチェックポイントへ戻り、ライフが満タンになる。
- 未来ハート取得後は、復帰時のライフが5になる。
- `npm run validate:movement` と `npm run validate:enemy` が成功する。
- スクリーンショット `screenshots/damage-knockback-pc.png` を保存する。

---

## T5. スマホで音が鳴らない問題を直す

### 現状の問題

`AudioContext` は最初の `playTone()`（＝ジャンプ音、`update()` 内）で生成される。タッチハンドラの中ではないため、iOS / Safari では `suspended` のままになる。`resume()` の呼び出しがコード中に存在しない。

### やること

`src/main.js` に `ensureAudio()` を追加する。

```js
const ensureAudio = () => {
  audioContext ||= new AudioContext();
  if (audioContext.state === 'suspended') audioContext.resume();
};
```

呼び出し箇所（いずれもユーザー操作ハンドラの内側であること）:

- `window.addEventListener('keydown', ...)` の中
- タッチボタンの `pointerdown` ハンドラの中
- `ui.sound` の `click` ハンドラの中

`playTone()` 内では `AudioContext` を新規生成せず、未生成なら何もせずに返す形にする。

### 完了条件

- スマホ縦画面（実機、または `resize_window` の mobile プリセット）で、最初のジャンプから効果音が鳴る。
- SOUND OFF → ON の切り替えが効く。

---

## T6. 読み込み失敗を画面に出す

### 現状の問題

起動時の `fetch` と画像ロードはすべてトップレベル `await` で、`try` / `catch` が無い。1件でも失敗すると「結晶ラボを同期中…」の表示のまま何も起きず、原因が分からない。実機確認のときに詰まる。

### やること

- 起動処理（データ取得とアセットロード）を `try` / `catch` で包む。
- 失敗時は `#loading` を消さず、その中に失敗したパスとエラー内容を表示する。`loadImage` の reject メッセージには既にパスが入っているので、それを利用する。
- 表示は日本語の見出し1行＋パス、程度でよい。スタイルは `src/style.css` の `.loading` 側に最小限追加する。

### 完了条件

- 存在しないパスを一時的に `asset-manifest.js` へ入れると、ローディング画面にそのパスが表示される。確認後、必ず元に戻すこと。
- 正常時の起動挙動は変わらない。

---

## 任意（所長の判断待ち・着手前に確認すること）

### T7. 収集半径をレジストリの値で使う

`data/prefab-registry.json` は品目別に `sensorCircle.radius` を 62 / 68 / 74 / 78 と定義しているが、`src/main.js` は `78 * 78` で決め打ちしており、`src/stage-resolver.js` が生成する `sensors` は誰も参照していない。

「`data/*.json` を実装上の正とする」という本プロジェクトの方針に反する箇所だが、今回のレビューでは所長の合意対象に入っていない。**T1〜T6 を完了させたあと、着手可否を所長に確認すること。**

---

## 着手順と粒度

`_LAB_HQ/CODEX_QUEUE.md` の運用（1回1タスク）に合わせ、次の順で1件ずつ処理する。

1. **T1 配信ビルドの修復** — 他タスクの確認手段になるため最優先
2. **T4 ライフを体力型へ** — T3のミス回数がこれに依存する
3. **T2 判定の一元化とスライド回避**
4. **T3 目的の再定義** — 変更範囲が最も広い
5. **T5 音声**
6. **T6 読み込み失敗の可視化**

各タスクの完了時に、共通の検証コマンド一式と該当スクリーンショットを揃えてから次へ進む。

## 完了後にやること

- `docs/HANDOFF_2026-08-11.md` を更新する。特に「ゴール条件: データ結晶7個」「コース監査上の配置結晶: 9個」の記述は本作業で古くなる。
- `README.md` の確認用スクリーンショット参照を更新する。現在 `screenshots/pc-stage-opening.png` を指しているが、これは通常ラボへ刷新する前のダーク／ゴシック版で、現在の見た目と一致していない。正しくは `screenshots/stage01-normal-lab-pc.png` 系。
- `npm run validate` に `validate:contact` が含まれていない。T1 で `validate:build` を足すタイミングで、`validate:contact` も連鎖へ入れるか検討する（Python依存が入るため、入れる場合は README に明記すること）。
