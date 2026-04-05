# Changelog

All notable changes to the Frado Player WordPress plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [3.3.0] — 2026-04-02 (upcoming — Phase 4)

Design tokens, new shortcode attributes, light mode, and motion-accessibility support.

### Added

- CSS design tokens (`--fp-*`) — all hardcoded values migrated to `:root` custom properties; component CSS references only `var(--fp-*)` tokens
- `autoplay` shortcode attribute — safe autoplay that reads `data-autoplay` and calls `play()` on `canplaythrough` (respects browser user-gesture requirements)
- `loop` shortcode attribute — sets `mediaEl.loop` via `data-loop`; enables seamless looping of a single track or entire playlist
- `color` shortcode attribute — per-instance accent color override; PHP emits `style="--fp-accent:#hex"` on the container, all `var(--fp-accent)` references auto-inherit
- `@media (prefers-reduced-motion: reduce)` — sets all `--fp-duration-*` tokens to `0ms`, disabling spectrum and seekbar animations for users who prefer reduced motion
- `@media (prefers-color-scheme: light)` — light mode token overrides for `--fp-bg`, `--fp-surface`, `--fp-text`, `--fp-text-muted`, `--fp-border`; accent amber stays the same in both modes

---

## [3.2.0] — 2026-04-02 (upcoming — Phase 3)

Factory method for theme integration, eliminating setTimeout hacks and manual DOM building.

### Added

- `FradoPlayer.fromCard(cardEl, containerEl)` static factory method — reads `data-fp-*` attributes from card element, writes `data-*` attributes to the `.frado-player` container, parses `data-fp-tracks` CSV into `<li>` DOM, instantiates the player, and calls `play()` immediately (card click is the user gesture — no setTimeout needed)
- Theme migration guide documenting how to replace the 60 ms + 150 ms `setTimeout` initialization block in `openArtistModal()` with `FradoPlayer.fromCard(card, fpEl)`

### Changed

- Theme integration: manual playlist `<li>` building loop in `openArtistModal()` is no longer needed — `fromCard()` handles it internally

### Fixed

- `fvideoToggle()` in theme discards the Promise returned by `vid.play()` — now wrapped with `.catch()` to prevent `UnhandledPromiseRejection` under autoplay restrictions
- `fvideoPrev` / `fvideoNext` call `vid.play()` synchronously after `vid.load()`, producing `AbortError` — now waits for `canplay`
- Missing `fvideoInited` guard on video player event listeners (parallel to the existing `fplayerInited` guard on audio)
- Eliminated 60 ms + 150 ms `setTimeout` hacks for FradoPlayer initialization — fragile on slow devices, unnecessary with the `fromCard()` factory

---

## [3.1.0] — 2026-04-02 (upcoming — Phase 2)

Formal state machine, container-scoped keyboard handling, and centralized accessibility management.

### Added

- `_FPState` class — centralized state machine managing `idle`, `loading`, `playing`, `paused`, and `error` lifecycle states; writes `container.dataset.fpState` on every transition and fires `fp:statechange` custom events with `{ from, to }` detail
- `_FPAccessibility` class — manages hidden `aria-live="polite"` region (one per instance), `announce(text)` method, `aria-busy` during loading, `aria-pressed` on play and mute buttons, `aria-disabled` on prev/next buttons, focus restoration
- `_FPKeyboard` v3 (rewritten) — bound to container instead of `document` (fixes multi-player key conflicts); full key map: `Space`, `K` (play/pause), `←`/`→` (seek), `↑`/`↓` (volume), `M` (mute), `F` (fullscreen), `N` (next), `P` (prev), `Home`, `End`, `Escape`, `1`–`9` (jump to track); guards for `ctrlKey`/`metaKey`/`altKey` and INPUT/TEXTAREA/SELECT targets
- ARIA compliance improvements: `aria-current="true"` on active playlist track, `aria-posinset` and `aria-setsize` on playlist `<li>` items, `role="region"` and `aria-label` on player container

### Changed

- PHP: added `tabindex="0"` on `.frado-player` container (required for container-scoped keyboard)
- PHP: added `tabindex="0"` on volume slider
- PHP: added `role="region"` and `aria-label="Frado Player — {title}"` on player container
- `_FPState` is now the single source of truth for playback state — other modules read `_FPState.current` instead of the ad-hoc `isPlaying` boolean

---

## [3.0.0] — 2026-04-02 (Phase 1)

Unified Player Release. This version merges audio and video playback into a single, self-contained plugin — removing all inline player logic from theme templates. The JavaScript architecture was refactored around a centralized state machine with dedicated classes for keyboard handling and accessibility. A complete `docs/` folder with architecture diagrams, specs, and usage guides was added.

### Added

- **Unified player** — audio and video are now handled by a single plugin; theme templates no longer need inline player code
- `src_aac` field in `tracks=` format — tracks now support 7 fields: `title|mp3|flac|opus|aac|duration|thumb`
- Per-track thumbnail in `tracks=` format (7th field)
- Full keyboard shortcut set: `↑`/`↓` adjust volume, `M` toggles mute, `F` toggles fullscreen, `N` skips to next track, `P` returns to previous track, `1`–`9` jump directly to that track number in the playlist
- Event system — public `.on()` and `.off()` methods for subscribing to `play`, `pause`, `trackchange`, `error`, and `end` events
- `.destroy()` method — tears down all DOM event listeners and closes the AudioContext cleanly
- Loading state — seekbar shimmer animation renders while the browser is buffering media
- Error state — inline retry button appears on `error` media events without requiring a page reload
- `docs/` folder — architecture overview, shortcode spec, keyboard reference, and contributor guide

### Fixed

- **B1 (HIGH)** — `_resizeCanvas()` calls `ctx.scale(dpr, dpr)` cumulatively on every resize; the transform accumulates exponentially (at DPR=2, after two resizes all drawing is at 4x scale). Fixed by replacing `ctx.scale()` with `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`
- **B2 (MEDIUM)** — seekbar does not handle `pointercancel`; the `seeking` flag stays `true` after a touch scroll takeover, permanently breaking seek interaction until page reload
- **B3 (MEDIUM)** — `loadTrack()` calls `core.loadSrc()` then `core.play()` synchronously without waiting for `canplay`, causing silent `AbortError` failures on slow networks and leaving `isPlaying` out of sync
- **B4 (MEDIUM)** — if volume is loaded as muted from `localStorage`, `mediaEl.volume` is never initialized; browser default (1.0) is used until the user unmutes, producing a jarring volume jump
- **B5 (MEDIUM)** — `_FPBottomSheet` is never destroyed in `FradoPlayer.destroy()`, leaking a `window` resize listener on every player teardown
- **PHP** — double-escaping in `data-title` / `data-artist` attributes: `esc_attr()` was applied to values already escaped by `esc_html()`, causing entities like `&amp;` to render as `&amp;amp;` in data attributes
- **PHP** — URL data attributes (`data-src`, `data-src-flac`, etc.) emitted without `esc_attr()` wrapper (`echo $src` with no attribute context escaping)
- **PHP** — `touch-action:manipulation` written as inline `style` attribute on seekbar and volume slider, violating CSP policies that block `style-src 'unsafe-inline'`; moved to CSS class rule
- **PHP** — `wp_enqueue_style` / `wp_enqueue_script` called once per shortcode instance; with multiple players on a page WordPress receives redundant enqueue calls; now enqueues only when `$instance === 1`
- Missing `aria-valuetext` on seekbar and volume slider — screen readers announced raw integers instead of human-readable time strings (e.g. "2 minutes 14 seconds") and percentages
- Play button missing `aria-pressed` attribute — screen readers could not report play/pause toggle state
- Mute button uses ambiguous `aria-label="Volume"` — replaced with action-descriptive labels `"Silenciar"` / `"Ativar som"` that update dynamically with mute state

### Changed

- Fullscreen button moved from the transport controls row to the now-playing row (left of duration display)
- Spectrum EQ animated bars removed from the player UI (decorative noise with no functional value)
- PiP (Picture-in-Picture) disabled on the video element via `disablePictureInPicture` attribute
- Badge/tag visual style changed from full-width tarja (banner) to compact pill outline (`border-radius: 50px`)
- Modal body structure reordered: player and playlist appear first, followed by scrollable artist info

---

## [2.0.0] — 2025-06-01

Multi-Codec & Spectrum Release. Complete rewrite of the JavaScript architecture into a class-based system. Introduced the spectrum analyzer, playlist support, Media Session API integration, and multi-codec source negotiation for both audio and video.

### Added

- **Spectrum analyzer** — 30-band frequency visualizer rendered via Web Audio API and `<canvas>`
- **Playlist support** — embedded track list with previous/next navigation and direct click-to-play
- **Media Session API** — integration with OS lock screen and notification shade controls (title, artist, artwork, track commands)
- Multiple codec sources for audio: FLAC, Opus, AAC, MP3 — browser selects the best supported format automatically
- Multiple codec sources for video: AV1, HEVC/H.265, H.264
- Video mode — automatically detected from source file extensions or via explicit `type="video"` attribute
- `src_av1`, `src_hevc`, `src_h264` shortcode attributes for video sources
- `localStorage` volume persistence — volume setting is remembered across browser sessions
- Multiple independent players per page — each instance is isolated via a static instance counter
- Pointer events (`pointerdown`, `pointermove`, `pointerup`) on seekbar and volume slider for reliable touch response on mobile
- Picture-in-Picture (PiP) support via the browser's standard PiP API
- Keyboard shortcuts: `Space` play/pause, `←`/`→` seek backward/forward
- Accessibility: `role="slider"`, `aria-label`, and `aria-valuenow` on interactive controls

### Changed

- Complete rewrite of JS architecture into four classes: `_FPCore`, `_FPPlaylist`, `_FPSpectrum`, `FradoPlayer`
- CSS migrated to custom properties (`var(--fp-*)`) for consistent theming

---

## [1.0.0] — 2024-03-01

Initial Release.

### Added

- WordPress shortcode `[frado_player]`
- Single audio file playback (MP3)
- Custom seekbar and volume slider controls
- Responsive layout

---

[Unreleased]: https://github.com/fradomnt/frado-player/compare/v3.3.0...HEAD
[3.3.0]: https://github.com/fradomnt/frado-player/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/fradomnt/frado-player/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/fradomnt/frado-player/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/fradomnt/frado-player/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/fradomnt/frado-player/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/fradomnt/frado-player/releases/tag/v1.0.0
