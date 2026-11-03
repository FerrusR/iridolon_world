/** Passive observations only: no extra draws, re-evaluation, repair, or roll cancellation. */
const nativeFunctionSource = Function.prototype.toString;
const CHECK_TYPES = new Set([
  "check", "attack-roll", "spell-attack-roll", "skill-check", "saving-throw",
  "perception-check", "flat-check", "initiative"
]);

export function describeValue(value) {
  if (typeof value !== "function") return { type: typeof value, value: String(value).slice(0, 300) };
  // Diagnostic fingerprint, not a signature or proof that the client is trustworthy.
  const source = nativeFunctionSource.call(value);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return { type: "function", name: value.name.slice(0, 80), fingerprint: (hash >>> 0).toString(16) };
}

export function createIntegrityWatch(targets) {
  const read = (get) => { try { return get(); } catch { return undefined; } };
  const previous = new Map(Object.entries(targets).map(([path, get]) => [path, read(get)]));
  return {
    describe: () => Object.fromEntries([...previous].map(([path, value]) => [path, describeValue(value)])),
    scan() {
      const changes = [];
      for (const [path, get] of Object.entries(targets)) {
        const before = previous.get(path), after = read(get);
        if (before === after) continue;
        changes.push({ path, before: describeValue(before), after: describeValue(after) });
        previous.set(path, after);
      }
      return changes;
    }
  };
}

export function snapshotCheck(roll) {
  if (!CHECK_TYPES.has(roll.options?.type) || !roll._evaluated) return null;
  const dice = roll.dice;
  // Restrict this comparison to ordinary checks. Damage/custom roll transforms are outside its scope.
  if (!dice?.length || dice.length > 4 || dice.some((die) => die.results.length > 20)) return null;
  return {
    formula: String(roll.formula).slice(0, 300), total: roll.total,
    dice: dice.map((die) => ({
      faces: die.faces, number: die.number, method: die.method,
      modifiers: [...die.modifiers],
      results: die.results.map((result) => Object.fromEntries([
        "result", "active", "discarded", "rerolled", "exploded", "count", "success", "failure"
      ].filter((key) => Object.hasOwn(result, key)).map((key) => [key, result[key]])))
    }))
  };
}

/** Preserve the exact return value/Promise, this, arguments, and thrown errors of both methods. */
export function observeCheckRolls(RollClass, onEvent) {
  const snapshots = new WeakMap();
  const prototype = RollClass.prototype;
  const evaluate = prototype.evaluate, toMessage = prototype.toMessage;
  if (typeof evaluate !== "function" || typeof toMessage !== "function") return false;
  const safely = (callback) => { try { callback(); } catch { /* Observation must never interrupt a roll. */ } };
  prototype.evaluate = function (...args) {
    const result = evaluate.apply(this, args);
    const remember = () => safely(() => {
      const snapshot = snapshotCheck(this);
      if (snapshot) snapshots.set(this, snapshot);
    });
    if (result instanceof Promise) result.then(remember, () => {});
    else remember();
    return result;
  };
  prototype.toMessage = function (...args) {
    safely(() => {
      const before = snapshots.get(this), after = snapshotCheck(this);
      if (before && after && JSON.stringify(before) !== JSON.stringify(after)) {
        onEvent({ kind: "check-changed", detail: { before, after } });
        // Repeated rendering of the same changed roll should not flood the GM.
        snapshots.set(this, after);
      }
    });
    return toMessage.apply(this, args);
  };
  return true;
}

export const REPORT_KINDS = new Set([
  "status", "startup-change", "function-change", "check-changed", "monitor-error"
]);

/** Validate untrusted client telemetry; the sender ID must come separately from the server. */
export function validReport(report) {
  if (!report || report.v !== 1 || !REPORT_KINDS.has(report.kind) ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(report.session ?? "") ||
      !Number.isSafeInteger(report.seq) || report.seq < 1) return false;
  try { return JSON.stringify(report).length <= 16000; } catch { return false; }
}
