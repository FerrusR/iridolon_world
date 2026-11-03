/**
 * «Переполняющая сила» — руны под токеном. Часть модуля elinvale-tools (бой у сердца, Гл. 3).
 *
 * Пока на актёре висит эффект slug elinvale-overflowing-power, у каждого его токена
 * на открытой сцене в правом верхнем углу тлеет янтарная руна (JB2A Rune02Loop, Sequencer). Сняли эффект
 * (руками или он истёк в конце боя) — руна гаснет. Свет даёт сам эффект (TokenLight),
 * этот файл только про руны.
 *
 * Руну на каждый токен кладёт один клиент — активный ГМ. Эффекты Sequencer persistent:
 * хранятся на сцене и переживают перезагрузку. После загрузки сцены руны сверяются
 * с эффектами (добавить недостающие, снять лишние).
 *
 * Без модулей sequencer и jb2a_patreon файл ничего не делает (свет остаётся).
 * Пересверить руны на открытой сцене вручную: game.modules.get("elinvale-tools").api.syncOverflowRunes()
 */

const MODULE_ID = "elinvale-tools";
const POWER_SLUG = "elinvale-overflowing-power";
const RUNE_COUNT = 8;
const runeFile = (n) =>
  `modules/jb2a_patreon/Library/Generic/Magic_Signs/Runes/Rune02Loop_01_0${n}_Regular_Yellow_400x400.webm`;
const runeName = (token) => `elinvale-overflowing-runes-${token.id}`;

const canDraw = () =>
  game.modules.get("sequencer")?.active && game.modules.get("jb2a_patreon")?.active && !!canvas?.ready;

// Один исполнитель на весь стол, иначе каждый клиент положит свою руну.
const isLeadGM = () => game.users.activeGM?.isSelf ?? false;

const hasPower = (actor, ignoreId = null) =>
  !!actor?.items?.some((i) => i.type === "effect" && i.slug === POWER_SLUG && i.id !== ignoreId);

// Руна закреплена за актёром: у одного PC всегда один и тот же знак.
function runeFor(actor) {
  let hash = 0;
  for (const ch of actor.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return runeFile((hash % RUNE_COUNT) + 1);
}

async function syncToken(token, ignoreId = null) {
  const actor = token?.actor;
  if (!actor) return;
  const name = runeName(token);
  const playing = Sequencer.EffectManager.getEffects({ name, object: token }).length > 0;
  const wanted = hasPower(actor, ignoreId);

  if (wanted && !playing) {
    // Над токеном, в правом верхнем углу: под токеном руну закрывает непрозрачный диск
    // токенов pf2e-tokens, а слева сверху Foundry рисует иконки состояний.
    await new Sequence()
      .effect()
        .file(runeFor(actor))
        .attachTo(token, { bindVisibility: true, offset: { x: 0.38, y: -0.38 }, gridUnits: true })
        .scaleToObject(0.55)
        .opacity(0.9)
        .fadeIn(1200)
        .fadeOut(1200)
        .persist()
        .name(name)
      .play();
  } else if (!wanted && playing) {
    await Sequencer.EffectManager.endEffects({ name, object: token });
  }
}

async function syncActor(actor, ignoreId = null) {
  if (!actor || !canDraw() || !isLeadGM()) return;
  for (const token of actor.getActiveTokens()) await syncToken(token, ignoreId);
}

async function syncScene() {
  if (!canDraw() || !isLeadGM()) return;
  for (const token of canvas.tokens.placeables) await syncToken(token);
}

const report = (err) => console.error(`${MODULE_ID} | Переполняющая сила:`, err);
const isPower = (item) => item.type === "effect" && item.slug === POWER_SLUG;

Hooks.on("createItem", (item) => {
  if (isPower(item)) syncActor(item.actor).catch(report);
});

Hooks.on("deleteItem", (item) => {
  if (isPower(item)) syncActor(item.actor, item.id).catch(report);
});

// Токен с эффектом вытащили на сцену во время игры.
Hooks.on("createToken", (tokenDoc) => {
  if (tokenDoc.parent !== canvas?.scene || !hasPower(tokenDoc.actor)) return;
  setTimeout(() => {
    if (tokenDoc.object && canDraw() && isLeadGM()) syncToken(tokenDoc.object).catch(report);
  }, 500);
});

// Sequencer поднял сохранённые эффекты открытой сцены — теперь сверка без риска дублей.
Hooks.on("sequencerEffectManagerReady", () => {
  syncScene().catch(report);
});

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  if (!module) return;
  module.api = Object.assign(module.api ?? {}, { syncOverflowRunes: syncScene });
});
