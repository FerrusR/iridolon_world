# Macro patterns — Foundry v14 + PF2e

Script macros run as async functions with these locals: `speaker`, `actor` (speaker's actor), `token`, `character` (user's assigned character), `scope` (args when called via `macro.execute()`).

## v14 API gotchas (old internet examples break on these)

- `Dialog` (v1) is gone → use `foundry.applications.api.DialogV2` (`.prompt()`, `.confirm()`, `.wait()`).
- Many former globals live in namespaces: `foundry.utils.*` (mergeObject, duplicate...), `foundry.canvas.*`, `foundry.applications.*`. If a copy-pasted macro throws "X is not defined", search the API docs for its namespaced home: https://foundryvtt.com/api
- TinyMCE is removed; anything touching rich-text editors must use ProseMirror.
- MeasuredTemplate *documents* were eliminated in v14 — template-placing macros from v13 and earlier need rework.

## Getting actors

```js
// Selected tokens' actors (GM workflow)
const actors = canvas.tokens.controlled.map(t => t.actor).filter(a => a);
// The user's character, falling back to selection (player workflow)
const actor = game.user.character ?? canvas.tokens.controlled[0]?.actor;
// Targets (for "apply to target" effects)
const targets = Array.from(game.user.targets).map(t => t.actor);
if (!actor) return ui.notifications.warn("Select a token first.");
```

## PF2e system entry points (`game.pf2e`)

```js
// Bundled action implementations (skill actions, exploration, downtime)
game.pf2e.actions.get("demoralize").use({ actors: [actor] });
game.pf2e.actions.restForTheNight({ actors });

// Roll any statistic with proper modifiers/traits
const stat = actor.getStatistic("athletics");   // or "fortitude", "perception", a lore slug...
await stat.roll({ dc: { value: 20 }, label: "Проверка Атлетики" });

// Damage roll to chat
new DamageRoll("3d6[fire]").toMessage({ speaker });

// Conditions & effects
await actor.increaseCondition("frightened", { value: 2 });
await actor.decreaseCondition("frightened");
await actor.toggleCondition("prone");

// Items & casting
const item = actor.items.getName("Боевой клич");
await item?.toMessage();                         // post to chat
```

## Chat, rolls, dialogs

```js
// Plain chat card
ChatMessage.create({ speaker, content: "<p><strong>Пепел падает.</strong> Все существа под открытым небом...</p>" });

// Standard roll
const roll = await new Roll("4d6kh3").evaluate();
await roll.toMessage({ speaker, flavor: "Характеристика" });

// DialogV2 input
const dc = await foundry.applications.api.DialogV2.prompt({
  window: { title: "Сложность" },
  content: '<input type="number" name="dc" value="20" autofocus>',
  ok: { callback: (event, button) => button.form.elements.dc.valueAsNumber }
});
```

## Compendium access from macros

```js
const pack = game.packs.get("my-homebrew-world.items");
const docs = await pack.getDocuments();                        // all
const doc = await fromUuid("Compendium.my-homebrew-world.items.Item.dEfGhIjKlMnOpQ78");
await actor.createEmbeddedDocuments("Item", [doc.toObject()]); // grant item to actor
```

## Idioms worth keeping

- Guard clauses + `ui.notifications.warn/info/error` for user mistakes; macros fail silently otherwise.
- Everything document-touching is async — `await` all `create/update/delete` calls.
- GM-only operations (updating unowned actors) fail for players; check `game.user.isGM` and message accordingly.
- For repeatable campaign automation prefer shipping the macro in the module's Macro pack over pasting into worlds — it stays versioned with the content.
- Test in console (F12) first: paste the body, inspect errors, then save as a macro document.
