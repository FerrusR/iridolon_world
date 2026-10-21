# module.json reference (Foundry v14)

The manifest lives at the module root; `id` must exactly match the folder name under `Data/modules/`.

## Working template for a PF2e content module

```json
{
  "id": "my-homebrew-world",
  "title": "My Homebrew World",
  "description": "Deities, creatures, and items for the campaign.",
  "version": "0.1.0",
  "authors": [{ "name": "Ferrus" }],
  "compatibility": {
    "minimum": "14",
    "verified": "14"
  },
  "relationships": {
    "systems": [
      {
        "id": "pf2e",
        "type": "system",
        "compatibility": { "minimum": "8.0.0" }
      }
    ]
  },
  "packs": [
    {
      "name": "deities",
      "label": "Homebrew Deities",
      "path": "packs/deities",
      "type": "Item",
      "system": "pf2e",
      "ownership": { "PLAYER": "OBSERVER", "ASSISTANT": "OWNER" }
    },
    {
      "name": "bestiary",
      "label": "Homebrew Bestiary",
      "path": "packs/bestiary",
      "type": "Actor",
      "system": "pf2e",
      "ownership": { "PLAYER": "LIMITED", "ASSISTANT": "OWNER" }
    },
    {
      "name": "items",
      "label": "Homebrew Items",
      "path": "packs/items",
      "type": "Item",
      "system": "pf2e",
      "ownership": { "PLAYER": "OBSERVER", "ASSISTANT": "OWNER" }
    },
    {
      "name": "journals",
      "label": "World Lore",
      "path": "packs/journals",
      "type": "JournalEntry",
      "ownership": { "PLAYER": "OBSERVER", "ASSISTANT": "OWNER" }
    },
    {
      "name": "macros",
      "label": "Campaign Macros",
      "path": "packs/macros",
      "type": "Macro",
      "ownership": { "PLAYER": "OBSERVER", "ASSISTANT": "OWNER" }
    }
  ],
  "packFolders": [
    {
      "name": "My Homebrew World",
      "sorting": "m",
      "color": "#3b2524",
      "packs": ["deities", "bestiary", "items", "journals", "macros"]
    }
  ],
  "url": "https://github.com/user/my-homebrew-world",
  "manifest": "https://github.com/user/my-homebrew-world/releases/latest/download/module.json",
  "download": "https://github.com/user/my-homebrew-world/releases/latest/download/module.zip"
}
```

## Field notes

- **id** — lowercase, hyphens (not underscores), no special characters. Changing it later orphans every UUID link pointing into the module.
- **compatibility** — `minimum`/`verified`/`maximum`, strings. `"minimum": "14"` gates to v14+. A generation-only value ("14") verifies against all 14.x builds.
- **packs[].type** — one of `Actor`, `Item`, `JournalEntry`, `Macro`, `RollTable`, `Scene`, `Playlist`, `Adventure`, `Cards`.
- **packs[].system** — REQUIRED for `Actor`, `Item`, and `Adventure` packs (`"pf2e"`); omit for Journals/Macros/RollTables (they're system-agnostic).
- **packs[].name vs path** — `name` is the compendium id (referenced in UUIDs as `Compendium.<module-id>.<name>`); `path` points at the LevelDB directory. Keep them equal to avoid confusion.
- **packs[].ownership** — roles `PLAYER`, `TRUSTED`, `ASSISTANT` to levels `OWNER`/`OBSERVER`/`LIMITED`/`NONE`. `LIMITED` on bestiaries stops players reading statblocks.
- **packs[].banner** — optional image shown in the compendium sidebar, e.g. reuse a system banner: `"systems/pf2e/assets/compendium-banner/green.webp"` (green = character options, red = bestiaries, blue = equipment/spells, orange = GM tools — pf2e convention).
- **packFolders** — sidebar folder tree; `sorting` `"m"` (manual) or `"a"` (alphabetical); nest via `folders` array.
- **relationships.systems** — locks the module to worlds running pf2e; better than the legacy top-level `"system"` array.
- **relationships.requires** — for dependencies on other modules.
- **esmodules / scripts / styles** — only needed if the module ships JS/CSS (e.g. registering homebrew traits). Content-only modules omit them.
- **languages** — for localization files; irrelevant when compendium content itself is written in Russian (document text isn't localized through lang files).
- **manifest / download** — only needed for distribution outside manual installs. For a personal campaign module, installing by copying the folder is fine and these can be omitted.
- **media** — optional Setup-screen art: `[{"type": "setup", "url": "...", "thumbnail": "..."}]`.

## Versioning discipline

Bump `version` whenever pack contents change; Foundry uses it to detect updates. For a personal module a simple `0.x.y` counter is enough.
