# PF2e document schemas (system 8.x / Foundry v14)

Annotated source-JSON examples, verified against the pf2e repo `v14-dev` branch (July 2026).
When a field is unclear, fetch the closest official document from
`https://raw.githubusercontent.com/foundryvtt/pf2e/v14-dev/packs/pf2e/<pack>/<slug>.json` and mirror it.

## Contents

1. [Universal conventions](#universal-conventions)
2. [Deity (Item, type "deity")](#deity)
3. [NPC / monster (Actor, type "npc")](#npc--monster)
4. [Equipment & weapons (Item)](#equipment--weapons)
5. [Journal entries (lore)](#journal-entries)
6. [Roll tables](#roll-tables)
7. [Macro documents](#macro-documents)
8. [Traits, rarity, and homebrew limits](#traits-rarity-homebrew-limits)

## Universal conventions

- `_id`: 16 chars `[a-zA-Z0-9]`, unique within the pack, immutable once assigned.
- `name`: display name — Cyrillic is fine. Keep source filenames ASCII slugs.
- `img`: path to icon. Reuse Foundry core icons (`icons/...` — huge stock library, e.g. `icons/weapons/swords/sword-guard-blue.webp`) or pf2e system icons (`systems/pf2e/icons/...`), or ship your own under the module (`modules/<id>/art/...`).
- `system.publication`: `{"title": "<your campaign/source name>", "license": "ORC", "remaster": true}`.
- Descriptions are HTML strings. pf2e house style: `<p>` paragraphs, `<strong>` labels, `<hr />` separators, `@UUID[...]` links, `@Check[fortitude|dc:20|basic]` inline checks, `@Damage[2d6[fire]]` inline damage, action glyphs `<span class="action-glyph">1</span>` (values: 1, 2, 3, r = reaction, f = free).
- Folders inside a pack: optional `_folders.json` at the pack source root (array of `{_id, name, type, folder, sorting, sort, color, description, flags}`), and documents reference them via `"folder": "<folder _id>"`.

## Deity

Item `"type": "deity"`. Official example (Sarenrae, trimmed):

```json
{
  "_id": "BNycwu3I21dTh4D9",
  "img": "systems/pf2e/icons/deities/sarenrae.webp",
  "name": "Sarenrae",
  "type": "deity",
  "system": {
    "category": "deity",
    "attribute": ["con", "wis"],
    "description": {
      "value": "<p>Deity lore...</p>\n<p><strong>Title</strong> The Dawnflower</p>\n<p><strong>Areas of Concern</strong> healing, the sun</p>\n<p><strong>Edicts</strong> protect allies...</p>\n<p><strong>Anathema</strong> create undead, lie...</p>\n<p><strong>Religious Symbol</strong> angelic ankh</p>\n<p><strong>Sacred Animal</strong> dove</p>\n<p><strong>Sacred Colors</strong> blue, gold</p>"
    },
    "domains": {
      "primary": ["fire", "healing", "sun", "truth"],
      "alternate": ["repose"]
    },
    "font": ["heal"],
    "sanctification": { "modal": "can", "what": ["holy"] },
    "skill": ["medicine"],
    "spells": {
      "1": "Compendium.pf2e.spells-srd.Item.Breathe Fire",
      "3": "Compendium.pf2e.spells-srd.Item.Fireball"
    },
    "weapons": ["scimitar"],
    "traits": {},
    "rules": [],
    "publication": { "license": "ORC", "remaster": true, "title": "..." }
  }
}
```

Field notes:
- `category`: `"deity"`, `"pantheon"`, or `"philosophy"`. Philosophies typically empty `domains`/`font`/`spells`.
- `attribute`: divine attribute options (cleric key attribute choices).
- `font`: `["heal"]`, `["harm"]`, or both.
- `sanctification`: `null` for none, else `{"modal": "can"|"must", "what": ["holy"]|["unholy"]|["holy","unholy"]}`.
- `spells`: cleric bonus spells, keys = spell rank, values = UUID strings. For homebrew spells point at your own pack: `Compendium.<module-id>.<pack>.Item.<_id>`.
- `weapons`: array of base-weapon slugs (`"scimitar"`, `"longsword"`).
- The structured edicts/anathema live only as `<strong>`-labelled lines in the description HTML — keep that format so sheets render familiarly.

## NPC / monster

Actor `"type": "npc"`. Structure (Goblin Warrior, heavily trimmed — fetch the full file when building a statblock):

```json
{
  "_id": "fLLKuOXwPq1Iq0U4",
  "img": "systems/pf2e/icons/default-icons/npc.svg",
  "name": "Goblin Warrior",
  "type": "npc",
  "system": {
    "abilities": {
      "str": {"mod": 0}, "dex": {"mod": 3}, "con": {"mod": 1},
      "int": {"mod": 0}, "wis": {"mod": -1}, "cha": {"mod": 1}
    },
    "attributes": {
      "ac": { "value": 16, "details": "" },
      "hp": { "value": 6, "max": 6, "temp": 0, "details": "" },
      "speed": { "value": 25, "otherSpeeds": [] },
      "allSaves": { "value": "" }
    },
    "perception": { "mod": 2, "details": "", "senses": [{ "type": "darkvision" }] },
    "saves": {
      "fortitude": { "value": 5, "saveDetail": "" },
      "reflex": { "value": 7, "saveDetail": "" },
      "will": { "value": 3, "saveDetail": "" }
    },
    "skills": { "acrobatics": { "base": 5 }, "stealth": { "base": 5 } },
    "details": {
      "level": { "value": -1 },
      "languages": { "value": ["goblin", "common"], "details": "" },
      "blurb": "",
      "publicNotes": "<p>Player-visible lore...</p>",
      "privateNotes": "",
      "publication": { "license": "ORC", "remaster": true, "title": "..." }
    },
    "initiative": { "statistic": "perception" },
    "resources": {},
    "traits": {
      "rarity": "common",
      "size": { "value": "sm" },
      "value": ["goblin", "humanoid"]
    }
  },
  "items": [ /* embedded items — see below */ ]
}
```

Embedded `items` array carries everything the creature has:
- **Inventory**: full weapon/armor/equipment items (same schema as the equipment pack, plus `system.equipped` `{carryType, handsHeld, invested}`). Set `_stats.compendiumSource` when copied from a system compendium.
- **Attacks**: `"type": "melee"` items (used for BOTH melee and ranged NPC attacks). Core fields: `system.bonus.value` (attack modifier), `system.damageRolls` (object keyed by random lowercase id: `{"damage": "1d6", "damageType": "slashing"}`), `system.traits.value` (attack traits; ranged attacks get `"range-increment-X"`/`"reload-N"` style traits and `system.range: {increment, max}`), optional `flags.pf2e.linkedWeapon` pointing at the inventory item's `_id`.
- **Abilities**: `"type": "action"` items — `system.actionType.value` (`"passive"`, `"action"`, `"reaction"`, `"free"`), `system.actions.value` (number of actions or null), `system.category` (`"interaction"`, `"defensive"`, `"offensive"`), description HTML with `<strong>Trigger</strong>`/`<strong>Effect</strong>` lines.
- **Spellcasting**: a `"type": "spellcastingEntry"` item plus individual `"type": "spell"` items whose `system.location.value` is the entry's `_id`.
- Embedded items need their own unique `_id` and `sort` (100000 × position).

Building statblocks by hand is error-prone. Two safer paths: (a) build the creature in Foundry's NPC sheet, then `fvtt package unpack` it and clean up; (b) copy the nearest official monster JSON and edit numbers. For balance targets use GM Core creature-building tables per level.

## Equipment & weapons

Item types for physical gear: `weapon`, `armor`, `shield`, `equipment`, `consumable`, `ammo`, `treasure`, `backpack`. Weapon example (Longsword, trimmed):

```json
{
  "_id": "LJdbVTOZog39EEbi",
  "img": "icons/weapons/swords/sword-guard-blue.webp",
  "name": "Longsword",
  "type": "weapon",
  "system": {
    "category": "martial",
    "group": "sword",
    "baseItem": "longsword",
    "damage": { "damageType": "slashing", "dice": 1, "die": "d8" },
    "bonus": { "value": 0 },
    "bonusDamage": { "value": 0 },
    "splashDamage": { "value": 0 },
    "runes": { "potency": 0, "striking": 0, "property": [] },
    "traits": { "rarity": "common", "value": ["versatile-p"] },
    "usage": { "canBeAmmo": false, "value": "held-in-one-hand" },
    "bulk": { "value": 1 },
    "price": { "value": { "gp": 1 } },
    "level": { "value": 0 },
    "quantity": 1,
    "hardness": 0,
    "hp": { "max": 0, "value": 0 },
    "size": "med",
    "material": { "grade": null, "type": null },
    "range": null,
    "reload": { "value": "-" },
    "ammo": null,
    "expend": null,
    "grade": null,
    "containerId": null,
    "description": { "value": "<p>...</p>" },
    "rules": [],
    "publication": { "license": "ORC", "remaster": true, "title": "..." }
  }
}
```

Notes:
- Magic items: raise `level.value`, `price`, add rune values or set `specific`; magical trait in `traits.value` (`"magical"`). For invested items use type `equipment` with `system.usage.value` like `"worn-ring"` and trait `"invested"`.
- `rules` — PF2e Rule Elements (automation: FlatModifier, GrantItem, RollOption, Note...). Powerful but deep; see the pf2e wiki "Quickstart guide for rule elements". Start with `[]` and add automation after content is stable.
- Consumables: `system.uses {value, max, autoDestroy}`; ammo: `price.per`.

## Journal entries

`JournalEntry` documents hold lore; content lives in `pages`:

```json
{
  "_id": "aBcDeFgHiJkLmNoP",
  "name": "Боги Пепла",
  "pages": [
    {
      "_id": "qRsTuVwXyZaBcDeF",
      "name": "Обзор пантеона",
      "type": "text",
      "title": { "show": true, "level": 1 },
      "text": { "content": "<p>...</p>", "format": 1 },
      "sort": 100000
    }
  ],
  "folder": null,
  "flags": {}
}
```

`format: 1` = HTML. Pages can also be `image`, `pdf`, `video`. Link between documents with `@UUID[...]` — journals are excellent hubs linking deities/NPCs.

## Roll tables

```json
{
  "_id": "aBcDeFgHiJkLmN12",
  "name": "Случайные находки в пепле",
  "formula": "1d20",
  "replacement": true,
  "displayRoll": true,
  "results": [
    {
      "_id": "bCdEfGhIjKlMnO34",
      "type": "text",
      "name": "Оплавленная монета",
      "description": "<p>Оплавленная монета неизвестной чеканки</p>",
      "range": [1, 10],
      "weight": 1,
      "drawn": false
    },
    {
      "_id": "cDeFgHiJkLmNoP56",
      "type": "document",
      "documentUuid": "Compendium.my-homebrew-world.items.Item.dEfGhIjKlMnOpQ78",
      "range": [11, 20],
      "weight": 1,
      "drawn": false
    }
  ]
}
```

`type: "text"` for prose results, `type: "document"` + `documentUuid` to drop actual items/actors. (In v13+ the old `text` result field was replaced by `name`/`description`; old examples on the internet use the pre-v13 shape.)

## Macro documents

```json
{
  "_id": "0GU2sdy3r2MeC56x",
  "name": "Rest for the Night",
  "type": "script",
  "img": "icons/svg/sleep.svg",
  "scope": "global",
  "author": "AUTHOR_USER_ID_OPTIONAL",
  "ownership": { "default": 1 },
  "command": "game.pf2e.actions.restForTheNight({ actors: [game.user.character ?? canvas.tokens.controlled.map((t) => t.actor)].flat().filter((a) => a?.type === \"character\") })"
}
```

`command` is a plain JS string (escape carefully). Writing macro code: see `references/macros.md`.

## Traits, rarity, homebrew limits

- `traits.value` entries must be slugs the system knows, or they render as untranslated text. Custom traits/languages/damage types are registered per-world in PF2e's **Homebrew Elements** settings, not shippable via content packs. Options: stick to existing traits; document manual setup; or ship an `esmodules` script that writes the homebrew settings.
- `rarity`: `"common" | "uncommon" | "rare" | "unique"`.
- Sizes: `"tiny" | "sm" | "med" | "lg" | "huge" | "grg"`.
- Attribute/skill slugs are English lowercase (`"medicine"`, `"con"`) regardless of content language.
