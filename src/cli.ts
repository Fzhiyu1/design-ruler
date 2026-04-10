import { Command } from 'commander'
import { measure } from './commands/measure.js'
import { screenshot } from './commands/screenshot.js'
import { overlay } from './commands/overlay.js'

const program = new Command()

program
  .name('design-ruler')
  .description('A ruler for AI agents — measure runtime CSS, capture screenshots, and overlay-compare against design specs.\nAll output is JSON by default for machine consumption. Designed for CI and agent loops.')
  .version('0.1.0')

program.addHelpText('after', `
Workflow (agent):
  1. measure  → read element bbox + computed CSS as JSON
  2. screenshot → capture current rendering to PNG
  3. overlay  → visually compare design PNG vs live page (interactive or cached)

Engine selection:
  Default: Playwright (launches headless Chromium, no setup needed)
  --cdp <host:port>: Connect to existing Chrome/WebView via CDP (e.g. adb forward)

Examples:
  $ design-ruler measure --url http://localhost:3000 --selector ".dialog"
  $ design-ruler measure --url http://localhost:3000 --selector ".btn" --cdp 127.0.0.1:9222
  $ design-ruler screenshot --url http://localhost:3000 --output page.png
  $ design-ruler overlay --design ./figma-export.png --url http://localhost:3000
  $ design-ruler overlay --design ./figma-export.png --url http://localhost:3000 --cached
`)

const measureCmd = program
  .command('measure')
  .description('Measure an element\'s bbox and computed style. Returns JSON with selector, bbox {x,y,width,height}, computedStyle {}, and children[].')
  .requiredOption('--url <url>', 'Target page URL (http://... or data:text/html,...)')
  .requiredOption('--selector <selector>', 'CSS selector to measure')
  .option('--depth <n>', 'Child element depth (0=no children)', '1')
  .option('--cdp <host:port>', 'CDP endpoint (skip Playwright, connect to running browser)')
  .option('--format <format>', 'Output format: json | table', 'json')
  .action(measure)

measureCmd.addHelpText('after', `
Output (json):
  {
    "selector": ".dialog",
    "bbox": { "x": 100, "y": 200, "width": 400, "height": 300 },
    "computedStyle": { "border-radius": "12px", "padding": "24px", ... },
    "children": [{ "tag": "h2", "className": "title", "bbox": {...}, "text": "..." }]
  }

Agent usage:
  Parse JSON output → compare bbox/style against design spec → adjust CSS → re-measure.
  Use --depth 0 for faster measurement when children are not needed.
`)

const screenshotCmd = program
  .command('screenshot')
  .description('Capture a PNG screenshot of the full page or a specific element.')
  .requiredOption('--url <url>', 'Target page URL')
  .option('--selector <selector>', 'CSS selector (captures element only)')
  .option('--output <path>', 'Output file path (default: screenshot-<timestamp>.png)')
  .option('--full-page', 'Capture full scrollable page')
  .option('--cdp <host:port>', 'CDP endpoint')
  .action(screenshot)

screenshotCmd.addHelpText('after', `
Output (JSON to stdout):
  { "output": "./screenshot-1234567890.png", "bytes": 45678 }

Agent usage:
  Capture before/after screenshots to verify visual changes.
  Use --selector to isolate a component.
`)

const overlayCmd = program
  .command('overlay')
  .description('Generate ghost overlay: design image (magenta-tinted) on top of live page.')
  .requiredOption('--design <path>', 'Path to design screenshot (PNG/JPG)')
  .requiredOption('--url <url>', 'Target page URL')
  .option('--selector <selector>', 'CSS selector — composite ghost on element (Sharp, pixel-precise)')
  .option('--output <path>', 'Output file path (default: overlay-<timestamp>.png)')
  .option('--offset-x <px>', 'Horizontal offset of design overlay (full-page mode)')
  .option('--offset-y <px>', 'Vertical offset of design overlay (full-page mode)')
  .option('--scale <ratio>', 'Scale factor for design overlay (1 = 100%)')
  .option('--opacity <0-1>', 'Opacity of design overlay')
  .option('--cdp <host:port>', 'CDP endpoint')
  .option('--port <port>', 'Local server port for interactive UI', '9876')
  .action(overlay)

overlayCmd.addHelpText('after', `
Modes:
  Selector (recommended for components):
    $ design-ruler overlay --design dialog.png --url http://localhost:3000 --selector ".dialog" --output ghost.png
    Screenshots the element, resizes design to match, composites via Sharp. Pixel-precise.

  Direct (full-page):
    $ design-ruler overlay --design spec.png --url http://localhost:3000 --offset-x 0 --offset-y 0 --output ghost.png

  Interactive (default): Opens browser UI for manual drag-to-align.
    $ design-ruler overlay --design spec.png --url http://localhost:3000

Ghost image: Design elements appear in magenta, implementation in original colors.
Where they align → clean. Where they diverge → visible magenta ghosting.
AI agents can read ghost images to identify misaligned regions.
`)

program.parse()
