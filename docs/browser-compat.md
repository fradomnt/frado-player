# Frado Player v3 — Browser Compatibility

> Last updated: 2026-04-02

---

## Table of Contents

1. [Audio Codec Support Matrix](#1-audio-codec-support-matrix)
2. [Video Codec Support Matrix](#2-video-codec-support-matrix)
3. [Web API Support](#3-web-api-support)
4. [iOS / Safari Special Cases](#4-ios--safari-special-cases)
5. [WordPress Compatibility](#5-wordpress-compatibility)
6. [Minimum Supported Browsers](#6-minimum-supported-browsers-v3)
7. [Feature Detection Pattern](#7-feature-detection-pattern)
8. [v3 vs v2 Browser Support Changes](#8-v3-vs-v2-browser-support-changes)
9. [Known Issues & v3 Fix Status](#9-known-issues--v3-fix-status)

---

## 1. Audio Codec Support Matrix

| Codec | Chrome | Firefox | Safari | Edge | iOS Safari | Android Chrome | Notes |
|---|---|---|---|---|---|---|---|
| FLAC | ✓ | ✓ | ✓ (macOS 11+) | ✓ | ✓ (iOS 15+) | ✓ | Best quality, lossless |
| Opus (.opus) | ✓ | ✓ | ✓ (macOS Monterey+) | ✓ | ✓ (iOS 17+) | ✓ | Best lossy quality |
| AAC (.m4a) | ✓ | ✓ (partial) | ✓ | ✓ | ✓ | ✓ | Widest compatibility |
| MP3 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Universal fallback |

### Priority Order: FLAC → Opus → AAC → MP3

The player selects the best available codec at runtime using `canPlayType()`. The order reflects a deliberate trade-off between quality and compatibility:

1. **FLAC** — Lossless, bit-perfect audio. Preferred for music playback where file size is acceptable. Now broadly supported across all major desktop and mobile browsers (iOS 15+, macOS 11+). Selected first whenever available.

2. **Opus** — The best lossy codec available. Achieves equivalent perceived quality at roughly half the bitrate of MP3. Excellent for streaming or bandwidth-constrained contexts. Limited on older Apple devices (requires iOS 17+ / macOS Monterey+), so it ranks below FLAC to avoid false positives on Apple.

3. **AAC (.m4a)** — Wide Apple ecosystem support; the native codec for iOS/macOS. Firefox support is partial (depends on platform-level decoder availability), but functional on most desktop Linux/Windows/macOS builds. Used as a near-universal fallback when Opus is unavailable.

4. **MP3** — Universal. Every browser and OS supports it without exception. Used as the last-resort fallback to guarantee playback on any device, including legacy ones.

---

## 2. Video Codec Support Matrix

| Codec | Chrome | Firefox | Safari | Edge | iOS Safari | Android Chrome |
|---|---|---|---|---|---|---|
| AV1 (.mp4) | ✓ (Chrome 70+) | ✓ (Firefox 67+) | ✓ (Safari 17+) | ✓ | ✓ (iOS 17+) | ✓ |
| HEVC / H.265 (.mp4) | ✗ | ✗ | ✓ (hardware) | ✓ (Win11+) | ✓ | ✗ |
| H.264 (.mp4) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### Notes on Video Codec Selection

- **AV1** is the preferred modern codec: superior compression over H.264 at equivalent quality, royalty-free, and now broadly supported. Requires Chrome 70+, Firefox 67+, Safari 17+, or iOS 17+. Android Chrome has supported AV1 hardware decoding since 2021 on compatible chipsets.

- **HEVC / H.265** is exclusively hardware-decoded on Apple devices (macOS, iOS). Chrome and Firefox on non-Apple platforms do not support HEVC due to licensing restrictions. Edge on Windows 11 supports it via platform codecs. Because of this fragmentation, HEVC is never used as a primary source — it is only offered as an optional hint for Apple environments.

- **H.264** is the universal video fallback, equivalent to MP3 for audio. Every modern browser decodes it, typically in hardware. Always provided as the final `<source>` element in the player's `<video>` tag.

---

## 3. Web API Support

| API | Chrome | Firefox | Safari | Edge | iOS | Notes |
|---|---|---|---|---|---|---|
| Web Audio API / AudioContext | ✓ | ✓ | ✓ | ✓ | ✓ | Requires user gesture to resume on iOS |
| MediaSession API | ✓ | ✓ | ✓ | ✓ | ✓ | Lock screen / notification controls |
| IntersectionObserver | ✓ | ✓ | ✓ | ✓ | ✓ | Scroll-driven animations and lazy load |
| History API (pushState) | ✓ | ✓ | ✓ | ✓ | ✓ | Modal back-button behavior |
| Fullscreen API (requestFullscreen) | ✓ | ✓ | ✓ | ✓ | ✗* | *iOS requires webkitEnterFullscreen |
| webkitEnterFullscreen | ✗ | ✗ | ✗ | ✗ | ✓ | iOS-only inline video fullscreen |
| Picture-in-Picture | ✓ | ✓ | ✓ | ✓ | ✓ | Disabled via `disablePictureInPicture` |
| localStorage | ✓ | ✓ | ✓ | ✓ | ✓ | Volume and preference persistence |
| Pointer Events | ✓ | ✓ | ✓ | ✓ | ✓ | Seekbar and volume drag on touch |
| Canvas 2D | ✓ | ✓ | ✓ | ✓ | ✓ | Spectrum analyzer rendering |
| CSS `prefers-reduced-motion` | ✓ | ✓ | ✓ | ✓ | ✓ | Disables animations for accessibility |
| CustomEvent with `detail` | ✓ | ✓ | ✓ | ✓ | ✓ | Used for all `fp:*` events; **IE11 ✗** (needs polyfill, not provided) |
| `ctx.setTransform()` (Canvas 2D) | ✓ | ✓ | ✓ | ✓ | ✓ | v3 fix for B1 canvas scale bug; broader support than `ctx.scale()` chaining |
| CSS Custom Properties (`--fp-*`) | ✓ | ✓ | ✓ | ✓ | ✓ | Design tokens and `color=` override; **IE11 ✗** — see [section 8](#8-v3-vs-v2-browser-support-changes) |
| `data-fp-state` + CSS `[data-fp-state="..."]` selectors | ✓ | ✓ | ✓ | ✓ | ✓ | All modern browsers; attribute selectors since CSS2 |
| `aria-live` polite region | ✓ | ✓ | ✓ | ✓ | ✓ | Screen reader announcements (track changes, state) |
| `aria-pressed` dynamic update | ✓ | ✓ | ✓ | ✓ | ✓ | Play/pause and mute button state for assistive tech |
| `pointer-events: none` (CSS) | ✓ | ✓ | ✓ | ✓ | ✓ | Applied to spectrum canvas to pass clicks through to controls beneath |

### v3 API Notes

- **`CustomEvent` with `detail`:** Already required by v2 for all `fp:*` events (`fp:play`, `fp:pause`, etc.). IE11 does not support the `CustomEvent` constructor — no polyfill is shipped. This is an existing requirement, not new in v3.

- **`ctx.setTransform()`:** Part of the Canvas 2D specification since its inception. Supported in all browsers that support `<canvas>`. v3 uses `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` instead of cumulative `ctx.scale(dpr, dpr)` to fix the exponential-scaling bug (B1). `setTransform()` resets the matrix absolutely rather than composing on top of the existing transform, so it is both safer and more widely reliable than relying on `ctx.scale()` idempotency.

- **CSS Custom Properties (`--fp-*`):** Required for design tokens (`--fp-accent`, `--fp-bg`, etc.) and the `color=` shortcode override. Supported in Chrome 49+, Firefox 31+, Safari 9.1+, Edge 15+, iOS 9.3+. **IE11 does NOT support CSS Custom Properties** — this is the single largest compatibility drop in v3. However, IE11 was already non-functional in v2 due to `CustomEvent`, `ResizeObserver`, and other missing APIs.

- **`data-fp-state` attribute + CSS attribute selectors:** `_FPState` writes `container.dataset.fpState` on every state transition. CSS targets these via `[data-fp-state="playing"]`, `[data-fp-state="loading"]`, etc. Attribute selectors are CSS2 — universal support, including IE7+.

- **`aria-live="polite"` region:** `_FPAccessibility` creates a visually-hidden `<div aria-live="polite">` per player instance. Screen readers announce text changes at the next opportunity. Supported by all major screen reader + browser combinations: NVDA/Chrome, JAWS/Chrome, JAWS/Edge, VoiceOver/Safari, TalkBack/Chrome.

- **`aria-pressed` dynamic update:** `_FPAccessibility` manages `aria-pressed="true"` / `"false"` on the play button and mute button. Screen readers correctly announce toggle state. Supported in all browsers within the v3 minimum support range.

- **`pointer-events: none` (CSS):** Applied to the spectrum `<canvas>` overlay so pointer events pass through to the seekbar and transport controls underneath. Supported in all browsers within the v3 minimum range (Chrome 2+, Firefox 3.6+, Safari 4+, Edge 12+, iOS 3.2+).

- **Container-scoped `addEventListener('keydown')`:** v3 binds keyboard shortcuts to `container.addEventListener('keydown')` instead of `document`. This is not a new browser API requirement — `addEventListener` on any `Element` has universal support. The behavioral difference: the player container must have focus (`tabindex="0"` added in PHP) before keyboard shortcuts work. Users must click or tab into the player first.

---

## 4. iOS / Safari Special Cases

iOS Safari and WebKit impose restrictions that differ from other browsers. Frado Player v3 handles all of these explicitly.

### 4.1 AudioContext Suspended on Page Load

The Web Audio API's `AudioContext` starts in a `suspended` state on iOS and will not produce sound until explicitly resumed inside a user gesture handler (click or touchend). The player calls `audioContext.resume()` inside its primary click/touch listener before any playback begins.

```js
document.addEventListener('click', function resumeCtx() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  document.removeEventListener('click', resumeCtx);
}, { once: true });
```

### 4.2 video.play() Returns a Promise

On modern browsers (including all currently supported versions), `HTMLMediaElement.play()` returns a `Promise`. Calling `.play()` without handling the rejection causes unhandled promise errors, especially when autoplay is blocked. The player always wraps `.play()` in a `.catch()`:

```js
var playPromise = videoEl.play();
if (playPromise !== undefined) {
  playPromise.catch(function(err) {
    // Autoplay was prevented — show play button overlay
    console.warn('Frado Player: play() blocked:', err);
  });
}
```

### 4.3 Fullscreen on iOS: webkitEnterFullscreen

iOS Safari does not implement the standard `requestFullscreen()` API for `<video>` elements. Instead, it exposes `webkitEnterFullscreen()` on the video element itself. The player feature-detects both paths:

```js
function enterFullscreen(el) {
  if (el.requestFullscreen) {
    el.requestFullscreen();
  } else if (el.webkitEnterFullscreen) {
    el.webkitEnterFullscreen(); // iOS Safari
  }
}
```

### 4.4 playsinline Attribute Required

Without the `playsinline` attribute, iOS Safari automatically takes the video fullscreen as soon as playback starts. The player always sets this attribute in its generated `<video>` markup:

```html
<video playsinline webkit-playsinline preload="metadata">
```

Both `playsinline` and the legacy `webkit-playsinline` are emitted for compatibility with older iOS 9/10 devices (non-supported but harmless).

### 4.5 FLAC Support by iOS Version

| iOS Version | FLAC Support |
|---|---|
| iOS 11–14 | ✗ |
| iOS 15+ | ✓ |

The codec detection via `canPlayType('audio/flac')` correctly returns `''` (empty string) on iOS 14 and below, so the player falls through to Opus or AAC automatically without any version-sniffing.

### 4.6 Autoplay Policy

iOS blocks any `video.play()` or `audio.play()` call that is not directly triggered by a user gesture, unless the media element is muted. The player never initiates autoplay with audio. If `autoplay` mode is configured, the player mutes the element first, then unmutes after the first user interaction.

---

## 5. WordPress Compatibility

| WordPress Version | PHP Version | Support Level |
|---|---|---|
| 6.0+ | 7.4+ | Full — all features, block editor shortcode, REST hooks |
| 5.8–5.9 | 7.2+ | Full — all features, classic and block editor |
| 5.0–5.7 | 7.0+ | Partial — no block editor shortcode; classic editor and widget supported |
| < 5.0 | < 7.0 | Not supported |

### Notes

- The `[frado_player]` shortcode works in all supported WordPress versions.
- The Gutenberg block (`frado-player/player`) requires WordPress 5.8+ with the block editor enabled.
- PHP 7.4+ is required for named arguments and typed properties used in the plugin's PHP layer. On PHP 7.2–7.3, a compatibility shim handles this automatically.
- Tested with the following popular themes: Twenty Twenty-Three, Twenty Twenty-Four, Astra, GeneratePress, Kadence. No conflicts found as of v3.

---

## 6. Minimum Supported Browsers (v3)

| Browser | Minimum Version | Release Year |
|---|---|---|
| Chrome | 80+ | 2020 |
| Firefox | 78+ (ESR) | 2020 |
| Safari | 14+ | 2020 |
| Edge | 80+ (Chromium) | 2020 |
| iOS Safari | 14+ | 2020 |
| Android Chrome | 80+ | 2020 |

**Browsers older than the 2020 baseline:** The player HTML renders and basic `<audio>`/`<video>` playback functions via native browser controls, but the following features degrade or are absent:

- Codec selection falls back to MP3 (audio) and H.264 (video).
- Spectrum analyzer is disabled (Canvas 2D available but AudioContext may be unreliable).
- MediaSession / lock screen controls are not registered.
- Volume animations and CSS transitions are disabled.
- `prefers-reduced-motion` check is skipped (treated as no-preference).

No JavaScript errors are thrown; degraded features fail silently.

**IE11:** Explicitly not supported. IE11 was already broken in v2 due to missing `CustomEvent` constructor and `ResizeObserver`. v3 adds a hard dependency on CSS Custom Properties (`--fp-*`), which IE11 does not support. No polyfill is shipped.

---

## 7. Feature Detection Pattern

The player never uses browser or user-agent sniffing. All capability checks are done through explicit feature detection at initialization time.

### Audio Codec Detection

```js
var audio = document.createElement('audio');

// canPlayType returns: 'probably', 'maybe', or '' (empty = not supported)
var canFlac = audio.canPlayType('audio/flac') !== '';
var canOpus = audio.canPlayType('audio/ogg; codecs="opus"') !== '';
var canAac  = audio.canPlayType('audio/mp4; codecs="mp4a.40.2"') !== '';
// MP3 is always supported in v3 target range — used as unconditional fallback

function pickAudioCodec(sources) {
  if (canFlac && sources.flac) return sources.flac;
  if (canOpus && sources.opus) return sources.opus;
  if (canAac  && sources.aac)  return sources.aac;
  return sources.mp3; // guaranteed fallback
}
```

### Video Codec Detection

```js
var video = document.createElement('video');

var canAv1  = video.canPlayType('video/mp4; codecs="av01.0.05M.08"') !== '';
var canHevc = video.canPlayType('video/mp4; codecs="hvc1"') !== '';
// H.264 is always the final fallback

function pickVideoCodec(sources) {
  if (canAv1  && sources.av1)  return sources.av1;
  if (canHevc && sources.hevc) return sources.hevc;
  return sources.h264;
}
```

### Web API Detection

```js
var hasMediaSession         = 'mediaSession' in navigator;
var hasAudioContext         = !!(window.AudioContext || window.webkitAudioContext);
var hasIntersectionObserver = 'IntersectionObserver' in window;
var hasFullscreen           = document.documentElement.requestFullscreen != null;
var hasWebkitFullscreen     = typeof document.createElement('video').webkitEnterFullscreen === 'function';
var hasPointerEvents        = 'PointerEvent' in window;
var hasPip                  = 'pictureInPictureEnabled' in document;
var haslocalStorage         = (function() {
  try { localStorage.setItem('_fp', '1'); localStorage.removeItem('_fp'); return true; }
  catch (e) { return false; }
})();
var hasCSSCustomProperties  = window.CSS && CSS.supports && CSS.supports('--fp-test', '0');
```

### Reduced Motion Check

```js
var prefersReducedMotion = window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Listen for runtime changes (user toggles OS setting while page is open)
if (window.matchMedia) {
  window.matchMedia('(prefers-reduced-motion: reduce)')
    .addEventListener('change', function(e) {
      prefersReducedMotion = e.matches;
      // Re-apply animation state to player UI
    });
}
```

---

## 8. v3 vs v2 Browser Support Changes

This section documents the specific browser compatibility differences introduced in v3.

### CSS Custom Properties (`--fp-*`)

| | v2 | v3 |
|---|---|---|
| **Requirement** | Not used | Required for design tokens and `color=` override |
| **IE11** | Already broken (other reasons) | Explicitly dropped — CSS Custom Properties not supported |
| **Impact** | None | IE11 cannot render themed styles; falls back to browser defaults |

v3 uses `--fp-*` CSS custom properties for all design tokens (`--fp-accent`, `--fp-bg`, `--fp-surface`, `--fp-text`, etc.) and the `color=` shortcode override (`style="--fp-accent:#hex"` on the container). All modern browsers (Chrome 49+, Firefox 31+, Safari 9.1+, Edge 15+, iOS 9.3+) support CSS Custom Properties. IE11 does not and never will.

**Practical impact:** IE11 was already non-functional in v2 due to missing `CustomEvent` constructor, `ResizeObserver`, `Promise`, and `Pointer Events` (partial). The addition of CSS Custom Properties in v3 makes IE11 incompatibility explicit and intentional rather than incidental.

### `ctx.setTransform()` — Canvas Scale Bug Fix

| | v2 | v3 |
|---|---|---|
| **API used** | `ctx.scale(dpr, dpr)` — cumulative | `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` — absolute |
| **Bug** | Transform accumulates exponentially on resize | Fixed: matrix reset on every resize |
| **Browser support** | Same | Same — `setTransform()` has identical support to `scale()` |

v2's `_resizeCanvas()` called `ctx.scale(dpr, dpr)` on every `ResizeObserver` callback. At DPR=2, after two resizes the effective scale was 4x, after three resizes 8x, etc. v3 replaces this with `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`, which sets the transform matrix absolutely rather than composing on top of the existing one.

`setTransform()` is part of the Canvas 2D specification and has the same browser support as `scale()` — it is not a new requirement. This fix improves behavior on all browsers, including high-DPI displays and resizable containers.

### Container-Scoped Keyboard Events

| | v2 | v3 |
|---|---|---|
| **Binding** | `document.addEventListener('keydown')` | `container.addEventListener('keydown')` |
| **New browser API?** | No | No — `addEventListener` on `Element` is universal |
| **Behavioral change** | Shortcuts work globally on page | User must focus the player first (click or Tab into it) |

v3 binds `_FPKeyboard` to the `.frado-player` container element instead of `document`. This eliminates the v2 bug where multiple players on the same page fought for the same `keydown` events. The `isOnlyPlayer` heuristic in v2 is removed.

**User-facing impact:** Keyboard shortcuts (Space, K, arrows, M, F, N, P, etc.) require the player to have focus. The container has `tabindex="0"` (added in PHP), so it is reachable via Tab key. Clicking anywhere inside the player also gives it focus. This is the correct accessible pattern — keyboard shortcuts should not hijack the entire page.

**No new browser requirement.** `Element.addEventListener()` is supported everywhere, including IE8+ (with the standard API).

### `aria-live` Polite Region (New in v3)

| | v2 | v3 |
|---|---|---|
| **Implementation** | Not present | `_FPAccessibility` creates `<div aria-live="polite">` per player |
| **Purpose** | — | Announces track changes, play/pause state to screen readers |
| **Browser support** | — | All modern browsers + screen readers |

The `aria-live="polite"` attribute is a WAI-ARIA 1.0 feature supported by all screen reader + browser combinations in the v3 minimum range (NVDA, JAWS, VoiceOver, TalkBack). No new browser capability is required — this is a DOM attribute that assistive technology interprets.

### `aria-pressed` on Toggle Buttons (New in v3)

| | v2 | v3 |
|---|---|---|
| **Play button** | No `aria-pressed` | `aria-pressed="true"` / `"false"` managed by `_FPAccessibility` |
| **Mute button** | `aria-label="Volume"` (ambiguous) | `aria-pressed` + descriptive `aria-label` |
| **Browser support** | — | All modern browsers + screen readers |

`aria-pressed` is a WAI-ARIA 1.0 attribute. No new browser capability is required. Screen readers announce toggle buttons correctly when `aria-pressed` is present — for example, "Play, toggle button, pressed" or "Play, toggle button, not pressed".

### `pointer-events: none` on Spectrum Canvas

| | v2 | v3 |
|---|---|---|
| **Implementation** | Not explicitly set | `pointer-events: none` on `<canvas>` element |
| **Purpose** | — | Allows clicks to pass through the spectrum overlay to transport controls |
| **Browser support** | — | Chrome 2+, Firefox 3.6+, Safari 4+, Edge 12+, iOS 3.2+ |

The spectrum `<canvas>` visually overlays the player controls. Without `pointer-events: none`, clicks on the canvas would not reach the play/pause or seekbar elements underneath. This CSS property has universal support within the v3 minimum range.

---

## 9. Known Issues & v3 Fix Status

### Fixed in v3 Phase 1

| Issue | v2 Behavior | v3 Fix | Reference |
|---|---|---|---|
| **Canvas scale bug (B1 — HIGH)** | `ctx.scale(dpr, dpr)` accumulates on every resize — spectrum drawing scales exponentially (4x, 8x, 16x...) on high-DPI displays | `_resizeCanvas()` uses `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` — absolute matrix reset, no accumulation | architecture-v3.md, Bug 16 |
| **Seekbar pointercancel (B2 — MEDIUM)** | Seekbar does not handle `pointercancel`; `seeking` flag stays `true` after a touch scroll takeover, leaving the seekbar stuck | Seekbar listens for `pointercancel` and resets `seeking` flag | architecture-v3.md, Bug 17 |
| **AbortError on track change (B3 — MEDIUM)** | `fvideoPrev` / `fvideoNext` call `vid.play()` synchronously after `vid.load()`, producing `AbortError` because the previous `play()` Promise rejects | `loadTrack()` waits for `canplay` event before calling `play()`; all `play()` calls are `.catch()`-wrapped | architecture-v3.md, Bugs 3 & 18 |
| **Keyboard event collision** | `_FPKeyboard` bound to `document` — multiple players fight for same keydown events | Bound to `container` with `tabindex="0"` | architecture-v3.md, Bug 1 |
| **Mute button ambiguous label** | `aria-label="Volume"` — neither describes action nor state | `aria-label="Silenciar"` / `"Ativar som"` + `aria-pressed` | architecture-v3.md, Bugs 10 & 11 |
| **Play button missing state** | No `aria-pressed` attribute — screen readers cannot report play/pause state | `aria-pressed="true"` / `"false"` managed by `_FPAccessibility` | architecture-v3.md, Bug 11 |
| **BottomSheet memory leak (B5)** | `_FPBottomSheet` never destroyed in `FradoPlayer.destroy()` — leaks `window` resize listener | `destroy()` calls `_FPBottomSheet.destroy()` | architecture-v3.md, Bug 20 |

### Fixed in v3 Phase 1 (PHP)

| Issue | v2 Behavior | v3 Fix |
|---|---|---|
| **Double-escaping** | `esc_attr( $atts['title'] )` where `$atts['title']` already `esc_html()`'d — entities double-encoded | Store `$title_raw = sanitize_text_field(...)`, use `esc_attr()` for attributes, `esc_html()` for text nodes |
| **Unescaped URL attributes** | `echo $src` without `esc_attr()` wrapper | All data-URL attributes wrapped in `esc_attr()` |
| **Inline style CSP violation** | `style="touch-action:manipulation"` in PHP output | Moved to `frado-player.css` as `.frado-player__progress { touch-action: manipulation; }` |
| **Redundant enqueue** | `wp_enqueue_style`/`wp_enqueue_script` called per shortcode instance | Enqueue once: `if ( $instance === 1 )` guard |

### Remaining (Scheduled for Later Phases)

| Issue | Phase | Status |
|---|---|---|
| Volume loaded as muted from localStorage but `mediaEl.volume` not initialized (B4) | Phase 2 | Pending |
| `_FPPlaylist` does not set `aria-current` on active track | Phase 2 | Pending — `_FPAccessibility` class will manage this |
| Video player listeners missing `fvideoInited` guard | Phase 3 | Pending — theme-side fix |

---

*Frado Player v3 — browser-compat.md*
