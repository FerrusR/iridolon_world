# ComfyUI Checkpoint Guide — Homebrew Fantasy Vault

Reference for generating fantasy art for the vault via the local ComfyUI MCP server.
Paste the "Which model to use" and "Recommended settings" sections into the Cowork
instructions so any new session picks the right checkpoint.

Install location: `/home/ferrus/comfy/ComfyUI/models/checkpoints/`
GPU: NVIDIA RTX 3080, 11.6 GB VRAM — both models fit comfortably.

## Installed checkpoints

- **dreamshaperXL_lightningDPMSDE.safetensors** — DreamShaper XL (Lightning). Fast,
  painterly fantasy all-rounder. SDXL architecture.
- **ponyDiffusionV6XL_v6StartWithThisOne.safetensors** — Pony Diffusion V6 XL.
  Best for characters and creatures. SDXL architecture.

## Which model to use

- **DreamShaper XL Lightning** → scenes, landscapes, environments, locations, items,
  props, maps, atmospheric concept art, "establishing shot" worldbuilding images.
- **Pony V6 XL** → characters, portraits, NPCs/PCs, monsters, creatures, stylized
  fantasy races, anything where anatomy and pose matter most.

## Recommended settings

### DreamShaper XL Lightning (fast — default daily driver)
- Sampler: `dpmpp_sde` (DPM++ SDE), Scheduler: `karras`
- Steps: 6–8, CFG: ~2.0
- Size: 1024×1024, or 832×1216 (portrait) / 1216×832 (landscape)
- Negative prompt: keep minimal at this low CFG.
- These are the persisted defaults in `~/.config/comfyui-mcp/config.json`.

### Pony V6 XL (characters / creatures)
- Prepend the positive prompt with quality tags:
  `score_9, score_8_up, score_7_up, score_6_up,`
- Optional style/rating tags: `source_anime` / `source_cartoon` / `source_furry`,
  and `rating_safe` (or as appropriate).
- Negative prompt baseline: `score_6, score_5, score_4, worst quality, low quality, blurry`
- Sampler: `dpmpp_2m` (or Euler a `euler_ancestral`), Scheduler: `karras`, Steps: ~26, CFG: ~7
- Size: 832×1216 portrait works well for character art. Pony has a baked-in VAE.
- Note: Pony base is NOT a Lightning model, so it needs ~25 steps (slower than
  DreamShaper). To speed it up later, add a Pony Lightning/Hyper LoRA and drop to
  ~8 steps at CFG ~2.

#### IMPORTANT — Pony skews NSFW by default
Pony will often drop clothing and produce nude/suggestive results unless constrained.
For SFW character art:
- Push clothing in the positive prompt: `(fully clothed:1.4)`, and name the garments
  explicitly (e.g. `high-collared robes`, `layered armored bodice`, `hooded cloak`,
  `covered chest`).
- Front-load the negative prompt with: `nude, nudity, topless, naked, bare chest,
  exposed breasts, cleavage, bare shoulders, partially nude, suggestive, nsfw`.
- Keep `rating_safe` in the positive tags.
DreamShaper does not need any of this.

## LoRAs

Install location: `/home/ferrus/comfy/ComfyUI/models/loras/`
(sibling of `checkpoints/`; drop the `.safetensors` there and it appears in the **Load LoRA**
/ `LoraLoader` node). A LoRA sits *on top of* a checkpoint — insert **Load LoRA** between the
checkpoint loader and the sampler; it modifies both `MODEL` and `CLIP`. `strength_model` drives
style intensity; keep `strength_clip` equal unless you have a reason to split them. LoRAs can be
chained (stack multiple Load LoRA nodes).

### pf2token — NPC token style (ours)
Custom style-LoRA that reproduces the Paizo painted **token-bust** look for homebrew NPCs.
Trained on SDXL base 1.0 (kohya sd-scripts). See `_lora_token_style/` for the project.

- **File:** `pf2token_sdxl-000006.safetensors` — **epoch 6 is the pick** (epoch 8 = backup).
  Do NOT use the final epoch (`pf2token_sdxl.safetensors` = e12): it over-trains and drifts from
  the tight token cutout into a full portrait on gray.
- **Trigger word:** `pf2token` (must be in the prompt).
- **Pair with:** DreamShaper XL — best match for the semi-realistic painterly style. (Pony works
  too but needs its `score_*` tags and skews the look.)
- **Strength:** `0.7–0.85`. Lower if faces distort; higher if the style is too weak.
- **Prompt shape:** `pf2token, a <race> character, bust portrait, <role/gear>, plain white background`
  (e.g. `pf2token, a dwarf character, bust portrait, warrior, heavy armor, plain white background`).
- **Negative:** `gray background, gradient, full body` (nudges it toward a clean plain background).
- **The LoRA only does the art style.** A game-ready token = art → **remove background** (rembg →
  transparent PNG) → Foundry adds the token ring. Don't expect the raw output to be ring-cropped.

### Using LoRAs in general
- Match the LoRA's base family to the checkpoint (our SDXL LoRAs → SDXL checkpoints only).
- A trained trigger word must appear in the prompt or the LoRA barely fires.
- If a style LoRA over-bakes (blown highlights, mangled detail), drop `strength_model` first,
  then try an earlier epoch/version.

## General notes
- Both are SDXL-family — always use ~1 megapixel SDXL resolutions, not 512×512.
- If a generation looks washed out on DreamShaper, you're probably running too many
  steps or too-high CFG for a Lightning model.
- Defaults are tuned for DreamShaper. When generating with Pony, override steps/cfg/
  sampler per the table above (the defaults' CFG 2 / 8 steps are wrong for Pony).
