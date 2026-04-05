# Frado Player v3 — Keyboard Shortcuts Specification

> Last updated: 2026-04-02

> **v3 Scope Change:** In v3, `_FPKeyboard` is **container-scoped** (bound to the `.frado-player` element), not document-scoped as in v2. This requires `tabindex="0"` on the player container so it can receive focus and keyboard events. The user must click or tab into the player before shortcuts activate. See [Scope Change in v3](#scope-change-in-v3) for details.

---

## 1. Shortcuts Table — Complete v3 Spec

### Playback

| Key | Action | Status | Notes |
|---|---|---|---|
| `Space` | Play / Pause | `[v2 ✓]` | `e.code === 'Space'`; `e.preventDefault()` to block page scroll |
| `K` | Play / Pause (YouTube-style alias) | `[Phase 2]` | Common expectation; same action as `Space` |
| `←` | Seek back 5 s | `[v2 ✓]` | Clamps to 0; no-op if no duration yet |
| `→` | Seek forward 5 s | `[v2 ✓]` | Clamps to `duration`; no-op if no duration yet |
| `Home` | Seek to start | `[Phase 2]` | Sets `currentTime = 0` |
| `End` | Seek to end (last 10 s) | `[Phase 2]` | Sets `currentTime = max(0, duration - 10)` |

### Volume

| Key | Action | Status | Notes |
|---|---|---|---|
| `↑` | Volume +5% | `[v2 ✓]` | Calls `volume.setVolume(pct + 5)`; clamps to 100 |
| `↓` | Volume -5% | `[v2 ✓]` | Calls `volume.setVolume(pct - 5)`; clamps to 0 |
| `M` | Mute toggle | `[v2 ✓]` | `e.code === 'KeyM'`; calls `volume.toggleMute()` |

### Fullscreen / Dismiss

| Key | Action | Status | Notes |
|---|---|---|---|
| `F` | Fullscreen toggle | `[v2 ✓]` | `e.code === 'KeyF'`; dispatches `fp:fullscreen-request`; video mode only in practice |
| `Escape` | Close bottom sheet / exit fullscreen | `[Phase 2]` | Browser handles fullscreen exit natively; bottom sheet close needs explicit wiring via `fp:sheet-close` |

### Playlist Navigation

| Key | Action | Status | Notes |
|---|---|---|---|
| `N` | Next track | `[Phase 2]` | Only meaningful with playlist; calls `playlist.next()` |
| `P` | Previous track | `[Phase 2]` | `>3 s` played -> restarts current; otherwise goes to previous; calls `playlist.prev()` |
| `1`–`9` | Jump to track N | `[Phase 2]` | Only when playlist has N or more tracks; uses `e.code` (`Digit1`...`Digit9`) to avoid numpad conflicts |

> **Status legend:**
> - `[v2 ✓]` — Already working in v2, carried forward unchanged
> - `[Phase 1]` — Being added in v3 Phase 1 (critical bug fixes, no new features)
> - `[Phase 2]` — Being added in v3 Phase 2 (state machine + keyboard rewrite + ARIA)

> **Note on volume step:** The current implementation uses 5% steps (range 0–100), not 10%. The `_FPVolume.setVolume(pct)` API works on the 0–100 scale. The spec table above reflects the actual code; adjust to 10% steps if preferred by changing the delta from `5` to `10`.

---

## 2. Scope Change in v3

### v2 behavior (document-scoped)

```js
document.addEventListener('keydown', this._handler);    // line 1160 in v2
```

The handler fires for **ALL** keypresses on the page. A focus guard (`container.contains(document.activeElement)`) partially compensates, but the `isOnlyPlayer` fallback means a single player on the page captures keyboard events globally, even when focus is elsewhere.

### v3 behavior (container-scoped)

```js
container.addEventListener('keydown', this._handler);   // v3 _FPKeyboard
```

The handler fires **only when the player or a child element is focused**. The browser's native event bubbling path ensures this — no extra guards needed, no `document.activeElement` polling.

### Requirements for container-scoped binding

1. **`tabindex="0"` on the player container** — without this, the `<div>` is not focusable and will never receive keyboard events.

```html
<div class="frado-player" tabindex="0" role="region" aria-label="Frado Player">
```

2. **CSS focus style** — the player must have a visible focus indicator so users know when it is active:

```css
frado-player:focus-visible,
.frado-player:focus-visible {
    outline: 2px solid var(--fp-accent, #F59E0B);
    outline-offset: 2px;
}
```

### Impact on user interaction

The user must **click or tab into the player** before keyboard shortcuts activate. This is the correct behavior: it prevents the player from hijacking keys while the user is interacting with other parts of the page.

---

## 3. Multiple Players on Same Page

### v2 problem

Both players are bound to `document.addEventListener('keydown', ...)`. When the user presses a key, **both** handlers fire. The `isOnlyPlayer` guard (line 1111 in v2) only helps when there is exactly one player — with two or more players, the guard fails and both players fight for the same key events.

### v3 solution

With container-scoped listeners (`container.addEventListener`), two players on the same page are completely independent. Player A's handler never sees keys typed while Player B has focus, and vice versa. Each player's keyboard scope is hermetically sealed to its own DOM subtree.

No special logic is needed — the browser's native event bubbling handles isolation automatically.

---

## 4. Current v2 Implementation

The keyboard handler lives in `frado-player.js` starting at **line 1096**.

```
/* ── _FPKeyboard ──  (lines 1096 – 1165) */

function _FPKeyboard(container, core, playlist, volume) {
    this.container = container;
    this.core      = core;
    this.playlist  = playlist;
    this.volume    = volume;

    var self = this;

    this._handler = function(e) {
        var tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;   // line 1108

        var hasFocus     = container.contains(document.activeElement);            // line 1110
        var isOnlyPlayer = document.querySelectorAll('.frado-player').length === 1;
        if (!hasFocus && !isOnlyPlayer) return;                                   // line 1112

        switch (e.code) {
            case 'Space':       // line 1115  — play / pause
                e.preventDefault();
                core.toggle();
                break;

            case 'ArrowLeft':   // line 1120  — seek -5 s
                e.preventDefault();
                if (core.mediaEl && core.mediaEl.duration) {
                    core.mediaEl.currentTime = Math.max(0, core.mediaEl.currentTime - 5);
                }
                break;

            case 'ArrowRight':  // line 1127  — seek +5 s
                e.preventDefault();
                if (core.mediaEl && core.mediaEl.duration) {
                    core.mediaEl.currentTime = Math.min(
                        core.mediaEl.duration,
                        core.mediaEl.currentTime + 5
                    );
                }
                break;

            case 'ArrowUp':     // line 1137  — volume +5%
                e.preventDefault();
                if (volume) volume.setVolume(Math.min(100, volume.pct + 5));
                break;

            case 'ArrowDown':   // line 1142  — volume -5%
                e.preventDefault();
                if (volume) volume.setVolume(Math.max(0, volume.pct - 5));
                break;

            case 'KeyM':        // line 1147  — mute toggle
                e.preventDefault();
                if (volume) volume.toggleMute();
                break;

            case 'KeyF':        // line 1152  — fullscreen (video)
                container.dispatchEvent(
                    new CustomEvent('fp:fullscreen-request', { bubbles: false })
                );
                break;
        }
    };

    document.addEventListener('keydown', this._handler);    // line 1160
}

_FPKeyboard.prototype.destroy = function() {
    document.removeEventListener('keydown', this._handler); // line 1164
};
```

### What is already wired at instantiation (line 1263)

```js
this.keyboard = new _FPKeyboard(container, this.core, this.playlist, this.volume);
```

The `fp:fullscreen-request` custom event is caught at line 1276 by `_FPPlayer._toggleFullscreen()`, which calls `el.requestFullscreen()` / `el.webkitRequestFullscreen()` and `document.exitFullscreen()` as appropriate.

### Known issues in the v2 implementation

1. **`document`-level listener** (line 1160) — the handler is bound to `document`, not `container`. The focus guard on lines 1110–1112 partially compensates, but the fallback `isOnlyPlayer` branch means a single player on the page captures all keyboard events globally, even when focus is elsewhere. **Fixed in v3 Phase 1** (bind to container).
2. **`Escape`, `N`, `P`, `1`–`9`, `Home`, `End`, `K`** — not handled. **Added in v3 Phase 2** (full key map rewrite).
3. **No modifier-key guard** — currently `F` triggers fullscreen even when `Ctrl+F` or `Cmd+F` (browser search) is pressed. **Fixed in v3 Phase 2** (modifier guard).

---

## 5. v3 Implementation — `_FPKeyboard` (Drop-in Replacement)

The block below is the complete v3 `_FPKeyboard` class as specified in `architecture-v3.md` Section 2. It replaces the v2 constructor and prototype. It addresses every gap listed in Section 1, moves the listener from `document` to `container` (scoped focus), and adds modifier-key guards.

**Phase 1 change:** bind to `container` instead of `document` (line 6 below).
**Phase 2 changes:** full key map (`K`, `N`, `P`, `Home`, `End`, `Escape`, `1`–`9`), modifier guard.

```js
/* ── _FPKeyboard v3 ── */

function _FPKeyboard(container, core, playlist, volume) {
    this.container = container;
    this.core      = core;
    this.playlist  = playlist;
    this.volume    = volume;

    this._handler = this._onKey.bind(this);

    // Bind to the container, not document — container-scoped
    container.addEventListener('keydown', this._handler);
}

_FPKeyboard.prototype._onKey = function(e) {
    // Do not intercept when the user is typing
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // Ignore any combination that uses a system/browser modifier key
    // (Ctrl+F = browser search, Cmd+F = macOS spotlight, etc.)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    var core     = this.core;
    var playlist = this.playlist;
    var volume   = this.volume;

    switch (e.code) {

        // ── Playback ────────────────────────────────────────────
        case 'Space':
        case 'KeyK':                        // YouTube-style alias
            e.preventDefault();
            core.toggle();
            break;

        case 'ArrowLeft':
            e.preventDefault();
            if (core.mediaEl && core.mediaEl.duration) {
                core.mediaEl.currentTime = Math.max(0, core.mediaEl.currentTime - 5);
            }
            break;

        case 'ArrowRight':
            e.preventDefault();
            if (core.mediaEl && core.mediaEl.duration) {
                core.mediaEl.currentTime = Math.min(
                    core.mediaEl.duration,
                    core.mediaEl.currentTime + 5
                );
            }
            break;

        case 'Home':
            e.preventDefault();
            if (core.mediaEl) core.mediaEl.currentTime = 0;
            break;

        case 'End':
            e.preventDefault();
            if (core.mediaEl && core.mediaEl.duration) {
                core.mediaEl.currentTime = Math.max(0, core.mediaEl.duration - 10);
            }
            break;

        // ── Volume ──────────────────────────────────────────────
        case 'ArrowUp':
            e.preventDefault();
            if (volume) volume.setVolume(Math.min(100, volume.pct + 5));
            break;

        case 'ArrowDown':
            e.preventDefault();
            if (volume) volume.setVolume(Math.max(0, volume.pct - 5));
            break;

        case 'KeyM':
            e.preventDefault();
            if (volume) volume.toggleMute();
            break;

        // ── Fullscreen ──────────────────────────────────────────
        case 'KeyF':
            e.preventDefault();
            this.container.dispatchEvent(
                new CustomEvent('fp:fullscreen-request', { bubbles: false })
            );
            break;

        // ── Playlist navigation ─────────────────────────────────
        case 'KeyN':
            if (playlist && playlist.tracks.length > 1) {
                e.preventDefault();
                playlist.next();
            }
            break;

        case 'KeyP':
            if (playlist && playlist.tracks.length > 1) {
                e.preventDefault();
                playlist.prev();
            }
            break;

        // ── Close / dismiss ─────────────────────────────────────
        case 'Escape':
            // 1. If a bottom sheet is open, close it
            var sheet = this.container.querySelector('.frado-player__sheet--open');
            if (sheet) {
                e.preventDefault();
                this.container.dispatchEvent(
                    new CustomEvent('fp:sheet-close', { bubbles: false })
                );
                break;
            }
            // 2. If in fullscreen, exit (browser also does this natively, but
            //    dispatching keeps our UI state in sync)
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                e.preventDefault();
                if (document.exitFullscreen) document.exitFullscreen();
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            }
            break;

        // ── Numeric track jump (1–9) ────────────────────────────
        default:
            var digit = e.code.match(/^Digit([1-9])$/);
            if (digit && playlist) {
                var n = parseInt(digit[1], 10);
                if (n <= playlist.tracks.length) {
                    e.preventDefault();
                    playlist.loadTrack(n - 1);
                }
            }
            break;
    }
};

_FPKeyboard.prototype.destroy = function() {
    this.container.removeEventListener('keydown', this._handler);
};
```

> **Integration note:** `fp:sheet-close` must also be wired in `_FPBottomSheet`. Add `container.addEventListener('fp:sheet-close', function() { self.close(); });` inside the `_FPBottomSheet` constructor.

---

## 6. Conflict Prevention

### Per-shortcut analysis

| Key | Risk | Mitigation |
|---|---|---|
| `Space` | Scrolls page | `e.preventDefault()` — always safe inside a focused media widget |
| `←` / `→` | Scrolls page horizontally | `e.preventDefault()` — safe |
| `↑` / `↓` | Scrolls page vertically | `e.preventDefault()` — safe |
| `M` | No browser conflict | Safe |
| `F` | `Ctrl+F` / `Cmd+F` opens browser find | Guard: `if (e.ctrlKey \|\| e.metaKey) return;` (already in v3 class) |
| `N` / `P` | No browser conflict | Safe |
| `Home` / `End` | Scrolls to top/bottom of page | `e.preventDefault()` — acceptable trade-off when player is focused |
| `Escape` | Native fullscreen exit | Allow browser default to also fire; our handler syncs UI state |
| `1`–`9` | No browser conflict | Safe; use `e.code` (`Digit1`...`Digit9`) to avoid numpad conflicts (`Numpad1` etc.) |

### Input fields inside the player (e.g., playlist search)

The guard at the top of `_onKey`:

```js
var tag = e.target.tagName;
if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
```

This runs before any `switch` case. Add `|| e.target.isContentEditable` if the player ever gains a `contenteditable` field.

### Modifier-key guard

```js
if (e.ctrlKey || e.metaKey || e.altKey) return;
```

This one line prevents all OS- and browser-level shortcuts from being stolen (`Ctrl+C`, `Cmd+Shift+F`, `Alt+Left` for browser back, etc.).

---

## 7. Visual Feedback

Each shortcut must produce an immediate, perceivable change. The table below maps keys to their expected DOM/ARIA side-effects, all of which are already driven by the existing `_FPVolume`, `_FPCore`, and `_FPPlaylist` methods — no extra rendering code is needed as long as those methods are called correctly.

| Key | Visual / ARIA feedback | Driven by |
|---|---|---|
| `Space` / `K` | Play icon swaps to Pause icon (or vice versa); `aria-label` on button updates | `core.toggle()` -> `fp:play` / `fp:pause` events -> existing DOM updates |
| `←` / `→` | Seekbar fill width updates; current-time display updates; `aria-valuenow` on seekbar | `mediaEl.currentTime =` -> `timeupdate` event -> existing seekbar listener |
| `Home` / `End` | Same as seek | Same as above |
| `↑` / `↓` | Volume slider fill and thumb position update; icon switches between low/high; `aria-valuenow` on slider | `volume.setVolume()` -> `_FPVolume._applyVolume()` -> `_updateFill()` + `_updateIcons()` |
| `M` | Volume icon swaps to muted state; slider fill drops to 0 visually; `aria-pressed="true"` on mute button | `volume.toggleMute()` -> `_FPVolume._updateIcons()` + `_updateFill()` |
| `F` | Player enters/exits fullscreen; fullscreen button `aria-pressed` updates | `fp:fullscreen-request` -> `_toggleFullscreen()` -> `fullscreenchange` event |
| `Escape` | Bottom sheet slides down and disappears; or player exits fullscreen | `fp:sheet-close` -> `_FPBottomSheet.close()` / `document.exitFullscreen()` |
| `N` / `P` | Active track row in playlist receives `.frado-player__track--active`; title/duration in transport updates; playback restarts | `playlist.next()` / `playlist.prev()` -> `loadTrack()` -> existing active-class logic |
| `1`–`9` | Same as N/P but jumps to absolute track index | `playlist.loadTrack(n - 1)` -> same as above |

### Transient feedback (recommended addition)

For accessibility and discoverability, consider showing a small on-screen indicator (OSD) for volume and seek actions:

```js
// Example: append to _FPKeyboard._onKey after volume cases
_FPKeyboard.prototype._showOSD = function(text) {
    var osd = this.container.querySelector('.frado-player__osd');
    if (!osd) return;
    osd.textContent = text;
    osd.classList.add('frado-player__osd--visible');
    clearTimeout(this._osdTimer);
    this._osdTimer = setTimeout(function() {
        osd.classList.remove('frado-player__osd--visible');
    }, 800);
};
```

Suggested OSD strings:

| Action | OSD text |
|---|---|
| Volume change | `Volume: 70%` |
| Mute | `Muted` / `Unmuted` |
| Seek | `-5s` / `+5s` |
| Track jump | `Track 3` |
| Fullscreen | `Fullscreen` / `Exit fullscreen` |

---

## 8. Implementation Phases (from architecture-v3.md)

| Phase | Version | Keyboard changes |
|---|---|---|
| **Phase 1** | v3.0.0 | Bind `_FPKeyboard` to `container` instead of `document` (bug fix). Existing key map unchanged. |
| **Phase 2** | v3.1.0 | Full `_FPKeyboard` rewrite: add `K`, `N`, `P`, `Home`, `End`, `Escape`, `1`–`9`. Add modifier-key guard. PHP adds `tabindex="0"`, `role="region"`, `aria-label` to container. |
| **Phase 3** | v3.2.0 | No keyboard changes (factory + theme migration). |
| **Phase 4** | v3.3.0 | No keyboard changes (design tokens + color override). |
