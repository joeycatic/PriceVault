# PriceVault Dashboard — Design Guardrails

Reference this before any dashboard UI work. Goal: a monitoring tool that reads as
precise and built-for-purpose, not a generic indigo/purple SaaS template.

## Avoid the defaults

Don't reach for: indigo/purple gradient sidebars, soft rounded cards with drop shadows,
a hero stat block with a big number + small label + sparkline (the templated dashboard look).
Also avoid the current AI-design clichés: warm cream + terracotta, or near-black + single
neon accent — pick a direction because it fits price-tracking, not because it's a safe default.

## Ground it in the actual job

PriceVault's job is surveillance: watching competitor prices change and surfacing deltas
fast. Design around that:
- **Signature element**: price deltas should be the most visually distinct thing on any
  screen — not another green/red badge, but a treatment specific to this product (e.g.
  a directional marker system, a compact trend rail next to the price, or a diff-style
  before/after that borrows from version-control diffs rather than finance-app conventions).
- **Numbers are the content.** Use a monospaced or tabular-figure numeral style for all
  prices so columns of numbers align and are scannable at a glance — this is a legitimate,
  purposeful use of monospace, not decoration.
- **Density over whitespace.** This is a tool an operator checks daily, not a marketing
  page. Favor compact, scannable tables and lists over generous card padding.

## Token system (fill in before building, don't skip)

- **Color**: 4–6 named hex values. Pick a base (light or dark) deliberately based on
  "checked daily, often alongside other tabs" — don't default to dark mode just because
  it looks technical. One accent color reserved only for price-drop/price-rise signaling
  so it stays meaningful.
- **Type**: a utility/data face for numbers and tables (something with real tabular
  figures — e.g. Inter, IBM Plex Mono for numerals specifically), a second face for
  headings/nav if the data face doesn't carry personality alone. Avoid pairing two
  generic geometric sans faces — pick one with actual character.
- **Layout**: sketch in ASCII/prose before building — table-first or card-first, where
  alerts live relative to the product list, how multi-source comparison is laid out.

## German-language specifics

- All UI strings are German (see AGENTS.md) — write real German copy, not
  placeholder/translated-literally text. Sentence case, plain verbs, no filler
  (matches the tone the rest of the product should have).
- Numbers/currency formatted per German convention (comma decimal separator,
  period thousands separator, € suffix) — don't ship US-formatted numbers.

## Process

1. State the token system (color/type/layout/signature) in 4–6 lines before writing
   any component code.
2. Build the signature element (price-delta treatment) first — it's the thing every
   other screen inherits from.
3. Self-critique against the "avoid the defaults" list above before calling it done.
4. Responsive down to mobile, visible keyboard focus, respects reduced motion —
   quality floor, not optional polish.
