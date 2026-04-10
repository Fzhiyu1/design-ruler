export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

export interface ChildElement {
  tag: string
  className: string
  bbox: BBox
  text?: string
  children?: ChildElement[]
}

export interface MeasureResult {
  selector: string
  bbox: BBox
  computedStyle: Record<string, string>
  children?: ChildElement[]
}

export interface OverlayParams {
  designImagePath: string
  targetUrl: string
  offsetX: number
  offsetY: number
  scale: number
  opacity: number
  scrollY?: number
}

export interface ScreenshotOptions {
  selector?: string
  fullPage?: boolean
  output?: string
}

export interface RuntimeEngine {
  /** Take a screenshot, optionally of a specific element */
  screenshot(options?: ScreenshotOptions): Promise<Buffer>

  /** Measure an element's bbox + computed style */
  measure(selector: string, depth?: number): Promise<MeasureResult>

  /** Execute JavaScript in the page context */
  evaluate<T = unknown>(expression: string): Promise<T>

  /** Inject a design overlay image onto the page */
  injectOverlay(params: OverlayParams): Promise<void>

  /** Capture the page with overlay applied */
  captureOverlay(): Promise<Buffer>

  /** Clean up resources */
  close(): Promise<void>
}
