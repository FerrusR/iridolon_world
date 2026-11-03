---
type: mechanic
status: canon
updated: 2026-10-27
tags: [mythic, хоумрул]
---

# Mythic — правила стола

Принято Ferrus 2026-10-26. Основа — War of Immortals; ниже три изменения для кампании.

1. **Обычный переброс за Mythic Point.** Можно потратить 1 Mythic Point, чтобы перебросить собственный check по обычным правилам переброса через Hero Point. Используются обычные модификаторы, без повышения до mythic proficiency; второй результат обязателен. Это fortune effect с обычными ограничениями fortune. Отдельного запаса Hero Points нет. Rewrite Fate сохраняется по RAW для skill checks и saving throws.
2. **Обход Mythic Resilience.** Mythic Resilience не повышает degree of success saving throws против эффектов, исходящих от существ с trait mythic, а также против эффектов, которые сами имеют trait mythic. Mythic PC считается мифическим источником и при 0 текущих Mythic Points.
3. **Anathema Calling.** Потеря всех текущих Mythic Points происходит за добровольное нарушение, когда игрок понимает, что действие нарушает anathema. Если это неочевидно, GM сообщает об этом до окончательного выбора действия. У Artisan’s Calling удаляется запрет использовать оружие и предметы, изготовленные другими; остальные положения сохраняются.

## Foundry

Реализация первых двух правил — `08_Foundry/elinvale-tools/esmodules/mythic-rules.mjs`; настройка модуля **Mythic: правила Элинваля**. Anathema применяется GM вручную.

С 2026-10-27 `esmodules/mythic-feats.mjs` автоматизирует RAW-применения двух фитов:
**Ears That Hear the Truth** для Perception initiative и Sense Motive, **Arms That Cut the Waves**
для Athletics check действия Swim. В штатном окне броска появляется выключенный по умолчанию
переключатель соответствующего фита за 1 MP. При включении proficiency заменяется на `level + 10`
только для текущего броска; MP списывается при подтверждении. Отмена окна бесплатна.
Для владельца фита с доступным MP окно открывается и при быстрых бросках. Инициативу обновляет
штатный код PF2e, секретность Sense Motive сохраняется. Продление дыхания из Arms применяется вручную.

В меню сообщения **Rewrite Fate (1 Mythic Point)** остаётся для skill checks и saving throws. **Обычный переброс (1 Mythic Point)** использует исходные модификаторы, включая MAP. Для исходного броска с mythic proficiency сохраняется уже имевшаяся proficiency: обычный переброс её не повышает и не понижает.

Mythic Resilience распознаётся по официальному compendium source, slug или английскому имени. Для способности, созданной вручную с другим именем и без source, GM может поставить флаг `elinvale-tools.mythicResilience: true` на её Item. Сама способность должна содержать обычные AdjustDegreeOfSuccess rule elements. Без автоматизации в исходной способности модуль ничего не добавляет.

Спасбросок должен содержать источник эффекта: использовать кнопку save с карточки заклинания/способности. У отдельного броска с листа NPC нет информации о том, кто вызвал saving throw; в таком случае обход проверяется GM вручную.

Основания и обсуждение: [[PF2e_Mythic_Rules_Issues_and_Fixes]]. Источник Mythic в кампании — [[Проводник]].
