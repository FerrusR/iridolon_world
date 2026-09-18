/**
 * Музыкальный пульт (music cues) — часть модуля elinvale-tools.
 *
 * Список «ситуация → трек» с папками. Клик по ▶ глушит всю играющую музыку
 * и запускает выбранный трек; Shift+клик — запускает поверх, ничего не глуша.
 * Трек добавляется перетаскиванием из вкладки Playlists.
 *
 * Данные лежат в world-настройке elinvale-tools.musicCues (видит только GM).
 */

const MODULE_ID = "elinvale-tools";
const SETTING = "musicCues";
const DATA_VERSION = 1;
const DRAG_TYPE = "elinvale-tools.node";

const { ApplicationV2, DialogV2 } = foundry.applications.api;

/* ------------------------------------------------------------------ утилиты */

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const newId = () => foundry.utils.randomID(16);

const lookup = (uuid) => (foundry.utils.fromUuid ?? globalThis.fromUuid)(uuid);

const lookupSync = (uuid) => {
  try {
    return (foundry.utils.fromUuidSync ?? globalThis.fromUuidSync)(uuid) ?? null;
  } catch (err) {
    return null;
  }
};

const docLabel = (doc) =>
  doc?.documentName === "PlaylistSound" ? `${doc.parent?.name ?? "?"} / ${doc.name}` : doc?.name ?? "";

/* ------------------------------------------------------------ модель данных */

export function makeCue(label = "Новая запись") {
  return { id: newId(), type: "cue", label, uuid: "", track: "" };
}

export function makeFolder(name = "Новая папка") {
  return { id: newId(), type: "folder", name, collapsed: false, children: [] };
}

/** Обход дерева; fn возвращает false — обход прекращается. */
export function walk(items, fn, parent = null) {
  for (let i = 0; i < items.length; i++) {
    const node = items[i];
    if (fn(node, items, i, parent) === false) return false;
    if (node.type === "folder" && Array.isArray(node.children)) {
      if (walk(node.children, fn, node) === false) return false;
    }
  }
  return true;
}

export function findNode(data, id) {
  if (!id) return null;
  let found = null;
  walk(data.items, (node, siblings, index, parent) => {
    if (node.id !== id) return;
    found = { node, siblings, index, parent };
    return false;
  });
  return found;
}

export function detachNode(data, id) {
  const hit = findNode(data, id);
  if (!hit) return null;
  hit.siblings.splice(hit.index, 1);
  return hit.node;
}

export function isDescendant(node, id) {
  if (!node) return false;
  if (node.id === id) return true;
  if (node.type !== "folder") return false;
  return (node.children ?? []).some((child) => isDescendant(child, id));
}

export function containerFor(data, parentId) {
  if (!parentId) return data.items;
  const hit = findNode(data, parentId);
  if (!hit || hit.node.type !== "folder") return data.items;
  hit.node.children ??= [];
  return hit.node.children;
}

export function insertNode(data, node, parentId = null, index = null) {
  const list = containerFor(data, parentId);
  if (index === null || index < 0 || index > list.length) list.push(node);
  else list.splice(index, 0, node);
  return node;
}

/** Переносит узел: либо внутрь папки parentId, либо перед узлом beforeId. */
export function moveNode(data, id, { parentId = null, beforeId = null } = {}) {
  const hit = findNode(data, id);
  if (!hit) return false;
  if (parentId && (parentId === id || isDescendant(hit.node, parentId))) return false;
  if (beforeId && (beforeId === id || isDescendant(hit.node, beforeId))) return false;
  if (beforeId && !findNode(data, beforeId)) return false;

  detachNode(data, id);

  if (beforeId) {
    const before = findNode(data, beforeId);
    if (!before) {
      data.items.push(hit.node);
      return true;
    }
    before.siblings.splice(before.index, 0, hit.node);
    return true;
  }

  insertNode(data, hit.node, parentId, null);
  return true;
}

/* ----------------------------------------------------------- чтение / запись */

export function readData() {
  const raw = game.settings.get(MODULE_ID, SETTING);
  const data = foundry.utils.deepClone(raw ?? {});
  if (!Array.isArray(data.items)) data.items = [];
  data.v ??= DATA_VERSION;
  return data;
}

export async function writeData(data) {
  return game.settings.set(MODULE_ID, SETTING, { v: DATA_VERSION, items: data.items ?? [] });
}

/* ------------------------------------------------------------ воспроизведение */

/** Останавливает всё, что играет или стоит на паузе в плейлистах. */
export async function stopEverything() {
  const active = game.playlists.filter(
    (p) => p.playing || p.sounds.some((s) => s.playing || s.pausedTime)
  );
  for (const playlist of active) await playlist.stopAll();
  return active.length;
}

export function isPlaying(uuid) {
  const doc = uuid ? lookupSync(uuid) : null;
  if (!doc) return false;
  if (doc.documentName === "PlaylistSound") return !!doc.playing;
  if (doc.documentName === "Playlist") return !!doc.playing;
  return false;
}

export async function playCue(cue, { layer = false } = {}) {
  if (!cue?.uuid) {
    ui.notifications.warn("У записи нет трека: перетащи трек из вкладки Playlists на строку.");
    return null;
  }
  const doc = await lookup(cue.uuid);
  if (!doc) {
    ui.notifications.warn(`Трек не найден: ${cue.track || cue.uuid}. Похоже, его удалили из плейлистов.`);
    return null;
  }
  if (!layer) await stopEverything();
  if (doc.documentName === "PlaylistSound") return doc.parent.playSound(doc);
  if (doc.documentName === "Playlist") return doc.playAll();
  ui.notifications.warn("Запись ссылается не на трек и не на плейлист.");
  return null;
}

/* ------------------------------------------------------------------- разметка */

function cueHtml(node, depth) {
  const doc = node.uuid ? lookupSync(node.uuid) : null;
  const missing = !!node.uuid && !doc;
  const track = node.track || docLabel(doc);
  const icon = !node.uuid ? "fa-arrow-down-long" : missing ? "fa-triangle-exclamation" : "fa-music";
  const trackText = node.uuid
    ? esc(track || node.uuid)
    : "перетащи сюда трек из Playlists";
  return `
<li class="row cue${missing ? " is-missing" : ""}" data-id="${node.id}" data-kind="cue"
    data-uuid="${esc(node.uuid)}" data-drop="cue" draggable="true" style="--depth:${depth}">
  <i class="fa-solid fa-grip-vertical handle"></i>
  <button type="button" class="play" data-action="play"
          data-tooltip="Играть — глушит остальное. Shift — поверх, ничего не глуша">
    <i class="fa-solid fa-play"></i>
  </button>
  <div class="fields">
    <input type="text" class="label" data-field="label" value="${esc(node.label)}" placeholder="Ситуация">
    <div class="track" title="${esc(track)}">
      <i class="fa-solid ${icon}"></i>
      <span>${trackText}</span>
      ${node.uuid ? `<button type="button" class="mini" data-action="clearTrack" data-tooltip="Убрать трек"><i class="fa-solid fa-xmark"></i></button>` : ""}
    </div>
  </div>
  <button type="button" class="mini danger" data-action="remove" data-tooltip="Удалить запись">
    <i class="fa-solid fa-trash"></i>
  </button>
</li>`;
}

function folderHtml(node, depth) {
  return `
<li class="row folder" data-id="${node.id}" data-kind="folder" data-drop="folder"
    draggable="true" style="--depth:${depth}">
  <i class="fa-solid fa-grip-vertical handle"></i>
  <button type="button" class="twisty" data-action="toggleFolder" data-tooltip="Свернуть / развернуть">
    <i class="fa-solid ${node.collapsed ? "fa-folder" : "fa-folder-open"}"></i>
  </button>
  <input type="text" class="label" data-field="name" value="${esc(node.name)}" placeholder="Название">
  <button type="button" class="mini" data-action="addCue" data-tooltip="Запись в эту папку">
    <i class="fa-solid fa-plus"></i>
  </button>
  <button type="button" class="mini" data-action="addFolder" data-tooltip="Папка внутри">
    <i class="fa-solid fa-folder-plus"></i>
  </button>
  <button type="button" class="mini danger" data-action="remove" data-tooltip="Удалить папку">
    <i class="fa-solid fa-trash"></i>
  </button>
</li>`;
}

/* -------------------------------------------------------------------- actions */

function nodeIdFrom(target) {
  return target?.closest("[data-id]")?.dataset.id ?? null;
}

async function onPlay(event, target) {
  const hit = findNode(readData(), nodeIdFrom(target));
  if (!hit || hit.node.type !== "cue") return;
  await playCue(hit.node, { layer: event.shiftKey });
}

async function onStopAll() {
  const stopped = await stopEverything();
  if (!stopped) ui.notifications.info("Музыка и так не играет.");
}

async function onAddCue(event, target) {
  const data = readData();
  const parentId = nodeIdFrom(target);
  const parent = findNode(data, parentId);
  const inFolder = parent && parent.node.type === "folder";
  if (inFolder) parent.node.collapsed = false;
  const cue = insertNode(data, makeCue(""), inFolder ? parentId : null, null);
  this.focusId = cue.id;
  await writeData(data);
}

async function onAddFolder(event, target) {
  const data = readData();
  const parentId = nodeIdFrom(target);
  const parent = findNode(data, parentId);
  const inFolder = parent && parent.node.type === "folder";
  if (inFolder) parent.node.collapsed = false;
  const folder = insertNode(data, makeFolder(""), inFolder ? parentId : null, null);
  this.focusId = folder.id;
  await writeData(data);
}

async function onRemove(event, target) {
  const data = readData();
  const hit = findNode(data, nodeIdFrom(target));
  if (!hit) return;
  const isFullFolder = hit.node.type === "folder" && (hit.node.children?.length ?? 0) > 0;
  if (isFullFolder) {
    const ok = await DialogV2.confirm({
      window: { title: "Удалить папку" },
      content: `<p>Удалить папку «${esc(hit.node.name)}» вместе со всем, что внутри?</p>`
    });
    if (!ok) return;
  }
  detachNode(data, hit.node.id);
  await writeData(data);
}

async function onToggleFolder(event, target) {
  const data = readData();
  const hit = findNode(data, nodeIdFrom(target));
  if (!hit || hit.node.type !== "folder") return;
  hit.node.collapsed = !hit.node.collapsed;
  await writeData(data);
}

async function onClearTrack(event, target) {
  const data = readData();
  const hit = findNode(data, nodeIdFrom(target));
  if (!hit || hit.node.type !== "cue") return;
  hit.node.uuid = "";
  hit.node.track = "";
  await writeData(data);
}

async function onJson() {
  const current = JSON.stringify(readData(), null, 2);
  const result = await DialogV2.prompt({
    window: { title: "Музыкальный пульт — JSON" },
    position: { width: 640 },
    content: `<p class="notes">Скопируй текст, чтобы сохранить список, или вставь сюда сохранённый и нажми «Применить» (текущий список будет заменён).</p>
<textarea name="payload" style="width:100%;height:22em;font-family:monospace">${esc(current)}</textarea>`,
    ok: { label: "Применить", callback: (event, button) => button.form.elements.payload.value },
    rejectClose: false
  });
  if (!result) return;
  let parsed;
  try {
    parsed = JSON.parse(result);
  } catch (err) {
    ui.notifications.error(`Это не похоже на JSON: ${err.message}`);
    return;
  }
  if (!parsed || !Array.isArray(parsed.items)) {
    ui.notifications.error("В JSON нет массива items — список не заменён.");
    return;
  }
  await writeData(parsed);
  ui.notifications.info("Список записей заменён.");
}

/* ------------------------------------------------------------------- перенос */

async function handleDrop(event, row) {
  event.preventDefault();
  event.stopPropagation();
  row?.classList.remove("drop-target");

  let payload;
  try {
    payload = JSON.parse(event.dataTransfer.getData("text/plain"));
  } catch (err) {
    return;
  }

  const data = readData();
  const targetId = row?.dataset.id ?? null;
  const kind = row?.dataset.kind ?? null;

  // перетаскивание строки внутри пульта
  if (payload?.type === DRAG_TYPE) {
    if (!payload.id || payload.id === targetId) return;
    let moved;
    if (!row) moved = moveNode(data, payload.id, {});
    else if (kind === "folder") moved = moveNode(data, payload.id, { parentId: targetId });
    else moved = moveNode(data, payload.id, { beforeId: targetId });
    if (moved) await writeData(data);
    return;
  }

  // трек или плейлист из сайдбара
  if (payload?.type !== "PlaylistSound" && payload?.type !== "Playlist") return;
  const doc = await lookup(payload.uuid);
  if (!doc) {
    ui.notifications.warn("Не удалось прочитать перетащенный трек.");
    return;
  }

  if (kind === "cue") {
    const hit = findNode(data, targetId);
    if (!hit) return;
    hit.node.uuid = doc.uuid;
    hit.node.track = docLabel(doc);
    if (!hit.node.label?.trim()) hit.node.label = doc.name;
  } else {
    const cue = makeCue(doc.name);
    cue.uuid = doc.uuid;
    cue.track = docLabel(doc);
    if (kind === "folder") {
      const folder = findNode(data, targetId);
      if (folder?.node.type === "folder") folder.node.collapsed = false;
    }
    insertNode(data, cue, kind === "folder" ? targetId : null, null);
  }
  await writeData(data);
}

/* ----------------------------------------------------------------------- окно */

export class MusicCuesApp extends ApplicationV2 {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: "elinvale-music-cues",
    classes: ["elinvale-music-cues"],
    tag: "div",
    window: { title: "Музыкальный пульт", icon: "fa-solid fa-music", resizable: true },
    position: { width: 440, height: 620 },
    actions: {
      play: onPlay,
      stopAll: onStopAll,
      addCue: onAddCue,
      addFolder: onAddFolder,
      remove: onRemove,
      toggleFolder: onToggleFolder,
      clearTrack: onClearTrack,
      json: onJson
    }
  };

  filter = "";
  focusId = null;

  static open() {
    if (!game.user.isGM) {
      ui.notifications.warn("Музыкальный пульт доступен только мастеру.");
      return null;
    }
    MusicCuesApp.instance ??= new MusicCuesApp();
    MusicCuesApp.instance.render({ force: true });
    return MusicCuesApp.instance;
  }

  static toggle() {
    if (MusicCuesApp.instance?.rendered) MusicCuesApp.instance.close();
    else MusicCuesApp.open();
  }

  static refresh() {
    if (MusicCuesApp.instance?.rendered) MusicCuesApp.instance.render();
  }

  static refreshState() {
    MusicCuesApp.instance?.refreshState();
  }

  async _renderHTML() {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = this.#buildHTML();
    return wrapper;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(...result.childNodes);
  }

  _onRender() {
    this.#activateListeners();
    this.#applyFilter();
    this.refreshState();
    if (this.focusId) {
      const input = this.element.querySelector(`[data-id="${this.focusId}"] input.label`);
      this.focusId = null;
      input?.focus();
      input?.select();
    }
  }

  #buildHTML() {
    const data = readData();
    const rows = [];
    const render = (items, depth) => {
      for (const node of items) {
        if (node.type === "folder") {
          rows.push(folderHtml(node, depth));
          if (!node.collapsed) render(node.children ?? [], depth + 1);
        } else {
          rows.push(cueHtml(node, depth));
        }
      }
    };
    render(data.items, 0);

    const empty = `<p class="hint">Пока пусто. «+» — новая запись, «папка +» — группа.
      Трек перетаскивается из вкладки Playlists прямо на строку (или на папку — тогда запись создастся сама).</p>`;

    return `
<div class="cues-toolbar">
  <button type="button" class="stop" data-action="stopAll" data-tooltip="Остановить всю музыку">
    <i class="fa-solid fa-stop"></i> Стоп
  </button>
  <input type="search" class="cues-filter" placeholder="Поиск…" value="${esc(this.filter)}">
  <button type="button" class="mini" data-action="addCue" data-tooltip="Новая запись">
    <i class="fa-solid fa-plus"></i>
  </button>
  <button type="button" class="mini" data-action="addFolder" data-tooltip="Новая папка">
    <i class="fa-solid fa-folder-plus"></i>
  </button>
  <button type="button" class="mini" data-action="json" data-tooltip="Экспорт / импорт (JSON)">
    <i class="fa-solid fa-file-code"></i>
  </button>
</div>
<ol class="cue-list" data-drop="root">${rows.join("")}</ol>
${rows.length ? "" : empty}`;
  }

  #activateListeners() {
    const root = this.element;
    if (!root) return;

    for (const input of root.querySelectorAll("input[data-field]")) {
      input.addEventListener("change", async (event) => {
        const field = event.currentTarget.dataset.field;
        const id = nodeIdFrom(event.currentTarget);
        const data = readData();
        const hit = findNode(data, id);
        if (!hit) return;
        hit.node[field] = event.currentTarget.value;
        await writeData(data);
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      });
    }

    const filterInput = root.querySelector(".cues-filter");
    filterInput?.addEventListener("input", (event) => {
      this.filter = event.currentTarget.value;
      this.#applyFilter();
    });

    for (const row of root.querySelectorAll(".row")) {
      row.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", JSON.stringify({ type: DRAG_TYPE, id: row.dataset.id }));
        event.dataTransfer.effectAllowed = "move";
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", () => row.classList.remove("dragging"));
      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.stopPropagation();
        row.classList.add("drop-target");
      });
      row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
      row.addEventListener("drop", (event) => handleDrop(event, row));
    }

    const list = root.querySelector(".cue-list");
    list?.addEventListener("dragover", (event) => event.preventDefault());
    list?.addEventListener("drop", (event) => handleDrop(event, null));
  }

  #applyFilter() {
    const root = this.element;
    if (!root) return;
    const query = this.filter.trim().toLowerCase();
    for (const row of root.querySelectorAll(".row")) {
      if (!query) {
        row.classList.remove("filtered-out");
        continue;
      }
      const haystack =
        row.dataset.kind === "cue"
          ? `${row.querySelector("input.label")?.value ?? ""} ${row.querySelector(".track span")?.textContent ?? ""}`
          : "";
      row.classList.toggle("filtered-out", !haystack.toLowerCase().includes(query));
    }
  }

  refreshState() {
    const root = this.element;
    if (!root) return;
    for (const row of root.querySelectorAll(".row.cue")) {
      row.classList.toggle("is-playing", isPlaying(row.dataset.uuid));
    }
  }
}

/* --------------------------------------------------------------- точки входа */

class MusicCuesMenu extends ApplicationV2 {
  render() {
    MusicCuesApp.open();
    return this;
  }
}

function injectDirectoryButton(element) {
  try {
    const root = element instanceof HTMLElement ? element : element?.[0];
    if (!root || root.querySelector(".elinvale-cues-open")) return;
    const header =
      root.querySelector(".header-actions") ??
      root.querySelector(".directory-header .action-buttons") ??
      root.querySelector(".directory-header");
    if (!header) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "elinvale-cues-open";
    button.innerHTML = `<i class="fa-solid fa-music"></i> Пульт`;
    button.addEventListener("click", () => MusicCuesApp.open());
    header.append(button);
  } catch (err) {
    console.warn(`${MODULE_ID} | не удалось добавить кнопку пульта в сайдбар`, err);
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: { v: DATA_VERSION, items: [] },
    onChange: () => MusicCuesApp.refresh()
  });

  try {
    game.settings.registerMenu(MODULE_ID, "openMusicCues", {
      name: "Музыкальный пульт",
      label: "Открыть пульт",
      hint: "Список «ситуация → трек» для сессии.",
      icon: "fa-solid fa-music",
      type: MusicCuesMenu,
      restricted: true
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | пункт настроек для пульта не зарегистрирован`, err);
  }

  game.keybindings.register(MODULE_ID, "openMusicCues", {
    name: "Музыкальный пульт: открыть / закрыть",
    editable: [{ key: "KeyM", modifiers: ["Control"] }],
    restricted: true,
    onDown: () => {
      MusicCuesApp.toggle();
      return true;
    }
  });
});

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  if (!module) return;
  module.api = Object.assign(module.api ?? {}, {
    openMusicCues: () => MusicCuesApp.open(),
    toggleMusicCues: () => MusicCuesApp.toggle(),
    stopAllMusic: () => stopEverything(),
    MusicCuesApp
  });
});

Hooks.on("renderPlaylistDirectory", (app, element) => {
  if (!game.user?.isGM) return;
  injectDirectoryButton(element);
});

for (const hook of [
  "updatePlaylist",
  "updatePlaylistSound",
  "createPlaylistSound",
  "deletePlaylistSound",
  "deletePlaylist"
]) {
  Hooks.on(hook, () => MusicCuesApp.refreshState());
}
