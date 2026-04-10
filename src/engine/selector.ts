/**
 * Resolve selector: if starts with ~, convert to [class*="..."] fuzzy match.
 * Returns a standard CSS selector.
 */
export function resolveSelector(input: string): string {
  if (input.startsWith('~')) {
    const keyword = input.slice(1).trim()
    return `[class*="${keyword}"]`
  }
  return input
}
