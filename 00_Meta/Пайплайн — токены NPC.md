---
type: guide
description: Пошаговый процесс изготовления VTT-токенов NPC для Foundry Dynamic Token Rings
updated: 2026-08-03
tags: [meta, pipeline, tokens, comfyui, lora, foundry, dynamic-ring]
---

# Пайплайн — токены NPC

Как из имени NPC получить готовый **Foundry Dynamic-Ring subject**: паизовский поясной
портрет в стиле нашей LoRA, на прозрачном фоне, с низом, срезанным по линии кольца.
Процесс воспроизводимый; новый токен = повтор шагов с другим промптом. Быстрый запуск —
команда **`/token <Имя NPC>`** (см. `.claude/commands/token.md`).

> Первый прогон, на котором отлаживали: [[Бьянка Сальвиати]] (2026-08-03).
> Смежное: [[ComfyUI Checkpoint Guide]], [[Token LoRA]]. Референс Foundry:
> https://foundryvtt.com/article/dynamic-token-rings/

## Что такое Dynamic-Ring subject
Foundry хранит токен из трёх слоёв (Subject / Ring / Background) и собирает их при рендере.
Мы делаем только **subject** — персонажа на прозрачном фоне, БЕЗ кольца и подложки; кольцо
Foundry рисует сам. Правила кадра:

- **Правило ⅔:** кольцо стоит на ⅔ от центра; внутренние ⅔ — зона субъекта, внешняя ⅓ —
  padding. Что заходит в padding — «выныривает» поверх кольца.
- **Разрыв только сверху и по бокам.** Голова/плечи/воротник выходят за кольцо вверх и вбок.
- **Низ вписан в кольцо.** Нижнюю часть срезаем ЧЁТКОЙ круговой маской по линии кольца
  (стандартный приём), чтобы тело не торчало снизу. Мечи/щиты снизу — не наш случай.
- Показываем **бюст**, а не одно лицо.

## Результат
- **Финал (под гит):** `99_Sketches/tokens/<Имя NPC>.webp` (WebP q80; **только webp**, png-резерв
  не держим) — 512×512, RGBA, прозрачный фон, низ срезан по кольцу. Это и есть Subject Texture в
  Foundry (webp поддерживается нативно).
- **Сырьё (НЕ под гит):** `99_Sketches/tokens/_work/<slug>/` — батч генерации, вырез,
  промежуточные композиты, `GEN_PARAMS.md`. Папка в `.gitignore`.

## Prereqs
- ComfyUI поднят, доступен через comfyui-MCP (`get_system_stats`).
- Модели (`list_local_models`): checkpoint `dreamshaperXL_lightningDPMSDE.safetensors`,
  LoRA `pf2token_sdxl-000006.safetensors` (триггер **`pf2token`**).
- Нода **ComfyUI-RMBG** (BiRefNet матирование). Нет — `install_custom_node comfyui-rmbg`,
  затем `restart_comfyui`. ⚠️ После рестарта MCP иногда теряет хэндл процесса и не
  поднимает ComfyUI сам — тогда попроси пользователя запустить ComfyUI вручную.
- Python: Pillow + numpy. Скрипт композита `00_Meta/scripts/token_frame.py`.

---

## Шаги

### 1. Облик — сначала канон
Токен фиксирует внешность. Если в `04_NPCs/<Имя>.md` блок `## Образ` = TBD: предложи 2–4
связных концепта (возраст, наряд, первое впечатление) с опорой на роль/регион/палитру,
дождись выбора, зафиксируй в файле и сними пункт из [[Open_Questions]].

### 2. Промпт по шаблону
Триггер `pf2token` — всегда первым словом.

> **Главное правило: держи промпт скупым — как капшены датасета.** LoRA училась на
> строках вида `pf2token, a human character, bust portrait, affluent, casual clothing,
> plain white background`. Стиль и «токенность» уже зашиты в триггер `pf2token`. Стоит
> дописать `cinematic / warm dramatic lighting / highly detailed / painterly digital
> illustration / Pathfinder RPG art style / three-quarter view` — и DreamShaper (полу-
> реалистичная кинобаза) перебивает LoRA: глянцевая кожа, драматический свет, сцена на
> фоне. Проверено A/B 2026-08-03 (насыщенность 0.62→0.31 при таргете Paizo 0.12;
> сцены на фоне исчезли). НЕ добавляй эти слова.
>
> **Этничность людей задавай явно.** Датасет LoRA перекошен в Tian Xia (много `tian-*`,
> `wu-ku`, `duangkamol`, `nai-yan-fei`), поэтому `human` без уточнения дрейфует в азиатскую
> внешность. Пиши происхождение словом (`Mediterranean Italian woman, olive skin, dark brown
> eyes`; `Nordic`; `West African`…), а в негатив при нужде — `east asian`. Это описательные
> слова, дрейфа в фотореализм не дают. Проверено на Бьянке (батч C, 2026-08-03).

**Positive** (только обученная лексика, никаких кинематографичных тегов):
```
pf2token, a {раса} character, bust portrait, {для людей — этничность: Mediterranean Italian
woman, olive skin, dark brown eyes / Nordic / …}, {роль/статус: affluent, warrior, sage,
artisan, soldier…}, {волосы/причёска}, {наряд и палитра}, {ключевой аксессуар},
plain white background
```
**Negative:**
```
photorealistic, photograph, realistic photo, 3d render, background scenery, interior,
room, candles, furniture, dramatic lighting, bokeh, depth of field, cinematic, vignette,
high contrast, gray background, gradient, full body, multiple people, crowd, text,
watermark, signature, logo, deformed face, extra fingers, blurry, low quality,
modern clothing, armor, weapon
```
(`armor, weapon` убрать, если NPC — боец. `gray background, gradient` тянут фон к чистому
белому — фон всё равно снимет матт на шаге 4, но так меньше запечённой сцены на фигуре.)

### 3. Генерация (ComfyUI)
`generate_image` из MCP **не умеет LoRA** — собираем граф вручную и шлём `enqueue_workflow`:
`CheckpointLoaderSimple → LoraLoader → CLIPTextEncode×2 → KSampler → VAEDecode → SaveImage`.

| Параметр | Значение |
|---|---|
| checkpoint | `dreamshaperXL_lightningDPMSDE.safetensors` |
| lora | `pf2token_sdxl-000006.safetensors`, strength_model **0.9** / strength_clip **1.0** |
| размер | 1024×1024, batch **4** |
| steps / cfg | 8 / 2.0 |
| sampler / scheduler | `dpmpp_sde` / `karras` |
| denoise / seed | 1.0 / записать seed |

Забери батч (`get_image`), покажи, дай выбрать. Критерий: лицо к камере и по центру,
чистый фон, попадание в образ, без артефактов.

### 4. Матирование (прозрачный фон)
1. `upload_image` выбранного кадра в `input/`.
2. `remove_background` с моделью **`BiRefNet_toonout`** (заточена под рисованное — идеально
   под наш стиль). Первый прогон докачивает модель.
3. Забери RGBA-вырез (`get_history` → `get_image`). Проверь альфу (кромка/волосы).

### 5. Композит субъекта — срез по кольцу
`00_Meta/scripts/token_frame.py`: вписывает вырез и срезает низ круговой маской по кольцу
(верх/бока свободны). Рисует превью с макетом кольца.
```
python3 "00_Meta/scripts/token_frame.py" \
  <вырез.png> <out_subject.png> <out_preview.png> \
  --canvas 512 --height-frac 0.78 --top-frac 0.07 --cap-frac 0.55
```
Ключевые ручки: `--height-frac` (крупность бюста; меньше = больше тела в кадре),
`--cap-frac` (высота линии, выше которой разрыв свободен), `--rc-frac` (радиус среза,
доля base; дефолт 0.70 = линия кольца). Прогони 2–3 варианта, покажи превью, дай выбрать.
Превью — только для оценки; в Foundry уходит **out_subject** (без кольца).

### 6. Экспорт и раскладка
- Финал: `out_subject` → `99_Sketches/tokens/<Имя NPC>.webp` (q80). **Только webp** — png-резерв
  не сохраняем (одна копия). `out_subject.png` остаётся лишь в `_work/` (gitignored).
- Сырьё (батч, вырез, все композиты) → `99_Sketches/tokens/_work/<slug>/`.
- `GEN_PARAMS.md` рядом с сырьём: дата, образ, выбранный кадр, все параметры, промпт, **seed**,
  финальная команда `token_frame.py`.
- Проверь, что гит видит только финал: `git add -n 99_Sketches/tokens`.

### 7. Настройки в Foundry (Prototype Token)
- **Subject Texture** = путь к `<Имя>.webp`.
- **Ring Enabled** = вкл.
- **Lock Artwork Rotation** = вкл (портрет не крутится).
- Глобально: **Dynamic Token Rings Fit = Standard** (буфер под вылет за кольцо).
- **Subject Scale Correction** трогать не нужно (мы делаем 512-субъект в размер кольца, не
  overscale). Overscale (холст 2× + Scale Correction 2) — отдельный приём, нам не нужен.

---

## Воспроизводимость
Батч из 4 при фиксированном seed даёт те же 4 кадра; «вариант N» = batch index N-1.
Чтобы повторить конкретный — тот же воркфлоу (тот же seed, batch 4), взять N-й выход.

## Грабли и фиксы
- **Мало бюста / один «лицо»:** уменьшай `--height-frac` (0.78–0.72). Источник обрезан по
  грудь → руки/пояс из него не вытянуть; для полного торса как в оф. примере нужна
  **перегенерация под токен** (кадр голова-по-пояс, плоский фон).
- **Низ торчит из кольца:** это и лечит круговой срез (`token_frame.py`); проверь `--rc-frac`≈0.70.
- **Дрейф в фотореализм / сцена на фоне:** причина — кинематографичные слова в промпте
  (`dramatic lighting`, `highly detailed`, `cinematic`, `painterly digital illustration`),
  а НЕ слабая LoRA. Лечится **сокращением** промпта до лексики капшенов (см. правило в шаге 2),
  а не добавлением стиля. Держи cfg ≤ 2.5, `plain white background` — в начало.
- **Волосы/кромка на матте:** `BiRefNet_toonout` берёт чисто; при ореоле — feather/erode маски.
- **Нода не видна после установки:** нужен `restart_comfyui`; если MCP потерял процесс —
  ComfyUI запускает пользователь вручную.

## Конвенции именования
- Токен: `99_Sketches/tokens/<Имя NPC>.webp` (**только webp**, без png); имя как в NPC-файле (кириллица ок).
- **Вариант облика:** суффикс в скобках — `<Имя NPC> (подполье).webp`, `… (дизгиз)`, `… (год спустя)`.
  Основной (публичный) облик — без суффикса.
- Рабочая папка: `99_Sketches/tokens/_work/<латинский-slug>/` (напр. `bianca/`, `bianca_podpolye/`).

## Вариант-токен — та же личность, другой облик
Когда NPC меняет вид по сюжету (дизгиз, подполье, ранение, до/после), делаем **второй токен
с тем же лицом**, а не генерим заново (txt2img с новым промптом лицо не сохранит — оно функция
промпта+seed). Проверено на [[Бьянка Сальвиати|Бьянке]] (облик «подполье», 2026-08-03).

**Метод по умолчанию — inpaint «всё кроме лица»:**
1. Берём **уже одобренный кадр** первого токена ДО матта (напр. `_work/<slug>/…C1…png`, 1024²).
2. **Маска keep-лицо:** эллипс по лицу (лоб→подбородок, скула→скула), исключая волосы/украшения/ворот;
   `GaussianBlur ~12`. Полярность: **white = перекрасить, black = сохранить лицо**. Сверься с оверлеем.
3. Граф: `CheckpointLoaderSimple → LoraLoader(pf2token 0.9/1.0) → CLIPTextEncode×2 →
   LoadImage(источник) + LoadImageMask → VAEEncodeForInpaint(grow_mask_by 6) → RepeatLatentBatch 4 →
   KSampler(8/2.0, dpmpp_sde/karras, denoise 1.0) → VAEDecode → SaveImage`. Промпт — скупой, по правилу
   шага 2 (только новые части: наряд/палитра/волосы/аксессуар), этничность повторить, фон `plain white`.
4. **Шов маски.** На границе keep-эллипса часто виден шов (яркая «старая» кожа ↔ перекрашенная тень).
   Лечится лёгким **глобальным img2img «unify»**: `LoadImage → VAEEncode → KSampler(denoise 0.30–0.38,
   steps 12) → VAEDecode` тем же промптом. Шов уходит, идентичность держится.
5. Дальше — обычные шаги 4–6 (матт `BiRefNet_toonout` → `token_frame.py` **с теми же ручками**, что у
   первого токена, для парности → экспорт под суффиксом).

**Когда нужен полный простор (другой ракурс, капюшон надвинут, серия обликов):** ставим один раз
**IPAdapter FaceID / InstantID** (лицо-reference → свежая генерация в том же DreamShaperXL+pf2token).
Даёт свободу позы/кадра, но требует доустановки нод InsightFace/IPAdapter. Inpaint проще для одного
варианта; FaceID окупается на рекуррентных обликах.

## Легаси
`00_Meta/scripts/make_token.py` — простой полностью-круглый статик-токен (без dynamic ring).
Оставлен на случай, если dynamic ring не используется.
