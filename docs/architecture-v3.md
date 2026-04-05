# Frado Player v3 — Architecture Plan

**Date:** 2026-04-02
**Based on:** audit-php.md, audit-audio-modal.md, audit-video-player.md, audit-js.md, aria-spec.md, keyboard-shortcuts.md, design-tokens.css

---

## 1. Goals

### What v3 Solves vs v2

**Critical bugs fixed (from audits):**

1. `_FPKeyboard` is bound to `document` instead of `container` — with multiple players on a page both fight for the same keydown events; the `isOnlyPlayer` heuristic is brittle
2. `fvideoToggle()` in theme discards the Promise returned by `vid.play()` — causes `UnhandledPromiseRejection` under autoplay restrictions
3. `fvideoPrev` / `fvideoNext` call `vid.play()` synchronously after `vid.load()`, producing `AbortError`
4. Double-escaping in PHP: `esc_attr( $atts['title'] )` where `$atts['title']` has already been run through `esc_html()` — entities get double-encoded
5. URL data attributes emitted without explicit `esc_attr()` wrapper (`echo $src` with no attribute context escaping)
6. `wp_enqueue_style` / `wp_enqueue_script` called once per shortcode instance; with three players on a page WordPress receives three redundant enqueue calls
7. `touch-action:manipulation` as inline style violates CSP policies that block `style-src 'unsafe-inline'`
8. No `tabindex` on seekbar or volume slider — neither is reachable by keyboard
9. No `aria-valuetext` on either slider — screen readers announce raw integers instead of time strings
10. Mute button uses `aria-label="Volume"` — ambiguous, neither describes action nor state
11. Play button missing `aria-pressed` — screen readers cannot report play/pause state
12. 60 ms + 150 ms `setTimeout` hacks in theme for FradoPlayer initialization — fragile on slow devices, unnecessary with a proper factory method
13. `tracks=` parser does not support AAC (field 5), per-track thumbnail (field 7), comma-in-title (delimiter collision)
14. `_FPPlaylist` reads `aria-current` nowhere — active track not announced to screen readers
15. Video player listeners in theme have no `fvideoInited` guard — parallel to the `fplayerInited` guard on audio

**JS-specific bugs (from audit-js.md):**

16. **B1 (HIGH)** — `_resizeCanvas()` calls `ctx.scale(dpr, dpr)` cumulatively on every resize. The transform accumulates exponentially; at DPR=2 after two resizes, all drawing is at 4× scale. Must use `ctx.setTransform()` instead.
17. **B2 (MEDIUM)** — Seekbar does not handle `pointercancel`; the `seeking` flag stays `true` after a touch scroll takeover
18. **B3 (MEDIUM)** — `loadTrack()` calls `core.loadSrc()` then `core.play()` synchronously without waiting for `canplay`, causing silent failures on slow networks
19. **B4 (MEDIUM)** — If volume is loaded as muted from localStorage, `mediaEl.volume` is never initialized; browser default (1.0) is used until unmute
20. **B5 (MEDIUM)** — `_FPBottomSheet` is never destroyed in `FradoPlayer.destroy()`, leaking a `window` resize listener

**Missing features added in v3:**
- `autoplay`, `loop`, `color` shortcode attributes
- `FradoPlayer.fromCard(cardEl, containerEl)` factory — theme stops needing to know internals
- Formal state machine (`_FPState`) replacing ad-hoc `isPlaying` boolean
- `_FPAccessibility` class managing live regions, `aria-busy`, `aria-current`, focus restoration
- `_FPKeyboard` v3: adds `K`, `N`, `P`, `Home`, `End`, `Escape`, `1`–`9`; scoped to container, not document
- Design tokens (`--fp-*`) compiled into CSS custom properties
- `color=` shortcode attribute overrides `--fp-accent` inline on the container

### Non-Goals / Out of Scope for v3

- No SPA router integration (history API stays in theme)
- No server-side playlist rendering via REST API
- No React / Web Component rewrite (ES5 IIFE pattern is preserved)
- No audio download/export feature
- No streaming protocol support (HLS, DASH)
- No WP admin settings page
- Legacy `fplayerAudio` / `fvideoEl` players in theme are NOT absorbed — they stay in theme
- No right-to-left layout support
- No IE11 support (already broken in v2 due to `CustomEvent`, `ResizeObserver`)

---

## 2. Class Architecture

### Class Tree

```
window.FradoPlayer (public facade)
│
├── static: FradoPlayer.fromCard(cardEl, containerEl)
│
├── instance properties:
│   ├── .state     → _FPState          (new)
│   ├── .core      → _FPCore           (evolved)
│   ├── .playlist  → _FPPlaylist       (evolved)
│   ├── .spectrum  → _FPSpectrum       (unchanged)
│   ├── .volume    → _FPVolume         (unchanged)
│   ├── .keyboard  → _FPKeyboard       (rewritten — v3 class)
│   ├── .a11y      → _FPAccessibility  (new)
│   ├── .session   → _FPMediaSession   (unchanged)
│   └── .sheet     → _FPBottomSheet    (unchanged)
│
└── instance methods:
    play() pause() toggle() next() prev()
    seekTo(pct) setVolume(v) destroy()
    on(event, cb) off(event, cb)
```

### Class Responsibilities

**`FradoPlayer`** (public facade, ~80 lines)
- Instantiates all sub-modules in the correct order
- Wires transport button click handlers
- Wires `fp:fullscreen-request` and `fp:sheet-close` custom events
- Exposes the clean public API
- Exposes `static fromCard(cardEl, containerEl)`
- Owns the `_listeners` map for `.on()` / `.off()`
- `destroy()` calls every sub-module's `destroy()` then clears `_listeners`

**`_FPState`** (new, ~60 lines)
- Owns the formal state machine: `idle | loading | playing | paused | error`
- Listens to `_FPCore`'s `fp:play`, `fp:pause`, `fp:ended`, `fp:error`, `fp:trackloaded` events
- Sets `container.dataset.fpState` attribute on every transition (CSS can target `[data-fp-state="loading"]`)
- Sets `aria-busy` on container during `loading`
- Fires `fp:statechange` custom event with `{ from, to }` detail
- No other module reads `isPlaying` boolean — they read state via `_FPState.current`

**`_FPCore`** (evolved, ~250 lines)
- Creates `<audio>` or `<video>` element, adds `<source>` children
- Owns seekbar pointer events
- `play()`, `pause()`, `toggle()`, `seek(pct)`, `loadSrc(srcObj, title, durationStr)`
- Fires `fp:play`, `fp:pause`, `fp:ended`, `fp:timeupdate`, `fp:trackloaded`, `fp:error` as CustomEvents on container
- Bug fix: `destroy()` must also remove the seekbar pointer listeners
- Bug fix: `_resizeCanvas()` — use `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` not cumulative `ctx.scale()`
- Bug fix: seekbar must handle `pointercancel` event
- v3 addition: on `loadedmetadata`, also fire `fp:durationchange` with formatted string

**`_FPPlaylist`** (evolved, ~120 lines)
- Reads track `<li>` elements from DOM into `this.tracks[]`
- `loadTrack(index)`, `next()`, `prev()`
- v3: `_applyActiveClass(index)` sets `aria-current="true"` on active item, removes from others
- v3: updates `aria-label` on `<ol>` when album title changes

**`_FPSpectrum`** (unchanged from v2)
- Web Audio API analyser with 30-band logarithmic frequency mapping
- ResizeObserver for canvas resize
- `start()`, `collapse()`, `stop()`, `destroy()`

**`_FPVolume`** (unchanged from v2, minor additions)
- Pointer drag + wheel on volume track
- localStorage persistence
- v3 addition: set `aria-valuetext` (e.g. `"70%"`) on every `setVolume()` call
- v3 addition: `tabindex="0"` now in PHP output, not JS

**`_FPKeyboard`** (rewritten per keyboard-shortcuts.md)
- Bound to `container`, not `document`
- Handles: `Space`, `K`, `←`, `→`, `↑`, `↓`, `M`, `F`, `N`, `P`, `Home`, `End`, `Escape`, `1`–`9`
- Guards: exits early for `e.ctrlKey || e.metaKey || e.altKey`
- Guards: exits early for INPUT/TEXTAREA/SELECT targets
- `destroy()` uses `container.removeEventListener`

**`_FPAccessibility`** (new, ~100 lines)
- Creates and manages the hidden `aria-live="polite"` region (one per player instance)
- `announce(text)` — sets live region text; AT will read it at next opportunity
- Listens to `fp:play` → announces track title + "em reprodução"
- Listens to `fp:pause` → announces "pausado"
- Listens to `fp:trackloaded` → updates `aria-label` on container region
- Listens to `fp:statechange` → sets `aria-busy` during loading
- Manages `aria-pressed` on play button
- Manages `aria-pressed` on mute button
- Manages `aria-disabled` on prev/next buttons
- `destroy()` nulls references

**`_FPMediaSession`** (unchanged from v2)
**`_FPBottomSheet`** (unchanged from v2 — bug fix: must be included in `destroy()`)

### `FradoPlayer.fromCard(cardEl, containerEl)` Factory

```js
static fromCard(cardEl, containerEl):
  1. Read data-fp-* attributes from cardEl
  2. Write data-* attributes to containerEl (the .frado-player div)
  3. Parse data-fp-tracks CSV into <li> DOM inside containerEl's <ol>
  4. Instantiate new FradoPlayer(containerEl)
  5. Call instance.play() immediately — no setTimeout (card click was the user gesture)
  6. Return the instance
```

---

## 3. State Machine

### States

```
idle ──────────────────────────► loading
                                    │
                      ┌─────────────┤
                      ▼             ▼
                   error         playing
                                    │
                               ◄────┤
                            paused  │
                               └────►
                                    │
                               (ended → idle or auto-advance)
```

### Transitions Table

| From | Event / Trigger | To | Side Effects |
|---|---|---|---|
| `idle` | `loadSrc()` called | `loading` | `aria-busy="true"`, `data-fp-state="loading"` |
| `idle` | `play()` called with existing src | `loading` | same |
| `loading` | `fp:play` fires | `playing` | `aria-busy="false"`, `data-fp-state="playing"`, spectrum starts |
| `loading` | `fp:error` fires | `error` | `aria-busy="false"`, `data-fp-state="error"`, live region announces error |
| `playing` | `fp:pause` fires | `paused` | `data-fp-state="paused"`, spectrum collapses |
| `paused` | `fp:play` fires | `playing` | `data-fp-state="playing"`, spectrum starts |
| `playing` | `fp:ended` fires | `idle` | playlist auto-advance OR stays `idle` |
| `playing` | `loadSrc()` called | `loading` | spectrum stop, `aria-busy="true"` |
| `paused` | `loadSrc()` called | `loading` | `aria-busy="true"` |
| `error` | `loadSrc()` called (retry) | `loading` | live region announces retry |
| Any | `destroy()` called | (destroyed) | all listeners removed |

**Rule:** `_FPState` is the only class that writes `container.dataset.fpState`. Other classes react to `fp:statechange` events.

---

## 4. Public API

### Constructor

```js
new FradoPlayer(containerEl)
// containerEl — .frado-player element with data-* attributes populated
// Returns instance immediately; media loads asynchronously
```

### Instance Methods

| Method | Description |
|---|---|
| `play()` | Calls `core.play()`. Returns Promise (resolves when playback starts, rejects on autoplay block). |
| `pause()` | Calls `core.pause()`. |
| `toggle()` | Play if paused/idle, pause if playing. |
| `next()` | Advance to next track. No-op if single track. |
| `prev()` | If >3s elapsed: seek to 0. Otherwise: go to previous track. Wraps. |
| `seekTo(pct)` | Seek to `pct` percent (0–100). No-op if no duration loaded. |
| `setVolume(v)` | Set volume to `v` percent (0–100). |
| `destroy()` | Destroy all sub-modules, remove all listeners, null all DOM references. Safe to call multiple times. |
| `on(event, cb)` | Subscribe to player events. `cb` receives `{ detail }`. |
| `off(event, cb)` | Unsubscribe. |

### Events

| Internal CustomEvent | Public `.on()` event | Detail |
|---|---|---|
| `fp:play` | `'play'` | `{ title }` |
| `fp:pause` | `'pause'` | `{}` |
| `fp:ended` | `'ended'` | `{}` |
| `fp:trackloaded` | `'trackchange'` | `{ index, title, duration }` |
| `fp:error` | `'error'` | `{ message }` |
| `fp:timeupdate` | `'timeupdate'` | `{ currentTime, duration, pct }` |
| `fp:volumechange` | `'volumechange'` | `{ volume, muted }` |

### Static Factory

```js
FradoPlayer.fromCard(cardEl, containerEl)
// cardEl      — .frado-album-card element (has data-fp-* attributes)
// containerEl — the .frado-player wrapper div inside the modal
// Returns: FradoPlayer instance, already playing
```

---

## 5. PHP Changes (v3)

### New Shortcode Attributes

```php
$atts = shortcode_atts( [
    // ... existing attributes ...
    'autoplay' => '0',   // '0' or '1' — absint() clamped 0/1
    'loop'     => '0',   // '0' or '1' — absint() clamped 0/1
    'color'    => '',    // '#hex' — validated with preg_match
], $atts, 'frado_player' );
```

### Updated `tracks=` Format (v3 — backward compatible)

```
title|mp3|flac|opus|aac|duration|thumb
```

- Field 5 (index 4): `aac` — new
- Field 6 (index 5): `duration`
- Field 7 (index 6): `thumb` — new, per-track thumbnail URL
- All fields after `mp3` optional; defaults to empty string

### Fix Double-Escaping

v2 (buggy): `esc_attr( $atts['title'] )` where `$atts['title']` was already `esc_html()`'d.

v3 (correct): Store `$title_raw = sanitize_text_field( $atts['title'] )`, then use `esc_attr( $title_raw )` for data attributes and `esc_html( $title_raw )` for text nodes.

### Fix URL Data Attributes

v2: `data-src="<?php echo $src; ?>"`
v3: `data-src="<?php echo esc_attr( $src ); ?>"`

### Asset Enqueuing — Once Per Page

```php
if ( $instance === 1 ) {
    wp_enqueue_style( 'frado-player' );
    wp_enqueue_script( 'frado-player' );
}
```

### New DOM Attributes

```html
<div class="frado-player"
     id="frado-player-{N}"
     role="region"
     aria-label="Frado Player — {title}"
     aria-busy="false"
     data-fp-state="idle"
     data-autoplay="0|1"
     data-loop="0|1"
     tabindex="0"
     [style="--fp-accent:#hex" — only when color= set]
     ...existing data-* ...>
```

### Move Inline Style to CSS

Remove `style="touch-action:manipulation"` from PHP output.
Add to `frado-player.css`:
```css
.frado-player__progress,
.frado-player__volume-track {
    touch-action: manipulation;
}
```

---

## 6. CSS / Design Tokens

### Strategy

All design values in `--fp-*` CSS custom properties on `:root`. Component CSS references only `var(--fp-*)`. See `design-tokens.css` for full specification.

### CSS File Structure

```css
/* 1. Design tokens (:root block) */
/* 2. Component styles — reference only var(--fp-*) */
/* 3. @media (prefers-reduced-motion: reduce) — set all --fp-duration-* to 0ms */
/* 4. @media (prefers-color-scheme: light) — override surface/text tokens */
```

### Dark/Light Mode Tokens That Change

| Token | Dark | Light |
|---|---|---|
| `--fp-bg` | `#0F0F23` | `#F8FAFC` |
| `--fp-surface` | `#1B1B30` | `#E2E8F0` |
| `--fp-text` | `#F8FAFC` | `#0F172A` |
| `--fp-text-muted` | `#94A3B8` | `#64748B` |
| `--fp-border` | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.10)` |

Accent (`--fp-accent` amber) stays the same in both modes.

### Color Override

PHP emits `style="--fp-accent:#hex"` on the container when `color=` is set. All `var(--fp-accent)` references inside that element auto-inherit. No JS needed.

---

## 7. Theme Integration Bridge

### How `openArtistModal()` Should Change

**Remove (lines 1616–1626 in page-musica.php):**
```js
setTimeout(function() {
    if (window.FradoPlayer) {
        fpEl._fradoPlayer = new window.FradoPlayer(fpEl);
        setTimeout(function() {
            if (fpEl._fradoPlayer && fpEl._fradoPlayer.core) {
                fpEl._fradoPlayer.core.play();
            }
        }, 150);
    }
}, 60);
```

Also remove the manual `<li>` playlist building loop (~10 lines).

**Replace with:**
```js
modal.classList.add('active');           // show modal first
document.body.style.overflow = 'hidden';
if (window.FradoPlayer && FradoPlayer.fromCard) {
    fpEl._fradoPlayer = FradoPlayer.fromCard(card, fpEl);
} else if (window.FradoPlayer) {
    // Graceful degradation for v2 plugin
    fpEl._fradoPlayer = new FradoPlayer(fpEl);
}
history.pushState({ fpModal: true }, '');
window._fpModalStatePushed = true;
```

**Why no more setTimeout:** The 60 ms was to wait for `display:none` → `display:block` to propagate so canvas measured correctly. v3 fix: call `fromCard()` after `modal.classList.add('active')`, so the spectrum canvas has dimensions when initialized. The 150 ms was for AudioContext unlock — the card click IS the user gesture, so `play()` is safe immediately.

### `destroy()` Contract

After `destroy()`:
1. Media element paused and removed from DOM
2. AudioContext closed
3. All event listeners removed (including `_FPBottomSheet`'s `window` resize listener — bug fix)
4. All RAF loops cancelled
5. All property references nulled

Theme usage unchanged:
```js
try { fpEl._fradoPlayer.destroy(); } catch(e) {}
fpEl._fradoPlayer = null;
```

---

## 8. Migration Path (v2 → v3)

### Backward Compatible (no theme change required)

- `new FradoPlayer(el)` constructor signature unchanged
- `.destroy()` method preserved
- `.core.play()` still works
- All `data-*` attribute names unchanged
- All CSS class names unchanged
- Custom events `fp:play`, `fp:pause`, `fp:ended`, `fp:trackloaded` still fire on container

### Breaking Changes

| # | Change | Impact |
|---|---|---|
| 1 | `_FPKeyboard` bound to container — `.frado-player` needs `tabindex="0"` (PHP change) | Low |
| 2 | `aria-busy`, `data-fp-state` written by JS — don't hard-code in PHP or theme CSS | Low |
| 3 | `tracks=` format: 7 fields — old 5-field data still works | Zero |
| 4 | CSS token names changed (see design-tokens.css) | Low — only custom overrides |
| 5 | `touch-action:manipulation` removed from inline style, moved to CSS | Zero |

### Theme Migration Checklist

- [ ] Remove 60 ms + 150 ms `setTimeout` block in `openArtistModal()`
- [ ] Replace FradoPlayer init + play with `FradoPlayer.fromCard(card, fpEl)`
- [ ] Remove manual playlist `<li>` building in `openArtistModal()`
- [ ] Verify `closeArtistModal()` still calls `destroy()` then `null` (unchanged)
- [ ] Add `.catch()` to `fvideoToggle()` (Bug 2 — theme fix)
- [ ] Fix `fvideoPrev`/`fvideoNext` `AbortError` (Bug 3 — theme fix)
- [ ] Add `fvideoInited` guard (Bug 1 — theme fix)
- [ ] Update CSS custom property names if any theme CSS overrides renamed `--fp-*` tokens

---

## 9. File Structure

```
frado-player/
├── frado-player.php           ← shortcode, asset registration, PHP fixes
├── assets/
│   ├── frado-player.js        ← all classes (IIFE, ES5-compatible)
│   └── frado-player.css       ← component styles + design tokens
└── docs/
    ├── audit-php.md
    ├── audit-js.md
    ├── audit-audio-modal.md
    ├── audit-video-player.md
    ├── aria-spec.md
    ├── keyboard-shortcuts.md
    ├── design-tokens.css
    ├── browser-compat.md
    ├── integration-guide.md
    └── architecture-v3.md     ← this document
```

### JS Internal Module Order (all in one IIFE)

```
1.  detectType(), addSources()     — utility functions
2.  _FPCore                        — media element, state events
3.  _FPState                       — NEW: formal state machine
4.  _FPSpectrum                    — canvas visualizer
5.  _FPVolume                      — volume + persistence
6.  _FPPlaylist                    — track list, navigation
7.  _FPAccessibility               — NEW: ARIA live regions, focus mgmt
8.  _FPMediaSession                — Media Session API
9.  _FPKeyboard                    — v3 rewrite: container-scoped
10. _FPBottomSheet                 — mobile bottom sheet
11. FradoPlayer                    — public facade + fromCard() static
12. bootFradoPlayers()             — auto-init .frado-player elements
13. window.FradoPlayer = ...       — export
```

---

## 10. Implementation Order (Priority)

### Phase 1 — Critical Bugs + PHP Fixes (No New Features)

Target: zero regressions, fully backward compatible. → **v3.0.0**

1. PHP: Fix double-escaping (`esc_attr` on `esc_html`'d value)
2. PHP: Add `esc_attr()` to all data-URL attributes
3. PHP: Move `touch-action:manipulation` to CSS
4. PHP: Optimize asset enqueue (once per page)
5. PHP: Add AAC field (index 4) to `tracks=` parser
6. JS: Fix `_FPKeyboard` — bind to container not document
7. JS: Fix `_resizeCanvas()` — use `ctx.setTransform()` not cumulative `ctx.scale()`
8. JS: Fix seekbar `pointercancel` — reset `seeking` flag
9. JS: Fix `_FPBottomSheet` memory leak — include in `destroy()`
10. JS: Add `aria-valuetext` to seekbar and volume slider
11. JS: Fix mute button `aria-label` → `"Silenciar"` / `"Ativar som"`
12. JS: Add `aria-pressed` to play button

### Phase 2 — State Machine + Keyboard + ARIA → **v3.1.0**

1. JS: Add `_FPState` class
2. JS: Add `_FPAccessibility` class
3. JS: Rewrite `_FPKeyboard` (full key map)
4. PHP: Add `tabindex="0"`, `role="region"`, `aria-label` to container
5. PHP: Add `tabindex="0"` to volume slider
6. PHP: Add `aria-current`, `aria-posinset`, `aria-setsize` to playlist `<li>` items

### Phase 3 — `fromCard()` Factory + Theme Migration → **v3.2.0**

1. JS: Add `FradoPlayer.fromCard()` static method
2. Theme: Replace setTimeout block with `fromCard()`
3. Theme: Remove manual playlist DOM building
4. Theme: Fix `fvideoToggle()` Promise, `fvideoPrev/Next` AbortError, add `fvideoInited` guard

### Phase 4 — Design Tokens + Color Override → **v3.3.0**

1. CSS: Migrate all hardcoded values to `var(--fp-*)` tokens
2. PHP: Add `autoplay`, `loop`, `color` shortcode attributes
3. CSS: Add `@media (prefers-color-scheme: light)` block
4. CSS: Add `@media (prefers-reduced-motion: reduce)` block
5. JS: `bootFradoPlayers()` reads `data-autoplay` and calls `play()` on `canplaythrough`
6. JS: `_FPCore._buildMedia()` reads `data-loop` and sets `mediaEl.loop`
