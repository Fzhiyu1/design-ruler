---
name: design-restore
description: Use when restoring/reconstructing a design image (concept art, screenshot, mockup, Figma export) into a clean, modular, HAND-EDITABLE HTML page. Produces Open-Design-editable HTML and verifies visual fidelity against the target image with the design-ruler CLI, iterating until the render matches.
---

# Design Restore — image → editable HTML

You turn a **target design image** into a **single self-contained HTML file** that (1) is a real responsive mobile page visually matching the image, (2) scrolls and adapts like a normal app screen, and (3) stays cleanly editable by a human afterward (in Open Design or any editor). You verify fidelity with the `design-ruler` CLI and iterate until the render matches the target.

`design-ruler` only **measures** runtime rendering — it does not generate or judge. **You are the diff engine:** you write the HTML, render it, compare against the target, decide the fix, and re-measure.

## When to use

The user gives a design image (concept art / screenshot / mockup / Figma export) and wants editable HTML that reproduces it.

## Output contract — the HTML you write MUST follow ALL of these

1. **One standalone HTML file.** All CSS in a single `<style>` block. No external deps, no build step. It must open directly via `file://`.
2. **Real responsive mobile page, mobile-first — NOT a fixed canvas.** Use `<meta name="viewport" content="width=device-width, initial-scale=1">`. Wrap the whole UI in a root container `<div data-od-id="app-root" data-od-label="App root">` styled `max-width: 430px; margin: 0 auto;`, and lay it out fluidly inside (%, flex/grid, rem). The target image is a **hi-res mockup (≈2–3× a real phone)** — reproduce its proportions and layout, do NOT copy its pixel count as your CSS size, and do NOT lock the viewport to the image width (`width=1024` etc. is wrong).
3. **Natural vertical scroll.** Do NOT put `overflow: hidden` on `<body>` or the root — the page must scroll like a normal mobile page. Avoid `position: absolute` for layout (use it only for genuinely-overlapping bits like a badge); build with normal flow + flex/grid so it adapts and a human can restyle it.
4. **Expose modules.** Every meaningful block carries:
   - `data-od-id="<stable-kebab-id>"` — stable, unique (e.g. `hero-banner`, `product-card-cat`)
   - `data-od-label="<human name>"` — shows in editors' layer lists (e.g. `Hero banner`, `Product card · cat`)
   - These are **protected** — never strip them in later edits.
5. **Token-driven styling.** Define theme values as CSS variables on `:root` (colors, spacing, radius, font sizes) and reuse them. This makes global tweaks possible.
6. **Editable text in leaf nodes.** Put text in leaf elements (`<span>`, `<p>`), not buried in containers that also hold children — editing a container's text would collapse its children.
7. **Real modular structure, NOT a flattened image.** Do NOT `<img src="target.png">` the whole thing. Reconstruct actual elements (status bar, search, categories, hero, grid cards, nav…). Editability is the whole point — a pixel-perfect flattened copy is a failure.

## Workflow

1. **Study the image.** Look at it. Identify the modules, layout, colors, type scale, spacing.

2. **Write the HTML** following the output contract. Save it (e.g. `restore.html`) with an absolute path.

3. **Render the phone column** (non-interactive). Screenshot the `app-root` element — because it's `max-width:430px` centered, this captures the mobile layout at phone width regardless of the headless browser's viewport:
   ```bash
   design-ruler screenshot --url "file:///ABS/PATH/restore.html" --selector "[data-od-id='app-root']" --output render.png
   ```
   `render.png` is your current result, at phone width.

4. **Compare to the target.** Two ways, use both:
   - **Look at `render.png` next to the target image** — you have vision; judge layout, color, hierarchy directly.
   - **Ghost overlay** (target tinted magenta over your render, non-interactive). Overlay screenshots the `app-root` element and **resizes the target to match it** — so the hi-res mockup is scaled to your phone-width column automatically (you do NOT need matching pixel counts):
     ```bash
     design-ruler overlay --design /ABS/PATH/target.png --url "file:///ABS/PATH/restore.html" --selector "[data-od-id='app-root']" --output ghost.png
     ```
     Open `ghost.png`: where magenta ghosts out of alignment → that block is off (proportions/spacing/order); where it blends → aligned. (Always pass `--selector` + `--output` so it runs headless and does not open a browser.)

5. **Measure exact values when a block is off:**
   ```bash
   design-ruler measure --url "file:///ABS/PATH/restore.html" --selector "[data-od-id='hero-banner']"
   ```
   Returns the rendered bbox `{x,y,width,height}` + computed CSS as JSON. Compare against what the image implies, then fix the CSS.

6. **Iterate steps 3–5.** Fix the worst misalignments first. Re-render, re-compare, until the ghost is clean and the render reads like the target.

## Rules of thumb

- **It's an app screen, not a screenshot.** Design at phone logical width (~390–430px), let it scroll, make it adapt. A fixed `width=1024` non-scrolling canvas is the #1 failure mode — it looks fine in a 1:1 overlay but breaks in any real phone viewport.
- Reconstruct structure even when it costs a few pixels of fidelity — **editability > pixel-perfection**.
- The image's text may be decorative or garbled; write real, legible copy in your HTML.
- Prefer flex/grid layout + the CSS variables over hard-coded absolute positions, so a human can restyle later.
- Don't stop at "looks roughly right" — use `measure` to confirm key blocks are proportioned/ordered like the target.
