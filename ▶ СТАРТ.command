#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
# снять блокировки macOS после скачивания
xattr -cr . 2>/dev/null || true
chmod +x scripts/mac/launch.sh "Запустить OnlyFriends.command" "Остановить OnlyFriends.command" 2>/dev/null || true
exec bash "./scripts/mac/launch.sh"
