#!/bin/bash

# データベースファイルを削除
echo "データベースファイルを削除しています..."
rm -f prisma/dev.db
rm -f prisma/dev.db-journal
rm -f prisma/*.db
rm -f prisma/*.db-journal

echo "✅ データベースファイルを削除しました"
echo ""
echo "データベースを再作成するには、以下のコマンドを実行してください:"
echo "  npm run db:push"
