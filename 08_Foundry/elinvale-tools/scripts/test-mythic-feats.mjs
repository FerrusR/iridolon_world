/** Behavioral tests for the native-dialog bridge; no live world or database writes. */
import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.Hooks = { on() {}, once() {} };
let active = true;
let pwol = false;
const actors = new Map();
const notices = [];
globalThis.ui = { notifications: { warn: (s) => notices.push(s), error: (s) => notices.push(s) } };
globalThis.foundry = { utils: { fromUuidSync: (uuid) => actors.get(uuid) } };

class Element extends EventTarget {
  constructor(tag) { super(); this.tag = tag; this.dataset = {}; this.children = []; }
  matches(selector) { return this.tag === selector; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  before(child) {
    const children = this.parent.children;
    children.splice(children.indexOf(this), 0, child); child.parent = this.parent;
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (selector === "button[type=submit]" && child.tag === "button") return child;
      if (selector === "[data-elinvale-mythic-feat]" && child.dataset.elinvaleMythicFeat) return child;
      if (selector === "input" && child.tag === "input") return child;
      const nested = child.querySelector?.(selector);
      if (nested) return nested;
    }
    return null;
  }
}
globalThis.document = { createElement: (tag) => new Element(tag), createTextNode: (text) => ({ text }) };
class Modifier {
  constructor(data) { Object.assign(this, data); this.enabled = !this.ignored; }
}
class CheckModifier {
  constructor(proficiency = 4) {
    this.modifiers = [
      new Modifier({ type: "proficiency", slug: "proficiency", modifier: proficiency }),
      new Modifier({ type: "ability", slug: "wis", modifier: 3 }),
      new Modifier({ type: "circumstance", slug: "bonus", modifier: 1 }),
      new Modifier({ type: "status", slug: "frightened", modifier: -1 })
    ];
    this.calculateTotal();
  }
  delete(modifier) { this.modifiers.splice(this.modifiers.indexOf(modifier), 1); }
  push(modifier) { this.modifiers.push(modifier); this.calculateTotal(); }
  calculateTotal(options) {
    if (options?.size) for (const modifier of this.modifiers) {
      if (modifier.predicate?.length) modifier.ignored = !modifier.predicate.every((p) => options.has(p));
    }
    for (const modifier of this.modifiers) modifier.enabled = !modifier.ignored;
    this.totalModifier = this.modifiers.filter((m) => m.enabled).reduce((n, m) => n + m.modifier, 0);
  }
}
class Actor {
  constructor(slug = "ears-that-hear-the-truth", points = 3) {
    this.uuid = "Actor.pc"; this.level = 2; this.isOwner = true; this.points = points;
    this.itemTypes = { feat: [{ slug }] }; this.baseProficiency = 4;
    actors.set(this.uuid, this);
  }
  isOfType(type) { return type === "character"; }
  getResource() { return { value: this.points, max: 3 }; }
  async updateResource(_slug, value) { this.points = value; }
}

let driver;
let failBeforeRoll = false;
let rollCount = 0;
let lastDialog;
let passThroughEvent;
class Dialog {
  constructor(check, context) {
    this.check = check; this.context = context;
    this.promise = new Promise((resolve) => { this.resolve = resolve; });
  }
  render() {
    this.element = new Element("form"); this.element.append(new Element("button"));
    renderMythicFeatToggle(this, [this.element]); return this;
  }
  setPosition() {}
  close() { if (!this.isResolved) this.resolve(false); }
  submit() { this.resolve(true); this.isResolved = true; this.close(); }
}
const Check = {
  async roll(check, context, event, callback) {
    passThroughEvent = event;
    if (context.options?.has("secret")) context.messageMode = "blind";
    if (!context.skipDialog) {
      const dialog = lastDialog = new Dialog(check, context).render();
      await driver(dialog);
      if (!await dialog.promise) return null;
    }
    if (failBeforeRoll) throw new Error("Simulated dice failure");
    rollCount++;
    const result = { total: 10 + check.totalModifier, modifier: check.totalModifier, context };
    if (callback) await callback(result, "success", { private: context.messageMode === "blind" }, event);
    return result;
  }
};
globalThis.game = {
  user: { isGM: false }, settings: { get: () => active },
  pf2e: { Check, Modifier, settings: { variants: { pwol: { get enabled() { return pwol; } } } } }
};
const { getMythicFeatChoice, renderMythicFeatToggle, installMythicFeatPatches } =
  await import("../esmodules/mythic-feats.mjs");
installMythicFeatPatches();

function context(type = "initiative", domains = ["all", "perception", "initiative"], options = []) {
  return { actor: new Actor(), type, domains, options: new Set(options), skipDialog: true, messageMode: "public" };
}
function select(dialog, value = true) {
  const checkbox = dialog.element.querySelector("input");
  assert.ok(checkbox, "Mythic toggle rendered");
  checkbox.checked = value; checkbox.dispatchEvent(new Event("change"));
}

test("Perception initiative: proficiency replaced, other modifiers retained, 1 MP before dice", async () => {
  const ctx = context(); const check = new CheckModifier();
  const originalOptions = ctx.options;
  driver = (dialog) => {
    assert.equal(ctx.actor.points, 3);
    select(dialog);
    assert.equal(ctx.actor.points, 3, "preview must not charge");
    assert.equal(check.totalModifier, 15);
    assert.equal(ctx.actor.baseProficiency, 4, "actor proficiency is never rewritten");
    dialog.submit();
  };
  const result = await Check.roll(check, ctx, null, () => assert.equal(ctx.actor.points, 2));
  assert.equal(result.total, 25); assert.equal(ctx.actor.points, 2);
  assert.equal(ctx.options, originalOptions, "native Check.roll's original Set must be preserved");
  assert.ok(ctx.options.has("elinvale-tools:mythic-feat:ears-that-hear-the-truth"));
});
test("Sense Motive: retains blind visibility, secret option, target DC and fortune", async () => {
  const ctx = context("perception-check", ["all", "perception"], ["action:sense-motive", "secret"]);
  ctx.dc = { value: 23 }; ctx.rollTwice = "keep-higher";
  driver = (dialog) => { select(dialog); dialog.submit(); };
  const result = await Check.roll(new CheckModifier(6), ctx);
  assert.equal(result.context.messageMode, "blind"); assert.equal(result.modifier, 15);
  assert.equal(result.context.rollTwice, "keep-higher"); assert.deepEqual(result.context.dc, { value: 23 });
  assert.equal(ctx.actor.points, 2);
});
test("Swim: both action APIs recognized; only this check receives the bonus", async () => {
  for (const method of ["action:swim", "self:action:slug:swim"]) {
    const ctx = context("skill-check", ["all", "athletics"], [method]);
    ctx.actor = new Actor("arms-that-cut-the-waves");
    driver = (dialog) => { select(dialog); dialog.submit(); };
    assert.equal((await Check.roll(new CheckModifier(), ctx)).modifier, 15);
    assert.equal(ctx.actor.points, 2);
    const ordinary = { ...ctx, options: new Set(), skipDialog: true };
    assert.equal((await Check.roll(new CheckModifier(), ordinary)).modifier, 7);
    assert.equal(ctx.actor.points, 2);
  }
});
test("unchecked, toggled off and cancelled dialogs never charge MP", async () => {
  for (const mode of ["unchecked", "off", "cancel"]) {
    const ctx = context();
    driver = (dialog) => {
      if (mode !== "unchecked") select(dialog);
      if (mode === "off") select(dialog, false);
      if (mode === "cancel") dialog.close(); else dialog.submit();
    };
    const result = await Check.roll(new CheckModifier(), ctx);
    assert.equal(ctx.actor.points, 3);
    assert.equal(result?.modifier ?? null, mode === "cancel" ? null : 7);
  }
});
test("no toggle for Seek, generic Perception, Stealth initiative, Climb, attacks or rerolls", () => {
  for (const ctx of [
    context("perception-check", ["perception"], ["action:seek"]),
    context("perception-check", ["perception"]),
    context("initiative", ["all", "stealth", "initiative"]),
    context("skill-check", ["athletics"], ["action:climb"]),
    context("attack-roll", ["attack"], ["action:sense-motive"]),
    { ...context(), isReroll: true }
  ]) assert.equal(getMythicFeatChoice(new CheckModifier(), ctx), null);
});
test("missing/suppressed feat, unowned actor and 0 MP do not enable Mythic", async () => {
  for (const change of [
    (ctx) => ctx.actor.itemTypes.feat = [],
    (ctx) => ctx.actor.itemTypes.feat[0].suppressed = true,
    (ctx) => ctx.actor.isOwner = false,
    (ctx) => ctx.actor.points = 0
  ]) {
    const ctx = context(); change(ctx);
    assert.equal((await Check.roll(new CheckModifier(), ctx)).modifier, 7);
  }
});
test("MP exhausted or feat removed while dialog open: cancels before dice", async () => {
  for (const change of [(actor) => actor.points = 0, (actor) => actor.itemTypes.feat = []]) {
    const ctx = context(); const before = rollCount;
    driver = (dialog) => { select(dialog); change(ctx.actor); dialog.submit(); };
    assert.equal(await Check.roll(new CheckModifier(), ctx), null);
    assert.equal(rollCount, before);
  }
});
test("disabling the native proficiency checkbox does not charge for a missing bonus", async () => {
  const ctx = context(); const check = new CheckModifier();
  driver = (dialog) => {
    select(dialog);
    check.modifiers.find((m) => m.type === "proficiency").ignored = true;
    check.calculateTotal(); dialog.submit();
  };
  assert.equal((await Check.roll(check, ctx)).modifier, 7); assert.equal(ctx.actor.points, 3);
});
test("switching Mythic on and off preserves manually disabled conditional modifiers", async () => {
  const ctx = context(); ctx.options.add("conditional");
  const check = new CheckModifier();
  const penalty = check.modifiers.find((m) => m.slug === "frightened");
  penalty.predicate = ["conditional"];
  driver = (dialog) => {
    penalty.ignored = true; check.calculateTotal();
    select(dialog); assert.equal(penalty.ignored, true);
    select(dialog, false); assert.equal(penalty.ignored, true);
    select(dialog); dialog.submit();
  };
  assert.equal((await Check.roll(check, ctx)).modifier, 16);
});
test("failed roll refunds MP; callback failure after completed roll keeps payment", async () => {
  const ctx = context();
  driver = (dialog) => { select(dialog); dialog.submit(); };
  failBeforeRoll = true;
  try { await assert.rejects(Check.roll(new CheckModifier(), ctx), /dice failure/); }
  finally { failBeforeRoll = false; }
  assert.equal(ctx.actor.points, 3);
  await assert.rejects(Check.roll(new CheckModifier(), ctx, null, () => { throw Error("after roll"); }), /after roll/);
  assert.equal(ctx.actor.points, 2);
});
test("contextual clone spends on canonical token/world actor, not the stale clone", async () => {
  const ctx = context(); const actual = ctx.actor;
  ctx.actor = Object.assign(Object.create(Actor.prototype), actual, { points: 0 });
  driver = (dialog) => { select(dialog); dialog.submit(); };
  await Check.roll(new CheckModifier(), ctx);
  assert.equal(actual.points, 2); assert.equal(ctx.actor.points, 0);
});
test("Ctrl/Cmd visibility and callback event preserved; native fast rolls still get the choice", async () => {
  const ctx = context(); const event = { ctrlKey: true, shiftKey: true };
  driver = (dialog) => { select(dialog); dialog.submit(); };
  await Check.roll(new CheckModifier(), ctx, event, (_roll, _outcome, message, forwarded) => {
    assert.equal(forwarded, event); assert.equal(message.private, true);
  });
  assert.equal(ctx.skipDialog, false); assert.equal(passThroughEvent, null);
});
test("Proficiency Without Level uses +10; ordinary configured rolls pass through when disabled", async () => {
  const ctx = context(); driver = (dialog) => { select(dialog); dialog.submit(); };
  pwol = true;
  try { assert.equal((await Check.roll(new CheckModifier(), ctx)).modifier, 13); }
  finally { pwol = false; }
  active = false;
  try {
    const ctx = context();
    assert.equal((await Check.roll(new CheckModifier(), ctx)).modifier, 7);
    assert.equal(ctx.actor.points, 3); assert.equal(ctx.skipDialog, true);
  } finally { active = true; }
});
test("rerender and double submit never duplicate the toggle or payment", async () => {
  const ctx = context();
  driver = (dialog) => {
    renderMythicFeatToggle(dialog, [dialog.element]);
    assert.equal(dialog.element.children.length, 2);
    select(dialog); dialog.render();
    assert.equal(dialog.element.querySelector("input").checked, true);
    dialog.submit(); dialog.submit();
  };
  await Check.roll(new CheckModifier(), ctx); assert.equal(ctx.actor.points, 2);
});
test("two simultaneous confirmations cannot spend the last MP twice", async () => {
  const firstContext = context(); const actor = firstContext.actor; actor.points = 1;
  const secondContext = { ...firstContext, options: new Set() };
  let release;
  const payment = new Promise((resolve) => { release = resolve; });
  actor.updateResource = async (_slug, value) => { await payment; actor.points = value; };
  driver = (dialog) => { select(dialog); dialog.submit(); };
  const first = Check.roll(new CheckModifier(), firstContext);
  const second = await Check.roll(new CheckModifier(), secondContext);
  assert.equal(second, null);
  release(); assert.ok(await first); assert.equal(actor.points, 0);
});
test("payment failure cancels before dice; install is idempotent", async () => {
  const ctx = context(); const before = rollCount;
  ctx.actor.updateResource = async () => { throw Error("denied"); };
  driver = (dialog) => { select(dialog); dialog.submit(); };
  const originalError = console.error; console.error = () => {};
  try { assert.equal(await Check.roll(new CheckModifier(), ctx), null); }
  finally { console.error = originalError; }
  assert.equal(rollCount, before); assert.equal(ctx.actor.points, 3);
  const patched = Check.roll; installMythicFeatPatches(); assert.equal(Check.roll, patched);
});
