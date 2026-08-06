---
description: Сделать VTT-токен NPC для Foundry (dynamic ring) по пайплайну волта
argument-hint: <Имя NPC> (напр. Симоне Кальдана)
---

Сделай токен для NPC: **$ARGUMENTS**

Полный процесс и все параметры — в `00_Meta/Пайплайн — токены NPC.md`. Следуй ему.
Ниже — рабочая последовательность; на шагах с выбором ОСТАНАВЛИВАЙСЯ и показывай варианты.

1. **Облик.** Прочитай `04_NPCs/$ARGUMENTS.md`. Если `## Образ` = TBD — предложи 2–4
   концепта (опора на роль/регион/палитру), дождись выбора, зафиксируй в файле и сними
   пункт из `00_Meta/Open_Questions.md`.

2. **Проверь окружение.** `get_system_stats`; модели `list_local_models` (checkpoint
   `dreamshaperXL_lightningDPMSDE`, lora `pf2token_sdxl`); нода `comfyui-rmbg`
   (`list_installed_nodes`). Нет ноды → `install_custom_node comfyui-rmbg` + `restart_comfyui`;
   если MCP потерял процесс — попроси пользователя запустить ComfyUI вручную.

3. **Генерация.** Промпт по шаблону из SOP (триггер `pf2token` первым словом). Собери граф
   вручную (LoraLoader, strength 0.9/1.0) и `enqueue_workflow`: 1024×1024, batch 4, steps 8,
   cfg 2.0, `dpmpp_sde`/`karras`, seed записать. Забери батч, покажи, **дай выбрать кадр**.

4. **Матирование.** `upload_image` выбранного → `remove_background` (`BiRefNet_toonout`) →
   забери RGBA-вырез, проверь кромку.

5. **Композит.** Скачай вырез в `_work`. Прогони `00_Meta/scripts/token_frame.py`
   (`--canvas 512`, подбери `--height-frac` ~0.78 и `--cap-frac` ~0.55; низ срезается по
   кольцу). Сделай 2–3 варианта, покажи превью, **дай выбрать/подкрутить**.
   Правила кадра: разрыв кольца только сверху и по бокам; низ вписан по окружности;
   показывай бюст, не только лицо.

6. **Экспорт.** Финал (out_subject, БЕЗ кольца) → `99_Sketches/tokens/$ARGUMENTS.webp` (q80,
   **только webp** — png не держим). Сырьё → `99_Sketches/tokens/_work/<slug>/` (в .gitignore). Запиши
   `GEN_PARAMS.md` (параметры + seed + финальная команда). Проверь `git add -n 99_Sketches/tokens`.

7. **Напомни Foundry-настройки:** Subject Texture = файл, Ring Enabled, Lock Artwork Rotation,
   Fit Mode = Standard.

Покажи финал через present_files и жди подтверждения.
