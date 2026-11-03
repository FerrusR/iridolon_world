import { createIntegrityWatch, observeCheckRolls } from "./roll-monitor-core.mjs";

/** Uses an isolated Roll subclass. Never patches global dice functions or creates chat documents. */
export async function runRollMonitorSelfTest(RollClass) {
  const checks = [];
  const record = (name, passed) => checks.push({ name, passed: !!passed });
  const target = { handler: (value) => value };
  const original = target.handler;
  const watch = createIntegrityWatch({ handler: () => target.handler });
  try {
    target.handler = function (...args) { return original.apply(this, args); };
    record("Замена функции обнаружена; её поведение сохранено",
      watch.scan().length === 1 && target.handler(17) === 17);
  } finally {
    target.handler = original;
  }
  record("Восстановление функции обнаружено", watch.scan().length === 1);

  try {
    class ProbeRoll extends RollClass {
      // ChatMessage reconstructs rolls by registered class name, even with create:false.
      toJSON() { return { ...super.toJSON(), class: RollClass.name }; }
    }
    const events = [];
    if (!observeCheckRolls(ProbeRoll, (event) => events.push(event))) throw new Error("Unsupported Roll API");
    const roll = new ProbeRoll("1d20 + 7", {}, { type: "skill-check" });
    await roll.evaluate({ allowInteractive: false });
    await roll.toMessage({}, { create: false, messageMode: "gm" });
    record("Обычный check не вызывает событие", events.length === 0);
    const die = roll.dice[0];
    const originalFace = die.results[0].result;
    const alteredFace = originalFace === 20 ? 19 : 20;
    die.results[0].result = alteredFace;
    roll._total += alteredFace - originalFace;
    const alteredTotal = roll.total;
    await roll.toMessage({}, { create: false, messageMode: "gm" });
    record("Изменённый check обнаружен и оставлен без исправления",
      events.length === 1 && events[0].kind === "check-changed" &&
      events[0].detail.before.dice[0].results[0].result === originalFace &&
      events[0].detail.after.dice[0].results[0].result === alteredFace &&
      roll.total === alteredTotal && die.results[0].result === alteredFace);
  } catch (error) {
    checks.push({ name: "Проверка Foundry Roll API", passed: false, error: String(error.message) });
  }
  return { passed: checks.every((check) => check.passed), checks,
    scope: "Local detection logic and Foundry Roll API only; player-to-GM delivery is not tested." };
}
