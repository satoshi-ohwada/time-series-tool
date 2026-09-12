# データ分析・可視化 Webツール ポータル (Data Analytics Tools Portal)

本ポータルは、大和田様が開発・公開されている5つのデータ分析・可視化Webツールを一覧・選択できる公式ポータルページです。

外部サーバーとの通信を行わない**完全ローカル処理**と、Excelセル範囲の**コピー＆ペースト（直接貼り付け）**による即時分析という共通の設計思想を持つツール群を、直感的にナビゲーションできます。

---

## 🚀 掲載ツール一覧

| ツール名 | URL | 主な分析手法・用途 |
| :--- | :--- | :--- |
| **🗺️ 青森県市町村コロプレスツール** | [choropleth-tool](https://satoshi-ohwada.github.io/choropleth-tool/) | 市町村統計の色分け地図、面積バイアス解消バブル図（重なり回避・段階シンボル図）、Jenks自然分類、箱ひげ図 |
| **📊 簡易クラスター分析ツール** | [cluster-tool](https://satoshi-ohwada.github.io/cluster-tool/) | 階層的クラスタリング（ウォード法等）、デンドログラム（樹形図）、UMAP次元削減散布図、自動グループ分け |
| **🔍 簡易主成分分析（PCA）ツール** | [pca-test](https://satoshi-ohwada.github.io/pca-test/) | 主成分分析、バイプロット（因子負荷量ベクトル表示）、総合評価ポジショニングマップ、データ構造の2D要約 |
| **📈 簡易時系列分析ツール** | [time-series-tool](https://satoshi-ohwada.github.io/time-series-tool/) | STL分解（長期トレンド・季節変動・不規則成分の分離）、移動平均平滑化、周期性抽出 |
| **📝 簡易テキスト分析ツール** | [text-analysis-test](https://satoshi-ohwada.github.io/text-analysis-test/) | 日本語形態素解析（kuromoji.js）、頻出語ランキング、ワードクラウド、共起ネットワーク図 |

---

## 🌟 ポータルの特長

1. **目的別フィルタ機能**:
   - 「地図・地域統計」「多変量・分類」「テキスト分析」「時系列・トレンド」のタグをクリックして即座に絞り込み可能。
2. **課題別早見表（クイックナビゲーション）**:
   - 「手元のデータをどう分析すればよいか」という利用者の目的に応じた最適なツールをひと目で案内。
3. **完全ローカル処理のプライバシー保証明記**:
   - 機密データや独自調査データ、個人情報を含むアンケートでも安心して利用できる旨を前面に明記。
4. **高品位・レスポンシブデザイン**:
   - PC、タブレット、スマートフォンに対応。
   - 絵文字の環境依存文字化けを防ぐインラインSVGアイコンと洗練されたカードデザインを採用。
5. **単一ファイル完結**:
   - `index.html` 1ファイルのみで動作するため、GitHub Pagesへの公開やイントラネット（社内・学内LAN）への配置が極めて容易です。

---

## 🛠️ GitHub Pages へのデプロイ手順

本ポータルを GitHub Pages（例: `https://satoshi-ohwada.github.io/portal/` またはルート `https://satoshi-ohwada.github.io/`）に公開する手順です。

1. **GitHub 上で新しいリポジトリを作成**（例: `portal` または `tools`）。
2. **本フォルダのファイルをプッシュ**:
   ```bash
   cd portal/
   git init
   git add index.html README.md
   git commit -m "Initial commit: Data Analytics Tools Portal"
   git branch -M main
   git remote add origin https://github.com/satoshi-ohwada/portal.git
   git push -u origin main
   ```
3. **GitHub Pages の有効化**:
   - リポジトリの **Settings** > **Pages** を開く。
   - **Branch** を `main` / `root` に設定して **Save** をクリック。
   - 数分後、`https://satoshi-ohwada.github.io/portal/` でポータルが公開されます。

---

## 💻 ローカルでの確認方法

```bash
# portal ディレクトリ内で簡易サーバーを起動
python3 -m http.server 8000

# ブラウザでアクセス
http://localhost:8000
```
