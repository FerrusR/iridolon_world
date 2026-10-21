# Foundry core API for macros — v14

API docs: https://foundryvtt.com/api — search there when anything below is insufficient.

## v14 breaking changes (why old macros crash)

Most macros found online target v11-v13. Translate on sight:

| Old (≤v13) | v14 |
|---|---|
| `new Dialog({...}).render(true)` | `foundry.applications.api.DialogV2.prompt/confirm/wait(...)` |
| `MeasuredTemplate` / `canvas.templates` document workflows | Removed as a document type. Scene **Regions** absorbed templates: `canvas.regions.placeRegion(...)` for interactive placement; region docs carry `shapes` + behaviors |
| Bare `mergeObject`, `duplicate`, `getProperty` | `foundry.utils.mergeObject` etc. (bare globals removed) |
| `game.macros.getName(...).execute()` — still fine | unchanged |
| TinyMCE editor calls | Removed; ProseMirror only |
| `SightLayer`, old canvas globals | namespaced under `foundry.canvas.*` |

If a pasted macro throws `X is not defined`, the fix is almost always finding X's new namespace in the API docs.

## Dialogs (DialogV2)

```js
// Confirm
const ok = await foundry.applications.api.DialogV2.confirm({
  window: { title: "Сжечь припасы?" },
  content: "<p>Это действие необратимо.</p>",
});

// Single-input prompt
const dc = await foundry.applications.api.DialogV2.prompt({
  window: { title: "Сложность проверки" },
  content: '<input type="number" name="dc" value="20" autofocus>',
  ok: { label: "Бросить", callback: (event, button) => button.form.elements.dc.valueAsNumber },
});

// Multi-field form + custom buttons
const result = await foundry.applications.api.DialogV2.wait({
  window: { title: "Награда" },
  content: `
    <label>Золото <input type="number" name="gp" value="0"></label>
    <label>Опыт <input type="number" name="xp" value="0"></label>`,
  buttons: [
    { action: "give", label: "Выдать", default: true,
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
    { action: "cancel", label: "Отмена" },
  ],
});
if (result === "cancel" || !result) return;
```

`prompt` resolves to the ok-callback's return; `wait` resolves to the pressed button's `action` unless its callback returns something. User closing the window rejects/returns null — handle it.

## Chat

```js
ChatMessage.create({ speaker, content: "<p>HTML со всеми pf2e-энричерами</p>" });
ChatMessage.create({ content: "...", whisper: ChatMessage.getWhisperRecipients("GM") });  // GM-only
const roll = await new Roll("4d6kh3").evaluate();
await roll.toMessage({ speaker, flavor: "Подбросим кости" });
```

## Tokens, targets, scenes

```js
canvas.tokens.controlled            // selected Token objects (GM: anything; player: owned)
game.user.targets                   // Set<Token> the user targeted (T key)
canvas.tokens.placeables            // every token on the scene
token.document.update({ x, y });    // move; document, not the placeable
await canvas.scene.createEmbeddedDocuments("Token", [tokenDoc]);
// Distance between tokens (grid-aware):
canvas.grid.measurePath([tokenA.center, tokenB.center]).distance
```

## Compendia & world documents

```js
const doc = await fromUuid("Compendium.my-homebrew-world.items.Item.dEfGhIjKlMnOpQ78");
const pack = game.packs.get("my-homebrew-world.bestiary");
const index = await pack.getIndex();                 // cheap listing
const docs = await pack.getDocuments({ type: "npc" });
await actor.createEmbeddedDocuments("Item", [doc.toObject()]);   // grant compendium item
game.actors.getName("Пепельная гончая"); game.items; game.journal; game.tables;
await game.tables.getName("Случайные находки")?.draw();          // roll a table to chat
```

## Regions (ex-templates) & canvas effects

Interactive placement of an area (the v14 way to do "place a 20-ft burst"):

```js
const region = await canvas.regions.placeRegion({ /* shape defaults; user draws/places */ });
// Regions have behaviors (teleport, status, execute-macro...) configurable via region.document.
```

The API is new in v14 and evolving — for anything beyond simple placement, check current docs at https://foundryvtt.com/api before promising behavior.

## Permissions, GM gating, sockets

```js
if (!game.user.isGM) return ui.notifications.warn("Только для ГМ-а.");
actor.isOwner                        // can this user modify?
game.users.activeGM                  // the (first) connected GM or undefined
```

A player macro can't update unowned documents — there's no built-in "ask the GM to do it" in core. Options: whisper the GM a request card; or keep such macros GM-only. (Module `socketlib` exists for real delegation, but don't add a dependency unless the user has it.)

## Timing & hooks in macros

Macros can register hooks, but a hook registered in a macro lasts only until reload and re-registers on every run — prefer `Hooks.once` for one-shot follow-ups (e.g. "after the next combat turn"), and world scripts/modules for permanent hooks:

```js
Hooks.once("combatTurnChange", (combat) => { /* one-time follow-up */ });
```
