---
name: extract-assets
description: Use when you need the real visual assets (icons, photos, illustrations, backgrounds) out of a design image as individual named PNG files — e.g. to place high-fidelity assets into restored HTML instead of CSS approximations. Generates flat asset sheets with image2, then slices them into named files.
---

# Extract Assets — design image → individual named asset files

Pull a design image's visual assets out as **individual, named PNG files** you can drop into HTML/UI. Two categories, two sheets: **icons** and **images/backgrounds**. The heavy lifting is split: `imagine` (image2) redraws the assets onto a flat tiled sheet; **you** (your own vision) box each asset; `design-ruler crop` cuts them into files.

`design-ruler` is on PATH. The image key is configured (`design-ruler config get ai-gateway-key`).

## When to use

You have a design image (any kind — UI, poster, app screen) and want its icons / photos / backgrounds as reusable image assets, not CSS approximations.

## Workflow

1. **Generate the two asset sheets** (image2 via the GPT-5 tool path — `--model openai/gpt-image-2`). Each ~200s.

   Icon sheet:
   ```bash
   design-ruler imagine "From this design image, extract ALL icons and symbolic graphics. Redraw each cleanly and consistently, and lay them ALL out as a flat icon sheet on a plain white background — a neat grid, each icon centered in its own cell with a small text label of its name/role beneath it. Output ONLY the icons, tiled — no layout, cards, text blocks, photos, or backgrounds. Crisp vector-style icons matching the design's icon style." \
     --ref /ABS/design.png --model openai/gpt-image-2 --out icon-sheet.png
   ```

   Image sheet:
   ```bash
   design-ruler imagine "From this design image, extract ALL photographic / illustrative / pictorial elements and background images (photos, character or avatar art, hero artwork, background gradients/textures/patterns). Redraw each at high fidelity and lay them ALL out as a flat asset sheet on a plain white background — a neat grid, each image in its own cell with a small text label of its role beneath it. Output ONLY the images and backgrounds, tiled — no UI chrome, icons, buttons, or text blocks. High quality, matching the design's style." \
     --ref /ABS/design.png --model openai/gpt-image-2 --out image-sheet.png
   ```

2. **Box each asset.** Look at `icon-sheet.png`, then `image-sheet.png`. For every asset, output its **bounding box around the asset graphic ONLY (exclude the text label)** as **normalized 0–1 fractions** of the sheet's width/height, plus a kebab-case name taken from the label. Write one JSON file per sheet:

   `icons.json`:
   ```json
   [
     { "name": "icon-search", "box": [0.02, 0.05, 0.16, 0.30] },
     { "name": "icon-home",   "box": [0.02, 0.55, 0.16, 0.30] }
   ]
   ```
   (`box` = `[x, y, w, h]`, fractions of the sheet. Box the icon glyph, not its label.)

   `images.json` (same format, one entry per image/background asset):
   ```json
   [
     { "name": "avatar-lin",  "box": [0.02, 0.05, 0.46, 0.44] },
     { "name": "hero-banner", "box": [0.52, 0.05, 0.46, 0.44] }
   ]
   ```

3. **Slice into files:**
   ```bash
   design-ruler crop --in icon-sheet.png  --boxes icons.json  --normalized --out-dir assets/icons
   design-ruler crop --in image-sheet.png --boxes images.json --normalized --out-dir assets/images
   ```
   `crop` reads the sheet's real pixel size and maps your fractions to pixels, so your boxes don't depend on the resolution you viewed the sheet at.

   Output: `assets/icons/icon-search.png`, `assets/images/avatar-lin.png`, … — individual, named, ready for `<img data-od-id=...>`.

## Notes

- Box precision = YOUR visual grounding. Models with strong grounding (Codex/GPT-5) box tightly; verify a couple of crops and adjust boxes if off.
- These prompts are scenario-agnostic — they work on any design image, not just mobile/UI.
- `imagine --model openai/gpt-image-2 --ref ...` redraws (high quality, image2's interpretation), it is NOT a pixel-exact crop of the original — that's the intended trade for clean, crisp assets.
