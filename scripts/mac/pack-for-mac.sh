#!/usr/bin/env bash
# Собирает zip для передачи на другой Mac:
# распаковал → кликнул OnlyFriends.app → готово
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d)"
OUT_DIR="${TMPDIR:-/tmp}/OnlyFriends-pack-$$"
NAME="OnlyFriends-Mac"
DEST="$OUT_DIR/$NAME"
ZIP="$ROOT/dist/${NAME}-${STAMP}.zip"

mkdir -p "$DEST" "$ROOT/dist"

echo "→ Копирую проект (без node_modules / .next / логов)..."
rsync -a \
  --exclude node_modules \
  --exclude .next \
  --exclude logs \
  --exclude .mac-setup-done \
  --exclude dist \
  --exclude '.git' \
  --exclude 'prisma/*.db' \
  --exclude 'prisma/*.db-journal' \
  --exclude 'uploads/avatars/*' \
  --exclude '.DS_Store' \
  --exclude 'tsconfig.tsbuildinfo' \
  --exclude 'scripts/mac/AppIcon.iconset' \
  "$ROOT/" "$DEST/"

# dev.db не копируем по умолчанию (чистая БД на новом Mac)
# .env не копируем (секреты) — лаунчер создаст из .env.example
rm -f "$DEST/.env" 2>/dev/null || true

chmod +x \
  "$DEST/scripts/mac/launch.sh" \
  "$DEST/OnlyFriends.app/Contents/MacOS/OnlyFriends" \
  "$DEST/Запустить OnlyFriends.command" \
  "$DEST/Остановить OnlyFriends.command" \
  2>/dev/null || true

# снять quarantine с локальной копии (на целевом Mac всё равно может появиться)
xattr -cr "$DEST" 2>/dev/null || true

echo "→ Упаковываю $ZIP ..."
rm -f "$ZIP"
(
  cd "$OUT_DIR"
  # ditto лучше сохраняет .app и права на macOS
  ditto -c -k --sequesterRsrc --keepParent "$NAME" "$ZIP"
)

rm -rf "$OUT_DIR"

SIZE="$(du -h "$ZIP" | awk '{print $1}')"
echo "✓ Готово: $ZIP ($SIZE)"
echo ""
echo "Передайте архив → на новом Mac:"
echo "  1. Распаковать"
echo "  2. Двойной клик OnlyFriends.app"
echo "  3. Если macOS ругается: ПКМ → Открыть"
echo "  4. Первый запуск скачает Node-зависимости (нужен интернет)"
