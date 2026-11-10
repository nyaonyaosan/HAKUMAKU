# HAKUMAKU Web

多層薄膜の透過率・反射率スペクトルを計算する静的Webアプリです。

## GitHub Pagesで公開する方法

1. GitHubで公開リポジトリを作成します（例: `hakumaku-web`）。
2. このフォルダー内のファイルを、リポジトリの `main` ブランチ直下へ追加します。
3. リポジトリの **Settings → Pages** を開きます。
4. **Build and deployment** の Source を **Deploy from a branch** にします。
5. Branchを **main**、フォルダーを **/(root)** にして **Save** を押します。
6. 数分後、GitHub PagesのURLで利用できます。

公開URLは通常、次の形式です。

```text
https://GitHubユーザー名.github.io/リポジトリ名/
```

## 構成

- `index.html` — 画面本体
- `styles.css` — デザイン
- `app.js` — 計算処理と画面操作
- `Materials/index.txt` — 材料一覧
- `Materials/*.nk` — 材料ごとの光学定数データ

ビルド、サーバー側プログラム、データベースは不要です。

