/**
 * «Сила жизни» (бывш. «Лето в крови») — часть модуля elinvale-tools
 * (награда Главы 3, лесное озеро).
 *
 * Пока ГМ держит включённым тумблер «Сила жизни: прилив в начале боя»
 * (Game Settings → Module Settings, по умолчанию выключен), при старте боя
 * каждый участник с эффектом slug elinvale-summer-in-blood получает эффект-прилив
 * (TempHP 3, длительность encounter). Прилив снимается сам в конце боя вместе
 * с остатком временных HP. Тумблер выключен — хук ничего не делает.
 *
 * Переключить с хотбара: game.modules.get("elinvale-tools").api.toggleSummerSurge()
 */

const MODULE_ID = "elinvale-tools";
const SETTING = "summerSurgeActive";
const SUMMER_SLUG = "elinvale-summer-in-blood";
const SURGE_SLUG = "elinvale-summer-surge";
const SURGE_UUID = `Compendium.${MODULE_ID}.items.Item.ElinFxSummerSrg1`;

const lookup = (uuid) => (foundry.utils.fromUuid ?? globalThis.fromUuid)(uuid);

const isActive = () => {
  try {
    return game.settings.get(MODULE_ID, SETTING) === true;
  } catch {
    return false;
  }
};

async function setActive(value) {
  if (!game.user.isGM) {
    ui.notifications.warn("Тумблер прилива переключает только ГМ.");
    return isActive();
  }
  await game.settings.set(MODULE_ID, SETTING, !!value);
  return isActive();
}

async function grantSummerSurge(combat) {
  if (!game.user.isGM || !isActive()) return;

  const actors = [];
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor || actors.includes(actor)) continue;
    if (actor.itemTypes?.effect?.some((e) => e.slug === SUMMER_SLUG)) actors.push(actor);
  }
  if (actors.length === 0) return;

  const surge = await lookup(SURGE_UUID);
  if (!surge) {
    ui.notifications.warn("Elinvale tools: в паке items не найден эффект прилива (ElinFxSummerSrg1).");
    return;
  }
  const source = surge.toObject();
  delete source._id;

  for (const actor of actors) {
    // Остаток прилива от прошлого боя (если бой удалили, не закончив) — заменить свежим.
    const stale = actor.itemTypes.effect.filter((e) => e.slug === SURGE_SLUG).map((e) => e.id);
    if (stale.length) await actor.deleteEmbeddedDocuments("Item", stale);
    await actor.createEmbeddedDocuments("Item", [foundry.utils.deepClone(source)]);
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING, {
    name: "Сила жизни: прилив в начале боя",
    hint:
      "Включить, когда партия получила «Силу жизни», выключить, когда вышла из леса. " +
      "Пока включено, в начале каждого боя носители эффекта получают 3 временных HP.",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
    onChange: (value) => {
      if (game.user.isGM) {
        ui.notifications.info(`Сила жизни: прилив в начале боя ${value ? "ВКЛЮЧЁН" : "выключен"}.`);
      }
    }
  });
});

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  if (!module) return;
  module.api = Object.assign(module.api ?? {}, {
    isSummerSurgeActive: isActive,
    setSummerSurge: setActive,
    toggleSummerSurge: () => setActive(!isActive())
  });
});

Hooks.on("combatStart", (combat) => {
  grantSummerSurge(combat).catch((err) => console.error(`${MODULE_ID} | Сила жизни:`, err));
});
