---
name: extract-assets
description: Use when you need the real visual assets (icons, photos, illustrations, backgrounds) out of a design image as individual named PNG files — e.g. to place high-fidelity assets into restored HTML instead of CSS approximations. Generates flat asset sheets with image2, then slices them into named files.
---

# Extract Assets — design image → individual named asset files

Pull a design image's visual assets out as **individual, named PNG files** you can drop into HTML/UI. Two categories, two sheets: **icons** and **images/backgrounds**. The heavy lifting is split: `imagine` (image2) redraws the assets onto a flat **unlabeled** grid; **`autocrop` detects each asset's box deterministically**; **you** only name them (by recognizing each graphic); `crop` cuts the files.

`design-ruler` is on PATH. The image key is configured (`design-ruler config get ai-gateway-key`).

## When to use

You have a design image (any kind — UI, poster, app screen) and want its icons / photos / backgrounds as reusable image assets, not CSS approximations.

## Workflow

1. **Generate the two asset sheets** (image2 via the GPT-5 tool path — `--model openai/gpt-image-2`). Each ~200s.

   Icon sheet:
   ```bash
   design-ruler imagine "From this design image, extract ONLY the icons and symbolic graphics that ACTUALLY APPEAR in it — do NOT invent or add any generic/common UI icons (battery, wifi, signal bars, etc.) that are not present in this specific design. Redraw each real icon cleanly as a single self-contained glyph. Lay them out as a flat icon sheet on a plain white background. CRITICAL LAYOUT REQUIREMENT: place each icon as a clearly separated island with a WIDE band of pure white space (at least 20% of a tile's size) between every icon on all sides — icons must NEVER touch, abut, or merge; they are isolated tiles floating on white, NOT a collage or grid-without-gaps. One tile per real icon. NO text, NO labels, NO captions anywhere. Crisp vector-style icons matching the design's icon style." \
     --ref /ABS/design.png --model openai/gpt-image-2 --out icon-sheet.png
   ```

   Image sheet:
   ```bash
   design-ruler imagine "From this design image, extract ALL pictorial assets that ACTUALLY APPEAR in it — BOTH the foreground subjects (photos, character/avatar portraits, hero artwork) AND the background fills behind them (each card's background color/gradient, the hero backdrop). Redraw each at high fidelity. CRITICAL LAYOUT REQUIREMENT: lay them out as separate tiles on a plain white background, each tile a clearly separated island with a WIDE band of pure white space (at least 20% of a tile's size) between every tile on all sides — tiles must NEVER touch, abut, or merge into a collage; they are isolated rectangles floating on white. One tile per asset. Do NOT add assets that are not present in this design. NO text, NO labels, NO captions, NO UI chrome anywhere. High quality, matching the design's style." \
     --ref /ABS/design.png --model openai/gpt-image-2 --out image-sheet.png
   ```

2. **Auto-detect boxes (no manual boxing).** Run `autocrop` on each sheet. It finds every asset's tight pixel box by projection profile (white background + clean grid required — that's what step 1 produces). Because the sheet has no text labels, every detected box is a whole asset (an icon's detached parts — e.g. a crown's base bar — stay inside its box):

   ```bash
   design-ruler autocrop --in icon-sheet.png  --out-dir assets/icons
   design-ruler autocrop --in image-sheet.png --out-dir assets/images
   ```

   Each writes `boxes.json` (pixel coords, reading order, numeric placeholder names `"00"`, `"01"`, …) and `_overview.png` (the sheet with each box outlined and **numbered**).

3. **Name the assets (your job).** Open `assets/icons/_overview.png`. For each numbered box, **look at the graphic inside it** and edit `assets/icons/boxes.json`, replacing the placeholder `name` (`"00"`) with a kebab-case name for what it is (a magnifier → `"icon-search"`, a crown → `"hero-crown"`). Recognize each asset by its shape/content (and its role/position in the original design) — there are no text captions, and you don't need them. Do the same for `assets/images/boxes.json` using `assets/images/_overview.png`. You only assign names — the boxes are already pixel-exact.

4. **Slice into files** (pixel coords — no `--normalized`):
   ```bash
   design-ruler crop --in icon-sheet.png  --boxes assets/icons/boxes.json  --out-dir assets/icons
   design-ruler crop --in image-sheet.png --boxes assets/images/boxes.json --out-dir assets/images
   ```
   Output: `assets/icons/icon-search.png`, `assets/images/avatar-lin.png`, … — individual, named, ready for `<img data-od-id=...>`.

## Notes

- Box precision is deterministic (projection profiles), not your visual grounding — you only assign names. Glance at `_overview.png` to confirm the detection looks right; if a sheet isn't a clean white-background grid the profiles degrade (the overview makes that obvious — adjust `--white-threshold`/`--min-size` or regenerate the sheet).
- The sheets are intentionally **label-free** (no caption under each asset). A text caption is geometrically indistinguishable from an icon's own detached part (a crown's base bar, a tab dot), so labels would get mis-cropped — and you recognize assets by their graphic anyway, so the captions bought nothing. Keep generating them label-free.
- These prompts are scenario-agnostic — they work on any design image, not just mobile/UI.
- `imagine --model openai/gpt-image-2 --ref ...` redraws (high quality, image2's interpretation), it is NOT a pixel-exact crop of the original — that's the intended trade for clean, crisp assets.
- **The two prompts above are battle-tested for the two failure modes image2 has when redrawing:** (1) it invents extra generic icons that aren't in the design → the "ONLY … ACTUALLY APPEAR" wording; (2) it packs tiles edge-to-edge into a seamless collage so `autocrop` can't split them → the "WIDE band of pure white space … NEVER touch" wording (autocrop needs white gutters to separate tiles). Keep those constraints if you reword. image2 tends to merge a subject with its background into one tile (e.g. a portrait + its card backdrop) rather than emitting a separate plain-background tile — usually fine, since a card image wants the subject-on-background as one asset anyway. Always glance at `_overview.png`: if `count` is way off (too many = invented/split assets; too few = tiles merged), reword and regenerate.
