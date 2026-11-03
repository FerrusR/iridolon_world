/** Foundry 14 passive roll monitor. Reports are observations, never verdicts about intent. */
import { createIntegrityWatch, observeCheckRolls, validReport } from "./roll-monitor-core.mjs";

const MODULE_ID = "elinvale-tools";
const SETTING = "passiveRollMonitor";
const CHANNEL = `module.${MODULE_ID}`;
const MAX_LOG = 300;
const MAX_PENDING = 40;
const pending = [];
const lastSent = new Map();
const sessions = new Map();
const received = new Map();
let watch, session, sequence = 0, started = false, log = [], timer;
let lastStatus = 0, lastNotification = 0, dropped = 0;
const enabled = () => game.settings.get(MODULE_ID, SETTING) === true;
const safely = (callback) => { try { return callback(); } catch { return undefined; } };

function targets() {
  const terms = () => foundry.dice.terms;
  return {
    "CONFIG.Dice.randomUniform": () => CONFIG.Dice.randomUniform,
    "CONFIG.Dice.fulfillment.methods.mersenne.handler": () => CONFIG.Dice.fulfillment.methods.mersenne.handler,
    "MersenneTwister.random": () => foundry.dice.MersenneTwister.random,
    "DiceTerm.roll": () => terms().DiceTerm.prototype.roll,
    "DiceTerm._roll": () => terms().DiceTerm.prototype._roll,
    "Die.roll": () => terms().Die.prototype.roll,
    "Die._roll": () => terms().Die.prototype._roll,
    "Die.randomFace": () => terms().Die.prototype.randomFace,
    "Die.mapRandomFace": () => terms().Die.prototype.mapRandomFace,
    "Roll.evaluate": () => foundry.dice.Roll.prototype.evaluate,
    "Roll.toMessage": () => foundry.dice.Roll.prototype.toMessage,
    "CONFIG.Dice.terms.d": () => CONFIG.Dice.terms.d,
    "core.diceConfiguration": () => JSON.stringify(game.settings.get("core", foundry.dice.Roll.DICE_CONFIGURATION_SETTING))
  };
}

// Capture before init/setup/ready hooks, so startup modifications remain visible as diagnostics.
const startupWatch = createIntegrityWatch(targets());
const storageKey = () => `${MODULE_ID}.roll-monitor.${game.world.id}.${game.user.id}`;

function persist() {
  safely(() => localStorage.setItem(storageKey(), JSON.stringify(log)));
}

function append(entry) {
  log.push(entry);
  log = log.slice(-MAX_LOG);
  persist();
}

function send(report) {
  return safely(() => {
    const recipients = game.users.filter((user) => user.isGM && user.active).map((user) => user.id);
    if (!recipients.length || !game.socket.connected) return false;
    // Foundry 14's server routes to these users only and appends the authenticated sender ID.
    game.socket.emit(CHANNEL, report, { recipients });
    return true;
  }) ?? false;
}

function flush() {
  for (const entry of [...pending]) {
    if (Date.now() - (lastSent.get(entry.seq) ?? 0) < 5000) continue;
    if (!send(entry)) break;
    lastSent.set(entry.seq, Date.now());
  }
}

function report(kind, detail = {}) {
  const entry = {
    v: 1, session, seq: ++sequence, kind, detail, clientTime: Date.now(),
    core: game.version, system: game.system.version
  };
  if (!validReport(entry)) return;
  if (kind === "status") {
    const previous = pending.findIndex((saved) => saved.kind === "status");
    if (previous >= 0) lastSent.delete(pending.splice(previous, 1)[0].seq);
  }
  pending.push(entry);
  if (pending.length > MAX_PENDING) {
    lastSent.delete(pending.shift().seq);
    dropped++;
  }
  flush();
}

function scan() {
  if (!enabled()) return;
  for (const change of watch.scan()) report("function-change", change);
  flush();
  if (Date.now() - lastStatus > 60000) status();
}

function status() {
  lastStatus = Date.now();
  report("status", { watching: watch.describe(), coverage: "function-integrity-and-check-toMessage", dropped });
}

export function receiveReport(data, senderId) {
  if (!game.user.isGM || !enabled() || !validReport(data)) return;
  const user = game.users.get(senderId);
  if (!user || user.isGM) return;
  // Never trust an ID in the payload. Deduplicate reconnects and bound per-sender traffic.
  const now = Date.now();
  let bucket = received.get(senderId);
  if (!bucket || now - bucket.since > 60000) {
    bucket = { since: now, count: 0, ids: new Set() };
    received.set(senderId, bucket);
  }
  const id = `${data.session}:${data.seq}`;
  if (++bucket.count > 120) return;
  // Application-level acknowledgement also covers a GM tab still loading when a report was sent.
  safely(() => game.socket.emit(CHANNEL, {
    v: 1, kind: "ack", session: data.session, seq: data.seq
  }, { recipients: [user.id] }));
  if (bucket.ids.has(id)) return;
  bucket.ids.add(id);
  const entry = { receivedAt: now, userId: user.id, userName: user.name, ...data };
  // Override untrusted extra properties, even if another client supplies them.
  entry.userId = user.id;
  entry.userName = user.name;
  entry.receivedAt = now;
  if (data.kind === "status") {
    sessions.set(user.id, entry);
    return;
  }
  if (log.some((saved) => saved.userId === user.id && saved.session === data.session && saved.seq === data.seq)) return;
  append(entry);
  if (["function-change", "check-changed", "monitor-error"].includes(data.kind) && now - lastNotification > 10000) {
    lastNotification = now;
    ui.notifications.warn(`Монитор бросков: ${user.name} — ${data.kind === "check-changed"
      ? "результат изменился перед публикацией" : data.kind === "monitor-error"
        ? "проверка работает не полностью" : "изменился код или способ броска"}. Подробности в отчёте.`);
  }
}

export function getRollMonitorReport() {
  if (!game.user.isGM) return null;
  return structuredClone({
    world: game.world.id, exportedAt: Date.now(), enabled: enabled(),
    clients: game.users.filter((user) => !user.isGM && user.active).map((user) => ({
      userId: user.id, userName: user.name,
      lastReport: sessions.get(user.id) ?? null
    })),
    events: log
  });
}

function downloadReport() {
  const report = getRollMonitorReport();
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `roll-monitor-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function testRollMonitor() {
  if (!game.user.isGM) return null;
  const { runRollMonitorSelfTest } = await import("./roll-monitor-self-test.mjs");
  return runRollMonitorSelfTest(foundry.dice.Roll);
}

async function showSelfTest() {
  const result = await testRollMonitor();
  if (!result) return;
  const content = document.createElement("div");
  const explanation = document.createElement("p");
  explanation.textContent = "Локальная проверка. Глобальные функции и чат не меняются. Доставка от игрока проверяется отдельно.";
  content.append(explanation);
  for (const check of result.checks) {
    const row = document.createElement("p");
    row.textContent = `${check.passed ? "PASS" : "FAIL"}: ${check.name}${check.error ? ` (${check.error})` : ""}`;
    content.append(row);
  }
  return foundry.applications.api.DialogV2.wait({
    window: { title: `Монитор бросков: ${result.passed ? "PASS" : "FAIL"}` },
    content: content.outerHTML,
    buttons: [{ action: "close", label: "Закрыть", default: true }]
  });
}

function openReport() {
  if (!game.user.isGM) return;
  const report = getRollMonitorReport();
  const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const clients = report.clients.map((client) => {
    const at = client.lastReport?.receivedAt;
    return `<li>${escape(client.userName)}: ${at
      ? `последний отчёт ${escape(new Date(at).toLocaleTimeString())}` : "отчёта пока нет"}</li>`;
  }).join("");
  const events = [...report.events].reverse().map((event) => `<details><summary>${
    escape(new Date(event.receivedAt).toLocaleString())} · ${escape(event.userName)} · ${escape(event.kind)
  }</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${
    escape(JSON.stringify(event.detail, null, 2))}</pre></details>`).join("");
  return foundry.applications.api.DialogV2.wait({
    window: { title: "Монитор бросков", resizable: true }, position: { width: 720 },
    content: `<p>Технические наблюдения требуют проверки. Отсутствие отчёта не означает вмешательство.</p>
      <ul>${clients || "<li>Нет подключённых игроков.</li>"}</ul>
      <p>Сохранено событий: ${report.events.length}. Журнал хранится только в этом браузере GM.</p>
      <div style="max-height:55vh;overflow:auto">${events || "Событий нет."}</div>`,
    buttons: [
      { action: "test", label: "Самопроверка", callback: showSelfTest },
      { action: "export", label: "Скачать JSON", callback: downloadReport },
      { action: "close", label: "Закрыть", default: true }
    ]
  });
}

function start() {
  if (started || !enabled()) return;
  started = true;
  if (game.user.isGM) {
    const stored = safely(() => JSON.parse(localStorage.getItem(storageKey()) ?? "[]"));
    log = Array.isArray(stored) ? stored.filter((entry) => validReport(entry)).slice(-MAX_LOG) : [];
    game.socket.on(CHANNEL, (data, senderId) => safely(() => receiveReport(data, senderId)));
    return;
  }
  session = crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint32Array(4)),
    (value) => value.toString(16).padStart(8, "0")).join("");
  game.socket.on(CHANNEL, (data, senderId) => safely(() => {
    if (data?.v !== 1 || data.kind !== "ack" || data.session !== session ||
        !game.users.get(senderId)?.isGM) return;
    const index = pending.findIndex((entry) => entry.seq === data.seq);
    if (index >= 0) pending.splice(index, 1);
    lastSent.delete(data.seq);
  }));
  const startupChanges = startupWatch.scan();
  const observing = safely(() => observeCheckRolls(foundry.dice.Roll, (event) => safely(() => {
    if (enabled()) report(event.kind, event.detail);
  })));
  watch = createIntegrityWatch(targets());
  for (const change of startupChanges) report("startup-change", change);
  if (!observing) report("monitor-error", { reason: "Roll API unavailable; only function integrity is observed" });
  status();
  timer = setInterval(() => safely(scan), 1000);
  game.socket.on("connect", () => safely(() => { flush(); status(); }));
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING, {
    name: "Монитор бросков: пассивное наблюдение", scope: "world", config: true, restricted: true,
    hint: "Отчёт GM об изменениях кода и результатов checks. Броски не блокируются. Требуется перезагрузка.",
    type: Boolean, default: true, requiresReload: true
  });
  class RollMonitorMenu extends foundry.applications.api.ApplicationV2 {
    render() { openReport(); return this; }
  }
  game.settings.registerMenu(MODULE_ID, "rollMonitorReport", {
    name: "Монитор бросков", label: "Открыть отчёт", icon: "fa-solid fa-list-check",
    type: RollMonitorMenu, restricted: true
  });
});

Hooks.once("ready", () => {
  if (game.user.isGM) {
    const module = game.modules.get(MODULE_ID);
    module.api = Object.assign(module.api ?? {}, { openRollMonitor: openReport, getRollMonitorReport, testRollMonitor });
  }
  // Let all synchronous ready hooks finish before observing normal session changes.
  setTimeout(() => {
    try { start(); } catch {
      if (game.user.isGM) ui.notifications.warn("Монитор бросков не запущен. Проверь версию Foundry.");
    }
  }, 0);
});

Hooks.on("preCreateChatMessage", () => { if (watch) safely(scan); });
Hooks.on("userConnected", (user, connected) => {
  if (started && !game.user.isGM && user.isGM && connected) safely(() => { flush(); status(); });
});
globalThis.addEventListener?.("pagehide", () => clearInterval(timer));
