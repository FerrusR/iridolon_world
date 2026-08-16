#!/usr/bin/env bash
#
# deploy.sh — собрать модуль elinvale-tools и выкатить его в Foundry.
#
# Делает всё за один вызов:
#   1. пересобирает LevelDB-паки из src/           (node scripts/build.mjs)
#   2. останавливает Foundry                        (systemctl --user stop foundry.service)
#   3. сносит старую копию модуля в Data/modules    (чистая выкатка, без осиротевших файлов)
#   4. копирует свежий модуль (без build-обвязки)   (rsync --delete)
#   5. снова запускает Foundry                       (systemctl --user start foundry.service)
#
# Foundry гарантированно поднимается обратно даже если шаг упал (trap на EXIT).
#
# Использование:
#   ./scripts/deploy.sh              # полный цикл (сборка + выкатка)
#   ./scripts/deploy.sh --no-build   # только выкатить уже собранное (без пересборки)
#
# Переопределить путь к модулям Foundry:
#   FOUNDRY_MODULES=/путь/к/Data/modules ./scripts/deploy.sh

set -euo pipefail

# --- параметры -------------------------------------------------------------
FOUNDRY_MODULES="${FOUNDRY_MODULES:-/home/ferrus/foundrydata/Data/modules}"
SERVICE="foundry.service"

DO_BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-build) DO_BUILD=0 ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Неизвестный аргумент: $arg (см. --help)" >&2; exit 2 ;;
  esac
done

# --- пути (устойчивы к пробелам и к запуску из любой директории) -----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_DIR="$(dirname "$SCRIPT_DIR")"
MODULE_ID="$(basename "$MODULE_DIR")"
DEST="$FOUNDRY_MODULES/$MODULE_ID"

echo "==> Модуль:      $MODULE_DIR"
echo "==> Назначение:  $DEST"

# --- проверки окружения ----------------------------------------------------
command -v systemctl >/dev/null 2>&1 || { echo "ОШИБКА: нет systemctl" >&2; exit 1; }
command -v rsync     >/dev/null 2>&1 || { echo "ОШИБКА: нет rsync"     >&2; exit 1; }
if [ "$DO_BUILD" -eq 1 ]; then
  command -v node >/dev/null 2>&1 || { echo "ОШИБКА: нет node (нужен для сборки)" >&2; exit 1; }
fi
[ -f "$MODULE_DIR/module.json" ] || { echo "ОШИБКА: не найден $MODULE_DIR/module.json" >&2; exit 1; }

# --- безопасный рестарт: чем бы ни кончилось, Foundry поднимаем обратно -----
STOPPED=0
restart_foundry() {
  if [ "$STOPPED" -eq 1 ]; then
    echo "==> Запускаю $SERVICE обратно…"
    systemctl --user start "$SERVICE" || echo "ВНИМАНИЕ: не удалось запустить $SERVICE — подними вручную" >&2
    STOPPED=0
  fi
}
trap restart_foundry EXIT

# --- 1. сборка (пока Foundry ещё работает: упадёт сборка — простоя не будет) -
if [ "$DO_BUILD" -eq 1 ]; then
  echo "==> Сборка паков…"
  ( cd "$MODULE_DIR" && node scripts/build.mjs )
else
  echo "==> Сборку пропускаю (--no-build)"
fi

# --- 2. стоп Foundry -------------------------------------------------------
echo "==> Останавливаю $SERVICE…"
systemctl --user stop "$SERVICE"
STOPPED=1

# --- 3+4. чистая выкатка ---------------------------------------------------
# rsync --delete сам приводит назначение в точное соответствие источнику,
# удаляя осиротевшие от прошлых компакций LevelDB-файлы. Build-обвязку не тащим:
# Foundry в рантайме читает только module.json и packs/.
echo "==> Выкатываю модуль (rsync --delete)…"
mkdir -p "$DEST"
rsync -a --delete \
  --exclude 'node_modules' \
  --exclude 'src' \
  --exclude 'scripts' \
  --exclude 'package.json' \
  --exclude 'package-lock.json' \
  --exclude '.git' \
  --exclude '.gitignore' \
  --exclude '.github' \
  "$MODULE_DIR/" "$DEST/"

# --- 5. старт Foundry (через trap, чтобы путь был один) --------------------
restart_foundry

# небольшая пауза и статус
sleep 1
if systemctl --user is-active --quiet "$SERVICE"; then
  echo "==> Готово. $SERVICE активен."
else
  echo "==> Готово, но $SERVICE не активен — проверь: systemctl --user status $SERVICE" >&2
fi
