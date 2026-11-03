import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createIntegrityWatch, observeCheckRolls, snapshotCheck, validReport
} from "../esmodules/roll-monitor-core.mjs";
import { runRollMonitorSelfTest } from "../esmodules/roll-monitor-self-test.mjs";

function rollClass() {
  return class Roll {
    static DICE_CONFIGURATION_SETTING = "diceConfiguration";
    constructor({ type = "skill-check", result = 12, modifiers = [], results } = {}) {
      this.options = { type };
      this.formula = "1d20 + 7";
      this.total = result + 7;
      this._evaluated = false;
      this.dice = [{ faces: 20, number: 1, method: "mersenne", modifiers,
        results: results ?? [{ result, active: true }] }];
    }
    evaluate(...args) {
      this.evaluateArgs = args;
      this._evaluated = true;
      this.nativePromise = Promise.resolve(this);
      return this.nativePromise;
    }
    toMessage(...args) { this.messageArgs = args; return this; }
  };
}

test("integrity detection never invokes the RNG, repairs a change, or freezes configuration", () => {
  let draws = 0;
  const config = { rng() { draws++; return 0.2; } };
  const original = config.rng;
  const watch = createIntegrityWatch({ rng: () => config.rng });
  assert.deepEqual(watch.scan(), []);
  const altered = () => 0.99;
  config.rng = altered;
  assert.equal(watch.scan()[0].path, "rng");
  assert.equal(config.rng, altered);
  assert.deepEqual(watch.scan(), []);
  config.rng = original;
  assert.equal(watch.scan().length, 1, "restoration is also recorded");
  assert.equal(draws, 0);
  assert.equal(Object.isFrozen(config), false);
});

test("observer preserves Promise identity, arguments, message result and all successful checks", async () => {
  const Roll = rollClass(), events = [];
  observeCheckRolls(Roll, (event) => events.push(event));
  for (const options of [
    {}, { result: 20 }, { type: "saving-throw" }, { type: "initiative" },
    { modifiers: ["kh"], results: [{ result: 2, active: false, discarded: true }, { result: 20, active: true }] },
    { modifiers: ["kl"], results: [{ result: 2, active: true }, { result: 20, active: false, discarded: true }] }
  ]) {
    const roll = new Roll(options), args = { allowInteractive: false };
    const promise = roll.evaluate(args);
    assert.equal(promise, roll.nativePromise);
    assert.equal(await promise, roll);
    assert.deepEqual(roll.evaluateArgs, [args]);
    roll.options.degreeOfSuccess = 3; // PF2e adds this after evaluation.
    const messageArgs = [{ flags: { pf2e: { context: { isReroll: true } } } }, { messageMode: "blind" }];
    assert.equal(roll.toMessage(...messageArgs), roll);
    assert.deepEqual(roll.messageArgs, messageArgs);
  }
  assert.deepEqual(events, [], "natural 20s, fortune, misfortune and rerolls are not evidence of tampering");
});

test("post-evaluation tampering is reported without changing the posted result", async () => {
  const Roll = rollClass(), events = [];
  observeCheckRolls(Roll, (event) => events.push(event));
  const roll = new Roll();
  await roll.evaluate();
  roll.dice[0].results[0].result = 20;
  roll.total = 27;
  assert.equal(roll.toMessage(), roll);
  assert.equal(roll.total, 27);
  assert.equal(events.length, 1);
  assert.equal(events[0].detail.before.dice[0].results[0].result, 12);
  assert.equal(events[0].detail.after.dice[0].results[0].result, 20);
  roll.toMessage();
  assert.equal(events.length, 1);
});

test("damage, fixed substitutions, deserialized checks and new rerolls do not create false positives", async () => {
  const Roll = rollClass(), events = [];
  observeCheckRolls(Roll, (event) => events.push(event));
  const damage = new Roll({ type: "damage-roll" });
  await damage.evaluate();
  damage.total *= 2;
  damage.toMessage();
  const substitution = new Roll();
  substitution.dice = [];
  await substitution.evaluate();
  substitution.toMessage();
  const old = new Roll();
  old._evaluated = true;
  old.toMessage(); // An old roll reconstructed from chat has no local evaluation snapshot.
  const reroll = new Roll({ result: 5 });
  await reroll.evaluate();
  reroll.toMessage();
  assert.deepEqual(events, []);
  assert.equal(snapshotCheck(damage), null);
});

test("observation and delivery failures cannot cancel a roll; native errors are preserved", async () => {
  const Roll = rollClass();
  observeCheckRolls(Roll, () => { throw new Error("Report delivery failed"); });
  const roll = new Roll();
  await roll.evaluate();
  roll.total = 100;
  assert.equal(roll.toMessage(), roll);
  const error = new Error("Native failure");
  class Rejecting extends (rollClass()) { evaluate() { return Promise.reject(error); } }
  observeCheckRolls(Rejecting, () => {});
  await assert.rejects(new Rejecting().evaluate(), (actual) => actual === error);
  class Throwing extends (rollClass()) { evaluate() { throw error; } }
  observeCheckRolls(Throwing, () => {});
  assert.throws(() => new Throwing().evaluate(), (actual) => actual === error);
});

test("untrusted telemetry is bounded and rejects unknown protocol messages", () => {
  const base = { v: 1, session: "session-123", seq: 1, kind: "status", detail: {} };
  assert.equal(validReport(base), true);
  for (const patch of [{ v: 2 }, { seq: NaN }, { seq: -1 }, { kind: "ack" },
    { session: "<script>" }, { detail: "x".repeat(17000) }]) {
    assert.equal(validReport({ ...base, ...patch }), false);
  }
});

test("GM self-test exercises detection without changing shared functions or creating chat", async () => {
  let prepared = 0;
  class NativeRoll extends (rollClass()) {
    constructor(_formula, _data, options) {
      super({ type: options.type });
      this._total = this.total;
      delete this.total;
      Object.defineProperty(this, "total", { get: () => this._total });
    }
    toJSON() { return { class: this.constructor.name, total: this.total }; }
    toMessage(_data, options) {
      assert.equal(options.create, false);
      const data = this.toJSON();
      assert.equal(data.class, "NativeRoll", "isolated subclass serializes as a registered native class");
      prepared++;
      return data;
    }
  }
  const originalEvaluate = NativeRoll.prototype.evaluate, originalMessage = NativeRoll.prototype.toMessage;
  const result = await runRollMonitorSelfTest(NativeRoll);
  assert.equal(result.passed, true);
  assert.equal(result.checks.length, 4);
  assert.equal(prepared, 2);
  assert.equal(NativeRoll.prototype.evaluate, originalEvaluate);
  assert.equal(NativeRoll.prototype.toMessage, originalMessage);
});

test("Foundry integration: private recipients, server sender identity, retry/ack and GM-local persistence", async (t) => {
  const hooks = new Map(), intervals = [], sent = [], alerts = [], storage = new Map();
  const player = { id: "player1", name: "Player", isGM: false, active: true };
  const gm = { id: "gm1", name: "GM", isGM: true, active: true };
  const users = new Map([[player.id, player], [gm.id, gm]]);
  users.filter = (predicate) => [...users.values()].filter(predicate);
  const listeners = new Map();
  const Roll = rollClass();
  class DiceTerm { roll() {} _roll() {} randomFace() {} mapRandomFace() {} }
  class Die extends DiceTerm {}
  globalThis.foundry = {
    dice: { Roll, terms: { DiceTerm, Die }, MersenneTwister: { random: () => 0.5 } },
    applications: { api: { ApplicationV2: class {}, DialogV2: { wait() {} } } }
  };
  globalThis.CONFIG = { Dice: { randomUniform: () => 0.5,
    fulfillment: { methods: { mersenne: { handler: () => 10 } } }, terms: { d: Die } } };
  globalThis.Hooks = {
    once(name, fn) { hooks.set(name, [...hooks.get(name) ?? [], fn]); },
    on(name, fn) { hooks.set(name, [...hooks.get(name) ?? [], fn]); }
  };
  const settings = new Map();
  globalThis.game = {
    user: player, users, world: { id: "world1" }, version: "14.366", system: { version: "8.6.0" },
    modules: new Map([["elinvale-tools", {}]]),
    settings: {
      register(_module, key, config) { settings.set(key, config.default); }, registerMenu() {},
      get(_module, key) { return settings.get(key); }
    },
    socket: { connected: true,
      emit(...args) { sent.push(args); },
      on(name, fn) { listeners.set(name, [...listeners.get(name) ?? [], fn]); }
    }
  };
  globalThis.ui = { notifications: { warn: (text) => alerts.push(text) } };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value)
  };
  t.mock.method(globalThis, "setInterval", (fn) => { intervals.push(fn); return 1; });
  let now = 1800000000000;
  t.mock.method(Date, "now", () => now);
  const channel = "module.elinvale-tools";
  const emitSocket = (data, sender) => { for (const fn of listeners.get(channel) ?? []) fn(data, sender); };
  const emitHook = (name, ...args) => { for (const fn of hooks.get(name) ?? []) fn(...args); };
  const { getRollMonitorReport, testRollMonitor } = await import("../esmodules/roll-monitor.mjs");
  emitHook("init");
  emitHook("ready");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(sent.some(([, report]) => report.kind === "status"));
  assert.ok(sent.every(([, , options]) => JSON.stringify(options.recipients) === '["gm1"]'));
  assert.equal(alerts.length, 0);
  assert.equal(storage.size, 0, "player writes no logs/world documents");
  assert.equal(getRollMonitorReport(), null);
  assert.equal(await testRollMonitor(), null, "GM self-test is unavailable to players");
  const original = CONFIG.Dice.fulfillment.methods.mersenne.handler;
  const altered = () => 20;
  CONFIG.Dice.fulfillment.methods.mersenne.handler = altered;
  emitHook("preCreateChatMessage", {});
  assert.equal(CONFIG.Dice.fulfillment.methods.mersenne.handler, altered);
  const anomaly = sent.find(([, report]) => report.kind === "function-change")[1];
  now += 6000;
  intervals[0]();
  assert.equal(sent.filter(([, report]) => report.seq === anomaly.seq).length, 2, "unacknowledged event is retried");
  emitSocket({ v: 1, kind: "ack", session: anomaly.session, seq: anomaly.seq }, player.id);
  now += 6000;
  intervals[0]();
  assert.equal(sent.filter(([, report]) => report.seq === anomaly.seq).length, 3, "another player cannot acknowledge");
  emitSocket({ v: 1, kind: "ack", session: anomaly.session, seq: anomaly.seq }, gm.id);
  now += 6000;
  intervals[0]();
  assert.equal(sent.filter(([, report]) => report.seq === anomaly.seq).length, 3);
  assert.equal(alerts.length, 0, "player receives no warnings");

  // GM module instance has its own state, as it does in another browser.
  game.user = gm;
  const gmModule = await import("../esmodules/roll-monitor.mjs?gm-test");
  emitHook("ready");
  await new Promise((resolve) => setTimeout(resolve, 10));
  gmModule.receiveReport({ ...anomaly, userId: "someone-else", userName: "Forged" }, player.id);
  gmModule.receiveReport(anomaly, player.id);
  const report = gmModule.getRollMonitorReport();
  assert.equal(report.events.length, 1, "duplicate report is not logged twice");
  assert.equal(report.events[0].userId, player.id);
  assert.equal(report.events[0].userName, player.name);
  assert.equal(alerts.length, 1);
  assert.equal(storage.size, 1);
  assert.ok([...storage.keys()][0].endsWith("world1.gm1"));
  assert.ok(sent.some(([, data, options]) => data.kind === "ack" && options.recipients[0] === player.id));
  gmModule.receiveReport({ ...anomaly, seq: 123 }, "unknown-user");
  assert.equal(gmModule.getRollMonitorReport().events.length, 1);
  CONFIG.Dice.fulfillment.methods.mersenne.handler = original;
});
