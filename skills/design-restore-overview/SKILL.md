---
name: design-restore-overview
description: Use when you have a design image (an AI-generated concept render, a screenshot, or a mockup) and want to reproduce it as clean, hand-editable code with real assets, and you need the overall plan before picking a tool. The entry point that orients the whole image-to-code restore mode and routes you to the right sub-skill for each stage. Triggers include "还原设计图", "把设计图变成代码", restore a design image to HTML, image2 concept to editable webpage, design-to-code with real icons and photos.
---

# Design Restore Overview — the image-to-code restore mode

This is the **map**, not a step. It tells you how the pieces fit and which sub-skill owns each stage, so you reuse the existing `design-ruler` primitives and skills instead of inventing a pipeline. Read this first, then follow the sub-skill the current stage points to.

**Core stance:** the design image is the **authority/ground truth** (its look is correct by definition — don't second-guess its aesthetics). Your job is to *reproduce* it as editable code, deterministically. You — the agent — are the diff engine; `design-ruler` only measures.

## The full mode (four stages)

| Stage | What happens | Who owns it |
|---|---|---|
| ① Concept image | An AI image model (image2 / `design-ruler imagine`) produces the design render, OR the user hands you one. This PNG is the standard everything is judged against — it is **not** an asset source. | image2 gateway / user input (no skill) |
| ② Structure | Read the image, write a clean responsive **editable HTML structure** (`data-od-id`/`data-od-label` + CSS variables; image slots start as CSS placeholders). | **REQUIRED SUB-SKILL: design-restore** |
| ③ Real assets | Fill the placeholder slots: icons by **library match** (`design-ruler icon` → Iconify SVG), photos/backgrounds by **cropping real pixels** (`design-ruler crop`) from the design image. Never redraw or trace assets. | **REQUIRED SUB-SKILL: extract-assets** |
| ④ Verify loop | `design-ruler screenshot` the phone column → `overlay` ghost against the design → `measure` blocks that are off → fix CSS → repeat until it reads like the target. | the agent, using `design-ruler` (covered inside both sub-skills) |

## Why assets are obtained independently (the hard-won rule)

A design image is a **flattened render** — every asset is baked into one bitmap (anti-aliasing, shadows, overlap). Cropping a clean single asset back out is a **lossy inverse problem**; redrawing it (image2) changes a person's identity. So:
- **Icons** → the precise version already exists in a library. Recognize the semantics, fetch the SVG. Zero tracing.
- **Photos / backgrounds** → crop the real pixels (preserves identity); imperfect edges are absorbed by `object-fit`/clipping.

`autocrop` and "image2 redraws an asset sheet" are **retired** from this flow — they were the old redraw/placeholder paradigm that the exploration disproved.

## What "restored well" means — two separate dimensions

1. **Structural correctness (must be high)** — right blocks, hierarchy, element kinds, copy, colors. Judge this by **looking** (you/VLM are strong here).
2. **Pixel precision (loose — human-imperceptible ~5–15px is fine)** — a raster concept image's exact pixels carry no design intent; do not chase pixel-perfection.

## Strategic boundary — do NOT cross it

`design-ruler` is bet on giving the model **precise measurements it cannot get architecturally** (`measure` bbox/CSS truth, `overlay` pixel diff) — leverage that grows as models get stronger. It is **not** an evaluator/evolver that replaces model judgment.

- **Do not** use `score`/SSIM (or any single pixel metric) as a fitness/convergence judge. It was empirically disproven for design fidelity: blind to structural loss (deleting the whole bottom nav scores PASS), oversensitive to translation (an 8px shift rated 9.5× worse than deleting a module). `score` survives only as a generic same-source regression primitive.
- **Do not** build a meta-evaluator or evolution loop around this. The pragmatic path is **strongest model + thin measurement tools (`measure`/`overlay`) + agent self-check loop** — no evolution needed.

## Quick routing

- "I have the image, need editable HTML" → **design-restore**
- "HTML structure exists, slots are empty" → **extract-assets**
- "Is it close enough?" → look + `overlay` + `measure`; never `score`-as-judge.
