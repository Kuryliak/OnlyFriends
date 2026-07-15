#!/usr/bin/env bash
# Останавливает worker и Next.js, запущенные лаунчером
cd "$(dirname "$0")"
ROOT="$(pwd)"
PID_FILE="$ROOT/logs/onlyfriends.pids"

echo "Остановка OnlyFriends..."

if [[ -f "$PID_FILE" ]]; then
  while read -r pid; do
    [[ -n "${pid:-}" ]] && kill "$pid" 2>/dev/null || true
    pkill -P "$pid" 2>/dev/null || true
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi

pkill -f "$ROOT/node_modules/.bin/next" 2>/dev/null || true
pkill -f "$ROOT/src/worker/index.ts" 2>/dev/null || true
for pid in $(lsof -nP -iTCP:3000 -sTCP:LISTEN -t 2>/dev/null); do
  kill "$pid" 2>/dev/null || true
done

echo "Готово. Можно закрыть окно."
sleep 2
