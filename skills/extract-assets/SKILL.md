---
name: extract-assets
description: Use after design-restore has produced editable HTML for a design image, when you need to fill its placeholder image slots with real assets — fetch icons as ready-made SVGs from Iconify (by recognizing what each icon is) and crop real photos/backgrounds out of the design image. Does NOT redraw or trace anything.
---

# Extract Assets — fill a restored HTML with real assets

`design-restore` turns a design image into editable HTML whose image slots are CSS placeholders (each carries `data-od-id` / `data-od-label`). This skill fills those slots with **real** assets:

- **Icons** → you recognize what each icon is, `design-ruler icon` fetches a ready-made precise SVG from Iconify. No tracing, no cropping — the precise version already exists.
- **Photos / backgrounds** → you frame each one's box, `design-ruler crop` cuts the **real pixels** out of the design image (preserves identity).

Why not redraw/extract a sheet: a design image is a flattened render — cropping a clean single asset back out is a lossy inverse problem, and redrawing (image2) changes a person's identity. So: icons come from a library, photos are cropped real pixels. The tool only fetches/cuts; **you** do all the recognizing and placing.

`design-ruler` is on PATH.

## When to use

You have (1) the design image and (2) the HTML `design-restore` produced (with `data-od-id` placeholders), and you want the real assets in it.

## Workflow

1. **List the placeholder slots.** Read the HTML; for each element that should hold an image, note its `data-od-id`, `data-od-label`, and type (icon / photo / background).

2. **Icons — fetch ready-made SVGs.** For each icon, recognize what it is (a magnifier → "search", a heart → "heart") and fetch it:
   ```bash
   design-ruler icon "search" --set lucide --out assets/icons/icon-search.svg
   ```
   - `--set` picks a style set (e.g. `lucide` line, `material-symbols`, `mdi`); keep one set for a consistent look. Color is left to CSS (`currentColor`).
   - Not sure of the exact name? `design-ruler icon "grid" --search` lists candidates.
   - Inline the SVG into the matching `data-od-id` element (or `<img src=...svg>`). Keep `data-od-id` / `data-od-label`.

3. **Photos / backgrounds — crop real pixels.** Look at the design image, frame each photo's pixel box (your own vision — photos are large blocks, easy to frame). Write a boxes JSON and crop:
   ```bash
   design-ruler crop --in /ABS/design.png --boxes photos.json --out-dir assets/photos
   ```
   `photos.json`: `[{ "name": "<data-od-id>", "box": [x, y, w, h] }, ...]` (pixel coords; name = the slot's `data-od-id` so files line up). Place each as `<img ... object-fit:cover>` or `background-image`. Edges needn't be pixel-perfect — `object-fit` / container clipping absorbs a few px. (Greenfield project with no real source? Generate the asset with `design-ruler imagine` instead of cropping.)

4. **Verify.** Screenshot the phone column, ghost-overlay against the design, measure key blocks; iterate:
   ```bash
   design-ruler screenshot --url "file:///ABS/restore.html" --selector "[data-od-id='app-root']" --output render.png
   design-ruler overlay --design /ABS/design.png --url "file:///ABS/restore.html" --selector "[data-od-id='app-root']" --output ghost.png
   ```
   Where assets are wrong/distorted, fix that slot (re-fetch a different icon `--set`, or re-crop a tighter box) and re-verify.

## Notes

- **Icons: library match beats everything.** The icon you need was already drawn precisely by a designer — recognize it and fetch it. Don't trace or crop icons (lossy + dirty). For a non-library / brand-specific icon, an image→SVG model (e.g. StarVector) or writing the SVG by hand is the fallback.
- **Photos: crop real pixels, never redraw.** Redrawing a person (image2) produces a similar-but-different face — for any identity-bearing asset (a digital-human IP, a brand photo) that is unusable. Crop keeps the real pixels.
- The design image is a structural reference + concept visual, not an asset source.
