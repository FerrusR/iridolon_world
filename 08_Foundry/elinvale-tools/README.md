# Elinvale tools (`elinvale-tools`) — модуль Foundry VTT (PF2e)

**Единый модуль-контейнер** для всего хоумбрю мира. Сейчас в нём два пака — **deities**
(пятёрка богов) и **items** (предметы-реликвии). В будущем сюда же добавляются новые паки
(монстры, журналы, макросы) — отдельный модуль на каждое мелкое изменение плодить не нужно.

Пак **deities**: Темпус (Время/Судьба), Вирелла (Жизнь), Морана (Смерть), Магнус
(Справедливость), Лире (Удача). Совместимо с Foundry **v14** и системой **PF2e 8.x**.

Каждый бог заполнен по канону волта: сфера, эдикты, анафема, кто поклоняется, а также
механические поля PF2e — Divine Font, Divine Skill, Divine Attribute, Favored Weapon и
домены (primary + alternate). Текст — player-facing.

Пак **items** — реликвии PC (по одной на игрока) с их Gift 1 и seed-свойствами.
Канон механики — в волте: `06_Mechanics/Реликвии — хоумрул.md`. Подробнее ниже.

---

## Установка и выкатка

Компендиум — это база LevelDB, её нельзя редактировать руками: её надо **скомпилировать**
официальным CLI. Нужен установленный Node.js.

### Быстрый путь — `scripts/deploy.sh` (рекомендуется)

Один скрипт делает всё за вызов: пересобирает паки, останавливает Foundry, сносит старую
копию модуля, кладёт свежую (`rsync --delete`, без build-обвязки) и запускает Foundry
обратно. Foundry поднимается назад даже если шаг упал (trap на выходе).

```bash
cd elinvale-tools
npm install @foundryvtt/foundryvtt-cli   # только один раз (CLI нужен для сборки)
./scripts/deploy.sh                       # полный цикл: build → stop → выкатка → start
```

Флаги и настройки:

- `./scripts/deploy.sh --no-build` — выкатить уже собранное, без пересборки.
- `FOUNDRY_MODULES=/путь/к/Data/modules ./scripts/deploy.sh` — переопределить путь к модулям.
- Foundry-сервис — **user-unit** (`systemctl --user foundry.service`), sudo не нужен.

После первой установки в Foundry: **Game Settings → Manage Modules** — включить
«Elinvale tools». Дальше правки исходников выкатываются одним `./scripts/deploy.sh`.

### Вручную (что `deploy.sh` делает под капотом)

```bash
cd elinvale-tools
node scripts/build.mjs                       # пересобирает packs/ из src/ (сам чистит старое)
cd ..

# Foundry должен быть ЗАКРЫТ (или мир не запущен) — иначе LevelDB держит паки
# открытыми/залоченными, и копия либо не применится, либо затрётся при выходе.
systemctl --user stop foundry.service
rm -rf /home/ferrus/foundrydata/Data/modules/elinvale-tools   # снести старую копию ЦЕЛИКОМ
cp -r elinvale-tools /home/ferrus/foundrydata/Data/modules/   # положить свежую
systemctl --user start foundry.service
```

> ### ⚠️ Почему обязательно `rm -rf` перед копированием
>
> Компендиум — это база **LevelDB**, а не один файл: каждый раз, когда Foundry открывает
> мир, он делает компакцию и дописывает в папку пака новые файлы с растущими номерами
> (`000007.ldb`, `MANIFEST-000006`, `LOG.old`, …). `cp -r` поверх существующей папки
> **сливает**: одноимённые файлы перезатирает, а осиротевшие от прошлых компакций —
> **оставляет**. Отсюда два симптома, которые ты и видел:
>
> - **Файлов в `packs/*` становится всё больше** — старьё не удаляется.
> - **Правки «не применяются»** — `CURRENT` в назначении может указывать на старый
>   `MANIFEST`, ссылающийся на устаревшие `.ldb`; смешивать файлы двух разных инстансов
>   LevelDB в одной папке — неопределённое поведение (то свежие данные, то старые).
>
> `build.mjs` свою сторону чистит сам (`rmSync(destDir)` перед сборкой), так что расти
> может только **назначение** в `Data/modules/`. Лечение — сносить его перед копией.
>
> **Альтернатива одной командой** (без ручного `rm`): `rsync` с `--delete` синхронизирует
> назначение с источником, удаляя лишнее:
>
> ```bash
> rsync -a --delete elinvale-tools/ /home/ferrus/foundrydata/Data/modules/elinvale-tools/
> ```

**Добавить новое в модуль позже** (предметы, монстры, журналы, макросы): в `module.json`
допиши запись в массив `packs`, создай папку `src/<имя-пака>/` с JSON-документами и снова
прогони `node scripts/build.mjs`. Всё копится в одном модуле `elinvale-tools`.

---

## После установки: как игроки выбирают бога

1. **Compendium Browser** (иконка книги на боковой панели) → вкладка **Deities**. Чтобы
   боги там появились: в браузере **Settings → Sources** отметь источник «Боги Элинваля».
   Без этого браузер их не индексирует.
2. На листе персонажа: вкладка **Details** → поле **Deity** — перетащить бога из
   компендиума. Домены, шрифт, оружие и навык подтянутся автоматически.

---

## Реликвии PC — как это устроено

Пять реликвий, по одной на игрока. Общая схема одинакова:

- **Реликвия-предмет** (weapon / equipment). Носимые/телесные реликвии — invested
  worn equipment (инвестируешь → дар и seed включаются; снял/разинвестировал — гаснут).
  Пистолеты — weapon (дар активен, пока в руках).
- **`GrantItem`** на реликвии: пока предмет экипирован/инвестирован, соответствующий
  **дар-действие** сам появляется на вкладке **Actions**. Снял предмет — действие исчезает
  (rule elements физических предметов подавляются, когда предмет не экипирован/не
  инвестирован).
- **Дар-действие** (type `action`) несёт `actionType` (action/reaction), `frequency`
  once per hour и `selfEffect` → при использовании автоматически вешает
  **кулдаун-эффект «Дар реликвии — кулдаун (1 ч)»** (общий на все дары; тикает игровым
  временем). В описании — только механика + кликабельные ссылки (`@Check`, `@Damage`,
  `@UUID` на эффекты для перетаскивания). Флейвор Ferrus дописывает сам.
- **Seed-свойства** с бонусом к навыку зашиты как `FlatModifier` (item bonus) прямо на
  реликвии — применяются, пока инвестировано. Рост до +2 на relic 9 — поднять `value`
  вручную. Seed'ы-флейвор (осечки в чужой руке, «жуть в зеркалах») не автоматизированы.

**Кликабельно из карточки действия** (посылаешь действие в чат): `@Template` — кнопка
поставить шаблон (Frost Slick), `@Check` — сейв, `@Damage` — ролл урона/лечения (Rewind
даёт healing-ролл с кнопкой «apply healing» = предотвращённый урон), `@UUID` — перетащить
эффект (panache, resistance, откат, кулдаун).

Что **не** автоматизировано намеренно (отыгрыш вручную): применение difficult terrain и
prone, перезарядка, вражеские сейвы, перемещение, вражеский перебросок misfortune.

| PC | Реликвия (файл) | Дар (Gift 1) | Авто-механика |
|---|---|---|---|
| Тео (Starlord) | Парные пистолеты · `starlord-pistols.json` | Ледяная наледь / *Frost Slick* (`◆◆`, 1/h) | GrantItem→action, кулдаун, **@Template** (10-ft burst) + `@Check[reflex]` + `@Damage[1d6[cold]]` |
| Артур | Золотой шар · `arthur-orb.json` | Отмотка удара / *Rewind the Blow* (`⤾` reaction, 1/h) | +1 item Medicine (Treat Wounds/Battle Medicine), GrantItem→reaction, кулдаун, **@Damage[2d8[healing]]** (кнопка apply healing = предотвращение) |
| Фейт | Книга Судеб · `fate-book.json` | Дурное предзнаменование / *Foretold Misfortune* (`⤾` reaction, 1/h) | +1 item Occultism, GrantItem→reaction, кулдаун, эффект-**откат** (RollTwice keep lower на след. attack/save) |
| Кхар'Хадаг | Мутации · `khar-hadag-mutations.json` | Ответная мутация / *Answering Mutation* (`⤾` reaction, 1/h) | +1 item Survival, GrantItem→reaction, кулдаун, эффект-**resistance 5** (ChoiceSet выбор типа, до конца след. хода) |
| Архелай | Тело и чёрная кровь · `archelaus-body.json` | Хищный бросок / *Predator's Lunge* (`◆` move, 1/h) | +1 item Acrobatics, GrantItem→action, кулдаун, draggable **Effect: Panache** (+5 ft status Speed, `self:effect:panache`) |

**Общие эффекты** (`effect-*.json`): кулдаун-эффект 1 ч (общий), resistance-эффект
Ответной мутации, откат-эффект Дурного предзнаменования, Effect: Panache. Дар-действия и
эффекты лежат в том же паке `items` — их можно и перетаскивать вручную, если GrantItem
почему-то не сработал. Panache — self-contained дубликат: если finisher'ы завязаны на
встроенный тумблер свашбаклера, используй его.

> **Проверить в Foundry после сборки:** что granted-действие появляется при
> equip/invest и исчезает при снятии; что `selfEffect` вешает кулдаун по клику на
> действие; что ChoiceSet Ответной мутации спрашивает тип урона; что `frequency`
> (`per: "PT1H"`) и RollTwice-откат отрабатывают. Рост даров по сюжету (g2/g3/grand) пока
> не вшит — добавим rule elements, когда линии дойдут.

---

## Скрыть богов Paizo (не удаляя)

Богов Paizo штатно удалить нельзя (системные паки залочены), да и не нужно — достаточно
скрыть их от игроков:

1. **Compendium Browser → Settings → Sources** — снять галки с источников Paizo
   (Player Core, Gods & Magic и т.п.). В браузере останутся только твои боги.
2. **Спрятать сам системный пак Deities**: правый клик по компендиуму *Deities* →
   **Configure Ownership** → роли *Player* поставить **None**. GM видит, игроки — нет.

---

## Файлы

```
elinvale-tools/
├── module.json           манифест модуля-контейнера (v14 + pf2e)
├── scripts/build.mjs     сборка LevelDB-паков из src/
├── scripts/deploy.sh     сборка + стоп/старт Foundry + чистая выкатка в Data/modules/
├── src/deities/          исходники богов (по одному JSON)
│   ├── tempus.json  virella.json  morana.json  magnus.json  lire.json
├── src/items/            исходники реликвий, даров и эффектов
│   ├── starlord-pistols.json  arthur-orb.json  fate-book.json
│   ├── khar-hadag-mutations.json  archelaus-body.json      (реликвии-предметы)
│   ├── gift-frost-slick.json  gift-rewind-the-blow.json
│   ├── gift-foretold-misfortune.json  gift-answering-mutation.json
│   ├── gift-predators-lunge.json                            (дары, type action)
│   ├── effect-cooldown-relic-gift.json  effect-answering-mutation.json
│   ├── effect-foretold-misfortune-rider.json  effect-panache.json  (эффекты)
└── README.md             этот файл
```
