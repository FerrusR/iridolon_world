---
type: index
description: Динамические таблицы (Dataview) по NPC и локациям — срез по аркам и регионам.
tags: [meta, dashboard]
---

# Дэшборд — NPC и локации

> Таблицы пересчитываются сами (плагин **Dataview**). Правило полей — в [[CLAUDE_instructions]]; проверка — `00_Meta/scripts/check_schema.py`.
> Чтобы сменить арку/регион в запросе — поменяй значение в строке `WHERE` и выйди из режима правки.

## NPC по аркам

```dataview
TABLE WITHOUT ID arc AS "Арка", rows.file.link AS "NPC", rows.role AS "Роль"
FROM "04_NPCs"
WHERE type = "npc"
FLATTEN arcs AS arc
GROUP BY arc
SORT arc ASC
```

## Локации и регионы по аркам

```dataview
TABLE WITHOUT ID arc AS "Арка", rows.file.link AS "Локация / регион"
FROM "02_Regions"
WHERE type = "location"
FLATTEN arcs AS arc
GROUP BY arc
SORT arc ASC
```

## NPC одной арки (меняй «Арка 1»)

```dataview
TABLE region AS "Регион", arcs AS "Арки", role AS "Роль"
FROM "04_NPCs"
WHERE type = "npc" AND contains(arcs, [[Арка 1]])
SORT file.name ASC
```

## Всё по региону (меняй «Сольмаре»)

```dataview
TABLE type AS "Тип", arcs AS "Арки", role AS "Роль / профиль"
WHERE (type = "npc" OR type = "location")
  AND contains(string(region), "Сольмаре")
SORT type ASC, file.name ASC
```

## ⚠️ Проблемы — нет арки или места (заполнить)

```dataview
TABLE WITHOUT ID file.link AS "Заметка", type AS "Тип",
      choice(!arcs, "нет arcs", "") AS "arcs",
      choice(type = "npc" AND !region AND !location, "нет места", "") AS "место"
WHERE (type = "npc" OR type = "location")
  AND !contains(file.folder, "00_Meta")
  AND ( !arcs OR (type = "npc" AND !region AND !location) )
SORT file.name ASC
```

## Полный список NPC

```dataview
TABLE arcs AS "Арки", region AS "Регион", faction AS "Фракция", role AS "Роль"
FROM "04_NPCs"
WHERE type = "npc"
SORT file.name ASC
```
