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

## General notes
- Both are SDXL-family — always use ~1 megapixel SDXL resolutions, not 512×512.
- If a generation looks washed out on DreamShaper, you're probably running too many
  steps or too-high CFG for a Lightning model.
- Defaults are tuned for DreamShaper. When generating with Pony, override steps/cfg/
  sampler per the table above (the defaults' CFG 2 / 8 steps are wrong for Pony).
