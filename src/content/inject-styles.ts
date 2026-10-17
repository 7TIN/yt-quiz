/**
 * The panel's stylesheet is injected into an open shadow root. Two Chromium
 * behaviours were verified with a real render (headless Edge, see
 * scripts/panel-check.mjs) and need workarounds:
 *
 * 1. `@property` rules declared INSIDE a shadow stylesheet are ignored.
 *    Registration is document-wide though, so a `@property` rule hoisted into
 *    <head> does reach the shadow tree. Tailwind v4 emits `@property` rules for
 *    several of its internal custom properties, so we hoist all of them once.
 *
 * 2. `:root` matches nothing inside a shadow tree. Tailwind v4 declares its
 *    theme variables under `:root` (and `:host`), and our own design tokens use
 *    `:root`/`:host` too — so the injected copy rewrites `:root` to `:host`.
 *    (`:root` matches an ancestor outside the shadow tree that selectors cannot
 *    reach, hence "matches nothing".)
 */
const AT_PROPERTY_RULE_PATTERN = /@property\s+--[\w-]+\s*\{[^}]*\}/g
const HOIST_STYLE_ATTRIBUTE = 'data-ll-property-hoist'

/** Injects `css` into `shadow`, applying the workarounds above. */
export function injectPanelStyles(shadow: ShadowRoot, css: string): void {
  hoistAtPropertyRules(css)

  const style = document.createElement('style')
  style.textContent = css.replaceAll(':root', ':host')
  shadow.append(style)
}

/**
 * Copies every top-level `@property` rule into a single <style> element in
 * <head> so the registrations apply to (and from) the shadow tree. Runs once
 * per document; repeated calls only add rules that are not hoisted yet.
 */
export function hoistAtPropertyRules(css: string): void {
  const rules = css.match(AT_PROPERTY_RULE_PATTERN)
  if (!rules || rules.length === 0) return

  let hoistStyle = document.head.querySelector<HTMLStyleElement>(
    `style[${HOIST_STYLE_ATTRIBUTE}]`,
  )
  if (!hoistStyle) {
    hoistStyle = document.createElement('style')
    hoistStyle.setAttribute(HOIST_STYLE_ATTRIBUTE, '')
    document.head.append(hoistStyle)
  }

  const existing = hoistStyle.textContent ?? ''
  const missing = rules.filter((rule) => !existing.includes(rule))
  if (missing.length > 0) {
    hoistStyle.textContent = `${existing}${existing ? '\n' : ''}${missing.join('\n')}`
  }
}
