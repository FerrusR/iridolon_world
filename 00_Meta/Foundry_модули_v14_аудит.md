# Аудит модулей Foundry — переход v12 → v14

**Дата:** 27 июня 2026. **Контекст:** последняя игра велась на **v12**, целевая — **v14** (stable с 1 апреля 2026). Текущая система **pf2e v8.x** уже совместима с v14. Между v12 и v14 — две мажорные версии, поэтому часть модулей надо обновить, часть выкинуть, часть заменить.

## Как читать статус

- ✅ **v14** — проверено на foundryvtt.com, есть сборка с `Verified 14.x`.
- ⚠️ **v13** — проверено, максимум v13; под v14 ещё не выпущено.
- ❌ — мёртв / устарел / несовместим (проверено).
- 🔶 — **поштучно не проверял**, оценка по автору и активности. Перед запуском проверь строку «Foundry Versions … (Verified …)» на странице модуля.

> Нюанс v14: модули с диапазоном «13+» без верхнего предела обычно **загрузятся с предупреждением**. Модули с жёстким потолком (напр. Token Action HUD Core = `… - 13.999`) Foundry **заблокирует** до обновления автором.

Поштучно проверено ~22 модуля из списка; остальные помечены 🔶.

---

## 1. Оставляем — подтверждено под v14 ✅

| Модуль | Назначение |
|---|---|
| **lib-wrapper** | базовая библиотека (Verified 14) |
| **socketlib** | базовая библиотека (Verified 14) |
| **xdy-pf2e-workbench** | набор QoL/автоматизаций PF2e (14.360) |
| **pf2e-toolbelt** | мелкая автоматизация, таргет-урон, торговцы (14.361) |
| **quick-insert** | быстрый поиск по компендиумам (14.361) |
| **pf2e-ranged-combat** | автоматизация дальнего боя/перезарядки (14) |
| **pf2e-bestiary-tracking** | бестиарий с пошаговым раскрытием инфы (14.360) |
| **pf2e-dorako-ui** | UI-оверхол PF2e (14) |
| **sequencer** | движок визуальных эффектов (14) |
| **fxmaster** | погода/фильтры сцены (14, ветка V8 под «V14 Scene Levels») |
| **tokenmagic** | шейдер-эффекты на токенах/тайлах (14.363) |
| **levels** | многоуровневые карты, theripper93 (14) |

---

## 2. Подождать обновления — пока только v13 ⚠️

Рабочие и активные, но v14-сборки ещё нет. Главный блокер — **стек Token Action HUD** (ядро заперто на `13.999`).

| Модуль | Статус | Комментарий |
|---|---|---|
| **token-action-hud-core** | ⚠️ 13.345 (max 13.999) | блокируется на v14; не обновлялся ~9–10 мес. |
| **token-action-hud-pf2e** | ⚠️ 13.345 | зависит от core выше |
| **pf2e-dailies** | ⚠️ 13.351 | автор reonZ (Toolbelt/HUD уже на v14 — апдейт вероятен) |
| **pf2e-modifiers-matter** | ⚠️ 13 | — |
| **pf2e-creature-sounds** | ⚠️ 13 | «12+», вероятно загрузится с предупреждением |
| **pf2e-flatcheck-helper** (Utility Buttons) | ⚠️ 13 | актив (обновлён 3 нед. назад), но потолок 13 |
| **pf2e-level-up-wizard** | ⚠️ 13 | — |

**Что делать:** либо ждать апдейт, либо временно отключить на время игры. Замена TAH — см. раздел 4.

---

## 3. Удалить — мёртвое / устаревшее ❌

| Модуль | Почему | Замена |
|---|---|---|
| **advanced-macros** | функции в ядре с v10 | не нужна |
| **betterroofs** | крыши делаются ядром/Levels | не нужна |
| **foundryvtt-simple-calendar** | Verified **12**, релизов нет ~2 года | Seasons & Stars / GG Calendar (разд. 4) |
| **pf2e-token-hud** | deprecated, reonZ заменил его | **PF2e HUD** (✅ v14) |
| **pf2e-graphics** | на реестре застрял на **v12 (0.9.4)**, >1 года без обновления | см. разд. 4 |

---

## 4. Замены

- **Календарь** (вместо Simple Calendar): **Seasons & Stars** (v13+) + **Simple Calendar Compatibility Bridge** для модулей, завязанных на SC API. Альтернатива — **GG Calendar** (v12–v14, без зависимостей, SC API-совместим). Не держать SC и мост одновременно.
- **pf2e-token-hud → PF2e HUD** (reonZ, ✅ Verified 14.361) — прямой преемник, ставит твой sidebar/HUD заново.
- **Token Action HUD** (если v14 нужен сейчас): пока обновления нет — переезжай на **PF2e HUD** (его action-панель закрывает большую часть) или жди. Argon Combat HUD тоже ещё на v13.
- **pf2e-graphics**: прямой 1-в-1 замены нет. Пока — связка **JB2A + Sequencer** (+ ручные эффекты) или дождаться v14-сборки; проверь GitHub MrVauxs, не переехал ли проект.

---

## 5. Проверить вручную перед запуском 🔶

Не проверял поштучно. Сгруппировано по ожидаемой вероятности.

**Скорее всего уже под v14 (активные авторы):**
elevationruler · healthEstimate · illandril-token-tooltips · polyglot · token-variants · vtta-tokenizer · wall-height · gm-vision · chat-portrait · smalltime · token-frames · theripper-premium-hub · JB2A_DnD5e · jb2a_patreon · pf2e-animal-companions (Companion Compendia) · _chatcommands · dd-import · maestro · dice-calculator

**Под вопросом / исторически отстают — проверять внимательно:**
monks-active-tiles · monks-little-details · monks-combat-details · monks-combat-marker · monks-chat-timer · monks-sound-enhancements · drag-ruler · colorsettings · lib-df-hotkeys · color-picker · keybind-lib · stairways · combat-tracker-dock · challenge-tracker · breaktime · fvtt-perf-optim · less-chat · user-latency · roll-tracker · tile-scroll · token-z · easy-target · initiative-double-click · foundry-combat-focus · combat-enhancements · foundry-summons · foundry_community_macros · tcal · jaamod

**Moulinette (отдельно):** moulinette-core/-sounds/-tiles/-scenes/-imagesearch/-gameicons — Moulinette ушёл в веб-приложение/подписку; локальные модули частично не нужны. Проверь, нужен ли тебе ещё этот набор.

**PF2e-функциональные (не проверял):**
pf2e-ctrl-click-effects · pf2e-extempore-effects · pf2e-f-is-for-flatfooted · pf2e-giveth · pf2e-jb2a-macros · pf2e-monster-maker · pf2e-party-sheet-helper · pf2e-reaction · pf2e-roll-manager · pf2e-see-simple-scale-statistics · pf2e-subsystem-theming · pf2e-summons-assistant · pf2e-sustain-reminder · pf2e-dorako-ux · pf2-flat-check · pf2-pdf-en-import (Deidril importer)

**Контент (низкий риск — грузится, если система ок):**
pf2e-abomination-vaults · pf2e-ap190-the-choosing · pf2e-ap191-the-destiny-war · pf2e-ap192-the-worst-of-all-possible-worlds · pf2e-ap190-192-stolen-fate · pf2e-decks-harrow · pf2e-tokens-bestiaries · pf2e-tokens-characters · pf2e-tokens-monster-core · pf2e-tokens-myth-and-magic · the-harrowing-map-remakes-by-kalnix · pf2e-bardic-inspiration

---

## 6. Новые/актуальные моды (из официального гайда PF2e, появились после v12)

Проверь v14 у каждого, но это текущее поколение:

- **PF2e HUD** (reonZ) — ✅ v14. Уже рекомендован выше как замена token-hud.
- **PF2e Visioner** — относительная видимость/детект по токенам (sneak/hide на автомате).
- **PF2e Subsystems** — погони, influence, research как подсистемы. (Твой `pf2e-subsystem-theming` — это тема оформления к нему.)
- **PF2e Trigger** (reonZ) — конструктор автоматизаций «условие → действие».
- **PF2e Assistant** — авто-применение эффектов/состояний при действиях.
- **PF2e Request Rolls** — UI для запроса проверок у игроков, инлайн-ссылки.

---

## 7. План апгрейда

1. **Бэкап** мира перед сменой версии.
2. Поставить **Find the Culprit** (✅ v14) — пригодится для отлова конфликтов.
3. Снести мёртвое — раздел 3.
4. Обновить всё через **Module Management → Update All**.
5. ⚠️-модули (раздел 2): TAH-стек отключить или ждать; остальное по желанию.
6. 🔶-модули включать **партиями** (по 5–10), запуская мир между партиями.

---

_Источник статусов: страницы модулей на foundryvtt.com (строка Verified), официальный PF2e GM's Starter Guide, foundryvtt.com/releases. Проверено 27.06.2026._
