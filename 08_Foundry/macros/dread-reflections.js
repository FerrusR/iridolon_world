/* ============================================================================
 * Чужой — Ужас и отражения (Dread Reflections) · v6
 * Игрокам карточки показывают «Жуткая охота» и «Жуткий укус»; механика видна только GM.
 * Foundry VTT v14 · PF2e · PF2e Visioner (желательно)
 *
 * Script-макрос, только для GM. Выдели токен Чужого (или его копию) и запусти.
 * Копии — отдельные несвязанные токены (у Visioner свой signature на каждую копию).
 * Попадание по копии GM разбирает руками: урон — на токен Чужого, у цели −1 frightened.
 *
 * Меню:
 *   • Стон             — цели в 60 футах, карточка спаса Воли, перезарядка 1d4.
 *   • Применить броски — собрать спасы из чата: frightened, копии, видимость.
 *                        Урон при появлении идёт от того же спаса: провал — полный,
 *                        крит. провал — двойной (кнопка Roll Damage на карточке стона, у GM).
 *   • Начало хода      — карточка укуса для целей с frightened 2+.
 * Урон макрос НЕ наносит: карточки дают кнопку спаса и кнопку броска урона (только у GM),
 * урон применяет GM кнопками pf2e (у игроков бывают реакции против урона).
 * Для цели с копией все прочие существа, включая Чужого, undetected: Visioner убирает их с её экрана.
 * Игрок должен держать свой токен выделенным, иначе Visioner не применяет его взгляд.
 *   • Обновить         — убрать копии у тех, чей страх прошёл, и вернуть им видимость
 *                        (то же происходит само при любом запуске макроса).
 *   • Снять всё        — убрать все копии Чужого и вернуть видимость.
 * При каждом запуске макрос сам:
 *   – убирает копии у тех, чей страх прошёл, и все копии мёртвого Чужого;
 *   – подтягивает отставшие копии к их целям;
 *   – выравнивает HP копий по Чужому (полоска у копии не выдаёт подмену).
 * Правила: 06_Mechanics/Чужой — Ужас и отражения.md
 * ========================================================================== */

const CFG = {
  NAME: "Жуткая охота",       // player-facing: название не выдаёт механику
  BITE_NAME: "Жуткий укус",
  DESCRIPTION: "Тварь появляется прямо напротив тебя и хочет тебя сожрать.",
  BITE_DESCRIPTION: "Тварь цепляется острыми зубами прямо в твою плоть.",
  ICON: null,                 // null = портрет актёра Чужого; или путь к картинке
  DC: 19,
  RADIUS: 60,                 // футов
  BITE: "2d6[mental]",
  RECHARGE: "1d4",            // раундов
  TRAITS: ["emotion", "fear", "mental", "occult", "visual"],
  TINT: "#b48cff",            // фиолетовый tint копии
  SCOPE: "world",
  ALIEN_FLAG: "dreadReflections",
  COPY_FLAG: "dreadReflection",
  OPT: "dread-reflections",   // roll option, по которому ловим спасы в чате
  IMMUNITY_SLUG: "dread-reflections-immunity",
  RECHARGE_SLUG: "dread-reflections-recharge",
};

// ---------------------------------------------------------------- guards ----
if (!game.user.isGM) return ui.notifications.warn(`${CFG.NAME}: макрос только для GM.`);
if (!canvas.scene) return ui.notifications.warn(`${CFG.NAME}: нет активной сцены.`);

const DialogV2 = foundry.applications.api.DialogV2;
const visMod = game.modules.get("pf2e-visioner");
const VIS = visMod?.active ? visMod.api : null;
const GM_IDS = ChatMessage.getWhisperRecipients("GM").map((u) => u.id);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const DEGREE_RU = { criticalSuccess: "крит. успех", success: "успех", failure: "провал", criticalFailure: "крит. провал" };

// --------------------------------------------------------------- helpers ----
const copyFlag = (t) => t?.document?.getFlag(CFG.SCOPE, CFG.COPY_FLAG) ?? null;
const isCopy = (t) => !!copyFlag(t);
const allCopies = () => canvas.tokens.placeables.filter(isCopy);
const copiesOf = (A) => allCopies().filter((r) => copyFlag(r).alienId === A.id);
const copyFor = (A, C) => copiesOf(A).find((r) => copyFlag(r).creatureId === C.id) ?? null;
const realTokens = () => canvas.tokens.placeables.filter((t) => t.actor && !isCopy(t));

const alienState = (A) => {
  const state = foundry.utils.deepClone(A.document.getFlag(CFG.SCOPE, CFG.ALIEN_FLAG) ?? {});
  state.pending = (state.pending ?? []).filter((e) => e.kind === "wave");   // укусы больше не отслеживаются
  return state;
};
const saveAlienState = (A, state) => A.document.setFlag(CFG.SCOPE, CFG.ALIEN_FLAG, state);

const fright = (actor) => actor?.conditions?.frightened?.value ?? 0;
const hasEffect = (actor, slug) => actor?.itemTypes.effect.some((e) => e.slug === slug) ?? false;
const avsOn = () => { try { return !!game.settings.get("pf2e-visioner", "autoVisibilityEnabled"); } catch { return false; } };
const speakerOf = (A) => ChatMessage.getSpeaker({ token: A.document });

async function waitToken(id) {
  for (let i = 0; i < 40; i++) {
    const t = canvas.tokens.get(id);
    if (t) return t;
    await sleep(50);
  }
  return null;
}

async function setFrightenedAtLeast(actor, value) {
  if (fright(actor) >= value) return;
  const own = actor.itemTypes.condition.find((c) => c.slug === "frightened" && !c.isLocked);
  if (own) await game.pf2e.ConditionManager.updateConditionValue(own.id, actor, value);
  else await actor.increaseCondition("frightened", { value });
}

async function addEffect(actor, { name, slug, img, rounds = null, minutes = null, text }) {
  const duration = rounds
    ? { value: rounds, unit: "rounds", expiry: "turn-start", sustained: false }
    : { value: minutes ?? 1, unit: "minutes", expiry: "turn-start", sustained: false };
  await actor.createEmbeddedDocuments("Item", [{
    name, type: "effect", img,
    system: {
      slug, duration, tokenIcon: { show: true }, rules: [],
      description: { value: `<p>${text}</p>` },
      level: { value: actor.level ?? 1 }, traits: { rarity: "common", value: [] },
    },
  }]);
}

// --------------------------------------------------- карточки в стиле pf2e ----
function traitTags(traits = CFG.TRAITS) {
  const tags = traits.map((t) => {
    const label = loc(CONFIG.PF2E.actionTraits?.[t] ?? t);
    const tip = CONFIG.PF2E.traitsDescriptions?.[t] ? loc(CONFIG.PF2E.traitsDescriptions[t]) : "";
    return `<span class="tag" data-trait="${t}" data-tooltip="${esc(tip)}">${esc(label)}</span>`;
  }).join("");
  return `<section class="tags paizo-style" data-tooltip-class="pf2e">${tags}</section>`;
}

/** Кнопка спаса как в карточке заклинания; внутри — pf2e inline check, его клик ловит система. */
function saveButton(entry, { basic, damaging = basic, label: name = CFG.NAME }) {
  const saveName = loc(CONFIG.PF2E.saves.will);
  const showDC = !!game.pf2e.settings.metagame?.dcs;
  const label = loc(basic ? "PF2E.SaveDCLabelBasic" : "PF2E.SaveDCLabel", { dc: CFG.DC, type: saveName })
    .replace("<dc>", `<span${showDC ? "" : ' data-visibility="gm"'}>`)
    .replace("</dc>", "</span>");
  const options = [CFG.OPT, entry ? optFor(entry) : null, damaging ? "damaging-effect" : null].filter(Boolean).join(",");
  return `<section class="card-buttons">
    <button type="button" style="padding:0">
      <span data-pf2-check="will" data-pf2-dc="${CFG.DC}" data-pf2-traits="${CFG.TRAITS.join(",")}"
        data-pf2-roll-options="${options}" data-pf2-label="${esc(loc("PF2E.InlineCheck.DCWithName", { name }))}"
        data-pf2-repost-flavor="${esc(name)}" data-roller-role="target"
        style="${FILL_STYLE}">
        <i data-pf2-repost style="display:none"></i>${label}</span>
    </button>
  </section>`;
}

const FILL_STYLE = "all:unset;display:flex;align-items:center;justify-content:center;gap:0.3em;width:100%;height:100%;cursor:pointer";

/** Блок, который видит только GM (pf2e вырезает data-visibility="gm" у игроков). */
const gmOnly = (html) =>
  `<div data-visibility="gm" style="display:block;line-height:normal;padding:0.25em 0.4em;margin-top:0.25em">${html}</div>`;

/** Кнопка «Roll Damage» как в карточке заклинания (видна только GM): pf2e @Damage, заранее обогащённый от лица Чужого. */
async function damageButton(A, { formula, name }) {
  const label = loc("PF2E.Damage.Kind.Damage.Roll.Verb");
  const source = `@Damage[${formula}|traits:${CFG.TRAITS.join(",")}|name:${name}]{${label}}`;
  let html = source;
  try {
    const enriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(source, {
      rollData: A.actor.getRollData(), processVisibility: false,
    });
    const wrap = document.createElement("div");
    wrap.innerHTML = enriched;
    const anchor = wrap.querySelector("a.inline-roll");
    if (anchor) {
      anchor.querySelectorAll("i").forEach((i) => i.remove());   // без иконки кубика, как у кнопки спаса
      anchor.removeAttribute("data-tooltip");
      anchor.setAttribute("style", FILL_STYLE);
      html = anchor.outerHTML;
    }
  } catch (err) { console.warn(`${CFG.NAME} | не удалось подготовить кнопку урона`, err); }
  // Обёртка data-visibility="gm" с display:contents: pf2e вырезает её у игроков, а у GM она не ломает
  // вёрстку кнопки. hidden-to-others — штатная pf2e-подсветка GM-кнопок в карточках.
  return `<section class="card-buttons"><div data-visibility="gm" style="display:contents;line-height:normal">
    <button type="button" class="hidden-to-others" style="padding:0">${html}</button></div></section>`;
}

function abilityCard(A, { title, glyph = null, body, buttons = "" }) {
  const img = CFG.ICON ?? A.actor.img;
  return `<div class="pf2e chat-card item-card">
    <header class="card-header flexrow">
      <img src="${esc(img)}" alt="${esc(title)}" />
      <h3>${esc(title)}${glyph ? ` <span class="action-glyph">${glyph}</span>` : ""}</h3>
      ${traitTags()}
    </header>
    <section class="card-content">${body}</section>
    ${buttons}
  </div>`;
}

/** Служебная карточка для GM (без трейтов). */
function gmCard(A, title, lines, extra = "") {
  const img = CFG.ICON ?? A.actor.img;
  return `<div class="pf2e chat-card item-card">
    <header class="card-header flexrow"><img src="${esc(img)}" alt="" /><h3>${esc(title)}</h3></header>
    <section class="card-content">${lines.length ? `<ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>` : ""}${extra}</section>
  </div>`;
}

// ------------------------------------------------- размещение копии рядом ----
const gs = () => canvas.grid.size;
const rectOf = (doc) => ({
  x: Math.round(doc.x / gs()), y: Math.round(doc.y / gs()),
  w: Math.max(1, Math.round(doc.width)), h: Math.max(1, Math.round(doc.height)),
});
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const adjacent = (a, b) => !overlap(a, b) && a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
const centerPx = (r) => ({ x: (r.x + r.w / 2) * gs(), y: (r.y + r.h / 2) * gs() });

function wallBetween(a, b) {
  try {
    const backend = CONFIG.Canvas.polygonBackends?.move;
    return backend ? !!backend.testCollision(a, b, { type: "move", mode: "any" }) : false;
  } catch { return false; }
}

/** Свободная клетка вплотную к C, ближайшая к Чужому (клетка «по выбору Чужого»). */
function findSpot(C, A, w, h, ignoreIds = []) {
  const c = rectOf(C.document);
  const size = { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
  if (canvas.grid.type !== CONST.GRID_TYPES.SQUARE) {
    return { x: (c.x + c.w) * gs(), y: c.y * gs() };
  }
  const aCenter = centerPx(rectOf(A.document));
  const cCenter = centerPx(c);
  const sr = canvas.dimensions.sceneRect;
  const others = canvas.tokens.placeables
    .filter((t) => t.id !== C.id && !ignoreIds.includes(t.id))
    .map((t) => rectOf(t.document));

  let bestFree = null, bestAny = null;
  for (let ix = c.x - size.w; ix <= c.x + c.w; ix++) {
    for (let iy = c.y - size.h; iy <= c.y + c.h; iy++) {
      const r = { x: ix, y: iy, ...size };
      if (overlap(r, c)) continue;
      const px = ix * gs(), py = iy * gs();
      if (px < sr.x || py < sr.y || px + size.w * gs() > sr.x + sr.width || py + size.h * gs() > sr.y + sr.height) continue;
      const rc = centerPx(r);
      if (wallBetween(cCenter, rc)) continue;
      const score = Math.hypot(rc.x - aCenter.x, rc.y - aCenter.y);
      const cand = { x: px, y: py, score };
      if (!bestAny || score < bestAny.score) bestAny = cand;
      if (!others.some((o) => overlap(r, o)) && (!bestFree || score < bestFree.score)) bestFree = cand;
    }
  }
  const pick = bestFree ?? bestAny;
  return pick ? { x: pick.x, y: pick.y } : { x: (c.x + c.w) * gs(), y: c.y * gs() };
}

// ------------------------------------------------------ видимость (Visioner) ----
/**
 * C видит только копию: все прочие существа, включая самого Чужого, undetected (Visioner прячет их
 * с экрана); копия observed. Прочие копию не видят (undetected). Возвращает прежние состояния C → X для отката.
 */
async function applyVisibility(C, R) {
  if (!VIS) return null;
  const prev = {};
  const updates = [{ observerId: C.id, targetId: R.id, state: "observed" }];
  for (const t of realTokens()) {
    if (t.id === C.id) continue;
    const state = VIS.getVisibility(C.id, t.id) ?? "observed";
    const override = t.document.getFlag("pf2e-visioner", `avs-override-from-${C.id}`) ?? null;
    prev[t.id] = { state, override: override ? foundry.utils.deepClone(override) : null };
    updates.push({ observerId: C.id, targetId: t.id, state: "undetected" });
    updates.push({ observerId: t.id, targetId: R.id, state: "undetected" });
  }
  await VIS.bulkSetVisibility(updates);
  await VIS.updateTokenVisuals?.();
  return prev;
}

async function restoreVisibility(C, prev) {
  if (!VIS || !C || !prev) return;
  const key = `avs-override-from-${C.id}`;
  for (const [tid, p] of Object.entries(prev)) {
    const t = canvas.tokens.get(tid);
    if (!t) continue;
    try {
      await t.document.unsetFlag("pf2e-visioner", key);
      await VIS.setVisibility(C.id, tid, p.state ?? "observed", { isAutomatic: true });
      if (p.override) await t.document.setFlag("pf2e-visioner", key, p.override);
    } catch (err) { console.warn(`${CFG.NAME} | не удалось вернуть видимость ${C.name} → ${t.name}`, err); }
  }
  if (avsOn()) await VIS.autoVisibility?.updateTokens?.([C.id]);
  await VIS.updateTokenVisuals?.();
}

async function syncCopyHp(A, R) {
  const hp = A.actor?.hitPoints;
  const own = R.actor?.hitPoints;
  if (!hp || !own) return;
  const update = {};
  if (own.max !== hp.max) update["system.attributes.hp.max"] = hp.max;   // у NPC max хранится в данных
  if (own.value !== hp.value) update["system.attributes.hp.value"] = hp.value;
  if (Object.keys(update).length) await R.actor.update(update);
}

// ------------------------------------------------------------ копии ----
async function createCopy(A, C) {
  const existing = copyFor(A, C);
  if (existing) return { token: existing, created: false };

  const src = A.document.toObject();
  delete src._id;
  src.actorLink = false;                               // свой синтетический актёр → свой signature в Visioner
  src.hidden = true;                                   // невидима, пока не выставлена видимость
  src.texture = { ...(src.texture ?? {}), tint: CFG.TINT };
  src.sight = { ...(src.sight ?? {}), enabled: false };
  src.flags = foundry.utils.deepClone(src.flags ?? {});
  delete src.flags["pf2e-visioner"];                   // override'ы и карты Чужого копии не нужны
  if (src.flags[CFG.SCOPE]) delete src.flags[CFG.SCOPE][CFG.ALIEN_FLAG];
  foundry.utils.setProperty(src, `flags.${CFG.SCOPE}.${CFG.COPY_FLAG}`, {
    alienId: A.id, creatureId: C.id, prev: null,
  });
  const spot = findSpot(C, A, src.width, src.height);
  src.x = spot.x; src.y = spot.y;

  const [doc] = await canvas.scene.createEmbeddedDocuments("Token", [src]);
  const R = await waitToken(doc.id);
  if (R?.actor) {
    await syncCopyHp(A, R);
    const tells = R.actor.itemTypes.effect.filter((e) => e.slug === CFG.RECHARGE_SLUG).map((e) => e.id);
    if (tells.length) await R.actor.deleteEmbeddedDocuments("Item", tells);   // без иконки перезарядки на копии
  }
  const prev = R ? await applyVisibility(C, R) : null;
  await doc.update({ hidden: false, [`flags.${CFG.SCOPE}.${CFG.COPY_FLAG}.prev`]: prev });
  return { token: R, created: true };
}

async function removeCopy(R) {
  const f = copyFlag(R);
  const C = f ? canvas.tokens.get(f.creatureId) : null;
  if (C && f.prev) await restoreVisibility(C, f.prev);
  const key = `avs-override-from-${R.id}`;
  for (const t of canvas.tokens.placeables) {
    if (t.document.getFlag("pf2e-visioner", key)) await t.document.unsetFlag("pf2e-visioner", key);
  }
  await R.document.delete();
}

/** Уборка и слежение: вызывается при каждом запуске. */
async function maintain(A) {
  const notes = [];
  for (const R of allCopies()) {
    if (!canvas.tokens.get(copyFlag(R).alienId)) { await removeCopy(R); notes.push("убрана копия без Чужого"); }
  }
  if (!A?.actor) return notes;

  if ((A.actor.hitPoints?.value ?? 1) <= 0) {
    const copies = copiesOf(A);
    for (const R of copies) await removeCopy(R);
    if (copies.length) notes.push(`${A.name} мёртв, копии исчезли`);
    return notes;
  }
  for (const R of copiesOf(A)) {
    const C = canvas.tokens.get(copyFlag(R).creatureId);
    if (!C?.actor) { await removeCopy(R); notes.push("убрана копия без цели"); continue; }
    if (fright(C.actor) <= 0) { await removeCopy(R); notes.push(`${C.name}: страх прошёл, отражение исчезло`); continue; }
    await syncCopyHp(A, R);
    if (!adjacent(rectOf(R.document), rectOf(C.document))) {
      const spot = findSpot(C, A, R.document.width, R.document.height, [R.id]);
      await R.document.update({ x: spot.x, y: spot.y });
      notes.push(`${C.name}: отражение подтянулось`);
    }
  }
  return notes;
}

// ------------------------------------------------------- спасы из чата ----
const optFor = (entry) => `${CFG.OPT}:${entry.kind}-${entry.id}`;

function collectOutcomes(entry) {
  const opt = optFor(entry);
  const out = new Map();
  const msgs = game.messages.contents
    .filter((m) => (m.timestamp ?? 0) >= entry.createdAt - 2000)
    .sort((a, b) => a.timestamp - b.timestamp);
  for (const m of msgs) {
    const ctx = m.flags?.pf2e?.context;
    if (!ctx || ctx.type !== "saving-throw" || !ctx.outcome) continue;
    if (!Array.isArray(ctx.options) || !ctx.options.includes(opt)) continue;
    for (const tg of entry.targets) {
      if (ctx.token === tg.tokenId || (tg.linked && ctx.actor === tg.actorId)) out.set(tg.tokenId, ctx.outcome);
    }
  }
  return out;
}

async function rollForMissing(entry, tokenIds) {
  for (const id of tokenIds) {
    const t = canvas.tokens.get(id);
    const stat = t?.actor?.getStatistic("will");
    if (!stat) continue;
    await stat.roll({
      dc: { value: CFG.DC },
      token: t.document,
      traits: CFG.TRAITS,
      extraRollOptions: [CFG.OPT, optFor(entry), "damaging-effect"],
      label: CFG.NAME,
      skipDialog: true,
    });
  }
  await sleep(300);
}

const newEntry = (kind, targets) => ({
  id: foundry.utils.randomID(8).toLowerCase(), kind, createdAt: Date.now(),
  targets: targets.map((t) => ({ tokenId: t.id, actorId: t.actor.id, linked: !!t.document.actorLink, name: t.name })),
});

/** Карточка укуса: кнопки спаса и броска урона. Урон применяет GM кнопками pf2e на карточке урона. */
async function postBiteCard(A, targets) {
  const buttons = saveButton(null, { basic: true, label: CFG.BITE_NAME })
    + await damageButton(A, { formula: CFG.BITE, name: CFG.BITE_NAME });
  await ChatMessage.create({
    speaker: speakerOf(A),
    content: abilityCard(A, {
      title: CFG.BITE_NAME,
      body: `<p><strong>Targets</strong> ${targets.map((t) => esc(t.name)).join(", ")}</p>
        <p><strong>Defense</strong> basic Will</p>
        <hr />
        <p>${esc(CFG.BITE_DESCRIPTION)}</p>
        ${gmOnly(`<p><strong>GM:</strong> ${CFG.BITE.replace(/\[.*\]/, "")} mental, basic Will. Урон <strong>nonlethal</strong>: на 0 HP цель без сознания, но не dying.</p>`)}`,
      buttons,
    }),
  });
}

// ================================================================ шаги ====

async function stepMoan(A) {
  if (hasEffect(A.actor, CFG.RECHARGE_SLUG)) {
    const go = await DialogV2.confirm({
      window: { title: CFG.NAME },
      content: `<p>Способность ещё перезаряжается. Всё равно применить?</p>`,
      rejectClose: false,
    });
    if (!go) return;
  }

  const inRange = realTokens().filter((t) =>
    t.id !== A.id && t.actor.isOfType?.("creature") && A.distanceTo(t) <= CFG.RADIUS);
  if (!inRange.length) return ui.notifications.warn(`${CFG.NAME}: в ${CFG.RADIUS} футах никого нет.`);

  const isEnemy = (t) => (A.actor.alliance && t.actor.alliance)
    ? A.actor.isEnemyOf(t.actor)
    : t.document.disposition !== A.document.disposition;

  const rows = inRange.map((t) => {
    const immune = hasEffect(t.actor, CFG.IMMUNITY_SLUG);
    const dead = t.actor.isDead;
    const checked = isEnemy(t) && !immune && !dead && !t.document.hidden;
    const note = immune ? " <em>(иммунитет)</em>" : dead ? " <em>(мёртв)</em>" : "";
    return `<label style="display:block"><input type="checkbox" name="${t.id}" ${checked ? "checked" : ""}> ${esc(t.name)}${note}</label>`;
  }).join("");

  const picked = await DialogV2.wait({
    window: { title: `${CFG.NAME}: цели` },
    content: `<p>Существа в ${CFG.RADIUS} футах. Отмечены враги без иммунитета.</p>${rows}`,
    buttons: [
      { action: "ok", label: "Стон", default: true,
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
      { action: "cancel", label: "Отмена" },
    ],
    rejectClose: false,
  });
  if (!picked || picked === "cancel") return;
  const targets = inRange.filter((t) => picked[t.id]);
  if (!targets.length) return ui.notifications.warn(`${CFG.NAME}: цели не выбраны.`);

  const state = alienState(A);
  const entry = newEntry("wave", targets);
  state.pending.push(entry);
  await saveAlienState(A, state);

  const recharge = await new Roll(CFG.RECHARGE).evaluate();
  await addEffect(A.actor, {
    name: `${CFG.NAME}: перезарядка`, slug: CFG.RECHARGE_SLUG, img: "icons/svg/sound.svg",
    rounds: recharge.total, text: `${CFG.NAME}: снова доступна через ${recharge.total} р.`,
  });

  await ChatMessage.create({
    speaker: speakerOf(A),
    content: abilityCard(A, {
      title: CFG.NAME,
      glyph: "D",
      body: `<p><strong>Area</strong> ${CFG.RADIUS}-foot emanation; <strong>Targets</strong> ${targets.map((t) => esc(t.name)).join(", ")}</p>
        <p><strong>Defense</strong> Will</p>
        <hr />
        <p>${esc(CFG.DESCRIPTION)}</p>
        ${gmOnly(`<p><strong>Critical Success</strong> не действует, иммунитет 1 мин. <strong>Success</strong> frightened 1.
          <strong>Failure</strong> frightened 2 и ${CFG.BITE.replace(/\[.*\]/, "")} mental. <strong>Critical Failure</strong> frightened 3 и двойной урон.
          Урон <strong>nonlethal</strong>. Каждый испуганный получает отражение.</p>`)}`,
      buttons: saveButton(entry, { basic: false, damaging: true })
        + await damageButton(A, { formula: CFG.BITE, name: CFG.NAME }),
    }),
  });
  await ChatMessage.create({
    speaker: speakerOf(A), whisper: GM_IDS,
    content: gmCard(A, `${CFG.NAME}: GM`, [
      `Перезарядка: <strong>${recharge.total}</strong> р.`,
      "Когда все бросят, жми «Применить броски».",
    ]),
  });
}

async function stepApply(A) {
  const state = alienState(A);
  if (!state.pending.length) return ui.notifications.info(`${CFG.NAME}: нечего применять.`);

  let results = state.pending.map((e) => ({ entry: e, out: collectOutcomes(e) }));
  const missing = results.flatMap(({ entry, out }) => entry.targets.filter((tg) => !out.has(tg.tokenId)).map((tg) => ({ entry, tg })));
  if (missing.length) {
    const choice = await DialogV2.wait({
      window: { title: CFG.NAME },
      content: `<p>Ещё не бросили: <strong>${missing.map((m) => esc(m.tg.name)).join(", ")}</strong>.</p>`,
      buttons: [
        { action: "roll", label: "Бросить за них", default: true },
        { action: "ready", label: "Применить готовые" },
        { action: "cancel", label: "Отмена" },
      ],
      rejectClose: false,
    });
    if (!choice || choice === "cancel") return;
    if (choice === "roll") {
      for (const { entry, tg } of missing) await rollForMissing(entry, [tg.tokenId]);
      results = state.pending.map((e) => ({ entry: e, out: collectOutcomes(e) }));
    }
  }

  const lines = [];
  const damage = { full: [], double: [] };
  const remaining = [];

  for (const { entry, out } of results) {
    const left = [];
    for (const tg of entry.targets) {
      const outcome = out.get(tg.tokenId);
      const t = canvas.tokens.get(tg.tokenId);
      if (!t?.actor) continue;                         // токен пропал — просто забываем
      if (!outcome) { left.push(tg); continue; }

      if (outcome === "criticalSuccess") {
        await addEffect(t.actor, {
          name: `${CFG.NAME}: иммунитет`, slug: CFG.IMMUNITY_SLUG, img: "icons/svg/terror.svg",
          minutes: 1, text: `Временный иммунитет: ${CFG.NAME}.`,
        });
        lines.push(`${esc(t.name)}: крит. успех, иммунитет 1 мин.`);
        continue;
      }
      const value = { success: 1, failure: 2, criticalFailure: 3 }[outcome];
      await setFrightenedAtLeast(t.actor, value);
      const { created } = await createCopy(A, t);
      const f = fright(t.actor);
      const dmg = { failure: "полный урон", criticalFailure: "двойной урон" }[outcome];
      lines.push(`${esc(t.name)}: ${DEGREE_RU[outcome]}, frightened ${f}${created ? ", появилось отражение" : ""}${dmg ? `, <strong>${dmg}</strong>` : ""}`);
      if (outcome === "failure") damage.full.push(esc(t.name));
      if (outcome === "criticalFailure") damage.double.push(esc(t.name));
    }
    if (left.length) remaining.push({ ...entry, targets: left });
  }

  state.pending = remaining;
  await saveAlienState(A, state);

  if (lines.length) {
    const dmgHint = damage.full.length || damage.double.length
      ? `<p><strong>Урон</strong> (Roll Damage на карточке «${esc(CFG.NAME)}», nonlethal):
          ${damage.full.length ? `полный — ${damage.full.join(", ")}` : ""}${damage.full.length && damage.double.length ? "; " : ""}${damage.double.length ? `двойной — ${damage.double.join(", ")}` : ""}.</p>`
      : "";
    await ChatMessage.create({
      speaker: speakerOf(A), whisper: GM_IDS,
      content: gmCard(A, `${CFG.NAME}: итоги`, lines,
        dmgHint + (VIS ? "" : `<p><em>PF2e Visioner не активен: видимость выставь вручную.</em></p>`)),
    });
  }
  if (remaining.length) ui.notifications.info(`${CFG.NAME}: ждём ещё ${remaining.reduce((n, e) => n + e.targets.length, 0)} бросков.`);
}

async function stepTurnStart(A) {
  const targets = copiesOf(A)
    .map((R) => canvas.tokens.get(copyFlag(R).creatureId))
    .filter((C) => C?.actor && fright(C.actor) >= 2);
  if (!targets.length) return ui.notifications.info(`${CFG.NAME}: целей с frightened 2+ нет, копии только изолируют.`);
  await postBiteCard(A, targets);
}

async function stepClearAll(A) {
  const go = await DialogV2.confirm({
    window: { title: CFG.NAME },
    content: `<p>Убрать все копии ${esc(A.name)}, вернуть видимость и забыть ожидающие броски?</p>`,
    rejectClose: false,
  });
  if (!go) return;
  for (const R of copiesOf(A)) await removeCopy(R);
  await saveAlienState(A, { pending: [] });
  ui.notifications.info(`${CFG.NAME}: всё снято.`);
}

// ================================================================ меню ====

function resolveAlien() {
  const ctl = canvas.tokens.controlled;
  for (const t of ctl) {
    const f = copyFlag(t);
    if (f && canvas.tokens.get(f.alienId)) return canvas.tokens.get(f.alienId);
  }
  const plain = ctl.filter((t) => t.actor && !isCopy(t));
  if (plain.length === 1) return plain[0];
  if (plain.length > 1) return null;
  const ids = new Set([
    ...allCopies().map((r) => copyFlag(r).alienId),
    ...canvas.tokens.placeables.filter((t) => alienState(t).pending?.length).map((t) => t.id),
  ]);
  const found = [...ids].map((id) => canvas.tokens.get(id)).filter(Boolean);
  return found.length === 1 ? found[0] : null;
}

const A = resolveAlien();
const housekeeping = await maintain(A);
if (housekeeping.length) ui.notifications.info(`${CFG.NAME}: ${housekeeping.join("; ")}`);
if (!A?.actor) return ui.notifications.warn(`${CFG.NAME}: выдели один токен Чужого.`);
if (A.actor.type === "character") return ui.notifications.warn(`${CFG.NAME}: выделен персонаж игрока, а нужен Чужой.`);

const st = alienState(A);
const copyRows = copiesOf(A).map((R) => {
  const C = canvas.tokens.get(copyFlag(R).creatureId);
  return `<li>${esc(C?.name)}: frightened ${fright(C?.actor)}</li>`;
}).join("") || "<li><em>нет</em></li>";
const pendingRows = st.pending.map((e) => {
  const out = collectOutcomes(e);
  const who = e.targets.map((tg) => `${esc(tg.name)}${out.has(tg.tokenId) ? " ✓" : ""}`).join(", ");
  return `<li>${e.kind === "wave" ? "Стон" : "Укусы"}: ${who}</li>`;
}).join("") || "<li><em>нет</em></li>";
const hp = A.actor.hitPoints;

const action = await DialogV2.wait({
  window: { title: `${CFG.NAME}: ${A.name}` },
  position: { width: 460 },
  content: `
    <p><strong>${esc(A.name)}</strong> · HP ${hp?.value}/${hp?.max}
      · перезарядка: ${hasEffect(A.actor, CFG.RECHARGE_SLUG) ? "идёт" : "готово"}
      ${VIS ? "" : " · <em>Visioner не активен</em>"}</p>
    <p><strong>Отражения</strong></p><ul>${copyRows}</ul>
    <p><em>Попадание по отражению: урон на токен Чужого, у цели −1 frightened.</em></p>
    <p><strong>Ждём спасбросков</strong> (✓ бросил)</p><ul>${pendingRows}</ul>`,
  buttons: [
    { action: "moan", label: "Стон", icon: "fa-solid fa-ghost" },
    { action: "apply", label: "Применить броски", icon: "fa-solid fa-check", default: true },
    { action: "turn", label: "Начало хода Чужого", icon: "fa-solid fa-hourglass-start" },
    { action: "refresh", label: "Обновить", icon: "fa-solid fa-rotate" },
    { action: "clear", label: "Снять всё", icon: "fa-solid fa-broom" },
  ],
  rejectClose: false,
});

switch (action) {
  case "moan": await stepMoan(A); break;
  case "apply": await stepApply(A); break;
  case "turn": await stepTurnStart(A); break;
  case "refresh": {
    const notes = await maintain(A);
    ui.notifications.info(`${CFG.NAME}: ${notes.length ? notes.join("; ") : "всё актуально"}`);
    break;
  }
  case "clear": await stepClearAll(A); break;
  default: break;
}
