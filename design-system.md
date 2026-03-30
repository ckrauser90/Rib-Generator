# Design System — Rib Generator

Inspiration: elimente.de — Warm, minimalistisch, iPhone-artige Einfachheit

## Farbpalette

### Light Mode

| Token | Hex | Verwendung |
|-------|-----|------------|
| `--cream-50` | #FFFDF9 | Card Backgrounds |
| `--cream-100` | #FFF9F0 | Panels, Overlays |
| `--cream-200` | #F5EBE0 | Borders, Dividers |
| `--cream-300` | #E8D5C4 | Disabled States |
| `--sand-400` | #C9B8A3 | Muted Text, Icons |
| `--sand-500` | #8B7B6B | Secondary Text |
| `--brown-600` | #6F6157 | Tertiary Text |
| `--brown-700` | #5C4D40 | Body Text |
| `--brown-800` | #2F241B | Primary Text |
| `--terracotta-500` | #A2512B | Primary Action |
| `--terracotta-600` | #8B4722 | Primary Hover |
| `--terracotta-400` | #D7814C | Accent, Highlights |
| `--terracotta-100` | #F5E6DC | Accent Backgrounds |

### Dark Mode

| Token | Hex | Verwendung |
|-------|-----|------------|
| `--night-900` | #1A1512 | Page Background |
| `--night-800` | #252019 | Card Background |
| `--night-700` | #332B23 | Elevated Surfaces |
| `--night-600` | #443829 | Borders |
| `--sand-300` | #A89B8A | Muted Text |
| `--sand-200` | #C4B8A5 | Secondary Text |
| `--cream-100` | #FFF9F0 | Primary Text |
| `--cream-200` | #F5EBE0 | Headings |
| `--terracotta-400` | #D7814C | Accent (Dark) |
| `--terracotta-500` | #C47D4E | Primary Action Dark |

## Typografie

**Font Family:** `"Inter", system-ui, -apple-system, sans-serif`

| Style | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `xs` | 12px | 400 | 1.4 | Captions, Labels |
| `sm` | 14px | 400 | 1.5 | Secondary text |
| `base` | 16px | 400 | 1.6 | Body |
| `lg` | 18px | 500 | 1.5 | Subheadings |
| `xl` | 20px | 600 | 1.4 | H4 |
| `2xl` | 24px | 600 | 1.3 | H3 |
| `3xl` | 30px | 600 | 1.2 | H2 |
| `4xl` | 36px | 700 | 1.1 | H1 |

## Spacing System

Base: 4px

| Token | Value | Usage |
|-------|-------|-------|
| `1` | 4px | Tight gaps |
| `2` | 8px | Icon gaps |
| `3` | 12px | Input padding |
| `4` | 16px | Standard padding |
| `5` | 20px | Card padding |
| `6` | 24px | Section gaps |
| `8` | 32px | Large gaps |
| `10` | 40px | Page sections |
| `12` | 48px | Hero spacing |
| `16` | 64px | Max sections |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `sm` | 6px | Inputs, Small buttons |
| `md` | 10px | Cards, Medium buttons |
| `lg` | 16px | Modals, Large cards |
| `xl` | 24px | Hero elements |
| `full` | 9999px | Pills, Avatars |

## Shadows

```css
/* Subtle — Cards on white */
--shadow-sm: 0 1px 2px rgba(47, 36, 27, 0.04);

/* Elevated — Dropdown, Cards */
--shadow-md: 0 4px 12px rgba(47, 36, 27, 0.08);

/* Floating — Modals, Tooltips */
--shadow-lg: 0 16px 40px rgba(47, 36, 27, 0.12);

/* Heavy — Important modals */
--shadow-xl: 0 32px 64px rgba(47, 36, 27, 0.16);
```

## Animation

**Timing:** 200ms for interactions, 300ms for page transitions

**Easing:** `cubic-bezier(0.4, 0, 0.2, 1)` — iOS-like ease

**Principles:**
- Opacity + scale for enters
- Subtle translate for feedback
- No bounces or overshoots
- Never blocking

## Component Tokens

### Button Heights
- `h-10` (40px) — Default
- `h-12` (48px) — Large/CTAs

### Input Heights
- `h-11` (44px) — Minimum touch target
- `h-12` (48px) — Comfortable

### Border Widths
- `1px` — Standard borders
- `2px` — Focus rings

## Dark Mode Strategy

CSS variables swap on `[data-theme="dark"]` on `<html>`. No Tailwind `dark:` prefix chaos — use CSS custom properties throughout.