# ニャビットの暴走実験室 — Stage 01 Opening

Dr.よこぼを操作して結晶ラボを進む、2Dスクロールゲームのリッチプロトタイプです。

## 起動

```powershell
npm install
npm run dev
```

検証にはPython 3とPillowも使用します。配布確認は`npm run build`後に`npm run preview`で行えます。ビルド成果物は相対パスで構成されるため、サイト直下だけでなくサブディレクトリ配信にも対応します。

操作は `A/D` または矢印で移動、`Space` でジャンプ、`Shift` でスライド。縦スマホでは画面下のタッチコントローラーを使います。

ステージ床は「左端＋中間A/B＋右端」で組み立てる可変長モジュールです。生成スプライトと加工記録は `assets/`、ステージの当たり判定・配置・レスポンシブカメラ設定は `data/` に分離しています。

コースは全13区間・ワールド `11216×1560` です。前半（x0〜5600）で4段降り、後半（x5600〜11216）は最下段の上に3段の棚を積んで上下ルートを作ります。区間構成と高さ規格は `docs/floors/1f/COURSE_NOTES.md` を参照してください。

## 接地規格

- Dr.よこぼのランタイムフレームは、半透明境界ではなく不透明度128以上の靴底を `footBaseline: 287` に正規化します。
- 足場の全モジュールは、見た目の床面を `surfaceY: 6` に正規化します。ステージJSONの `platform.y` は画像原点ではなく実際の接触線です。
- ゲームは上記メタデータから描画位置を計算し、固定ピクセル補正を使いません。
- `F2` またはURLの `?debug-contact` で、床面・キャラ当たり判定・足元線を表示できます。

素材を追加・再処理したあとは次を実行します。

```powershell
npm run assets:normalize
npm run validate:contact
npm run validate:movement
```

接地検査が失敗した素材はゲームへ組み込みません。

## AI主体のステージ調整

- `F3` または `?editor` で、PC用の制約付き調整モードを開きます。
- スマホ実機確認は `npm run dev:lan` を使います。同一LANへ公開されるため、公衆Wi-Fiでは使用しないでください。
- アイテムや登録済みプレハブ全体はドラッグ・数値入力で移動できます。
- 画像倍率、回転、接地面、判定の自由変形はできません。
- 変更はブラウザのローカル下書きへ自動保存され、AI用指示または差分JSONとして書き出せます。
- コースは意味のある区間IDに分かれているため、「ジャンプ練習区画が単調」のような指示から対象を絞れます。

AI編集の詳細は `docs/ai-stage-authoring.md` を参照してください。

2026-08-12に区間ID `final-ascent` を `final-descent` へ変更しました。同日にコースを `5600` → `11216` へ延長し、出口リフトを `x10852` へ移設しました。以前のローカル下書きを使っている場合は、F3エディターの「下書きを破棄」で一度クリアしてください。

確認用スクリーンショット:

- `docs/qa/hazard-visual-pc.png` / `docs/qa/hazard-visual-mobile.png`（危険物）
- `screenshots/descent-overview-pc.png` / `descent-autoplay-goal-pc.png`（4段下降）
- `screenshots/switch-activate-pc.png` / `lift-descent-pc.png`（出口スイッチ＋下降リフト）
- `screenshots/midground-parallax-pc.png`（不透明な中景パララックス）
- `screenshots/info-panel-mobile.png`（390×844の情報パネル）
- `screenshots/t5-autoplay-regression.png`（出口リフト後のクリア評価）

## 検証

```powershell
npm run assets:normalize
npm run validate
npm run build
```

`npm run validate`には接地契約、コース、移動、被弾、敵、アイテム、音声初期化、読込エラー、表示契約、配布物の監査が含まれます。
