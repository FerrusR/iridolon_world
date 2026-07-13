#!/usr/bin/env python3
"""
lint_frontmatter.py — проверка (и авто-починка) YAML-фронтматтера в Obsidian-волте.

Зачем: Obsidian хранит вики-ссылку в свойстве как строку в кавычках — "[[Заметка]]".
Если написать её без кавычек (region: [[Заметка]]), YAML читает это как вложенный
список -> Obsidian рисует оранжевый «битый» чип, по которому не перейти. А если после
]] на строке идёт ещё текст (faction: [[X]] — прим.), весь блок properties становится
невалидным YAML -> красный текст, свойства пропадают.

Что ловит (только реальные поломки, без шума):
  ERROR  yaml_parse     — фронтматтер не парсится как YAML (Obsidian покажет ошибку).
  WARN   unquoted_link  — значение содержит вики-ссылку [[...]] без кавычек.
  (опц.) inline_comment — инлайн '# ...' в значении (только с флагом --strict).

Игнорирует (это НЕ проблема):
  • пустое значение с комментарием-подсказкой  (region:   # [[Регион]])
  • уже закавыченные значения                   (region: "[[X]]"   # прим.)

Режимы:
  python3 lint_frontmatter.py [vault]           # отчёт (код возврата 1, если есть ERROR)
  python3 lint_frontmatter.py [vault] --fix      # закавычить незакавыченные ссылки
  python3 lint_frontmatter.py [vault] --fix -n   # dry-run: показать правки, не записывать
  python3 lint_frontmatter.py [vault] --strict   # добавить предупреждения об инлайн-#
  python3 lint_frontmatter.py [vault] --check    # для git-хука: выход=1 и на WARN (не только ERROR)
"""
import os, re, sys, io

try:
    import yaml
except ImportError:
    print("Нужен pyyaml: pip install pyyaml --break-system-packages", file=sys.stderr)
    sys.exit(2)

SKIP_DIRS = {".git", ".obsidian", ".trash", "node_modules"}
KV = re.compile(r'^(\s*)([^:\s#][^:]*):(\s+)(.*)$')   # indent,key,sep,rest


def split_frontmatter(text):
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].rstrip("\n") != "---":
        return None
    for i in range(1, len(lines)):
        if lines[i].rstrip("\n") in ("---", "..."):
            return 1, i, lines            # (start, end_exclusive_of_body, all_lines)
    return None


def split_comment(rest):
    """Отделяет хвостовой '# комментарий' (вне [[...]]). Возвращает (value, comment)."""
    depth = 0
    for i, ch in enumerate(rest):
        if rest[i:i+2] == "[[":
            depth += 1
        elif rest[i:i+2] == "]]" and depth:
            depth -= 1
        # '#' в начале значения — тоже комментарий: перед rest всегда стоит sep (пробелы)
        if ch == "#" and depth == 0 and (i == 0 or rest[i-1] in " \t"):
            return rest[:i], rest[i:]
    return rest, ""


def classify(rest):
    """Возвращает (kind, fixed_line_value) для значения свойства.
    kind: 'ok' | 'comment_only' | 'unquoted_link' | 'has_comment'
    """
    value, comment = split_comment(rest)
    core = value.rstrip()
    ws = value[len(core):]                 # пробелы перед комментарием
    if core == "":
        return "comment_only", None, comment
    # Значение целиком — квотированный скаляр  "..." / '...'  → корректно при любом содержимом.
    if len(core) >= 2 and core[0] == core[-1] and core[0] in "\"'":
        return "ok", None, comment
    # Ломает свойство именно [[...]] БЕЗ кавычки прямо перед ним (Obsidian: оранжевый чип).
    # Корректный flow-список  arcs: ["[[Арка 1]]"]  — внутри кавычки, его НЕ трогаем.
    unq = any(core[m.start()-1:m.start()] not in ("\"", "'")
              for m in re.finditer(r"\[\[", core))
    if not unq:
        return "ok", None, comment
    # Авто-починка (обернуть в кавычки целиком) годна для скаляра и одиночной ссылки
    # [[X]]; для flow-коллекции ([..]/{..}) так делать нельзя — только предупреждаем.
    scalar_link = core.startswith("[[") or core[0] not in "[{"
    if scalar_link:
        fixed = '"' + core.replace("\\", "\\\\").replace('"', '\\"') + '"' + ws + comment
        return "unquoted_link", fixed, comment
    return "unquoted_link", None, comment


def process(text, do_fix=False):
    fm = split_frontmatter(text)
    issues, changed = [], False
    if fm is None:
        if text.startswith("---"):
            issues.append((1, "ERROR", "yaml_parse", "незакрытый блок --- фронтматтера"))
        return text, issues
    start, end, lines = fm

    # 1) валидность YAML всего блока (как это увидит Obsidian)
    block = "".join(lines[start:end])
    try:
        yaml.safe_load(block)
    except yaml.YAMLError as e:
        mark = getattr(e, "problem_mark", None)
        ln = (start + 1 + mark.line + 1) if mark else start + 1
        issues.append((ln, "ERROR", "yaml_parse",
                       str(getattr(e, "problem", e)).strip()[:80]))

    # 2) построчно
    for idx in range(start, end):
        raw = lines[idx]
        m = KV.match(raw.rstrip("\n"))
        if not m:
            continue
        indent, key, sep, rest = m.groups()
        kind, fixed, comment = classify(rest)
        lineno = idx + 1
        if kind == "unquoted_link":
            issues.append((lineno, "WARN", "unquoted_link",
                           f"{key.strip()}: значение со ссылкой без кавычек"))
            if do_fix and fixed is not None:
                nl = "\n" if raw.endswith("\n") else ""
                lines[idx] = f"{indent}{key}:{sep}{fixed}{nl}"
                changed = True
        if STRICT and comment and kind != "comment_only":
            issues.append((lineno, "WARN", "inline_comment",
                           f"{key.strip()}: инлайн-комментарий «{comment[:38]}»"))
    return ("".join(lines) if changed else text), issues


def main():
    args = [a for a in sys.argv[1:]]
    global STRICT
    STRICT = "--strict" in args
    do_fix = "--fix" in args
    check = "--check" in args        # для CI/хука: падать и на WARN (незакавыченных ссылках)
    dry = "-n" in args or "--dry-run" in args
    args = [a for a in args if not a.startswith("-")]
    vault = args[0] if args else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    n_files = n_err = n_warn = n_fixed = 0
    for root, dirs, files in os.walk(vault):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in sorted(files):
            if not fn.endswith(".md"):
                continue
            p = os.path.join(root, fn)
            text = io.open(p, encoding="utf-8").read()
            new_text, issues = process(text, do_fix=do_fix)
            if not issues:
                continue
            rel = os.path.relpath(p, vault)
            n_files += 1
            print(f"\n📄 {rel}")
            for ln, sev, code, msg in sorted(issues):
                icon = "❌" if sev == "ERROR" else "⚠️ "
                print(f"   {icon} L{ln:<3} [{code}] {msg}")
                n_err += sev == "ERROR"
                n_warn += sev == "WARN"
            if do_fix and new_text != text:
                if dry:
                    print("   → (dry-run) будет закавычено")
                else:
                    io.open(p, "w", encoding="utf-8").write(new_text)
                    print("   ✅ починено")
                n_fixed += 1

    print(f"\n{'='*60}")
    tail = f" | файлов изменено: {n_fixed}" if do_fix else ""
    print(f"Файлов с проблемами: {n_files} | ERROR: {n_err} | WARN: {n_warn}{tail}")
    fail = (n_err > 0) or (check and n_warn > 0)
    sys.exit(1 if (fail and not do_fix) else 0)


STRICT = False
if __name__ == "__main__":
    main()
