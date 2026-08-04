# Styling convention

**Decision (Aug 2026):** the 6 existing back-office screens stay on inline
styles. Everything new — starting with front-of-house/sales — uses
Tailwind, via the shared components in `src/components/ui/`.

## Why a split, not a full migration

Converting the existing screens carries real visual-regression risk for
zero functional benefit today - nothing is currently slow or broken.
Rewriting them right after the TypeScript migration would stack two large
refactors back-to-back on code that already works. The actual risk worth
avoiding is new code adding to the pile that eventually needs converting -
that's what this convention prevents, without requiring the rewrite now.

If a dedicated refactor pass happens later, that's the natural moment to
convert the original 6 screens too - bundled with the other cleanup
already flagged (code-splitting, some duplicated logic between screens).

## What's already in place

- `tailwind.config.js` - colors match `src/lib/tokens.ts` exactly, just
  Tailwind-cased (`bg-accent` = `accent` = `#1E5B8C`, `bg-canvas` = `bg`,
  `text-ink` = `textPrimary`, `text-slate` = `textMuted`, etc.) - a
  Tailwind screen and an inline-style screen will always match visually,
  since they're pulling from the same real color values, not
  independently-maintained ones that can drift apart.
- Preflight (Tailwind's CSS reset) is deliberately OFF
  (`src/index.css` only loads `@tailwind components` and
  `@tailwind utilities`, never `@tailwind base`) - enabling it would
  globally reset default browser styling on every element, including the
  6 untouched inline-style screens, and risk visual regressions there.
  Leave this off unless the old screens get converted too.
- `animation: backdrop-fade / modal-pop / banner-slide / spin` in the
  Tailwind config reference the exact same `@keyframes` already defined
  globally in `index.css` and used by every existing modal - a
  Tailwind-built modal and an inline-style modal move identically.

## Shared components (`src/components/ui/`)

- `Button.tsx` - variants: primary / secondary / danger / ghost, sizes:
  sm / md. Colors match the existing inline-style buttons exactly.
- `Card.tsx` - the white-surface-with-border wrapper used everywhere.
- `Modal.tsx` - backdrop + card, `position="center"` (matches the
  existing auto-PO/edit-entity modals) or `position="sheet"` (matches
  AskAgentModal's bottom-anchored style).

New screens should use these rather than reimplementing button/modal/card
styling ad hoc - that's what keeps a Tailwind screen and an inline-style
screen looking like the same app.
