# Frado Player v3 — ARIA Specification

**Version:** 3.0.0-draft
**Date:** 2026-04-02
**Author:** fradomnt
**Status:** Implementation target (updated with v3 phase mapping)

---

## v3 ARIA Summary

The five highest-priority ARIA fixes in the v3 implementation plan, ranked by user impact:

| # | Fix | Phase | Impact |
|---|---|---|---|
| 1 | Add `aria-pressed` to play/pause button — screen readers cannot report playback state without it | Phase 1 | **Critical** — core player function is invisible to AT users |
| 2 | Fix mute button `aria-label="Volume"` to action-based labels (`"Silenciar"` / `"Ativar som"`) + add `aria-pressed` | Phase 1 | **High** — current label is ambiguous and wrong |
| 3 | Add `aria-valuetext` to seekbar and volume slider — raw integers are meaningless without time/percent context | Phase 1 | **High** — NVDA/JAWS read "42" instead of "0:42 de 3:28" |
| 4 | Add `_FPAccessibility` class with live region, `aria-busy`, `aria-current` management | Phase 2 | **High** — track changes and loading states are silent to AT |
| 5 | Add `role="region"` + `aria-label` on container, `aria-current`/`aria-posinset`/`aria-setsize` on playlist items | Phase 2 | **Medium** — player is an anonymous div; playlist has no semantic structure |

---

## New in v3

### `_FPAccessibility` class `[Phase 2]`

New dedicated class (~100 lines) that centralizes all ARIA management in a single module. Responsibilities:

- **Live region management** — Creates and owns the hidden `aria-live="polite"` region (one per player instance). Provides `announce(text)` method.
- **`aria-pressed` on play button** — Listens to `fp:play` / `fp:pause` events and toggles `aria-label` + `aria-pressed` atomically.
- **`aria-pressed` on mute button** — Toggles `aria-label` (`"Silenciar"` / `"Ativar som"`) and `aria-pressed` on mute state change.
- **`aria-current` on playlist items** — Listens to `fp:trackloaded` and moves `aria-current="true"` to the active `<li>`, removing it from all others.
- **`aria-disabled` on prev/next** — Sets `aria-disabled="true"` on edge tracks (first/last with no loop, or single-track playlists).
- **Announcements** — `fp:play` announces track title + "em reproducao"; `fp:pause` announces "pausado"; `fp:trackloaded` updates container `aria-label`.
- **`destroy()`** — Nulls all references and removes the live region from DOM.

### `_FPState` class `[Phase 2]`

Formal state machine (`idle | loading | playing | paused | error`) that replaces the ad-hoc `isPlaying` boolean. ARIA-relevant behavior:

- Sets `aria-busy="true"` on the container during the `loading` state.
- Sets `aria-busy="false"` on transition out of `loading`.
- Writes `container.dataset.fpState` on every transition (CSS can target `[data-fp-state="loading"]`).
- Fires `fp:statechange` custom event with `{ from, to }` detail — consumed by `_FPAccessibility`.

### Container `role="region"` + `aria-label` (from PHP) `[Phase 2]`

PHP shortcode output updated to emit:

```html
<div class="frado-player"
     id="frado-player-{N}"
     role="region"
     aria-label="Frado Player — {title}"
     aria-busy="false"
     data-fp-state="idle"
     tabindex="0"
     ...>
```

This makes the player a landmark that screen reader users can navigate to directly (NVDA: `D`, JAWS: `R`, VoiceOver: `VO+U`).

### Playlist item `aria-current`, `aria-posinset`, `aria-setsize` (from PHP + JS) `[Phase 2]`

PHP emits the initial ARIA attributes on each `<li>`:

```html
<li role="button" tabindex="0"
    aria-current="true"
    aria-label="Faixa 1: Nome da Faixa, duracao 3:28"
    aria-posinset="1" aria-setsize="4" ...>
```

JS (`_FPPlaylist` + `_FPAccessibility`) keeps `aria-current` in sync when the active track changes.

---

## Overview

This document defines every ARIA attribute, role, live-region, and focus-management rule required to make Frado Player v3 fully accessible to screen reader users and keyboard-only users. It covers the gap between the current v2 implementation (as shipped in `frado-player.php`) and the v3 target.

Each section describes:
- The **current state** of the element in v2 PHP output.
- The **target state** for v3.
- The **rationale** for each change.
- The **v3 implementation status** — which phase addresses each requirement.

---

## 1. Player Container

### v3 Implementation Status

| Requirement | Status |
|---|---|
| `role="region"` on container | `[Phase 2]` — PHP change (arch-v3 Section 10, Phase 2 item 4) |
| `aria-label="Frado Player — {title}"` | `[Phase 2]` — PHP emits initial; JS updates on track change via `_FPAccessibility` |
| `aria-busy="false"` initial attribute | `[Phase 2]` — PHP emits initial; `_FPState` manages transitions |
| Hidden `aria-live="polite"` region | `[Phase 2]` — Created by `_FPAccessibility` class in JS |
| `tabindex="0"` on container | `[Phase 2]` — PHP change (required for `_FPKeyboard` container binding) |

### Current state (v2)

```html
<div class="frado-player" id="frado-player-1"
     data-type="audio"
     data-title="Album Title"
     data-artist="Artist Name"
     ...>
```

No landmark role, no accessible name, no live region.

### Target state (v3)

```html
<div class="frado-player"
     id="frado-player-1"
     role="region"
     aria-label="Frado Player — Album Title"
     aria-busy="false"
     data-type="audio"
     ...>

  <!-- Hidden live region — one per player instance -->
  <div class="frado-player__live"
       aria-live="polite"
       aria-atomic="true"
       style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">
  </div>
```

### Rationale

**`role="region"`** — A landmark role that lets screen reader users navigate directly to the player via the landmark shortcut (NVDA: `D`, JAWS: `R`, VoiceOver: `VO+U`). Without it, the player is an anonymous `<div>` that users must stumble across.

**`aria-label="Frado Player — [title]"`** — `role="region"` requires an accessible name; unnamed regions are ignored by some screen readers. The title embedded in the label lets users identify which album they are looking at when a page has multiple player instances.

**`aria-live="polite"` region** — The hidden live region is the single announcement channel for the entire player. It uses `aria-atomic="true"` so the full sentence is re-read when updated, not just the changed words. `polite` means the screen reader finishes what it is currently reading before announcing the update — appropriate for non-critical track-change notifications. The element is visually hidden but available in the accessibility tree (the `clip` technique is preferred over `display:none`, which removes the element from the tree).

**`aria-busy="false"` on container** — Flipped to `"true"` while buffering (see Section 6). Setting it on the container rather than a child means assistive technologies understand that the entire widget is in a loading state.

---

## 2. Seekbar (Progress)

### v3 Implementation Status

| Requirement | Status |
|---|---|
| `role="slider"` | `[v2 ✓]` — Already correct in v2 |
| `aria-label="Progresso"` | `[v2 ✓]` — Present in v2 (updated to "Progresso da faixa" in Phase 1) |
| `aria-valuemin`, `aria-valuemax`, `aria-valuenow` | `[v2 ✓]` — Already correct in v2 |
| `aria-valuetext` (time format) | `[Phase 1]` — JS addition (arch-v3 Section 10, Phase 1 item 10) |
| `tabindex="0"` | `[Phase 2]` — PHP change (arch-v3 Section 10, Phase 2 item 5 — volume; seekbar follows same pattern) |
| Keyboard handlers (arrow keys, Home, End) | `[Phase 2]` — `_FPKeyboard` rewrite |
| `aria-label` update to "Progresso da faixa" | `[Phase 1]` — PHP change |

### Current state (v2)

```html
<div class="frado-player__progress"
     role="slider"
     aria-label="Progresso"
     aria-valuemin="0"
     aria-valuemax="100"
     aria-valuenow="0"
     style="touch-action:manipulation">
```

Missing: `aria-valuetext`, `tabindex`, keyboard event handlers.

### Target state (v3)

```html
<div class="frado-player__progress"
     role="slider"
     aria-label="Progresso da faixa"
     aria-valuemin="0"
     aria-valuemax="100"
     aria-valuenow="42"
     aria-valuetext="0:42 de 3:28"
     tabindex="0"
     style="touch-action:manipulation">
  <div class="frado-player__progress-fill"></div>
</div>
```

### Attribute breakdown

| Attribute | Value | Why |
|---|---|---|
| `role="slider"` | — | Correct; exposes the expected keyboard contract (arrow keys change value). |
| `aria-label` | `"Progresso da faixa"` | More descriptive than `"Progresso"` — clarifies it is the track progress, not the volume. |
| `aria-valuemin` | `"0"` | Required by `role="slider"`. |
| `aria-valuemax` | `"100"` | Required; represents 100 % of the track. |
| `aria-valuenow` | numeric `%` | Required; updated by JS every second while playing. |
| `aria-valuetext` | `"0:42 de 3:28"` | **Missing in v2.** `[Phase 1]` fix. Without this, JAWS and NVDA read `"42"` — meaningless to the user. With it they read `"0 minutos e 42 segundos de 3 minutos e 28 segundos"`. |
| `tabindex="0"` | — | **Missing in v2.** `[Phase 2]` fix. Makes the slider reachable via Tab. |

### Required keyboard handlers (JS)

```js
seekbar.addEventListener('keydown', (e) => {
  const step = 1;          // 1 % per arrow key
  const bigStep = 10;      // 10 % per Page Up/Down
  let now = parseInt(seekbar.getAttribute('aria-valuenow'), 10);

  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowUp':
      now = Math.min(100, now + step); break;
    case 'ArrowLeft':
    case 'ArrowDown':
      now = Math.max(0, now - step); break;
    case 'PageUp':
      now = Math.min(100, now + bigStep); break;
    case 'PageDown':
      now = Math.max(0, now - bigStep); break;
    case 'Home':
      now = 0; break;
    case 'End':
      now = 100; break;
    default: return;
  }

  e.preventDefault();
  seekbar.setAttribute('aria-valuenow', now);
  seekbar.setAttribute('aria-valuetext', formatSeekText(now, totalSeconds));
  audio.currentTime = (now / 100) * audio.duration;
});

function formatSeekText(pct, totalSec) {
  const elapsed = Math.round((pct / 100) * totalSec);
  return `${fmtTime(elapsed)} de ${fmtTime(totalSec)}`;
}
```

---

## 3. Transport Buttons

### 3.1 Prev button

#### v3 Implementation Status

| Requirement | Status |
|---|---|
| `aria-label="Faixa anterior"` | `[v2 ✓]` — Already correct |
| `aria-disabled` on edge tracks | `[Phase 2]` — Managed by `_FPAccessibility` |

| | v2 | v3 |
|---|---|---|
| `aria-label` | `"Faixa anterior"` | `"Faixa anterior"` (no change) |
| `aria-pressed` | absent | not needed — action button, not toggle |
| `aria-disabled` | absent | `"true"` when playlist has only 1 track or when on first track and no loop |
| `disabled` (native) | absent | do **not** use `disabled` — it removes focus; use `aria-disabled="true"` + block action in JS |

```html
<!-- Single-track playlist -->
<button class="frado-player__btn frado-player__btn--prev"
        aria-label="Faixa anterior"
        aria-disabled="true">
```

### 3.2 Play / Pause button

#### v3 Implementation Status

| Requirement | Status |
|---|---|
| `aria-label` toggle (`"Reproduzir"` / `"Pausar"`) | `[Phase 1]` — JS update (arch-v3 Section 10, Phase 1 item 12) |
| `aria-pressed` toggle | `[Phase 1]` — JS addition (arch-v3 Section 10, Phase 1 item 12) |

This is a **toggle button** — its label and pressed state must change with playback state.

| State | `aria-label` | `aria-pressed` |
|---|---|---|
| Stopped / paused | `"Reproduzir"` | `"false"` |
| Playing | `"Pausar"` | `"true"` |

```html
<!-- Paused state -->
<button class="frado-player__btn frado-player__btn--play"
        aria-label="Reproduzir"
        aria-pressed="false">

<!-- Playing state (JS updates both attributes atomically) -->
<button class="frado-player__btn frado-player__btn--play"
        aria-label="Pausar"
        aria-pressed="true">
```

Current v2 has `aria-label="Reproduzir"` and no `aria-pressed`. Screen readers cannot tell users whether the player is currently playing without `aria-pressed`.

### 3.3 Next button

#### v3 Implementation Status

| Requirement | Status |
|---|---|
| `aria-label="Proxima faixa"` | `[v2 ✓]` — Already correct |
| `aria-disabled` on edge tracks | `[Phase 2]` — Managed by `_FPAccessibility` |

| | v2 | v3 |
|---|---|---|
| `aria-label` | `"Proxima faixa"` | `"Proxima faixa"` (no change) |
| `aria-pressed` | absent | not needed |
| `aria-disabled` | absent | `"true"` on last track with no loop / single-track playlist |

### 3.4 Mute button

#### v3 Implementation Status

| Requirement | Status |
|---|---|
| `aria-label` fix (action-based labels) | `[Phase 1]` — JS fix (arch-v3 Section 10, Phase 1 item 11) |
| `aria-pressed` toggle | `[Phase 2]` — Managed by `_FPAccessibility` |

This is a **toggle button**.

| State | `aria-label` | `aria-pressed` |
|---|---|---|
| Audible | `"Silenciar"` | `"false"` |
| Muted | `"Ativar som"` | `"true"` |

Current v2 has `aria-label="Volume"` — ambiguous and wrong. It describes neither the current state nor the action. The label must describe the action that will be performed on press.

```html
<!-- Audible — clicking will mute -->
<button class="frado-player__btn frado-player__btn--mute"
        aria-label="Silenciar"
        aria-pressed="false">

<!-- Muted — clicking will restore sound -->
<button class="frado-player__btn frado-player__btn--mute"
        aria-label="Ativar som"
        aria-pressed="true">
```

### 3.5 Fullscreen button (video mode only)

#### v3 Implementation Status

| Requirement | Status |
|---|---|
| `aria-label` toggle | `[Phase 2]` — New button, not in v2 |
| `aria-pressed` toggle | `[Phase 2]` — New button, not in v2 |

| State | `aria-label` | `aria-pressed` |
|---|---|---|
| Windowed | `"Tela cheia"` | `"false"` |
| Fullscreen | `"Sair da tela cheia"` | `"true"` |

```html
<button class="frado-player__btn frado-player__btn--fullscreen"
        aria-label="Tela cheia"
        aria-pressed="false">
  <svg aria-hidden="true">...</svg>
</button>
```

Note: this button is absent in the current v2 PHP but is in scope for v3 video mode.

---

## 4. Volume Slider

### v3 Implementation Status

| Requirement | Status |
|---|---|
| `role="slider"` | `[v2 ✓]` — Already correct |
| `aria-label="Volume"` | `[v2 ✓]` — Already correct |
| `aria-valuemin`, `aria-valuemax`, `aria-valuenow` | `[v2 ✓]` — Already correct |
| `aria-valuetext` (percent format) | `[Phase 1]` — JS addition (arch-v3 Section 10, Phase 1 item 10; `_FPVolume` sets `aria-valuetext` on every `setVolume()` call) |
| `tabindex="0"` | `[Phase 2]` — PHP change (arch-v3 Section 10, Phase 2 item 5) |
| Keyboard handlers (arrow keys, Home, End) | `[Phase 2]` — `_FPKeyboard` rewrite |

### Current state (v2)

```html
<div class="frado-player__volume-track"
     role="slider"
     aria-label="Volume"
     aria-valuemin="0"
     aria-valuemax="100"
     aria-valuenow="70"
     style="touch-action:manipulation">
```

Missing: `aria-valuetext`, `tabindex`.

### Target state (v3)

```html
<div class="frado-player__volume-track"
     role="slider"
     aria-label="Volume"
     aria-valuemin="0"
     aria-valuemax="100"
     aria-valuenow="70"
     aria-valuetext="70%"
     tabindex="0"
     style="touch-action:manipulation">
  <div class="frado-player__volume-fill" style="width:70%"></div>
  <div class="frado-player__volume-thumb"></div>
</div>
```

**`aria-valuetext="70%"`** — NVDA and JAWS will read "70 percent" instead of "70", which is meaningful in a volume context.

**`tabindex="0"`** — Makes the slider reachable. Currently unreachable by keyboard.

### Required keyboard handlers (JS)

```js
volSlider.addEventListener('keydown', (e) => {
  let now = parseInt(volSlider.getAttribute('aria-valuenow'), 10);
  const step = 5;

  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowUp':
      now = Math.min(100, now + step); break;
    case 'ArrowLeft':
    case 'ArrowDown':
      now = Math.max(0, now - step); break;
    case 'Home': now = 0; break;
    case 'End':  now = 100; break;
    default: return;
  }

  e.preventDefault();
  volSlider.setAttribute('aria-valuenow', now);
  volSlider.setAttribute('aria-valuetext', `${now}%`);
  audio.volume = now / 100;
});
```

---

## 5. Playlist

### v3 Implementation Status

| Requirement | Status |
|---|---|
| `<ol>` `aria-label="Lista de faixas — {album}"` | `[Phase 2]` — PHP change; JS updates via `_FPPlaylist` on album change |
| `<li>` `role="button"` | `[Phase 2]` — PHP change |
| `<li>` `tabindex="0"` | `[Phase 2]` — PHP change |
| `<li>` `aria-current="true"` on active track | `[Phase 2]` — PHP emits initial; `_FPPlaylist._applyActiveClass()` + `_FPAccessibility` manage in JS (arch-v3 Section 10, Phase 2 item 6) |
| `<li>` `aria-label` (combined track info) | `[Phase 2]` — PHP change |
| `<li>` `aria-posinset` / `aria-setsize` | `[Phase 2]` — PHP change (arch-v3 Section 10, Phase 2 item 6) |
| Child spans `aria-hidden="true"` | `[Phase 2]` — PHP change |

### Current state (v2)

```html
<ol class="frado-player__playlist">
  <li class="frado-player__track frado-player__track--active"
      data-title="Track Name"
      data-src="..."
      data-duration="3:28">
    <span class="frado-player__track-num">1</span>
    <span class="frado-player__track-name">Track Name</span>
    <span class="frado-player__track-duration">3:28</span>
  </li>
</ol>
```

Problems:
- `<li>` has no role — not focusable, not announced as interactive.
- No accessible name that combines track number, title, and duration.
- No `aria-current` to indicate the playing track.
- No `tabindex` — unreachable by keyboard.
- `<ol>` has no accessible name linking it to the album.

### Target state (v3)

```html
<ol class="frado-player__playlist"
    aria-label="Lista de faixas — Album Title">

  <!-- Active track -->
  <li class="frado-player__track frado-player__track--active"
      role="button"
      tabindex="0"
      aria-current="true"
      aria-label="Faixa 1: Nome da Faixa, duracao 3:28"
      aria-posinset="1"
      aria-setsize="4"
      data-title="Nome da Faixa"
      data-src="..."
      data-duration="3:28">
    <span class="frado-player__track-num" aria-hidden="true">1</span>
    <span class="frado-player__track-name" aria-hidden="true">Nome da Faixa</span>
    <span class="frado-player__track-duration" aria-hidden="true">3:28</span>
  </li>

  <!-- Inactive track -->
  <li class="frado-player__track"
      role="button"
      tabindex="0"
      aria-label="Faixa 2: Outra Faixa, duracao 4:05"
      aria-posinset="2"
      aria-setsize="4"
      data-title="Outra Faixa"
      data-src="..."
      data-duration="4:05">
    <span class="frado-player__track-num" aria-hidden="true">2</span>
    <span class="frado-player__track-name" aria-hidden="true">Outra Faixa</span>
    <span class="frado-player__track-duration" aria-hidden="true">4:05</span>
  </li>

</ol>
```

### Attribute breakdown

| Attribute | Notes |
|---|---|
| `role="button"` on `<li>` | Makes each row an interactive element. Alternatively the inner text spans could be replaced with a true `<button>`, which is preferred when possible. |
| `tabindex="0"` | Brings each item into the natural tab order. |
| `aria-current="true"` | Applied only to the currently playing track; removed from all others when the track changes. Per ARIA 1.2, `aria-current` on a `role="button"` is valid and announces "current". |
| `aria-label` | Combines all text into one readable sentence, avoiding the screen reader stitching together three separate spans in an order that may not be natural. The visible child spans receive `aria-hidden="true"` to prevent double-reading. |
| `aria-posinset` / `aria-setsize` | Tells the screen reader "item 2 of 4" — important when the list is dynamically filtered or paginated. |
| `aria-label` on `<ol>` | Names the playlist region. Without it, NVDA reads "list, 4 items" with no context. |

### PHP output for v3

The `$tracks_html` loop in PHP should produce:

```php
$tracks_html .= sprintf(
    '<li class="frado-player__track%1$s"'
    . ' role="button"'
    . ' tabindex="0"'
    . '%8$s'                          // aria-current="true" if first
    . ' aria-label="Faixa %7$d: %2$s, duracao %6$s"'
    . ' aria-posinset="%7$d"'
    . ' aria-setsize="%9$d"'
    . ' data-title="%2$s"'
    . ' data-src="%3$s"'
    . ' data-src-flac="%4$s"'
    . ' data-src-opus="%5$s"'
    . ' data-duration="%6$s">'
    . '<span class="frado-player__track-num" aria-hidden="true">%7$d</span>'
    . '<span class="frado-player__track-name" aria-hidden="true">%2$s</span>'
    . '<span class="frado-player__track-duration" aria-hidden="true">%6$s</span>'
    . '</li>' . "\n",
    esc_attr( $active_class ),            // %1$s
    $track_title,                         // %2$s
    $track_mp3,                           // %3$s
    $track_flac,                          // %4$s
    $track_opus,                          // %5$s
    $track_dur,                           // %6$s
    $track_num,                           // %7$d
    $idx === 0 ? ' aria-current="true"' : '',  // %8$s
    count( $tracks )                      // %9$d
);
```

---

## 6. Loading State

### v3 Implementation Status

| Requirement | Status |
|---|---|
| `aria-busy="true"` on container during buffering | `[Phase 2]` — Managed by `_FPState` class (arch-v3 Section 10, Phase 2 item 1) |
| Live region "Carregando faixa..." announcement | `[Phase 2]` — Managed by `_FPAccessibility` class |
| Spinner `aria-hidden="true"` | `[Phase 2]` — PHP/CSS change |

When the player is buffering (HTML `<audio>` or `<video>` fires `waiting`), the container and a visible indicator must communicate the state to assistive technologies.

### Markup

```html
<!-- On the container — set aria-busy while buffering -->
<div class="frado-player" role="region" aria-label="..." aria-busy="true">

  <!-- Visible spinner: aria-hidden so screen readers use aria-busy on container -->
  <div class="frado-player__spinner" aria-hidden="true"></div>

</div>
```

### JS

```js
audio.addEventListener('waiting', () => {
  container.setAttribute('aria-busy', 'true');
  liveRegion.textContent = 'Carregando faixa...';
});

audio.addEventListener('canplay', () => {
  container.setAttribute('aria-busy', 'false');
  liveRegion.textContent = '';
});
```

**Why `aria-busy` on the container, not a child `role="alert"`?**
Buffering is an expected, transient state — not an error. `aria-busy` politely communicates "wait" without interrupting the user the way `role="alert"` or `aria-live="assertive"` would.

---

## 7. Error State

### v3 Implementation Status

| Requirement | Status |
|---|---|
| `role="alert"` error div injected on error | `[Phase 2]` — Managed by `_FPAccessibility` + `_FPState` (`error` state transition) |
| `aria-busy="false"` cleared on error | `[Phase 2]` — Managed by `_FPState` |
| Retry button accessible | `[Phase 2]` — Standard `<button>` with text label |

When playback fails (`error` event on `<audio>/<video>`), an assertive alert must be presented so users are immediately informed regardless of what the screen reader is currently doing.

### Markup

```html
<!-- Injected into DOM on error; removed on recovery -->
<div class="frado-player__error"
     role="alert"
     aria-live="assertive"
     aria-atomic="true">
  Nao foi possivel reproduzir a faixa.
  <button class="frado-player__btn frado-player__btn--retry"
          type="button">
    Tentar novamente
  </button>
</div>
```

### JS

```js
audio.addEventListener('error', () => {
  container.setAttribute('aria-busy', 'false');

  const errorEl = document.createElement('div');
  errorEl.className  = 'frado-player__error';
  errorEl.setAttribute('role', 'alert');
  errorEl.setAttribute('aria-live', 'assertive');
  errorEl.setAttribute('aria-atomic', 'true');
  errorEl.innerHTML = `
    Nao foi possivel reproduzir a faixa.
    <button class="frado-player__btn frado-player__btn--retry" type="button">
      Tentar novamente
    </button>
  `;

  container.appendChild(errorEl);

  errorEl.querySelector('.frado-player__btn--retry')
         .addEventListener('click', () => {
           errorEl.remove();
           retryPlayback();
         });
});
```

**Why `role="alert"` + `aria-live="assertive"`?**
An error blocks the core function of the player. The user must know about it immediately. `assertive` interrupts whatever the screen reader is reading. `aria-atomic="true"` ensures the full message is read, not just the changed portion.

**Important:** `role="alert"` already implies `aria-live="assertive"` — both are specified here for clarity during development. In production, `role="alert"` alone is sufficient.

---

## 8. Media Session API

### v3 Implementation Status

| Requirement | Status |
|---|---|
| `MediaMetadata` sync with ARIA labels | `[v2 ✓]` — `_FPMediaSession` already exists (unchanged in v3) |
| Action handlers (play, pause, prev, next, seekto) | `[v2 ✓]` — Already implemented |

The Media Session API (`navigator.mediaSession`) lets the operating system, lock screen, and hardware media keys integrate with the player. The same metadata used in `aria-label` attributes should feed into `mediaSession`.

```js
function updateMediaSession(track) {
  if (!('mediaSession' in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title:  track.title,                     // same as aria-label on container
    artist: track.artist || playerArtist,    // same as data-artist attribute
    album:  playerAlbum,                     // same as aria-label on <ol>
    artwork: [
      { src: track.thumb || playerThumb, sizes: '512x512', type: 'image/jpeg' }
    ]
  });

  navigator.mediaSession.setActionHandler('play',         () => play());
  navigator.mediaSession.setActionHandler('pause',        () => pause());
  navigator.mediaSession.setActionHandler('previoustrack',() => prevTrack());
  navigator.mediaSession.setActionHandler('nexttrack',    () => nextTrack());
  navigator.mediaSession.setActionHandler('seekto',       (d) => seekTo(d.seekTime));
}
```

### Relationship to ARIA labels

| ARIA attribute | Media Session field |
|---|---|
| Container `aria-label` title portion | `MediaMetadata.title` |
| `data-artist` on container | `MediaMetadata.artist` |
| `<ol aria-label>` album portion | `MediaMetadata.album` |
| `data-thumb` on container | `MediaMetadata.artwork[].src` |

Keeping these in sync ensures that both screen-reader users inside the browser and OS-level media consumers (Bluetooth controls, lock screen, notification shade) see the same information.

---

## 9. Dynamic ARIA Updates via JS

### v3 Implementation Status

| State Change | Responsible v3 Class | Phase |
|---|---|---|
| Play/Pause `aria-label` + `aria-pressed` on play button | `_FPAccessibility` | `[Phase 1]` (aria-pressed), `[Phase 2]` (centralized in class) |
| Mute `aria-label` + `aria-pressed` on mute button | `_FPAccessibility` | `[Phase 1]` (label fix), `[Phase 2]` (aria-pressed via class) |
| Track change `aria-current` on playlist `<li>` | `_FPPlaylist._applyActiveClass()` + `_FPAccessibility` | `[Phase 2]` |
| Track change live region announcement | `_FPAccessibility.announce()` | `[Phase 2]` |
| Seekbar `aria-valuenow` + `aria-valuetext` | `_FPCore` (seekbar pointer events) | `[Phase 1]` (valuetext), `[v2 ✓]` (valuenow) |
| Volume `aria-valuenow` + `aria-valuetext` | `_FPVolume.setVolume()` | `[Phase 1]` (valuetext), `[v2 ✓]` (valuenow) |
| Buffering `aria-busy` | `_FPState` | `[Phase 2]` |
| Error `role="alert"` injection | `_FPAccessibility` | `[Phase 2]` |
| Prev/Next `aria-disabled` | `_FPAccessibility` | `[Phase 2]` |
| Fullscreen `aria-label` + `aria-pressed` | `_FPAccessibility` | `[Phase 2]` |
| Container `aria-label` update on track change | `_FPAccessibility` | `[Phase 2]` |

Every player state change requires one or more ARIA attribute mutations. This table is the authoritative contract for the JS layer.

| State Change | Element | Attribute | New Value | Notes |
|---|---|---|---|---|
| Play starts | play button | `aria-label` | `"Pausar"` | |
| Play starts | play button | `aria-pressed` | `"true"` | |
| Play starts | container | `aria-busy` | `"false"` | clear if was buffering |
| Paused | play button | `aria-label` | `"Reproduzir"` | |
| Paused | play button | `aria-pressed` | `"false"` | |
| Track changes | container | `aria-label` | `"Frado Player — [new title]"` | |
| Track changes | seekbar | `aria-valuenow` | `"0"` | reset to 0 |
| Track changes | seekbar | `aria-valuetext` | `"0:00 de [new duration]"` | |
| Track changes | live region | `textContent` | `"Reproduzindo: [title] — [artist]"` | polite announcement |
| Track changes | prev `<li>` | `aria-current` | remove attribute | |
| Track changes | new active `<li>` | `aria-current` | `"true"` | |
| Seeking (continuous) | seekbar | `aria-valuenow` | current `%` (integer) | throttle to 250 ms |
| Seeking (continuous) | seekbar | `aria-valuetext` | `"[elapsed] de [total]"` | |
| Volume changes | vol slider | `aria-valuenow` | current `%` (integer) | |
| Volume changes | vol slider | `aria-valuetext` | `"[n]%"` | |
| Mute on | mute button | `aria-label` | `"Ativar som"` | |
| Mute on | mute button | `aria-pressed` | `"true"` | |
| Mute off | mute button | `aria-label` | `"Silenciar"` | |
| Mute off | mute button | `aria-pressed` | `"false"` | |
| Buffering starts | container | `aria-busy` | `"true"` | |
| Buffering ends | container | `aria-busy` | `"false"` | |
| Error | error div | inject DOM | `role="alert"` node | see Section 7 |
| Fullscreen enters | fullscreen btn | `aria-label` | `"Sair da tela cheia"` | |
| Fullscreen enters | fullscreen btn | `aria-pressed` | `"true"` | |
| Fullscreen exits | fullscreen btn | `aria-label` | `"Tela cheia"` | |
| Fullscreen exits | fullscreen btn | `aria-pressed` | `"false"` | |
| Prev disabled | prev button | `aria-disabled` | `"true"` | |
| Prev enabled | prev button | `aria-disabled` | `"false"` or remove | |
| Next disabled | next button | `aria-disabled` | `"true"` | |
| Next enabled | next button | `aria-disabled` | `"false"` or remove | |

### Helper: atomic play/pause toggle

```js
function setPlayState(isPlaying) {
  playBtn.setAttribute('aria-label',   isPlaying ? 'Pausar'      : 'Reproduzir');
  playBtn.setAttribute('aria-pressed', isPlaying ? 'true'        : 'false');
  iconPlay.hidden  = isPlaying;
  iconPause.hidden = !isPlaying;
}
```

---

## 10. Screen Reader Announcement Pattern

### v3 Implementation Status

| Requirement | Status |
|---|---|
| Dedicated polite live region | `[Phase 2]` — Created by `_FPAccessibility` |
| Track change announcement | `[Phase 2]` — `_FPAccessibility.announce()` |
| Buffering announcement | `[Phase 2]` — `_FPAccessibility` listens to `fp:statechange` |
| Error assertive announcement | `[Phase 2]` — `role="alert"` injection |

### The problem

Naively setting `aria-label` on the container when a track changes causes NVDA and JAWS to re-read the full label — including the word "region" — which is verbose and distracting. Changing it on every animation frame during seeking makes the screen reader stutter.

### The solution: dedicated polite live region

```js
// One live region per player instance, created during init.
// Visually hidden, not display:none (would remove from a11y tree).
const liveRegion = container.querySelector('.frado-player__live');

function announceTrackChange(title, artist) {
  // Clear first to force re-announcement if the same track is selected again.
  liveRegion.textContent = '';

  // Use rAF to ensure the DOM flush happens before we write the new value.
  requestAnimationFrame(() => {
    liveRegion.textContent = `Reproduzindo: ${title}${artist ? ' — ' + artist : ''}`;
  });
}
```

### What not to do

```js
// BAD — updates on timeupdate fire ~4 times/sec, overwhelming the screen reader
audio.addEventListener('timeupdate', () => {
  liveRegion.textContent = `${elapsed} de ${total}`;
});

// BAD — aria-live="assertive" for track changes interrupts other content
liveRegion.setAttribute('aria-live', 'assertive');
```

### What to announce vs. what to leave silent

| Event | Announce? | Why |
|---|---|---|
| Track change | Yes — polite | User needs to know what is playing |
| Buffering | Yes — polite, brief | "Carregando faixa..." — informative |
| Error | Yes — assertive | Action required |
| Time update | No | Already visible; continuous updates are disruptive |
| Volume change | No | Slider `aria-valuetext` is sufficient via slider focus |
| Mute toggle | No | Button `aria-pressed` + `aria-label` change is sufficient |

---

## 11. Focus Management

### v3 Implementation Status

| Requirement | Status |
|---|---|
| Tab order follows visual reading order | `[Phase 2]` — `tabindex="0"` additions in PHP |
| Focus trap in video fullscreen | `[Phase 2]` — New fullscreen button and trap logic |
| Return focus after fullscreen close | `[Phase 2]` — `_FPAccessibility` + fullscreen handler |
| Playlist keyboard navigation (Enter/Space) | `[Phase 2]` — `_FPKeyboard` rewrite |
| `_FPKeyboard` scoped to container (not document) | `[Phase 1]` — Bug fix (arch-v3 Section 10, Phase 1 item 6) |

### 11.1 Tab order

The logical tab sequence within the player must follow visual order and the WCAG 2.4.3 Focus Order criterion.

```
[Player container — region landmark]
  -> [Seekbar — slider, tabindex=0]
  -> [Prev button]
  -> [Play/Pause button]
  -> [Next button]
  -> [Mute button]
  -> [Volume slider — tabindex=0]
  -> [Playlist item 1 — role=button, tabindex=0]
  -> [Playlist item 2 — role=button, tabindex=0]
  -> [Playlist item n...]
```

The spectrum canvas has `aria-hidden="true"` and receives no tab stop. The spectrum icon in the header also has `aria-hidden="true"`. The time display (`frado-player__time`) is read-only text — no tab stop, no role.

### 11.2 Focus trap in video fullscreen

When the player enters fullscreen mode, focus must be trapped inside the player to prevent the user from tabbing to invisible background content.

```js
const FOCUSABLE = [
  '.frado-player__btn--play',
  '.frado-player__btn--prev',
  '.frado-player__btn--next',
  '.frado-player__btn--mute',
  '.frado-player__btn--fullscreen',
  '.frado-player__progress[tabindex]',
  '.frado-player__volume-track[tabindex]',
].join(', ');

function trapFocus(e) {
  const focusable = [...container.querySelectorAll(FOCUSABLE)];
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];

  if (e.key === 'Tab') {
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (e.key === 'Escape') {
    exitFullscreen();
  }
}

document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement === container) {
    container.addEventListener('keydown', trapFocus);
    container.querySelector('.frado-player__btn--play').focus();
  } else {
    container.removeEventListener('keydown', trapFocus);
    // Return focus to fullscreen button (see 11.3)
    container.querySelector('.frado-player__btn--fullscreen').focus();
  }
});
```

### 11.3 Return focus after modal / fullscreen close

When fullscreen ends (either via `Escape`, button press, or OS gesture), focus must return to a predictable, meaningful element — the fullscreen button itself. This satisfies WCAG 2.4.3.

```js
function exitFullscreen() {
  document.exitFullscreen().then(() => {
    container.querySelector('.frado-player__btn--fullscreen').focus();
  });
}
```

### 11.4 Playlist keyboard navigation

Each playlist item has `role="button"` and `tabindex="0"`. Standard button keyboard behaviour applies: `Enter` and `Space` trigger the action (load and play track).

```js
playlistItems.forEach(item => {
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      loadAndPlayTrack(item);
    }
  });
});
```

Arrow-key navigation within the playlist (treating it as a `listbox`) is optional for WCAG AA compliance but recommended for UX. If implemented, use `role="listbox"` on `<ol>` and `role="option"` on `<li>`, with `aria-selected` instead of `aria-current`.

---

## 12. WCAG 2.1 AA Compliance Checklist

### Perceivable

- [ ] **1.1.1 Non-text Content (A)** — All icon-only `<button>` elements have descriptive `aria-label`. SVG icons have `aria-hidden="true"`. The spectrum canvas and spectrum icon have `aria-hidden="true"`.
- [ ] **1.3.1 Info and Relationships (A)** — `role="region"` on container; `role="slider"` on seekbar and volume; `role="button"` on playlist items; `<ol>` with `aria-label` conveys list structure.
- [ ] **1.3.3 Sensory Characteristics (A)** — No instruction relies solely on shape, position, or sound. Track state is communicated by `aria-current`, not only by visual highlight.
- [ ] **1.4.1 Use of Color (A)** — Active track is not distinguished by color alone; `aria-current` provides the programmatic signal.
- [ ] **1.4.3 Contrast (AA)** — Not in scope for this ARIA spec; covered in CSS design tokens.

### Operable

- [ ] **2.1.1 Keyboard (A)** — All controls reachable and operable via keyboard: sliders via arrow keys, buttons via Enter/Space, playlist items via Enter/Space. No keyboard trap except intentional fullscreen trap with Escape exit.
- [ ] **2.1.2 No Keyboard Trap (A)** — Fullscreen trap includes Escape key to exit; background content unreachable only while fullscreen is active.
- [ ] **2.4.3 Focus Order (AA)** — Tab sequence follows visual reading order: seekbar -> prev -> play -> next -> mute -> volume -> playlist items.
- [ ] **2.4.7 Focus Visible (AA)** — Focus indicator must be visible on all interactive elements. CSS `:focus-visible` outline required on seekbar, volume slider, buttons, and playlist items.

### Understandable

- [ ] **3.2.2 On Input (A)** — Changing the seekbar or volume slider does not cause unexpected context changes (no page navigation, no focus shift).
- [ ] **3.3.1 Error Identification (A)** — Playback errors are identified with `role="alert"` and a descriptive message (see Section 7).

### Robust

- [ ] **4.1.1 Parsing (A)** — No duplicate IDs (player uses `$instance` counter); no invalid ARIA on host elements.
- [ ] **4.1.2 Name, Role, Value (A)** — All interactive elements have: accessible name (via `aria-label` or native text); role (native or via `role=`); state/value exposed programmatically and kept in sync with JS state.
- [ ] **4.1.3 Status Messages (AA)** — Track-change announcements use `aria-live="polite"` live region; error messages use `role="alert"`. Neither requires focus movement.

---

## Appendix A — Complete v3 HTML Template

The full annotated HTML output for a 4-track audio player instance.

```html
<div class="frado-player"
     id="frado-player-1"
     role="region"
     aria-label="Frado Player — Nome do Album"
     aria-busy="false"
     data-type="audio"
     data-title="Nome do Album"
     data-artist="Nome do Artista"
     data-volume="0.7">

  <!-- Polite live region for track announcements -->
  <div class="frado-player__live"
       aria-live="polite"
       aria-atomic="true"
       style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">
  </div>

  <!-- Header -->
  <div class="frado-player__header">
    <div class="frado-player__spectrum-icon" aria-hidden="true">
      <span></span><span></span><span></span><span></span>
    </div>
    <span class="frado-player__track-title">Faixa 1</span>
    <span class="frado-player__time" aria-hidden="true">
      <span class="frado-player__time-elapsed">0:00</span>
      <span> / </span>
      <span class="frado-player__time-duration">3:28</span>
    </span>
  </div>

  <!-- Seekbar -->
  <div class="frado-player__progress"
       role="slider"
       aria-label="Progresso da faixa"
       aria-valuemin="0"
       aria-valuemax="100"
       aria-valuenow="0"
       aria-valuetext="0:00 de 3:28"
       tabindex="0"
       style="touch-action:manipulation">
    <div class="frado-player__progress-fill"></div>
  </div>

  <!-- Controls row -->
  <div class="frado-player__controls">

    <!-- Transport -->
    <div class="frado-player__transport">
      <button class="frado-player__btn frado-player__btn--prev"
              aria-label="Faixa anterior">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
        </svg>
      </button>

      <button class="frado-player__btn frado-player__btn--play"
              aria-label="Reproduzir"
              aria-pressed="false">
        <svg class="frado-player__icon-play" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <polygon points="5,3 19,12 5,21"/>
        </svg>
        <svg class="frado-player__icon-pause" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" hidden>
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>
      </button>

      <button class="frado-player__btn frado-player__btn--next"
              aria-label="Proxima faixa">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
        </svg>
      </button>
    </div>

    <!-- Spectrum canvas — purely decorative -->
    <canvas class="frado-player__spectrum" aria-hidden="true"></canvas>

    <!-- Volume group -->
    <div class="frado-player__volume-group">
      <button class="frado-player__btn frado-player__btn--mute"
              aria-label="Silenciar"
              aria-pressed="false">
        <svg class="frado-player__icon-vol-high" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>
        <!-- other volume icon svgs omitted for brevity — retain aria-hidden="true" on all -->
      </button>

      <div class="frado-player__volume-track"
           role="slider"
           aria-label="Volume"
           aria-valuemin="0"
           aria-valuemax="100"
           aria-valuenow="70"
           aria-valuetext="70%"
           tabindex="0"
           style="touch-action:manipulation">
        <div class="frado-player__volume-fill" style="width:70%"></div>
        <div class="frado-player__volume-thumb"></div>
      </div>
    </div>

  </div>

  <!-- Playlist -->
  <ol class="frado-player__playlist"
      aria-label="Lista de faixas — Nome do Album">

    <li class="frado-player__track frado-player__track--active"
        role="button"
        tabindex="0"
        aria-current="true"
        aria-label="Faixa 1: Nome da Faixa, duracao 3:28"
        aria-posinset="1"
        aria-setsize="4"
        data-title="Nome da Faixa"
        data-duration="3:28">
      <span class="frado-player__track-num" aria-hidden="true">1</span>
      <span class="frado-player__track-name" aria-hidden="true">Nome da Faixa</span>
      <span class="frado-player__track-duration" aria-hidden="true">3:28</span>
    </li>

    <li class="frado-player__track"
        role="button"
        tabindex="0"
        aria-label="Faixa 2: Segunda Faixa, duracao 4:05"
        aria-posinset="2"
        aria-setsize="4"
        data-title="Segunda Faixa"
        data-duration="4:05">
      <span class="frado-player__track-num" aria-hidden="true">2</span>
      <span class="frado-player__track-name" aria-hidden="true">Segunda Faixa</span>
      <span class="frado-player__track-duration" aria-hidden="true">4:05</span>
    </li>

    <!-- tracks 3 and 4 follow the same pattern -->

  </ol>

</div>
```

---

## Appendix B — Gaps vs. v2 Summary

| Element | v2 Gap | v3 Fix | Phase |
|---|---|---|---|
| Container | No role, no accessible name, no live region | `role="region"`, `aria-label`, hidden `aria-live` div | `[Phase 2]` |
| Seekbar | No `aria-valuetext`, no `tabindex`, no keyboard handler | Add all three | `[Phase 1]` (valuetext) `[Phase 2]` (tabindex, keyboard) |
| Seekbar label | `"Progresso"` | `"Progresso da faixa"` | `[Phase 1]` |
| Play button | No `aria-pressed` | Add `aria-pressed`, toggle with JS | `[Phase 1]` |
| Mute button | `aria-label="Volume"` (wrong) | `aria-label="Silenciar"/"Ativar som"` + `aria-pressed` | `[Phase 1]` (label) `[Phase 2]` (aria-pressed) |
| Prev/Next | No `aria-disabled` | Add `aria-disabled="true"` on edge tracks | `[Phase 2]` |
| Volume slider | No `aria-valuetext`, no `tabindex` | Add both | `[Phase 1]` (valuetext) `[Phase 2]` (tabindex) |
| Playlist `<ol>` | No accessible name | `aria-label="Lista de faixas — [album]"` | `[Phase 2]` |
| Playlist `<li>` | Not interactive, no name, no `aria-current` | `role="button"`, `tabindex`, `aria-label`, `aria-current`, `aria-posinset`, `aria-setsize` | `[Phase 2]` |
| Loading state | No communication to AT | `aria-busy="true"` on container + polite live region | `[Phase 2]` |
| Error state | No communication to AT | `role="alert"` injected on error | `[Phase 2]` |
| Keyboard binding | `_FPKeyboard` on `document` (bug) | Scoped to `container` | `[Phase 1]` |
