#!/usr/bin/env bash
# OnlyFriends — автозапуск для macOS
# Первый запуск: ставит зависимости, Playwright, .env, БД
# Далее: worker + Next.js + открывает браузер

set -euo pipefail

# ─── цвета ───────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[2m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'
  C_CYAN=$'\033[36m'
else
  C_RESET= C_BOLD= C_DIM= C_GREEN= C_YELLOW= C_RED= C_CYAN=
fi

info()  { echo "${C_CYAN}→${C_RESET} $*"; }
ok()    { echo "${C_GREEN}✓${C_RESET} $*"; }
warn()  { echo "${C_YELLOW}!${C_RESET} $*"; }
err()   { echo "${C_RED}✗${C_RESET} $*" >&2; }
header() {
  echo ""
  echo "${C_BOLD}════════════════════════════════════════${C_RESET}"
  echo "${C_BOLD}  OnlyFriends — запуск${C_RESET}"
  echo "${C_BOLD}════════════════════════════════════════${C_RESET}"
  echo ""
}

# ─── корень проекта ──────────────────────────────────────────
# Поддерживаем: .command в корне, .app внутри проекта, прямой вызов
resolve_root() {
  local src="${BASH_SOURCE[0]}"
  # если вызвали через symlink / .app wrapper
  while [[ -L "$src" ]]; do
    local dir
    dir="$(cd -P "$(dirname "$src")" && pwd)"
    src="$(readlink "$src")"
    [[ "$src" != /* ]] && src="$dir/$src"
  done

  local script_dir
  script_dir="$(cd -P "$(dirname "$src")" && pwd)"

  # scripts/mac → корень = ../..
  if [[ -f "$script_dir/../../package.json" ]]; then
    cd "$script_dir/../../" && pwd
    return
  fi

  # .app: Contents/MacOS → ../../../package.json (корень рядом с .app)
  if [[ -f "$script_dir/../../../package.json" ]]; then
    cd "$script_dir/../../../" && pwd
    return
  fi

  # fallback: текущая директория
  if [[ -f "./package.json" ]]; then
    pwd
    return
  fi

  err "Не найден package.json. Положите лаунчер внутрь папки OnlyFriends."
  exit 1
}

ROOT="$(resolve_root)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin:$PATH"

LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
PID_FILE="$LOG_DIR/onlyfriends.pids"
MARKER="$ROOT/.mac-setup-done"

WORKER_PID=""
DEV_PID=""

cleanup() {
  local code=$?
  echo ""
  info "Остановка OnlyFriends..."
  if [[ -f "$PID_FILE" ]]; then
    while read -r pid; do
      [[ -n "${pid:-}" ]] && kill "$pid" 2>/dev/null || true
      # убить дочерние процессы next/tsx
      pkill -P "$pid" 2>/dev/null || true
    done < "$PID_FILE"
    rm -f "$PID_FILE"
  fi
  [[ -n "${WORKER_PID:-}" ]] && kill "$WORKER_PID" 2>/dev/null || true
  [[ -n "${DEV_PID:-}" ]] && kill "$DEV_PID" 2>/dev/null || true
  # подчистить оставшиеся next/tsx этого проекта
  pkill -f "$ROOT/node_modules/.bin/next" 2>/dev/null || true
  pkill -f "$ROOT/src/worker/index.ts" 2>/dev/null || true
  ok "Остановлено. Можно закрыть это окно."
  exit "$code"
}
trap cleanup EXIT INT TERM

dialog() {
  local msg="$1"
  osascript -e "display dialog \"$msg\" buttons {\"OK\"} default button 1 with title \"OnlyFriends\" with icon caution" 2>/dev/null || true
}

# ─── проверки ────────────────────────────────────────────────
header
info "Папка проекта: $ROOT"

need_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    local ver
    ver="$(node -v | sed 's/v//')"
    local major="${ver%%.*}"
    if [[ "$major" -ge 18 ]]; then
      ok "Node.js $(node -v), npm $(npm -v)"
      return 0
    fi
    warn "Node.js $ver слишком старый (нужен 18+)."
  fi
  return 1
}

install_node() {
  warn "Node.js не найден. Пытаюсь установить..."
  if command -v brew >/dev/null 2>&1; then
    info "Установка Node.js через Homebrew (нужен интернет)..."
    brew install node
    export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
    if need_node; then return 0; fi
  fi

  err "Установите Node.js 20 LTS:"
  err "  https://nodejs.org/"
  open "https://nodejs.org/" 2>/dev/null || true
  dialog "Node.js не установлен.\\n\\nОткрыта страница nodejs.org — скачайте LTS, установите, затем снова запустите OnlyFriends."
  exit 1
}

if ! need_node; then
  install_node
fi

# ─── первый запуск / bootstrap ───────────────────────────────
FIRST_RUN=0
if [[ ! -d "$ROOT/node_modules" ]] || [[ ! -f "$MARKER" ]]; then
  FIRST_RUN=1
fi

if [[ ! -f "$ROOT/.env" ]]; then
  if [[ -f "$ROOT/.env.example" ]]; then
    cp "$ROOT/.env.example" "$ROOT/.env"
    ok "Создан .env из .env.example"
  else
    echo 'DATABASE_URL="file:./dev.db"' > "$ROOT/.env"
    warn "Создан минимальный .env"
  fi
fi

if [[ ! -d "$ROOT/node_modules" ]] || [[ ! -x "$ROOT/node_modules/.bin/next" ]]; then
  info "Установка зависимостей (npm install) — первый раз может занять 1–3 минуты..."
  npm install
  ok "Зависимости установлены"
else
  ok "node_modules на месте"
fi

# Prisma client + схема
info "Подготовка базы данных..."
npx prisma generate >/dev/null
npm run db:push -- --skip-generate 2>/dev/null || npm run db:push
ok "База данных готова (SQLite)"

# Playwright Chromium (идемпотентно — если уже стоит, быстро выходит)
info "Проверка браузера Playwright (Chromium)..."
npx playwright install chromium
ok "Playwright Chromium готов"

mkdir -p "$ROOT/uploads/avatars"
touch "$MARKER"
ok "Подготовка завершена"

# ─── если уже запущено — просто открыть браузер ─────────────
if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  warn "Порт 3000 уже занят — открываю существующий сервер"
  open "http://localhost:3000"
  echo ""
  echo "${C_DIM}Если это не OnlyFriends — закройте другой процесс и перезапустите.${C_RESET}"
  echo "${C_DIM}Нажмите Enter, чтобы выйти из лаунчера (сервер продолжит работать)...${C_RESET}"
  read -r || true
  # не убиваем чужой процесс
  trap - EXIT INT TERM
  exit 0
fi

# ─── запуск процессов ────────────────────────────────────────
echo ""
info "Запуск worker..."
npm run worker >"$LOG_DIR/worker.log" 2>&1 &
WORKER_PID=$!
echo "$WORKER_PID" > "$PID_FILE"
ok "Worker PID $WORKER_PID  (лог: logs/worker.log)"

info "Запуск веб-панели..."
npm run dev >"$LOG_DIR/dev.log" 2>&1 &
DEV_PID=$!
echo "$DEV_PID" >> "$PID_FILE"
ok "Next.js PID $DEV_PID  (лог: logs/dev.log)"

# ждём порт 3000
info "Жду готовности http://localhost:3000 ..."
READY=0
for i in $(seq 1 90); do
  if curl -sf -o /dev/null "http://localhost:3000" 2>/dev/null; then
    READY=1
    break
  fi
  # если dev умер — показать лог
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    err "Веб-сервер упал. Последние строки logs/dev.log:"
    tail -n 40 "$LOG_DIR/dev.log" || true
    exit 1
  fi
  sleep 1
done

if [[ "$READY" -ne 1 ]]; then
  err "Сервер не поднялся за 90 секунд. Смотри logs/dev.log"
  tail -n 40 "$LOG_DIR/dev.log" || true
  exit 1
fi

ok "Готово!"
open "http://localhost:3000"

echo ""
echo "${C_BOLD}${C_GREEN}OnlyFriends работает${C_RESET}"
echo "  Панель:  ${C_CYAN}http://localhost:3000${C_RESET}"
echo "  Логи:    ${C_DIM}$LOG_DIR/${C_RESET}"
echo ""
echo "${C_DIM}Не закрывайте это окно — пока оно открыто, сервер работает.${C_RESET}"
echo "${C_DIM}Закройте окно или Ctrl+C — чтобы остановить.${C_RESET}"
echo ""

# держим лаунчер живым, стримим логи
tail -n 0 -F "$LOG_DIR/dev.log" "$LOG_DIR/worker.log" 2>/dev/null &
TAIL_PID=$!
echo "$TAIL_PID" >> "$PID_FILE"

# ждать пока живы процессы
while kill -0 "$DEV_PID" 2>/dev/null || kill -0 "$WORKER_PID" 2>/dev/null; do
  sleep 2
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    err "Веб-сервер завершился. См. logs/dev.log"
    break
  fi
  if ! kill -0 "$WORKER_PID" 2>/dev/null; then
    warn "Worker упал — перезапуск..."
    npm run worker >"$LOG_DIR/worker.log" 2>&1 &
    WORKER_PID=$!
    # обновить pid-файл
    {
      echo "$WORKER_PID"
      echo "$DEV_PID"
      echo "$TAIL_PID"
    } > "$PID_FILE"
    ok "Worker перезапущен (PID $WORKER_PID)"
  fi
done

wait || true
