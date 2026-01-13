# GitHubリポジトリ作成手順

このプロジェクトをGitHubで管理するための手順です。

## 方法1: GitHub CLIを使用（推奨）

GitHub CLIがインストールされている場合：

```bash
# GitHubにログイン（初回のみ）
gh auth login

# リポジトリを作成してプッシュ
gh repo create DepositManagement --public --source=. --remote=origin --push
```

## 方法2: GitHub Webサイトを使用

1. **GitHubでリポジトリを作成**
   - https://github.com/new にアクセス
   - リポジトリ名: `DepositManagement`（または任意の名前）
   - 説明: 「介護法人向け預り金管理システム」
   - Public または Private を選択
   - **「Initialize this repository with a README」のチェックは外す**（既にローカルにリポジトリがあるため）
   - 「Create repository」をクリック

2. **リモートリポジトリを追加してプッシュ**
   ```bash
   # リモートリポジトリを追加（YOUR_USERNAMEを自分のGitHubユーザー名に置き換え）
   git remote add origin https://github.com/YOUR_USERNAME/DepositManagement.git
   
   # メインブランチをプッシュ
   git branch -M main
   git push -u origin main
   ```

## 方法3: SSHを使用する場合

SSHキーを設定している場合：

```bash
# リモートリポジトリを追加（YOUR_USERNAMEを自分のGitHubユーザー名に置き換え）
git remote add origin git@github.com:YOUR_USERNAME/DepositManagement.git

# メインブランチをプッシュ
git branch -M main
git push -u origin main
```

## 確認

プッシュが成功したら、GitHubのリポジトリページでファイルが表示されることを確認してください。

## 今後の作業フロー

```bash
# 変更をステージング
git add .

# コミット
git commit -m "変更内容の説明"

# GitHubにプッシュ
git push
```
