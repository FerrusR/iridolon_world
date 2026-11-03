/** Pre-roll Mythic feat choices in PF2e 8.6.0's native modifier dialog. */
const MODULE_ID = "elinvale-tools";
const PATCHED = Symbol.for("elinvale-tools.mythic-feats");
const MODIFIER_SLUG = "elinvale-mythic-feat-proficiency";
const dialogs = new WeakMap();
const spendingActors = new Set();
const FEATS = {
  ears: {
    slug: "ears-that-hear-the-truth",
    sourceId: "Compendium.pf2e.feats.Item.UbpSGpKNGucwIcHs",
    name: "Ears That Hear the Truth"
  },
  arms: {
    slug: "arms-that-cut-the-waves",
    sourceId: "Compendium.pf2e.feats.Item.6wxOKT9ApUAZMq1v",
    name: "Arms That Cut the Waves"
  }
};

function enabled() {
  return game.settings.get(MODULE_ID, "mythicHouseRules") === true;
}

function resourceActor(actor) {
  // Statistic checks can use a contextual clone. Spend on the actual world/token actor.
  const lookup = foundry.utils.fromUuidSync ?? globalThis.fromUuidSync;
  return (actor?.uuid && lookup?.(actor.uuid)) ?? actor;
}

function ownsFeat(actor, definition) {
  return actor.itemTypes.feat.some((feat) => !feat.suppressed &&
    (feat.slug === definition.slug || feat.sourceId === definition.sourceId));
}

export function getMythicFeatChoice(check, context) {
  const actor = resourceActor(context.actor ?? context.origin?.actor);
  if (!actor?.isOfType("character") || !actor.isOwner || context.isReroll ||
      !(actor.getResource("mythic-points")?.max > 0)) return null;
  const options = new Set(context.options ?? []);
  const domains = context.domains ?? [];
  const action = context.action;
  const senseMotive = action === "sense-motive" || options.has("action:sense-motive") ||
    options.has("self:action:slug:sense-motive");
  const swim = action === "swim" || options.has("action:swim") || options.has("self:action:slug:swim");
  const perceptionInitiative = context.type === "initiative" &&
    (domains.includes("perception") || options.has("check:statistic:base:perception"));
  const senseCheck = senseMotive && ["skill-check", "perception-check"].includes(context.type);
  const definition = (senseCheck || perceptionInitiative) && ownsFeat(actor, FEATS.ears) ? FEATS.ears :
    swim && context.type === "skill-check" && domains.includes("athletics") &&
    ownsFeat(actor, FEATS.arms) ? FEATS.arms : null;
  if (!definition || !check.modifiers.some((modifier) => modifier.type === "proficiency")) return null;
  return { actor, ...definition };
}

function setSelected(record, selected) {
  if (selected === record.selected) return;
  const { check } = record;
  if (selected) {
    record.originalProficiency = check.modifiers.filter((modifier) => modifier.type === "proficiency");
    for (const modifier of record.originalProficiency) check.delete(modifier);
    const pwol = game.pf2e.settings.variants.pwol.enabled;
    record.modifier = new game.pf2e.Modifier({
      slug: MODIFIER_SLUG,
      label: `Mythic · ${record.choice.name} (1 MP)`,
      type: "proficiency",
      modifier: 10 + (pwol ? 0 : record.choice.actor.level)
    });
    check.push(record.modifier);
  } else {
    check.delete(record.modifier);
    for (const modifier of record.originalProficiency) check.push(modifier);
  }
  record.selected = selected;
  // Match the native dialog's toggles: do not retest predicates and re-enable
  // a conditional modifier that the user has explicitly unchecked.
  check.calculateTotal();
}

async function resolveDialog(record, accepted, nativeResolve) {
  if (record.resolving) return;
  record.resolving = true;
  // The native dialog also allows disabling modifiers independently of our toggle.
  if (record.selected && !record.modifier.enabled) setSelected(record, false);
  if (!accepted || !record.selected) {
    nativeResolve(accepted);
    return;
  }
  const actor = resourceActor(record.choice.actor);
  const resource = actor.getResource("mythic-points");
  const stillEligible = getMythicFeatChoice(record.check, record.context);
  if (!enabled() || stillEligible?.slug !== record.choice.slug || resource.value < 1 || spendingActors.has(actor.uuid)) {
    ui.notifications.warn("Mythic: фит или MP недоступны, либо другой Mythic-бросок ещё выполняется.");
    nativeResolve(false);
    return;
  }
  spendingActors.add(actor.uuid);
  record.lockedActor = actor;
  try {
    await actor.updateResource("mythic-points", resource.value - 1);
    record.spent = true;
    // Check.roll keeps a reference to this Set before it opens the dialog.
    if (!(record.context.options instanceof Set)) record.context.options = new Set(record.context.options ?? []);
    record.context.options.add(`${MODULE_ID}:mythic-feat:${record.choice.slug}`);
    nativeResolve(true);
  } catch (error) {
    console.error(`${MODULE_ID} | Mythic feat payment:`, error);
    ui.notifications.error("Не удалось списать Mythic Point. Бросок отменён.");
    nativeResolve(false);
  }
}

export function renderMythicFeatToggle(application, html) {
  const record = dialogs.get(application.context);
  if (!record) return;
  const root = html?.[0] ?? html;
  const form = root?.matches?.("form") ? root : root?.querySelector("form");
  if (!form || form.querySelector("[data-elinvale-mythic-feat]")) return;
  if (!record.resolveInstalled) {
    const nativeResolve = application.resolve.bind(application);
    application.resolve = (accepted) => resolveDialog(record, accepted, nativeResolve);
    record.resolveInstalled = true;
  }

  const panel = document.createElement("div");
  panel.dataset.elinvaleMythicFeat = record.choice.slug;
  panel.className = "form-group";
  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = record.selected;
  checkbox.disabled = record.choice.actor.getResource("mythic-points").value < 1;
  label.append(checkbox, document.createTextNode(` ${record.choice.name} — 1 Mythic Point`));
  panel.append(label);
  form.querySelector("button[type=submit]")?.before(panel);
  checkbox.addEventListener("change", () => {
    setSelected(record, checkbox.checked);
    application.render(false);
  });
  application.setPosition({ height: "auto" });
}

/** Native Check.roll still creates the roll, secret message, callback and initiative result. */
export async function rollWithMythicFeat(nativeRoll, receiver, check, context = {}, event = null, callback) {
  const choice = enabled() ? getMythicFeatChoice(check, context) : null;
  if (!choice || choice.actor.getResource("mythic-points").value < 1) {
    return nativeRoll.call(receiver, check, context, event, callback);
  }
  const record = { check, context, choice, selected: false, spent: false, rolled: false, resolving: false };
  dialogs.set(context, record);
  // Eligible rolls always show the choice. Preserve Ctrl/Cmd secret-roll intent from legacy actions.
  if (event?.ctrlKey || event?.metaKey) context.messageMode = game.user.isGM ? "gm" : "blind";
  context.skipDialog = false;
  try {
    const result = await nativeRoll.call(receiver, check, context, null, async (...args) => {
      record.rolled = true;
      if (callback) await callback(...args.slice(0, 3), event ?? args[3]);
    });
    record.rolled ||= !!result;
    return result;
  } finally {
    dialogs.delete(context);
    try {
      if (record.spent && !record.rolled) {
        const actor = record.lockedActor;
        const resource = actor.getResource("mythic-points");
        await actor.updateResource("mythic-points", Math.min(resource.max, resource.value + 1));
      }
    } finally {
      if (record.lockedActor) spendingActors.delete(record.lockedActor.uuid);
    }
  }
}

export function installMythicFeatPatches() {
  const Check = game.pf2e.Check;
  if (Check[PATCHED]) return;
  if (typeof Check.roll !== "function" || typeof game.pf2e.Modifier !== "function") {
    throw new Error("Unsupported PF2e API: Mythic feat roll choices were not installed");
  }
  const nativeRoll = Check.roll;
  Check.roll = function (check, context = {}, event = null, callback) {
    return rollWithMythicFeat(nativeRoll, this, check, context, event, callback);
  };
  Check[PATCHED] = true;
}

Hooks.on("renderCheckModifiersDialog", renderMythicFeatToggle);
Hooks.once("setup", () => {
  try {
    installMythicFeatPatches();
  } catch (error) {
    console.error(`${MODULE_ID} | Mythic feat rolls:`, error);
    Hooks.once("ready", () => {
      if (game.user.isGM) ui.notifications.error("Переключатели Mythic feats не подключились. Проверь консоль и версию PF2e.");
    });
  }
});
