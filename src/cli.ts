import { Command } from 'commander'
import { measure } from './commands/measure.js'
import { screenshot } from './commands/screenshot.js'
import { overlay } from './commands/overlay.js'
import { configSet, configGet, configPath } from './commands/config.js'
import { imagine } from './commands/imagine.js'
import { skillInstall, skillPath } from './commands/skill.js'
import { crop } from './commands/crop.js'

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
  .requiredOption('--selector <selector>', 'CSS selector to measure (prefix ~ for fuzzy class match, e.g. ~header)')
  .option('--depth <n>', 'Child element depth (0=no children)', '1')
  .option('--cdp <host:port>', 'CDP endpoint (skip Playwright, connect to running browser)')
  .option('--pick <fields>', 'Pick specific fields: bbox, children, or CSS property names (comma-separated)')
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
  .option('--selector <selector>', 'CSS selector (captures element only, prefix ~ for fuzzy class match)')
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
  .option('--selector <selector>', 'CSS selector — composite ghost on element (Sharp, pixel-precise, prefix ~ for fuzzy class match)')
  .option('--full-page', 'Capture full scrollable page')
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

const configCmd = program
  .command('config')
  .description('Manage design-ruler configuration (API keys for image2, etc.)')

configCmd
  .command('set <key> <value>')
  .description('Set a config value. Supported key: ai-gateway-key')
  .action(configSet)

configCmd
  .command('get <key>')
  .description('Get a config value (key is masked). Supported key: ai-gateway-key')
  .action(configGet)

configCmd
  .command('path')
  .description('Print the absolute path of the config file')
  .action(configPath)

const imagineCmd = program
  .command('imagine <prompt>')
  .description('Generate or edit an image. No --ref = text-to-image (gpt-image-2). --ref = image-to-image edit.')
  .option('--out <path>', 'Output PNG path (default: imagine-<timestamp>.png)')
  .option('--quality <level>', 'low | medium | high (generate only)', 'medium')
  .option('--size <WxH>', 'Canvas size, e.g. 1024x1536 (generate only)')
  .option('--model <id>', 'Override model. generate default: openai/gpt-image-2. edit default: google/gemini-2.5-flash-image')
  .option('--ref <path>', 'Reference image → image-to-image edit mode')
  .option('--extra <path...>', 'Extra reference images (edit mode, repeatable)')
  .option('--target-size <WxH>', 'Output canvas / size for edit mode')
  .option('--key <vck_...>', 'Override API key (highest priority, not persisted)')
  .action((prompt: string, opts: Record<string, any>) => imagine(prompt, opts))

imagineCmd.addHelpText('after', `
Engines (which model runs, and why it matters):
  Text-to-image (no --ref):   openai/gpt-image-2  — highest quality, composes fresh. Use for redesigns.
  Image-to-image (--ref):
    default                   google/gemini-2.5-flash-image — faithful & fast, but only "tweaks/cleans"
                                the input and softens detail. Good for minor edits, weak for redesigns.
    --model openai/gpt-image-2  image2-quality redesign from the reference, via a GPT-5 + image_generation
                                tool under the hood. Truly redraws; slower & costlier.

Tips:
  • Want a polished REDESIGN from a screenshot? Either describe the content and use text-to-image (no --ref),
    or use --ref --model openai/gpt-image-2. Do NOT expect the default (gemini) edit to redesign — it won't.
  • --quality/--size apply to text-to-image; --target-size sizes the edit output.
`)

const skillCmd = program
  .command('skill')
  .description('Manage design-ruler agent skills (install all bundled skills, list paths)')

skillCmd
  .command('install')
  .description('Install all bundled skills into ~/.claude/skills (or --dir base)')
  .option('--dir <path>', 'Target skills base directory (default: ~/.claude/skills); each skill installs to <dir>/<name>/')
  .action((opts: Record<string, any>) => skillInstall(opts))

skillCmd
  .command('path')
  .description('List all bundled skills and their paths')
  .action(skillPath)

program
  .command('crop')
  .description('Crop named boxes out of an image (e.g. slice an extracted asset sheet into individual files).')
  .requiredOption('--in <path>', 'Source image')
  .requiredOption('--boxes <json>', 'JSON array of { name, box:[x,y,w,h] } — inline string or a .json file path')
  .option('--out-dir <dir>', 'Output directory (default: .)')
  .option('--normalized', 'Treat box values as 0-1 fractions of width/height (recommended for agent-supplied boxes)')
  .action((opts: Record<string, any>) => crop(opts))

program.parse()
