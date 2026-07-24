/**
 * Strip background-writing Tailwind utilities from caller-supplied className
 * strings so table primitives always receive opaque fills. Framework-independent
 * and importable by Node 20 without a TypeScript/TSX runtime.
 *
 * @param {string | undefined} className
 * @returns {string | undefined}
 */
export function withoutTableSurfaceUtilities(className) {
  if (className === undefined || className === null) return undefined

  const tokens = className.trim().split(/\s+/)
  const kept = []

  for (const token of tokens) {
    if (!token) continue
    const terminalUtility = extractTerminalUtility(token)
    if (isBackgroundUtility(terminalUtility)) continue
    kept.push(token)
  }

  return kept.join(" ")
}

/**
 * Extract the terminal utility from a potentially variant-prefixed token,
 * stripping an optional trailing `!` (suffix-important) from the result.
 *
 * Variants are colon-separated prefixes at bracket-depth zero. Arbitrary
 * variants like `[&:nth-child(2)]:` contain internal colons inside brackets
 * and are correctly preserved because we only split at depth-zero colons.
 *
 * @param {string} token
 * @returns {string}
 */
function extractTerminalUtility(token) {
  let depth = 0
  let lastColon = -1

  for (let i = 0; i < token.length; i++) {
    const ch = token[i]
    if (ch === "[") depth++
    else if (ch === "]") depth--
    else if (ch === ":" && depth === 0) lastColon = i
  }

  const utility = lastColon === -1 ? token : token.slice(lastColon + 1)
  // Strip suffix-important `!`
  return utility.endsWith("!") ? utility.slice(0, -1) : utility
}

/**
 * Returns true when a terminal utility writes to the background layer.
 * Covers:
 *   - bg-* (Tailwind background-color/image utilities)
 *   - from-*, via-*, to-* (gradient stop utilities)
 *   - arbitrary property/value forms whose property is background,
 *     background-color, or background-image
 *
 * @param {string} utility
 * @returns {boolean}
 */
function isBackgroundUtility(utility) {
  if (utility.startsWith("bg-")) return true
  if (utility.startsWith("from-")) return true
  if (utility.startsWith("via-")) return true
  if (utility.startsWith("to-")) return true

  // Arbitrary forms: [background:...], [background-color:...], [background-image:...]
  if (utility.startsWith("[background:")) return true
  if (utility.startsWith("[background-color:")) return true
  if (utility.startsWith("[background-image:")) return true

  return false
}
