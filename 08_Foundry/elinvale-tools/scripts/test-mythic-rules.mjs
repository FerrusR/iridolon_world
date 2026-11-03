/** Unit/integration harness for module boundaries; does not require a running Foundry world. */
import assert from "node:assert/strict";
import { test } from "node:test";

const callbacks = new Map();
globalThis.Hooks = {
  on(name, callback) { callbacks.set(name, [...callbacks.get(name) ?? [], callback]); },
  once() {}
};
const emit = (name, message) => { for (const callback of callbacks.get(name) ?? []) callback(message); };
let active = true;
let failure = false;
let pause = null;
const messages = new Map();
const notifications = [];
globalThis.ui = { notifications: {
  warn: (text) => notifications.push(text), error: (text) => notifications.push(text)
} };
class Predicate extends Array {
  test(options) { return this.every((s) => typeof s === "string" ? options.includes(s) : !options.includes(s.not)); }
}
class Actor {
  constructor(points = 3, max = 3) {
    this.uuid = "Actor.pc";
    this.isOwner = true;
    this.system = { resources: { mythicPoints: { value: points, max } }, traits: { value: [] } };
  }
  isOfType(type) { return type === "character"; }
  getSelfRollOptions(prefix = "self") { return [`${prefix}:level:2`]; }
  getResource() { return { ...this.system.resources.mythicPoints, slug: "mythic-points" }; }
  async updateResource(_slug, value) { this.system.resources.mythicPoints.value = value; }
}
class AdjustDegree {
  beforePrepareData() {
    this.captured = new Predicate(...this.predicate);
    return "native-result";
  }
}
const nativeMythicEntry = () => ({ label: "PF2E.RerollMenu.MythicPoint", visible: () => true });
class Chat {
  _getEntryContextOptions() { return [nativeMythicEntry()]; }
}
const calls = [];
const Check = {
  async rerollFromMessage(message, options = {}) {
    calls.push(options);
    if (pause) await pause;
    if (failure) throw new Error("Simulated failed roll");
    const result = {
      actor: message.actor,
      flags: structuredClone(message.flags),
      flavor: "native flavor",
      modifier: options.resource === "mythic-points" ? 16 : message.modifier,
      updateSource(data) {
        if (data.flavor) this.flavor = data.flavor;
        if (data["flags.elinvale-tools.ordinaryMythicReroll"]) {
          this.marker = data["flags.elinvale-tools.ordinaryMythicReroll"];
        }
      },
      getFlag() { return this.marker; }
    };
    result.flags.pf2e.context.isReroll = true;
    emit("preCreateChatMessage", result);
    emit("createChatMessage", result);
    if (options.resource === "mythic-points") {
      const actor = message.actor;
      await actor.updateResource("mythic-points", actor.getResource().value - 1);
    }
    return result;
  }
};
globalThis.game = {
  user: { isGM: false }, settings: { get: () => active }, messages,
  pf2e: { Check, Predicate, RuleElements: { builtin: { AdjustDegreeOfSuccess: AdjustDegree } } }
};
globalThis.CONFIG = { Actor: { documentClass: Actor }, ui: { chat: Chat } };
const { installMythicPatches, isResilienceRule } = await import("../esmodules/mythic-rules.mjs");
installMythicPatches();

function message(type = "attack-roll", modifier = 3) {
  const result = {
    id: "original", actor: new Actor(), isRerollable: true, isAuthor: true, modifier,
    flags: { pf2e: { context: { type, options: [], messageMode: "blind", mapIncreases: 2 } } }
  };
  messages.set(result.id, result);
  return result;
}
const element = { dataset: { messageId: "original" } };

for (const type of ["attack-roll", "spell-attack-roll", "perception-check", "flat-check"]) {
  test(`${type}: ordinary modifier, keep new, one MP, native visibility/context`, async () => {
    const original = message(type, type === "flat-check" ? 0 : 3);
    const result = await Check.rerollFromMessage(original, { resource: "mythic-points", keep: "higher" });
    assert.equal(result.modifier, original.modifier);
    assert.equal(original.actor.getResource().value, 2);
    assert.equal(calls.at(-1).keep, "new");
    assert.equal(calls.at(-1).resource, undefined);
    assert.equal(result.flags.pf2e.context.messageMode, "blind");
    assert.equal(result.flags.pf2e.context.mapIncreases, 2);
    assert.deepEqual(result.marker, { originalId: "original", cost: 1 });
  });
}
for (const type of ["skill-check", "saving-throw"]) {
  test(`${type}: native Rewrite Fate retained, ordinary alternative available`, async () => {
    const original = message(type);
    const result = await Check.rerollFromMessage(original, { resource: "mythic-points" });
    assert.equal(result.modifier, 16);
    assert.equal(original.actor.getResource().value, 2);
    const menu = new Chat()._getEntryContextOptions();
    assert.ok(menu[0].visible(element));
    const ordinary = await menu[1].onClick(null, element);
    assert.equal(ordinary.modifier, 3);
    assert.equal(original.actor.getResource().value, 1);
  });
}
test("attack menu hides Rewrite Fate and accepts HTMLElement or legacy jQuery", () => {
  message();
  const menu = new Chat()._getEntryContextOptions();
  assert.equal(menu[0].visible(element), false);
  assert.equal(menu[1].visible(element), true);
  assert.equal(menu[1].visible([element]), true);
});
test("fortune, consumed rerolls, missing points and missing ownership block ordinary rerolls", async () => {
  for (const change of [
    (m) => m.flags.pf2e.context.options.push("fortune"),
    (m) => m.flags.pf2e.context.substitutions = [{ selected: true, effectType: "fortune" }],
    (m) => m.isRerollable = false,
    (m) => m.actor.system.resources.mythicPoints.value = 0,
    (m) => m.actor.isOwner = false
  ]) {
    const original = message(); change(original);
    const before = calls.length;
    await Check.rerollFromMessage(original, { resource: "mythic-points" });
    assert.equal(calls.length, before);
  }
});
test("native failure refunds MP; duplicate clicks cannot spend twice", async () => {
  const original = message();
  failure = true;
  const log = console.error;
  console.error = () => {};
  try { await Check.rerollFromMessage(original, { resource: "mythic-points" }); }
  finally { failure = false; console.error = log; }
  assert.equal(original.actor.getResource().value, 3);
  let resume;
  pause = new Promise((resolve) => { resume = resolve; });
  const first = Check.rerollFromMessage(original, { resource: "mythic-points" });
  await Promise.resolve();
  const before = calls.length;
  try {
    await Check.rerollFromMessage(original, { resource: "mythic-points" });
    assert.equal(calls.length, before);
  } finally {
    resume(); await first; pause = null;
  }
  assert.equal(original.actor.getResource().value, 2);
});
test("non-resource rerolls unaffected; disabling restores native behavior", async () => {
  const original = message();
  assert.equal((await Check.rerollFromMessage(original)).modifier, 3);
  assert.equal(original.actor.getResource().value, 3);
  active = false;
  try {
    assert.equal((await Check.rerollFromMessage(original, { resource: "mythic-points" })).modifier, 16);
    assert.equal(new Chat()._getEntryContextOptions().length, 1);
    assert.deepEqual(original.actor.getSelfRollOptions(), ["self:level:2"]);
  } finally { active = true; }
});
test("Calling supplies mythic origin option even with zero remaining MP", () => {
  const actor = new Actor(0);
  assert.ok(actor.getSelfRollOptions("origin").includes("origin:trait:mythic"));
  assert.ok(actor.getSelfRollOptions().includes("self:trait:mythic"));
  assert.equal(new Actor(0, 0).getSelfRollOptions("origin").includes("origin:trait:mythic"), false);
});
test("Resilience bypasses mythic actor or item, retaining existing predicates and rule source", () => {
  for (const selector of ["fortitude", "reflex", "will", "saving-throw"]) {
    const rule = Object.assign(new AdjustDegree(), {
      item: { sourceId: "Compendium.pf2e.bestiary-family-ability-glossary.Item.0zvUNv8hRTdwXmhF" },
      selector, adjustment: { all: "one-degree-better" }, predicate: new Predicate("existing")
    });
    const original = rule.predicate;
    assert.equal(rule.beforePrepareData(), "native-result");
    assert.equal(rule.captured.test(["existing"]), true);
    assert.equal(rule.captured.test(["existing", "origin:trait:mythic"]), false);
    assert.equal(rule.captured.test(["existing", "item:trait:mythic"]), false);
    assert.equal(rule.captured.test([]), false);
    assert.equal(rule.predicate, original);
  }
});
test("other save upgrades and opposing adjustments are untouched; custom flag supported", () => {
  const base = {
    item: { slug: "evasion" }, selector: "reflex",
    adjustment: { all: "one-degree-better" }, predicate: new Predicate()
  };
  assert.equal(isResilienceRule(base), false);
  assert.equal(isResilienceRule({ ...base, item: { slug: "mythic-mythic-resilience" } }), true);
  assert.equal(isResilienceRule({ ...base, item: { name: "Mythic Resilience (Reflex and Will)" } }), true);
  assert.equal(isResilienceRule({ ...base, item: { getFlag: () => true } }), true);
  assert.equal(isResilienceRule({ ...base, item: { slug: "mythic-resilience" }, affects: "origin" }), false);
  const rule = Object.assign(new AdjustDegree(), base);
  rule.beforePrepareData();
  assert.deepEqual([...rule.captured], []);
});
test("installing twice does not duplicate wrappers or menu entries", () => {
  const fn = Check.rerollFromMessage;
  installMythicPatches();
  assert.equal(Check.rerollFromMessage, fn);
  assert.equal(new Chat()._getEntryContextOptions().length, 2);
});
