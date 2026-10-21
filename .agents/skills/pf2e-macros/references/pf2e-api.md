# PF2e system API for macros (`game.pf2e`, system 8.x / Foundry v14)

Verified against pf2e `v14-dev` sources (July 2026). In a live world, `game.pf2e` in the console (F12) is the ground truth — inspect it when in doubt.

## Contents

1. [Script macro locals](#script-macro-locals)
2. [Built-in actions (`game.pf2e.actions`)](#built-in-actions)
3. [Rolling checks (Statistic API)](#rolling-checks)
4. [Damage](#damage)
5. [Conditions & effects](#conditions--effects)
6. [Items, spells, inventory](#items-spells-inventory)
7. [GM tools (`game.pf2e.gm`)](#gm-tools)
8. [Inline enrichers (chat/description automation without JS)](#inline-enrichers)
9. [Useful settings & misc](#useful-settings--misc)

## Script macro locals

Every script macro body runs as an async function with: `speaker`, `actor` (speaker's actor), `token`, `character` (user's assigned character), `event` (the triggering click), `scope` (named args when invoked via `macro.execute({...})`). The official selection idiom:

```js
const a = token?.actor ?? actor ?? game.user.character;
if (!a) return ui.notifications.warn("Выбери токен.");
```

## Built-in actions

`game.pf2e.actions` is a Collection of Action objects keyed by slug — prefer these over reimplementing rules (they apply MAP, traits, DC resolution, degree-of-success text):

```js
// Modern interface: .get(slug).use(options)
await game.pf2e.actions.get("demoralize").use({ actors: [a] });
await game.pf2e.actions.get("recall-knowledge").use({ actors: [a], statistic: "arcana", difficultyClass: 20 });
// use() options: { actors, event, variant, statistic, difficultyClass, target, traits, modifiers, notes, rollOptions, message: {create} }
// .toMessage() posts the action's description card instead of rolling.
```

Slugs (kebab-case): administer-first-aid, affix-a-talisman, aid, arrest-a-fall, avert-gaze, avoid-notice, balance, burrow, climb, coerce, command-an-animal, conceal-an-object, crawl, create-a-diversion, create-forgery, decipher-writing, delay, demoralize, disable-device, disarm, dismiss, drop-prone, escape, feint, fly, force-open, gather-information, grab-an-edge, grapple, hide, high-jump, identify-alchemy, identify-magic, impersonate, interact, leap, learn-a-spell, lie, long-jump, make-an-impression, maneuver-in-flight, mount, palm-an-object, perform, pick-a-lock, point-out, ready, recall-knowledge, release, reposition, request, seek, sense-direction, sense-motive, shove, sneak, squeeze, stand, steal, step, stride, subsist, sustain, swim, take-cover, track, treat-disease, treat-poison, trip, tumble-through.

Legacy function-style actions also live on the same object (call directly with `{ event, actors }`): `treatWounds`, `restForTheNight`, `raiseAShield`, `earnIncome`, `takeABreather`, `steelYourResolve`, `encouragingWords`. Official system macro bodies are one-liners around these, e.g.:

```js
game.pf2e.actions.treatWounds({ event, actors: [token?.actor ?? actor ?? game.user.character].filter(a => a) });
```

## Rolling checks

Any check-capable statistic via `actor.getStatistic(slug)` — accepts `"perception"`, saves (`"fortitude"`, `"reflex"`, `"will"`), skills (`"athletics"`...), lore slugs (`"ash-lore"`), spellcasting (`"arcane"`), `"flat"`. Returns a Statistic or null.

```js
const stat = a.getStatistic("athletics");
await stat.roll({
  dc: { value: 25 },                       // or omit for a plain check
  label: "Проверка: перелезть через стену",
  extraRollOptions: ["action:climb"],      // feeds rule elements
  modifiers: [new game.pf2e.Modifier({ slug: "storm", label: "Пепельный шторм", modifier: -2, type: "circumstance" })],
  rollMode: "gmroll",                      // "publicroll" | "gmroll" | "blindroll" | "selfroll"
  skipDialog: true,
});
// Result message includes degree of success when dc is given.
// DC of a statistic: stat.dc.value (e.g. target's Fortitude DC for your macro's math).
```

## Damage

`DamageRoll` is not a global — grab it from CONFIG:

```js
const DamageRoll = CONFIG.Dice.rolls.find(R => R.name === "DamageRoll");
await new DamageRoll("6d6[fire]").toMessage({ speaker, flavor: "<strong>Пеплопад</strong> (basic Reflex DC 24)" });
// Mixed types: "4d6[fire],2d6[persistent,fire]"; untyped: "2d8".
```

The resulting chat card gets pf2e's apply-damage buttons — usually better than programmatic application. Programmatic HP change when needed:

```js
await a.applyDamage({ damage: 10, token: token.document });       // respects IWR
await a.update({ "system.attributes.hp.value": Math.min(a.hitPoints.value + 10, a.hitPoints.max) }); // raw healing
```

## Conditions & effects

```js
await a.increaseCondition("frightened", { max: 3 });   // add or bump value
await a.decreaseCondition("frightened");
await a.toggleCondition("prone");
a.hasCondition("frightened")                            // → boolean
```

Custom timed effect (an `effect` Item created on the fly):

```js
await a.createEmbeddedDocuments("Item", [{
  name: "Благословение пепла",
  type: "effect",
  img: "icons/magic/fire/flame-burning-embers-orange.webp",
  system: {
    tokenIcon: { show: true },
    duration: { value: 1, unit: "minutes", expiry: "turn-start", sustained: false },
    rules: [{ key: "FlatModifier", selector: "attack-roll", type: "status", value: 1 }],
    description: { value: "<p>+1 status к атакам.</p>" },
    slug: null, level: { value: 1 }, traits: { rarity: "common", value: [] },
  },
}]);
// Remove by slug/name: const eff = a.itemTypes.effect.find(e => e.name === "Благословение пепла"); await eff?.delete();
```

Rule elements inside `system.rules` are the automation vocabulary (FlatModifier, RollOption, Note, GrantItem, TokenLight...) — see the pf2e wiki "Quickstart guide for rule elements".

## Items, spells, inventory

```js
const item = a.items.getName("Боевой клич");    // or a.itemTypes.action / .weapon / .spell ...
await item.toMessage(event);                     // post its card
game.pf2e.rollItemMacro(itemId);                 // hotbar-style item roll
game.pf2e.rollActionMacro({ actorUUID, slug });  // hotbar-style action roll
// Strikes (weapon attacks with MAP):
const strike = a.system.actions?.find(s => s.slug === "dogslicer");
await strike?.variants[0].roll({ event });       // variants[1]/[2] = MAP -5/-10
// Cast a spell properly (consumes slot):
const spell = a.itemTypes.spell.find(s => s.name === "Огненный шар");
await spell?.spellcasting?.cast(spell, { rank: 3 });
// Coins:
await a.inventory.addCoins(new game.pf2e.Coins({ gp: 10 }));
await a.inventory.removeCoins(new game.pf2e.Coins({ sp: 5 }));
```

## GM tools

`game.pf2e.gm`: `calculateXP`, `checkPrompt` (build a check prompt for players), `editPersistent`, `launchTravelSheet`, `perceptionForSelected`, `stealthForSelected`, `xpFromEncounter`. Example: `game.pf2e.gm.checkPrompt()` opens the dialog GMs use to request rolls in chat.

Party access: `game.actors.party` (PartyPF2e) — `game.actors.party.members` for the roster; ideal for "roll X for the whole party" macros.

## Inline enrichers

For chat cards and descriptions — no JS needed, pf2e renders them as clickable buttons; use inside `ChatMessage.create({ content })` HTML:

- `@Check[fortitude|dc:24|basic:true|traits:fire]` — save button
- `@Damage[4d6[fire]]` — damage roll button
- `[[/act demoralize dc=20]]` — action button
- `@UUID[Compendium.pf2e.conditionitems.Item.Frightened]{Испуг 1}` — linked condition/item

A chat-card macro made of enrichers is often more robust than scripted rolling — players click, pf2e handles the rules.

## Useful settings & misc

- `game.pf2e.settings` — snapshot of world settings (metagame visibility, variant rules: `variants.fa` free archetype, `variants.pwol` proficiency-without-level...). Respect `settings.metagame.dcs` before printing DCs to public chat.
- `game.pf2e.worldClock` — campaign clock; `game.pf2e.worldClock.worldTime` (Luxon DateTime).
- `game.pf2e.Predicate`, `game.pf2e.Modifier`, `game.pf2e.ModifierType`, `game.pf2e.Check` — building blocks for custom checks.
- `game.pf2e.compendiumBrowser.openTab("equipment", ...)` — open the browser programmatically.
