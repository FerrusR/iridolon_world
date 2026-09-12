---
description: Сделать VTT-токен NPC для Foundry (dynamic ring) по пайплайну волта
argument-hint: <Имя NPC> (напр. Симоне Кальдана)
---

Сделай токен для NPC: **$ARGUMENTS**

Полный процесс и все параметры — в `00_Meta/Пайплайн — токены NPC.md`. Следуй ему.
На шагах с выбором ОСТАНАВЛИВАЙСЯ и показывай варианты.

1. **Облик.** Прочитай `04_NPCs/$ARGUMENTS.md`. Если `## Образ` = TBD — предложи 2–4
   концепта (опора на роль/регион/палитру), дождись выбора, зафиксируй в файле и сними
   пункт из `00_Meta/Open_Questions.md`.

2. **Проверь окружение.** `get_system_stats`; модели `list_local_models` (checkpoint
   `dreamshaperXL_lightningDPMSDE`, lora `pf2token_sdxl`); нода `comfyui-rmbg`. Нет ноды →
   `install_custom_node comfyui-rmbg` + `restart_comfyui`; если MCP потерял процесс — попроси
   пользователя запустить ComfyUI вручную.

3. **Базовый кадр — два пути** (см. SOP «Источник кадра»):
   - **A — родной (pf2token):** промпт по шаблону (триггер `pf2token` первым словом), граф вручную
     (LoraLoader 0.9/1.0) → `enqueue_workflow`: 1024², batch 4, steps 8, cfg 2.0, `dpmpp_sde`/`karras`,
     seed записать. Забери батч, покажи, **дай выбрать кадр**.
   - **B — внешний портрет (Nano Banana / Midjourney):** для конкретного одобренного облика или
     серии одного лица. Идентичность держит референс-картинка, не LoRA. Если фон — сцена/тёмный,
     **сначала перегенери фон в плоский белый** (правка в Nano Banana: белый студийный фон, ровный
     фронтальный свет, тень за спиной убрать, лицо/одежду/позу не менять). Стиль-проход img2img
     (`pf2token`, denoise ~0.5) — опционально, для уже-живописного кадра не нужен.
   ⚠️ **Баг:** `enqueue_workflow` иногда даёт ложный «ComfyUI is not running» даже когда MCP владеет
   процессом — слать граф через **`batch` action:"submit"**. `generate_image` / `remove_background` штатны.
   ⚠️ **Файл ComfyUI → волт:** `get_image action:"get"` с `save_dir` = **реальный путь волта**
   `/home/ferrus/Claude/Projects/Homebrew world/99_Sketches/tokens/_work/<slug>` (без него PNG уйдёт в
   `/tmp/comfyui-images` на стороне ComfyUI, сэндбокс его не видит). `token_frame.py` гоняй по mnt-пути.

4. **Матирование.** Путь B: убедись, что фон плоский белый. `upload_image` выбранного →
   `remove_background` (`BiRefNet_toonout`) → RGBA-вырез. **Проверь альфу на пурпуре/шахматке (не на
   превью — оно флэттит прозрачность)** + углы альфы и content-bbox.

5. **Композит.** Вырез в `_work` тем же приёмом (`save_dir`, см. шаг 3). Высокий кадр (до пояса/кистей)
   — сначала обрежь до головы+груди (обнули альфу ниже линии рук), иначе голова станет мелкой. Прогони
   `00_Meta/scripts/token_frame.py` (`--canvas 512`, `--height-frac` ~0.82–0.90, `--cap-frac` ~0.55–0.60;
   низ срезается по кольцу). 2–3 варианта, превью, **дай выбрать/подкрутить**. Кадр: разрыв кольца только
   сверху и по бокам; низ вписан по окружности; бюст, не одно лицо.

6. **Экспорт.** Финал (out_subject, БЕЗ кольца) → `99_Sketches/tokens/$ARGUMENTS.webp` (q80,
   **только webp** — png не держим). Сырьё → `99_Sketches/tokens/_work/<slug>/` (в .gitignore).
   Запиши `GEN_PARAMS.md` (источник A/B, параметры, seed, финальная команда). Проверь read-only:
   `git check-ignore 99_Sketches/tokens/$ARGUMENTS.webp` (пусто = попадёт в гит). **НЕ** `git add -n` — берёт `.git/index.lock`.

7. **Напомни Foundry-настройки:** Subject Texture = файл, Ring Enabled, Lock Artwork Rotation,
   Fit Mode = Standard.

Покажи финал через present_files и жди подтверждения.
