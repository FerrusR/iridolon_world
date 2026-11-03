/** Mythic house rules. Verified against PF2e 8.6.0; no stored actors/items are rewritten. */
const MODULE_ID = "elinvale-tools";
const SETTING = "mythicHouseRules";
const PATCHED = Symbol.for("elinvale-tools.mythic-rules");
const RESILIENCE_SOURCE = "Compendium.pf2e.bestiary-family-ability-glossary.Item.0zvUNv8hRTdwXmhF";
const pending = new Map();

const enabled = () => game.settings.get(MODULE_ID, SETTING) === true;
export const usesRewriteFate = (message) =>
  ["skill-check", "saving-throw"].includes(message?.flags?.pf2e?.context?.type);

export function isMythicActor(actor) {
  return actor?.traits?.has("mythic") || actor?.system?.traits?.value?.includes("mythic") ||
    (actor?.isOfType("character") && actor.system.resources.mythicPoints?.max > 0);
}

export function isResilienceRule(rule) {
  const item = rule.item;
  const source = item?.sourceId ?? item?._stats?.compendiumSource;
  const slug = item?.slug ?? item?.system?.slug ?? "";
  const identified = source === RESILIENCE_SOURCE || /^(?:mythic-)?mythic-resilience(?:-|$)/.test(slug) ||
    /^Mythic Resilience(?:\s*\(|$)/i.test(item?.name ?? "") ||
    item?.getFlag?.(MODULE_ID, "mythicResilience") === true;
  return identified && (rule.affects ?? "self") === "self" &&
    ["saving-throw", "fortitude", "reflex", "will"].includes(rule.selector) &&
    rule.adjustment?.all === "one-degree-better";
}

function canReroll(message) {
  const actor = message?.actor;
  const context = message?.flags?.pf2e?.context;
  const options = context?.options ?? [];
  // Also reject substitutions with fortune; PF2e's isRerollable checks dice and ownership.
  return !!(message?.isRerollable && (message.isAuthor || game.user.isGM) &&
    actor?.isOfType("character") && actor.isOwner && context &&
    actor.system.resources.mythicPoints?.value > 0 && !pending.has(actor.uuid) &&
    !options.includes("fortune") &&
    !context.substitutions?.some((s) => s.selected && s.effectType === "fortune"));
}

function messageFromElement(element) {
  const node = element?.[0] ?? element;
  return game.messages.get(node?.dataset?.messageId);
}

/** Keep native roll reconstruction, MAP, DC, notes, initiative, and blind visibility. */
export async function ordinaryMythicReroll(nativeReroll, receiver, message, options = {}) {
  if (!canReroll(message)) {
    ui.notifications.warn("Обычный Mythic-переброс недоступен: проверь MP, права и fortune effects.");
    return;
  }
  const actor = message.actor;
  const resource = actor.getResource("mythic-points");
  const record = { actor, originalId: message.id, created: false };
  pending.set(actor.uuid, record);
  let spent = false;
  try {
    await actor.updateResource("mythic-points", resource.value - 1);
    spent = true;
    // Omitting resource is essential: native MP rerolls replace proficiency unconditionally.
    const { resource: _resource, ...ordinaryOptions } = options;
    const result = await nativeReroll.call(receiver, message, { ...ordinaryOptions, keep: "new" });
    if (!record.created) throw new Error("PF2e did not create the reroll message");
    return result;
  } catch (error) {
    if (spent && !record.created) {
      const current = actor.getResource("mythic-points");
      await actor.updateResource("mythic-points", Math.min(current.max, current.value + 1));
    }
    console.error(`${MODULE_ID} | Ordinary Mythic reroll:`, error);
    ui.notifications.error(record.created
      ? "Переброс создан, но следующий шаг PF2e завершился ошибкой. Проверь чат; MP уже потрачен."
      : "Переброс не завершён. Mythic Point возвращён; подробности в консоли.");
  } finally {
    pending.delete(actor.uuid);
  }
}

export function installMythicPatches() {
  const Check = game.pf2e.Check;
  const rulePrototype = game.pf2e.RuleElements.builtin.AdjustDegreeOfSuccess.prototype;
  const actorPrototype = CONFIG.Actor.documentClass.prototype;
  const chatPrototype = CONFIG.ui.chat.prototype;
  if (Check[PATCHED]) return;
  if (typeof Check.rerollFromMessage !== "function" ||
      typeof rulePrototype.beforePrepareData !== "function" ||
      typeof actorPrototype.getSelfRollOptions !== "function" ||
      typeof chatPrototype._getEntryContextOptions !== "function") {
    throw new Error("Unsupported PF2e API: Mythic house rules were not installed");
  }

  const nativeReroll = Check.rerollFromMessage;
  Check.rerollFromMessage = function (message, options = {}) {
    if (enabled() && options.resource === "mythic-points" && !usesRewriteFate(message)) {
      return ordinaryMythicReroll(nativeReroll, this, message, options);
    }
    return nativeReroll.call(this, message, options);
  };

  // Calling grants MP, but PF2e 8.6 does not give its owner the creature trait automatically.
  // Supply the roll option for all prefixes, including origin, even at 0 remaining MP.
  const nativeOptions = actorPrototype.getSelfRollOptions;
  actorPrototype.getSelfRollOptions = function (prefix = "self", ...args) {
    const options = nativeOptions.call(this, prefix, ...args);
    const mythic = `${prefix}:trait:mythic`;
    return enabled() && isMythicActor(this) && !options.includes(mythic) ? [...options, mythic] : options;
  };

  const nativePrepare = rulePrototype.beforePrepareData;
  rulePrototype.beforePrepareData = function (...args) {
    if (!enabled() || !isResilienceRule(this)) return nativePrepare.apply(this, args);
    const original = this.predicate;
    this.predicate = new game.pf2e.Predicate(...original,
      { not: "origin:trait:mythic" }, { not: "item:trait:mythic" });
    try {
      return nativePrepare.apply(this, args);
    } finally {
      this.predicate = original;
    }
  };

  const nativeMenu = chatPrototype._getEntryContextOptions;
  chatPrototype._getEntryContextOptions = function (...args) {
    const entries = nativeMenu.apply(this, args);
    if (!enabled()) return entries;
    const mythic = entries.find((entry) => entry.label === "PF2E.RerollMenu.MythicPoint");
    if (mythic) {
      const nativeVisible = mythic.visible;
      mythic.label = "Rewrite Fate (1 Mythic Point)";
      mythic.visible = (element) => usesRewriteFate(messageFromElement(element)) &&
        canReroll(messageFromElement(element)) &&
        (typeof nativeVisible !== "function" || nativeVisible(element));
    }
    entries.push({
      label: "Обычный переброс (1 Mythic Point)",
      icon: "fa-solid fa-circle-m",
      visible: (element) => canReroll(messageFromElement(element)),
      onClick: (_event, element) => ordinaryMythicReroll(nativeReroll, Check, messageFromElement(element))
    });
    return entries;
  };
  Check[PATCHED] = true;
}

// Add the price to the same native chat card: no separate public message for a blind roll.
Hooks.on("preCreateChatMessage", (message) => {
  const record = pending.get(message.actor?.uuid);
  if (!record || !message.flags.pf2e?.context?.isReroll) return;
  message.updateSource({
    [`flags.${MODULE_ID}.ordinaryMythicReroll`]: { originalId: record.originalId, cost: 1 },
    flavor: `<p><strong>Обычный переброс · 1 Mythic Point</strong></p>${message.flavor ?? ""}`
  });
});

Hooks.on("createChatMessage", (message) => {
  const record = pending.get(message.actor?.uuid);
  if (record && message.getFlag(MODULE_ID, "ordinaryMythicReroll")?.originalId === record.originalId) {
    record.created = true;
  }
});

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING, {
    name: "Mythic: правила Элинваля",
    hint: "Обычный переброс за 1 MP; обход Mythic Resilience; переключатели Ears That Hear the Truth и Arms That Cut the Waves перед броском. Требуется перезагрузка мира.",
    scope: "world", config: true, restricted: true, type: Boolean, default: true, requiresReload: true
  });
});

Hooks.once("setup", () => {
  try {
    installMythicPatches();
  } catch (error) {
    console.error(`${MODULE_ID} | Mythic rules:`, error);
    Hooks.once("ready", () => {
      if (game.user.isGM) ui.notifications.error("Правила Mythic Элинваля не подключились. Проверь консоль и версию PF2e.");
    });
  }
});
