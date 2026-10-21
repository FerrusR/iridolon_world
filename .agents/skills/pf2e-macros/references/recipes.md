# Macro recipes — complete, tested patterns

Each recipe is a full macro body. Adapt names/strings; keep the guard structure.

## 1. Party-wide secret check (GM)

"Roll Perception secretly for every party member" — the shape of most GM batch macros:

```js
if (!game.user.isGM) return ui.notifications.warn("Только для ГМ-а.");
const members = game.actors.party?.members ?? [];
if (!members.length) return ui.notifications.warn("В партии никого нет.");
for (const a of members) {
  await a.getStatistic("perception")?.roll({
    rollMode: "gmroll",
    skipDialog: true,
    label: `Секретная Внимательность — ${a.name}`,
  });
}
```

Swap `"perception"` for any skill/save/lore slug. (For the two most common cases pf2e ships `game.pf2e.gm.perceptionForSelected()` / `stealthForSelected()` — those use *selected tokens*.)

## 2. Environment save with damage card (GM)

"Everyone in the ashfall makes a basic Reflex save or takes 6d6 fire" — enricher card, players click their own buttons:

```js
if (!game.user.isGM) return ui.notifications.warn("Только для ГМ-а.");
ChatMessage.create({
  content: `
    <h3>Пеплопад</h3>
    <p>Все под открытым небом: @Check[reflex|dc:24|basic:true|traits:environmental,fire]</p>
    <p>Урон при провале: @Damage[6d6[fire]]</p>`,
});
```

This is the most robust pattern for applied effects: pf2e's own buttons handle degrees of success, IWR, and damage application.

## 3. Skill check with a dialog-chosen DC (player)

```js
const a = token?.actor ?? actor ?? game.user.character;
if (!a) return ui.notifications.warn("Выбери токен.");
const dc = await foundry.applications.api.DialogV2.prompt({
  window: { title: "Сложность" },
  content: '<input type="number" name="dc" value="20" autofocus>',
  ok: { callback: (event, button) => button.form.elements.dc.valueAsNumber },
});
if (!Number.isFinite(dc)) return;
await a.getStatistic("athletics")?.roll({ dc: { value: dc }, label: "Проверка Атлетики" });
```

## 4. Toggle a custom effect (player buff button)

```js
const a = token?.actor ?? actor ?? game.user.character;
if (!a) return ui.notifications.warn("Выбери токен.");
const NAME = "Благословение пепла";
const existing = a.itemTypes.effect.find(e => e.name === NAME);
if (existing) {
  await existing.delete();
  return ui.notifications.info(`${NAME}: снято.`);
}
await a.createEmbeddedDocuments("Item", [{
  name: NAME, type: "effect",
  img: "icons/magic/fire/flame-burning-embers-orange.webp",
  system: {
    tokenIcon: { show: true },
    duration: { value: 1, unit: "minutes", expiry: "turn-start", sustained: false },
    rules: [{ key: "FlatModifier", selector: "attack-roll", type: "status", value: 1 }],
    description: { value: "<p>+1 status к броскам атаки.</p>" },
    level: { value: 1 }, traits: { rarity: "common", value: [] }, slug: null,
  },
}]);
ui.notifications.info(`${NAME}: наложено.`);
```

## 5. Apply condition to all targets (GM)

```js
if (!game.user.targets.size) return ui.notifications.warn("Выбери цели (T).");
for (const t of game.user.targets) {
  const a = t.actor;
  if (!a) continue;
  await a.increaseCondition("frightened", { max: 3 });
}
```

## 6. Grant an item from the campaign module's pack

```js
const a = token?.actor ?? actor ?? game.user.character;
if (!a) return ui.notifications.warn("Выбери токен.");
const doc = await fromUuid("Compendium.my-homebrew-world.items.Item.REPLACE_WITH_ID");
if (!doc) return ui.notifications.error("Предмет не найден — проверь UUID.");
await a.createEmbeddedDocuments("Item", [doc.toObject()]);
ChatMessage.create({ speaker, content: `<p>${a.name} получает @UUID[${doc.uuid}].</p>` });
```

## 7. Post a random flavor event (table-less oracle)

```js
const events = [
  "Пепел сгущается — видимость падает.",
  "Вдали слышен колокол мёртвого города.",
  "Ветер приносит запах серы.",
];
const roll = await new Roll(`1d${events.length}`).evaluate();
ChatMessage.create({
  content: `<p><em>${events[roll.total - 1]}</em></p>`,
  whisper: ChatMessage.getWhisperRecipients("GM"),
});
```

For player-visible tables with loot, prefer a real RollTable (drawing posts nice cards): `await game.tables.getName("Случайные находки")?.draw();`

## 8. Converting a found macro (v11-v13 → v14)

Procedure, not code: (1) run in console, collect the first error; (2) look the symbol up at https://foundryvtt.com/api — it near-always moved into `foundry.utils`/`foundry.applications`/`foundry.canvas`; (3) `Dialog` → rewrite with DialogV2 (recipe 3 shape); (4) template placement → Regions (`canvas.regions.placeRegion`) or, often better, an enricher card (recipe 2); (5) re-test the no-selection case — many old macros assume `token` exists.
