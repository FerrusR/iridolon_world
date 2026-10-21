---
name: foundry-pf2e
description: Build and maintain Foundry VTT v14 content modules and script macros for Pathfinder 2e. Covers scaffolding module.json, authoring compendium documents (deities, NPCs/monsters, items, journals, roll tables, macros) as JSON sources, compiling LevelDB packs with @foundryvtt/foundryvtt-cli, and writing Foundry/PF2e macro code. Use whenever the user mentions Foundry, FVTT, a module, compendium, pack, module.json, homebrew content for their PF2e game, or wants a macro — even if they only say "add my gods/monsters/items to Foundry".
---

# Foundry VTT v14 + PF2e Module Builder

Build distributable Foundry VTT content modules for the Pathfinder 2e system: homebrew deities, creatures, items, journals (lore), roll tables, and macros, packaged as compendium packs.

## Environment facts (verified July 2026)

- Target is **Foundry v14** (first stable: 14.354+, April 2026). Manifest `compatibility.minimum` should be `"14"`.
- The **PF2e system 8.x** line is the v14-compatible line (7.x and earlier are v13/v12). PF2e v14 support landed recently — if something schema-related fails, check the current release at https://github.com/foundryvtt/pf2e/releases.
- Compendium packs are **LevelDB directories**. Never hand-edit them. Author documents as one-JSON-file-per-document and compile with the official CLI: `npm install @foundryvtt/foundryvtt-cli`, then `compilePack(src, dest)` / `extractPack(src, dest)` from its API, or the `fvtt package pack/unpack` commands.
- v14 removed TinyMCE (rich text is ProseMirror; plain HTML strings in `description.value` are fine) and the MeasuredTemplate document type. Neither affects content packs; both can affect old macro code.

## Ground truth for schemas

The PF2e system's own pack sources are the authoritative schema reference. They live in the repo at `packs/pf2e/<pack-name>/<slug>.json` on the `v14-dev` branch:

```
https://raw.githubusercontent.com/foundryvtt/pf2e/v14-dev/packs/pf2e/deities/core-gods/sarenrae.json
https://raw.githubusercontent.com/foundryvtt/pf2e/v14-dev/packs/pf2e/pathfinder-monster-core/goblin-warrior.json
https://raw.githubusercontent.com/foundryvtt/pf2e/v14-dev/packs/pf2e/equipment/longsword.json
https://raw.githubusercontent.com/foundryvtt/pf2e/v14-dev/packs/pf2e/macros/rest-for-the-night.json
```

When unsure about a field, fetch a comparable official document and mirror it. Curated examples with commentary are in `references/pf2e-schemas.md` — read it before authoring any document.

## Workflow

### 1. Scaffold

Create the module directory (the directory name must equal the manifest `id`):

```
my-module/
├── module.json
├── src/                  # JSON sources, one file per document (not shipped)
│   ├── deities/
│   ├── bestiary/
│   ├── items/
│   ├── journals/
│   └── macros/
├── packs/                # compiled LevelDB output (shipped, gitignore-able)
├── scripts/build.mjs     # compile script (copy from this skill's scripts/)
└── lang/                 # only if the module localizes UI strings
```

Write `module.json` following `references/manifest.md`. Essentials: `id` (lowercase, hyphens), `compatibility: {"minimum": "14", "verified": "14"}`, `relationships.systems: [{"id": "pf2e", "type": "system"}]`, one `packs` entry per compendium (`type` + `system: "pf2e"` required for Actor/Item packs), optional `packFolders` to group them in the sidebar.

### 2. Author documents

One JSON file per document under `src/<pack>/`. Follow the conventions in `references/pf2e-schemas.md`. The rules that prevent 90% of breakage:

- Every document needs a unique `_id`: 16 chars of `[a-zA-Z0-9]`. Generate once, then **never change it** — links and world imports key off it. `scripts/build.mjs` can generate missing ids.
- Name files by slug (`ashen-queen.json`). Document `name` values can be Russian/Cyrillic — filenames should stay ASCII.
- Cross-links use UUIDs: `@UUID[Compendium.pf2e.spells-srd.Item.Fireball]` for system content (name-based works in source JSON for pf2e's own build; **ID-based is what actually resolves at runtime** — for your own module use `@UUID[Compendium.<module-id>.<pack-name>.Item.<_id>]`).
- HTML in descriptions: plain `<p>`, `<strong>`, `<hr />`. Action icons via `<span class="action-glyph">1</span>` (1/2/3/r/f).
- Set a `publication` block (`title` = your campaign name, `license: "ORC"`, `remaster: true`) so content is identifiable.
- Don't hand-write `_key` fields. The official CLI silently skips any document without a `_key` (`!items!<id>`, embedded: `!actors.items!<actorId>.<itemId>`) — `scripts/build.mjs` injects them automatically at compile time. Sources produced by `fvtt package unpack` already contain them; that's harmless. (The pf2e repo's own sources have no `_key` because pf2e uses its own build system, not the CLI.)

### 3. Compile and install

```bash
npm install @foundryvtt/foundryvtt-cli
node scripts/build.mjs        # compiles every src/<pack>/ into packs/<pack>/
```

Install by symlinking or copying the module folder into `{userData}/Data/modules/my-module/`, then enable it in the world. After changing sources: rebuild, then **restart the world** (packs are read at world load; Foundry must not be writing to the LevelDB while you compile — close the world or the whole server first).

To pull documents *out* of Foundry (e.g. an NPC built in-game with the UI) use `extractPack` / `fvtt package unpack` — this is the easiest way to get correct JSON: build one exemplar in Foundry, extract it, use it as a template.

### 4. Verify

- `node scripts/build.mjs` must run clean; it validates JSON parse + duplicate ids.
- In Foundry: compendium sidebar shows the packs; open documents; for the PF2e **Compendium Browser**, module packs must be ticked in the browser's settings tab before homebrew appears there.
- Drag a deity onto a character's Details tab, a bestiary actor onto a scene, and run each macro once.

## Macros

For script macros (documents in a `Macro` pack, or ad-hoc paste-in macros), read `references/macros.md`. Key points: macro documents are `"type": "script"` with the JS in `command`; use `game.pf2e` helpers and `foundry.applications.api.DialogV2` (v1 `Dialog` is gone in v14); actor targeting idiom is `canvas.tokens.controlled` / `game.user.character`.

## Homebrew that does NOT go in a module

PF2e stores some homebrew in **world settings**, not compendia: custom traits, languages, damage types (Game Settings → Homebrew Elements). A content module can't ship those; document them for manual setup or ship a small `esmodules` script that registers them on `ready`. Mention this to the user when their content needs new traits.

## References

- `references/manifest.md` — full module.json field reference for v14 + working template
- `references/pf2e-schemas.md` — annotated document schemas: deity, NPC, weapon/equipment, journal, roll table, macro
- `references/macros.md` — Foundry v14 + PF2e macro API patterns
- `scripts/build.mjs` — compile all packs, generate ids, catch duplicates
