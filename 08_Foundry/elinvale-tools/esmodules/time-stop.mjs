/**
 * «Остановка времени» — часть модуля elinvale-tools (бой у сердца, Гл. 3).
 *
 * Тумблер FXMaster на сцене, которая открыта у ГМ (canvas.scene), а не на активной:
 * можно спокойно гонять на тестовой сцене, пока игроки сидят на другой.
 * Включено — краски уходят, всё заливает тусклым янтарём, в воздухе висят
 * почти неподвижные золотые искры. Повторный вызов на той же сцене выключает.
 *
 * Хотбар: макрос «Остановка времени» из пака «Элинваль — макросы ГМ»,
 * или game.modules.get("elinvale-tools").api.toggleTimeStop()
 */

const MODULE_ID = "elinvale-tools";
const TOGGLE_KEY = "elinvale-time-stop";

const TIME_STOP_EFFECTS = [
  {
    kind: "filter",
    type: "color",
    options: {
      belowTokens: false,
      color: { value: "#ffd9a0", apply: true },
      saturation: 0.25,
      contrast: 1.1,
      brightness: 0.9,
      gamma: 1
    }
  },
  {
    kind: "particle",
    type: "stars",
    options: {
      belowTokens: false,
      tint: { value: "#ffc04d", apply: true },
      scale: 0.8,
      speed: 0.1,
      lifetime: 5,
      density: 0.2,
      alpha: 0.8
    }
  }
];

async function toggleTimeStop(scene = canvas?.scene) {
  if (!game.user.isGM) {
    ui.notifications.warn("Остановку времени включает только ГМ.");
    return null;
  }
  if (!game.modules.get("fxmaster")?.active || !globalThis.FXMASTER?.api?.effects) {
    ui.notifications.warn("Остановка времени: нужен активный модуль FXMaster.");
    return null;
  }
  if (!scene) {
    ui.notifications.warn("Остановка времени: не открыта ни одна сцена.");
    return null;
  }

  const result = await FXMASTER.api.effects.toggle({
    effects: TIME_STOP_EFFECTS,
    toggleKey: TOGGLE_KEY,
    scene
  });
  const active = !!result?.active;
  ui.notifications.info(`Время ${active ? "остановлено" : "снова идёт"}: сцена «${scene.name}».`);
  return active;
}

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  if (!module) return;
  module.api = Object.assign(module.api ?? {}, { toggleTimeStop });
});
