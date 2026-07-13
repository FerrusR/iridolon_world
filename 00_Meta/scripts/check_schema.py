#!/usr/bin/env python3
"""
check_schema.py — проверка обязательных полей frontmatter в Obsidian-волте.

Дополняет lint_frontmatter.py: тот следит за МЕХАНИКОЙ YAML (кавычки у ссылок),
а этот — за ПОЛНОТОЙ (нужные свойства заполнены). Разные оси, разные скрипты.

Правила (ERROR = блокирует коммит/хук):
  • type: npc  и  type: location  →  обязателен непустой `arcs`
        формат: список вики-ссылок, напр.  arcs: ["[[Арка 1]]"]  или  ["[[Арка 1]]", "[[Арка 3]]"]
  • type: npc  →  заполнено `region` И/ИЛИ `location` (хотя бы одно; реальным
        значением, не только комментарием-подсказкой)

Что НЕ трогаем: `тема-N` (сквозные темы — отдельная ось), боги/фракции/сессии
и всё в 00_Meta/ (шаблоны, скрипты).

Режимы:
  python3 check_schema.py [path]            # отчёт по волту (или по одному .md); exit 1 если есть ERROR
  python3 check_schema.py [path] --check     # то же, для git-хука (exit 1 при ERROR)
  python3 check_schema.py [path] --fix        # мигрировать теги арка-N -> поле arcs
  python3 check_schema.py [path] --fix -n     # dry-run миграции (показать, не писать)
  python3 check_schema.py --hook              # для PostToolUse: читает JSON из stdin,
                                              #   проверяет отредактированный файл, exit 2 (блок) при ERROR
"""
import os, re, sys, io, json

try:
    import yaml
except ImportError:
    print("Нужен pyyaml: pip install pyyaml --break-system-packages", file=sys.stderr)
    sys.exit(2)

SKIP_DIRS = {".git", ".obsidian", ".trash", "node_modules", "00_Meta"}
REQUIRE_ARCS = {"npc", "location"}
REQUIRE_PLACE = {"npc"}

LINK_RE = re.compile(r"\[\[[^\[\]]+\]\]")           # вики-ссылка [[...]] (алиас [[X|Y]] тоже ок)
ARCTAG_RE = re.compile(r"^арка-(\d+)")               # тег арка-N -> номер арки

# Признанные «заглушки» — намеренно, а не по забывчивости:
ARC_SENTINELS = {"фон"}          # arcs: ["фон"]  — сущность вне арок (фоновая)
PLACE_SENTINELS = {"неизвестно"}  # region/location: неизвестно  — место пока не определено


# ── разбор frontmatter ────────────────────────────────────────────────────────
def split_frontmatter(text):
    """Возвращает (start, end, lines) блока между --- ... --- либо None."""
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].rstrip("\n") != "---":
        return None
    for i in range(1, len(lines)):
        if lines[i].rstrip("\n") in ("---", "..."):
            return 1, i, lines
    return None


def parse_fm(text):
    """Возвращает (data_dict_or_None, err_str_or_None)."""
    fm = split_frontmatter(text)
    if fm is None:
        return None, None
    start, end, lines = fm
    block = "".join(lines[start:end])
    try:
        data = yaml.safe_load(block)
    except yaml.YAMLError as e:
        return None, str(getattr(e, "problem", e)).strip()[:80]
    return (data if isinstance(data, dict) else {}), None


def as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def arc_links(v):
    """Список валидных вики-ссылок из значения arcs (строка или список)."""
    out = []
    for item in as_list(v):
        if isinstance(item, str) and LINK_RE.fullmatch(item.strip()):
            out.append(item.strip())
    return out


def norm(s):
    return s.strip().strip("\"'").lower() if isinstance(s, str) else s


def arcs_ok(v):
    """arcs заполнен корректно: ≥1 вики-ссылка ИЛИ заглушка «фон»."""
    if arc_links(v):
        return True
    return any(norm(item) in ARC_SENTINELS for item in as_list(v))


def place_ok(data):
    """Место заполнено: region/location — реальным значением (ссылка или «неизвестно»)."""
    return has_value(data.get("region")) or has_value(data.get("location"))


def has_value(v):
    """True, если поле заполнено реальным значением (не None/пусто)."""
    if v is None:
        return False
    if isinstance(v, str):
        return v.strip() != ""
    if isinstance(v, (list, dict)):
        return len(v) > 0
    return True


def arc_tags_numbers(data):
    """Номера арок, закодированные в tags как арка-N (для миграции)."""
    nums = []
    for t in as_list(data.get("tags")):
        m = ARCTAG_RE.match(str(t))
        if m:
            nums.append(int(m.group(1)))
    return sorted(set(nums))


# ── проверка одного файла ──────────────────────────────────────────────────────
def check_file(path):
    """Возвращает список (severity, code, msg)."""
    text = io.open(path, encoding="utf-8").read()
    data, err = parse_fm(text)
    issues = []
    if err:
        # это забота lint_frontmatter.py; здесь просто не мешаем
        return issues
    if data is None:
        return issues
    t = data.get("type")
    if t not in REQUIRE_ARCS and t not in REQUIRE_PLACE:
        return issues

    if t in REQUIRE_ARCS:
        raw = data.get("arcs")
        if not arcs_ok(raw):
            if has_value(raw):
                issues.append(("ERROR", "arcs_format",
                               "поле `arcs` есть, но не список вики-ссылок и не «фон» "
                               "(нужно arcs: [\"[[Арка N]]\"] либо arcs: [\"фон\"])"))
            else:
                hint = arc_tags_numbers(data)
                extra = (f" — есть тег(и) арка-{','.join(map(str, hint))}, "
                         f"починится через --fix") if hint else \
                        " — укажи вручную (арка или «фон»)"
                issues.append(("ERROR", "arcs_missing",
                               f"нет обязательного `arcs`{extra}"))

    if t in REQUIRE_PLACE:
        if not place_ok(data):
            issues.append(("ERROR", "place_missing",
                           "у NPC не заполнены ни `region`, ни `location` "
                           "(нужно хотя бы одно: ссылка или «неизвестно»)"))
    return issues


# ── миграция: теги арка-N -> поле arcs ─────────────────────────────────────────
def migrate_file(path, dry=False):
    """Добавляет arcs: из тегов арка-N, если arcs пуст. Возвращает (changed, note)."""
    text = io.open(path, encoding="utf-8").read()
    data, err = parse_fm(text)
    if err or not isinstance(data, dict):
        return False, None
    if data.get("type") not in REQUIRE_ARCS:
        return False, None
    if arc_links(data.get("arcs")):
        return False, None                      # уже заполнено — не трогаем
    nums = arc_tags_numbers(data)
    if not nums:
        return False, None                      # нечего мигрировать
    value = ", ".join(f'"[[Арка {n}]]"' for n in nums)
    new_line = f"arcs: [{value}]\n"

    fm = split_frontmatter(text)
    start, end, lines = fm
    # точка вставки: сразу после строки type: (иначе после открывающего ---)
    insert_at = start
    for i in range(start, end):
        if re.match(r"^\s*type\s*:", lines[i]):
            insert_at = i + 1
            break
    lines.insert(insert_at, new_line)
    new_text = "".join(lines)
    if not dry:
        io.open(path, "w", encoding="utf-8").write(new_text)
    return True, f"arcs: [{value}]"


# ── обход ──────────────────────────────────────────────────────────────────────
def iter_md(root):
    if os.path.isfile(root):
        if root.endswith(".md"):
            yield root
        return
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in sorted(files):
            if fn.endswith(".md"):
                yield os.path.join(dirpath, fn)


def in_skip(path, vault):
    rel = os.path.relpath(path, vault)
    return any(part in SKIP_DIRS for part in rel.split(os.sep))


# ── режимы ──────────────────────────────────────────────────────────────────────
def run_report(root, do_fix, dry):
    n_files = n_err = n_fixed = 0
    for p in iter_md(root):
        rel = os.path.relpath(p)
        if do_fix:
            changed, note = migrate_file(p, dry=dry)
            if changed:
                n_fixed += 1
                tag = "(dry-run) " if dry else ""
                print(f"🔧 {tag}{rel}\n   + {note}")
        issues = check_file(p)
        if not issues:
            continue
        n_files += 1
        print(f"\n📄 {rel}")
        for sev, code, msg in issues:
            print(f"   ❌ [{code}] {msg}")
            n_err += 1
    print(f"\n{'='*64}")
    tail = f" | мигрировано: {n_fixed}" if do_fix else ""
    print(f"Файлов с проблемами: {n_files} | ERROR: {n_err}{tail}")
    return n_err


def run_hook():
    """PostToolUse: читает JSON из stdin, блокирует правку с ошибкой (exit 2)."""
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    ti = payload.get("tool_input") or {}
    path = ti.get("file_path") or ti.get("filePath")
    if not path or not path.endswith(".md") or not os.path.isfile(path):
        return 0
    vault = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if in_skip(os.path.abspath(path), vault):
        return 0
    issues = check_file(path)
    if not issues:
        return 0
    rel = os.path.relpath(path, vault)
    print(f"⛔ Схема frontmatter: {rel}", file=sys.stderr)
    for sev, code, msg in issues:
        print(f"   • [{code}] {msg}", file=sys.stderr)
    print("   Заполни поля по правилу из 00_Meta/CLAUDE_instructions.md "
          "(arcs: [\"[[Арка N]]\"]; у NPC — region/location).", file=sys.stderr)
    return 2


def run_staged():
    """git pre-commit: проверяет ТОЛЬКО staged .md (чужие легаси-пробелы не блокируют)."""
    import subprocess
    vault = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    try:
        out = subprocess.run(
            ["git", "-C", vault, "diff", "--cached", "--name-only", "-z",
             "--diff-filter=ACM"], capture_output=True).stdout
    except Exception:
        return 0
    files = [f for f in out.decode("utf-8", "replace").split("\0") if f.endswith(".md")]
    n_err = 0
    for rel in files:
        p = os.path.join(vault, rel)
        if not os.path.isfile(p) or in_skip(os.path.abspath(p), vault):
            continue
        issues = check_file(p)
        if issues:
            print(f"\n📄 {rel}")
            for sev, code, msg in issues:
                print(f"   ❌ [{code}] {msg}")
                n_err += 1
    if n_err:
        print(f"\n{'='*64}\nСхема frontmatter — ERROR: {n_err} (в staged-файлах)")
    return 1 if n_err else 0


def main():
    args = sys.argv[1:]
    if "--hook" in args:
        sys.exit(run_hook())
    if "--staged" in args:
        sys.exit(run_staged())
    do_fix = "--fix" in args
    dry = "-n" in args or "--dry-run" in args
    pos = [a for a in args if not a.startswith("-")]
    default_vault = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    root = pos[0] if pos else default_vault
    n_err = run_report(root, do_fix, dry)
    # при --fix не валим (даём дописать вручную оставшееся); иначе exit 1 на ошибках
    sys.exit(1 if (n_err > 0 and not do_fix) else 0)


if __name__ == "__main__":
    main()
