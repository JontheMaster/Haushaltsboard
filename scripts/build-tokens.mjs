// Übersetzt design/tokens.json in src/styles/tokens.css (CSS-Variablen + Tailwind-Theme).
// Aufruf: npm run tokens. Die erzeugte Datei nicht von Hand ändern.
import { readFileSync, writeFileSync } from 'node:fs'

const t = JSON.parse(readFileSync(new URL('../design/tokens.json', import.meta.url), 'utf8'))

const light = []
const dark = []
const theme = []
const themeInline = []

const add = (name, value) => {
  if (typeof value === 'object') {
    light.push(`  --${name}: ${value.light};`)
    dark.push(`  --${name}: ${value.dark};`)
  } else {
    light.push(`  --${name}: ${value};`)
  }
}

// Farben: semantisch (zwei Themes) und Palette (fest)
for (const { name, value } of t.color.tokens) {
  add(name, value)
  themeInline.push(`  --color-${name}: var(--${name});`)
}

// Abstände: --space-N für components.css, im Tailwind-Theme als p-N, gap-N usw.
// 0 und px sind keine Design-Abstände, werden aber für inset-0, border usw. gebraucht.
theme.push('  --spacing-0: 0px;', '  --spacing-px: 1px;')
for (const { name, value } of t.spacing.tokens) {
  add(name, value)
  theme.push(`  --spacing-${name.replace('space-', '')}: ${value};`)
}

// Radien heißen in Tailwind gleich, deshalb nur im Theme definieren
for (const { name, value } of t.radius.tokens) theme.push(`  --${name}: ${value};`)

// Schatten und Fokus wechseln mit dem Theme; Tailwind-Utilities dazu stehen in index.css
for (const { name, value } of t.shadow.tokens) add(name, value)

for (const { name, value } of t.duration.tokens) add(name, value)
for (const { name, value } of t.easing.tokens) theme.push(`  --${name}: ${value};`)

for (const [name, value] of Object.entries(t.type.families)) theme.push(`  --font-${name}: ${value};`)
for (const group of t.type.groups) {
  for (const s of group.styles) {
    theme.push(`  --text-${s.name}: ${s.fontSize};`)
    theme.push(`  --text-${s.name}--line-height: ${s.lineHeight};`)
    theme.push(`  --text-${s.name}--font-weight: ${s.fontWeight};`)
    if (s.letterSpacing) theme.push(`  --text-${s.name}--letter-spacing: ${s.letterSpacing};`)
  }
}

const css = `/* Erzeugt aus design/tokens.json von scripts/build-tokens.mjs. Nicht von Hand ändern. */

:root {
  color-scheme: light;
${light.join('\n')}
}

:root[data-theme='dark'] {
  color-scheme: dark;
${dark.join('\n')}
}

/* Tailwind: nur Token-Werte, keine Standardskala */
@theme {
  --color-*: initial;
  --spacing-*: initial;
  --radius-*: initial;
  --shadow-*: initial;
  --font-*: initial;
  --text-*: initial;
${theme.join('\n')}
}

@theme inline {
  --color-transparent: transparent;
  --color-current: currentColor;
${themeInline.join('\n')}
}
`

writeFileSync(new URL('../src/styles/tokens.css', import.meta.url), css)
console.log('src/styles/tokens.css geschrieben')
