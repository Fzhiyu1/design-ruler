# design-ruler

A ruler for AI agents — measure runtime rendering, capture screenshots, and verify CSS against design specs.

Most design-to-code tools try to be smart: they diff pixels, score similarity, generate reports. design-ruler takes the opposite approach — **it just collects data and gets out of the way**. The AI agent reads the measurements, compares them against whatever design spec it already has, fixes the CSS, and re-measures to verify. No human in the loop.

This is the open-source CLI distilled from an internal MCP-based design verification pipeline used in production.

## Why

AI coding agents can already read design specs and write CSS. What they can't do is **see** the result. They have no way to know if `border-radius: 12px` actually rendered as 12px, or if a `gap: 16px` shifted everything 8px from the design.

design-ruler gives agents eyes:

```
Agent reads design spec  →  "dialog should be 400×300, border-radius 12px, padding 24px"
Agent writes CSS         →  modifies styles
Agent runs measure       →  gets actual runtime values as JSON
Agent compares           →  "width is 380 not 400, padding is 16 not 24"
Agent fixes              →  adjusts CSS
Agent re-measures        →  "all within 1px tolerance ✓"
```

No SSIM scores, no pixel heatmaps, no HTML reports. The agent IS the diff engine.

## Install

Requires Node.js >= 18.

```bash
# From source
git clone https://github.com/Fzhiyu1/design-ruler.git
cd design-ruler
pnpm install
pnpm build
npm link

# Install Playwright browser (first time only)
npx playwright install chromium
```

Verify:

```bash
design-ruler --version
```

## Commands

### measure

Read an element's bounding box, computed styles, and child layout as structured JSON.

```bash
design-ruler measure --url "http://localhost:3000" --selector ".dialog"
```

```json
{
  "selector": ".dialog",
  "bbox": { "x": 100, "y": 200, "width": 400, "height": 300 },
  "computedStyle": {
    "border-radius": "12px",
    "padding": "24px",
    "font-size": "16px",
    "background-color": "rgb(255, 255, 255)"
  },
  "children": [
    {
      "tag": "h2",
      "className": "title",
      "bbox": { "x": 24, "y": 24, "width": 352, "height": 28 },
      "text": "Settings",
      "children": []
    }
  ]
}
```

Use `--depth` to control how deep the tree goes:

```bash
# Just the element, no children
design-ruler measure --url "..." --selector ".dialog" --depth 0

# 3 levels deep (element → children → grandchildren → great-grandchildren)
design-ruler measure --url "..." --selector ".dialog" --depth 3
```

Child `bbox` coordinates are relative to their parent, so you can directly compare against design spec layouts.

### screenshot

Capture a PNG screenshot of the page or a specific element.

```bash
# Full page
design-ruler screenshot --url "http://localhost:3000" --output page.png

# Specific element
design-ruler screenshot --url "http://localhost:3000" --selector ".dialog" --output dialog.png

# Full scrollable page
design-ruler screenshot --url "http://localhost:3000" --full-page --output full.png
```

Output: `{ "output": "page.png", "bytes": 45678 }`

### overlay

Generate a ghost image: design screenshot (magenta-tinted) composited on the live rendering.

```bash
# Component-level (recommended): Sharp pixel-precise compositing
design-ruler overlay --design dialog.png --url "http://localhost:3000" --selector ".dialog" --output ghost.png

# Full-page: direct offset params
design-ruler overlay --design spec.png --url "http://localhost:3000" --offset-x 0 --offset-y 0 --output ghost.png

# Interactive: opens browser UI for manual drag-to-align
design-ruler overlay --design ./design.png --url "http://localhost:3000"
```

Design elements appear in **magenta**, implementation in original colors. Where they align, the image looks clean. Where they diverge, you see magenta ghosting:

| Design | Ghost overlay |
|--------|--------------|
| ![design](docs/design-example.png) | ![ghost](docs/ghost-example.png) |

The ghost effect amplifies even 1-2px offsets. AI agents read ghost images to directly identify which elements are misaligned and by how much.

**How tinting works:** The design image is preprocessed with Sharp — white/light pixels become transparent, dark/colored pixels are tinted magenta with opacity proportional to darkness. This means no background color pollution, and the AI can always distinguish the design ghost (magenta) from the actual implementation (original colors).

## Engines

design-ruler supports two browser engines:

| Engine | When to use | Flag |
|--------|-------------|------|
| **Playwright** (default) | Local dev, CI, any web page | None needed |
| **CDP** | Android WebView, embedded browsers, remote debugging | `--cdp host:port` |

Playwright launches headless Chromium automatically. CDP connects to an already-running browser via Chrome DevTools Protocol.

```bash
# CDP example: Android emulator WebView
adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.example.app)
design-ruler measure --url "http://localhost:3000" --selector ".box" --cdp 127.0.0.1:9222
```

## Design Source Agnostic

design-ruler doesn't connect to any design tool. It only measures the runtime side. The design spec lives wherever your agent already reads it:

- **Figma** — via official MCP, REST API, or manual export
- **Sketch, Penpot, Pixso** — export a screenshot, use overlay
- **Design tokens** — your agent already knows the values
- **A napkin sketch** — screenshot it, overlay it

The agent bridges the gap between design data and runtime measurements. design-ruler just provides the measurements.

## Agent Workflow

The three commands work together in a verification loop. `measure` is the source of truth — it gives precise numbers. `screenshot` and `overlay` are visual aids that help the agent **find** problems, but `measure` is what **confirms** the fix.

```
1. Read design spec (from Figma MCP, design doc, or image)
2. Write/modify CSS
3. Identify what's wrong (visual):
   - design-ruler screenshot → agent reads image, compares with design
   - design-ruler overlay --selector ".component" → agent reads ghost image, spots misaligned regions
4. Quantify what's wrong (structural):
   - design-ruler measure → get exact rendered values as JSON
   - Compare spec vs actual → find deltas > 2px
5. Fix CSS for each delta
6. Verify (measure is final arbiter):
   - design-ruler measure → all deltas < 2px? Done.
   - If not, back to step 3.
```

**Why measure leads:** Ghost overlay and screenshots rely on multimodal vision, which has precision limits — an AI might miss a 2px offset or misjudge a color. `measure` returns exact computed values (`border-radius: 12px`, `padding: 24px`) that can be compared programmatically with zero ambiguity.

**Why visual still matters:** `measure` can't see everything. Shadows, gradients, visual weight, icon alignment, overall "feel" — these require eyes. The agent uses `screenshot` to spot-check overall fidelity, and `overlay` ghost images to quickly locate spatial misalignments. Then `measure` confirms and quantifies.

## Programmatic API

```typescript
import { createEngine, PlaywrightEngine } from 'design-ruler'
import { writeFile } from 'fs/promises'

// Auto-select engine
const engine = await createEngine({ url: 'http://localhost:3000' })

// Or explicitly
const engine = await PlaywrightEngine.create('http://localhost:3000', {
  viewport: { width: 1920, height: 1080 },
})

const result = await engine.measure('.dialog', 2)
console.log(result.bbox, result.computedStyle)

const buf = await engine.screenshot({ selector: '.dialog' })
await writeFile('dialog.png', buf)

await engine.close()
```

## Background

This tool was extracted from an internal design verification pipeline (Vue 3 + Android WebView + Figma MCP). The full pipeline includes dual-side layout snapshots, SSIM scoring, and HTML report generation.

In practice, we found that **AI agents don't need most of that machinery**. Give them structured measurements and they'll figure out the rest. The heavy verification tools (SSIM, reports, CSS diff with tolerance) actually interrupt the agent's autonomous flow — the AI has to stop, parse a report, then decide what to do. With design-ruler, the AI just reads JSON and acts.

The best workflow turned out to be: human selects a design module, agent does everything else.

design-ruler is the open-source distillation of that lesson: **tools should collect data, not make decisions.**

## License

MIT
