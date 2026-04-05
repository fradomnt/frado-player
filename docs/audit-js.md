# Audit — frado-player.js

**File:** assets/frado-player.js
**Date:** 2026-04-02

---

## v3 Resolution Summary

| Bug ID | Severity | Phase | Status |
|--------|----------|-------|--------|
| B1 — `_resizeCanvas` cumulative scale | HIGH | Phase 1 | Fixed: `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` replaces `ctx.scale()` |
| B2 — seekbar `pointercancel` missing | MEDIUM | Phase 1 | Fixed: `pointercancel` handler resets `_seeking` flag |
| B3 — `loadTrack` play() before canplay | MEDIUM | Phase 1 | Fixed: `play()` wrapped in `canplay` listener inside `loadTrack` |
| B4 — localStorage muted volume init | MEDIUM | Phase 1 | Fixed: `mediaEl.volume` initialized before muting |
| B5 — `_FPBottomSheet` not destroyed | MEDIUM | Phase 1 | Fixed: `destroy()` call added to `FradoPlayer.destroy()` |
| B6 — `_fpSourceNode` never removed | LOW | Phase 1 | Fixed: `AudioContext` closed in `destroy()` |
| B7 — shared localStorage key | LOW | — | Not in v3 scope |
| B8 — dead `isMobile` flag | LOW | — | Not in v3 scope |
| B9 — `KeyF` missing `preventDefault` | LOW | Phase 2 | Fixed: `_FPKeyboard` v3 rewrite prevents default on all handled keys |
| B10 — playlist missing video codecs | LOW | Phase 1 | Partial: `fromCard()` parses `srcAac`; video path fix via existing `addSources` |

---

## 1. Class Architecture

The file is wrapped in an IIFE `(function(window, document) { 'use strict'; ... }(window, document))`. Inside it defines seven constructors (used as classes via prototype-based inheritance) plus two free-standing helper functions and a boot routine.

---

### Free-standing helpers

| Name | Signature | Purpose |
|---|---|---|
| `detectType` | `(container: HTMLElement) → 'audio' \| 'video'` | Reads `data-type`, then presence of video source attrs, then file extension of `data-src` |
| `addSources` | `(mediaEl, container, type) → void` | Appends `<source>` children to a media element using the dataset values of `container` |
| `pctToGain` | `(pct: number) → number` | Converts 0-100 linear percentage to quadratic gain (`(pct/100)²`) |

---

### `_FPCore` — media core

**Constructor params:** `container: HTMLElement`

**Properties set in constructor:**

| Property | Type | Initial value |
|---|---|---|
| `container` | HTMLElement | arg |
| `type` | `'audio' \| 'video'` | from `detectType()` |
| `title` | string | `data-title` or `''` |
| `artist` | string | `data-artist` or `''` |
| `thumb` | string | `data-thumb` or `''` |
| `duration` | number | `0` |
| `currentTime` | number | `0` |
| `isPlaying` | boolean | `false` |
| `mediaEl` | HTMLAudioElement \| HTMLVideoElement | built by `_buildMedia()` |
| `progressEl` | HTMLElement \| null | `.frado-player__progress` inside container |

**Methods:**

| Method | Description |
|---|---|
| `_buildMedia()` | Creates `<audio>` or `<video>` + wrapper div, appends `<source>` children, inserts into container DOM |
| `_bindMediaEvents()` | Attaches `timeupdate`, `loadedmetadata`, `ended`, `play`, `pause` listeners on `mediaEl` |
| `_bindSeekbar()` | Attaches `pointerdown`, `pointermove`, `pointerup` on `.frado-player__progress` |
| `_doSeek(e)` | Calculates seek position from pointer event and sets `mediaEl.currentTime` |
| `play()` | Calls `mediaEl.play()`, swallows rejected promise (autoplay policy) |
| `pause()` | Calls `mediaEl.pause()` |
| `toggle()` | Calls `play()` or `pause()` based on `isPlaying` |
| `seek(pct)` | Sets `mediaEl.currentTime` from a 0-100 percentage |
| `loadSrc(srcObj, title, durationStr)` | Swaps all `<source>` children, calls `mediaEl.load()`, resets UI state, fires `fp:trackloaded` |
| `destroy()` | Pauses, removes mediaEl/wrapper from DOM, nulls all references |
| `_el(selector)` | Shortcut for `container.querySelector(selector)` |
| `_fmt(sec)` | Formats seconds to `'m:ss'` string |
| `_fire(name, detail)` | Dispatches a non-bubbling `CustomEvent` on container |
| `_setPlayState(playing)` | Toggles play/pause icon visibility, CSS class `frado-player--playing`, updates `aria-label` on play button |

---

### `_FPSpectrum` — Web Audio visualizer

**Constructor params:** `container: HTMLElement`, `mediaEl: HTMLMediaElement`

**Properties:**

| Property | Type | Notes |
|---|---|---|
| `container` | HTMLElement | |
| `mediaEl` | HTMLMediaElement | |
| `_raf` | number \| null | rAF handle for the main draw loop |
| `_collapseRaf` | number \| null | rAF handle for the collapse animation |
| `_audioReady` | boolean | true after successful `_initAudio()` |
| `_audioCtx` | AudioContext \| null | |
| `_analyser` | AnalyserNode \| null | fftSize=2048, smoothing=0.8 |
| `_dataArray` | Uint8Array \| null | 1024 bins |
| `_bands` | Array of `{freq, binIndex, currentHeight}` | 30 logarithmic bands |
| `_canvas` | HTMLCanvasElement \| null | `.frado-player__spectrum` |
| `_ctx2d` | CanvasRenderingContext2D \| null | |
| `_dpr` | number | `window.devicePixelRatio \|\| 1` |
| `_canvasW` / `_canvasH` | number | CSS pixel dimensions |
| `_resizeObs` | ResizeObserver \| null | |
| `_onPlay` / `_onPause` / `_onEnded` | functions | Stored for later `removeEventListener` |
| `_resumeHandler` | function | One-time click/touchstart on document to resume suspended AudioContext |

**Methods:**

| Method | Description |
|---|---|
| `_initAudio()` | Creates AudioContext, AnalyserNode, MediaElementSourceNode; guards with `_fpSourceNode` sentinel to avoid double-connection |
| `_setupCanvas()` | Finds canvas element, gets 2D context, sets DPR, attaches ResizeObserver |
| `_resizeCanvas()` | Resets canvas physical pixel size to match CSS size × DPR, re-scales context |
| `_buildBands()` | Builds 30 logarithmically-spaced frequency band objects (20 Hz → 20 kHz) |
| `_draw()` | Main rAF loop: reads FFT data, updates `currentHeight` with fast-attack/slow-decay, draws filled bar gradient |
| `start()` | Initializes audio if needed, resumes AudioContext, cancels any collapse loop, starts `_draw()` |
| `stop()` | Cancels `_raf` |
| `collapse()` | Stops draw loop, runs a decay animation at ×0.85 per frame until all bands < 0.5 |
| `destroy()` | Stops loops, disconnects ResizeObserver, removes event listeners, closes AudioContext, clears canvas |

---

### `_FPVolume` — volume slider and mute

**Constructor params:** `container: HTMLElement`, `mediaEl: HTMLMediaElement`

**Properties:**

| Property | Type | Initial value |
|---|---|---|
| `container` | HTMLElement | |
| `mediaEl` | HTMLMediaElement | |
| `pct` | number | 70 (overridden by localStorage or `data-volume`) |
| `muted` | boolean | false (overridden by localStorage) |
| `_lastPct` | number | 70 — used to restore volume after unmute when pct is 0 |
| `_initialized` | boolean | false |
| `_hasStoredPrefs` | boolean | false |
| `_trackEl` | HTMLElement \| null | `.frado-player__volume-track` |
| `_fillEl` | HTMLElement \| null | `.frado-player__volume-fill` |
| `_thumbEl` | HTMLElement \| null | `.frado-player__volume-thumb` |
| `_muteBtn` | HTMLElement \| null | `.frado-player__btn--mute` |

**Methods:**

| Method | Description |
|---|---|
| `_initDrag()` | Pointer events on `_trackEl` for drag interaction |
| `_setFromEvent(e)` | Calculates pct from pointer x, auto-unmutes if dragging above 0 |
| `_initWheel()` | Mouse wheel on `.frado-player__volume-group`, ±5% per tick |
| `_initMuteBtn()` | Click handler on mute button |
| `toggleMute()` | Flips `muted`, stores/restores `_lastPct`, triggers haptic `navigator.vibrate(8)` |
| `setVolume(pct)` | Sets `pct`, applies, updates all UI, saves prefs |
| `_applyVolume()` | One-time reads `data-volume` attr if no stored prefs; then sets `mediaEl.volume = pctToGain(pct)` |
| `_updateFill()` | Updates `_fillEl` width (0 when muted) |
| `_updateThumb()` | Positions `_thumbEl` left offset in px |
| `_updateIcons()` | Shows one of four volume icons (muted / low / mid / high) |
| `_loadPrefs()` | Reads `frado-player-prefs` from localStorage; prefs stored as `{volume: 0-1, muted: bool}` |
| `_savePrefs()` | Writes current state to localStorage |
| `destroy()` | Nulls all DOM references |

---

### `_FPPlaylist` — track list

**Constructor params:** `container: HTMLElement`, `core: _FPCore`

**Properties:**

| Property | Type | Notes |
|---|---|---|
| `container` | HTMLElement | |
| `core` | _FPCore | |
| `currentIndex` | number | 0 |
| `tracks` | Array of track objects | Each has `{index, title, src, srcFlac, srcOpus, srcAac, srcMp3, duration, el}` |

**Methods:**

| Method | Description |
|---|---|
| `_readTracks()` | Reads all `.frado-player__track` elements; reads `data-*` and fallback text content |
| `_initClickHandlers()` | Attaches click listener on each track `el` → `loadTrack(index)` |
| `_initAutoAdvance()` | Listens for `fp:ended` on container → `next()` |
| `loadTrack(index)` | Bounds-checks index, calls `core.loadSrc()` then `core.play()`, applies active class |
| `next()` | Advances index with wraparound to 0 |
| `prev()` | If `currentTime > 3`, seeks to 0 instead of going back; otherwise wraps to last |
| `_applyActiveClass(i)` | Toggles `frado-player__track--active` on all track elements |
| `destroy()` | Clears `tracks` array |

---

### `_FPMediaSession` — Media Session API

**Constructor params:** `container`, `core`, `playlist`

**Properties:** `container`, `core`, `playlist`

**Methods:**

| Method | Description |
|---|---|
| `_updateMetadata()` | Sets `navigator.mediaSession.metadata` with title, artist, and thumbnail artwork |
| `destroy()` | Nulls all five action handlers (`play`, `pause`, `previoustrack`, `nexttrack`, `seekto`) |

Constructor exits early (no-op) if `'mediaSession' in navigator` is false.

---

### `_FPKeyboard` — keyboard shortcuts

**Constructor params:** `container`, `core`, `playlist`, `volume`

**Properties:** `container`, `core`, `playlist`, `volume`, `_handler` (bound keydown function)

**Methods:**

| Method | Description |
|---|---|
| `destroy()` | Removes `keydown` listener from `document` |

---

### `_FPBottomSheet` — mobile bottom sheet

**Constructor params:** `container: HTMLElement`

**Properties:**

| Property | Type |
|---|---|
| `container` | HTMLElement |
| `isOpen` | boolean |
| `isMobile` | boolean (window.innerWidth < 768, updated on resize) |
| `_backdrop` | HTMLElement \| null |
| `_sheet` | HTMLElement \| null |

**Methods:**

| Method | Description |
|---|---|
| `open()` | Sets display:block, forces reflow, adds `--open` class, sets `document.body.style.overflow = 'hidden'` |
| `close()` | Removes `--open` class, restores body overflow, hides elements after 320 ms via `setTimeout` |
| `_initBackdropClick()` | Backdrop click → `close()` |
| `_initDragHandle()` | Pointer drag on handle; if delta Y > 60 px → `close()` |
| `destroy()` | Restores `document.body.style.overflow` if open |

---

### `FradoPlayer` — orchestrator (public class)

**Constructor params:** `container: HTMLElement`

**Properties:**

| Property | Type |
|---|---|
| `core` | _FPCore |
| `volume` | _FPVolume |
| `spectrum` | _FPSpectrum |
| `playlist` | _FPPlaylist |
| `session` | _FPMediaSession |
| `keyboard` | _FPKeyboard |
| `sheet` | _FPBottomSheet |

**Methods:**

| Method | Description |
|---|---|
| `_toggleFullscreen()` | iOS uses `webkitEnterFullscreen` on video element; all others use Fullscreen API on container |
| `_togglePiP()` | Picture-in-Picture via `video.requestPictureInPicture()` / `document.exitPictureInPicture()` |
| `destroy()` | Calls `destroy()` on all sub-modules in order: core, spectrum, volume, playlist, session, keyboard |

---

## 2. State Management

### Playback state

`isPlaying` lives on `_FPCore` and is updated exclusively through the native `play` and `pause` events fired by the media element — not by the `play()` / `pause()` calls themselves. This is the correct pattern (state follows the browser, not the intent).

`currentTime` and `duration` are shadowed on `_FPCore` and updated in `timeupdate` / `loadedmetadata` listeners.

### Race conditions identified

1. **`loadSrc` followed immediately by `play()`** (`_FPPlaylist.loadTrack`, line 998-999): `core.loadSrc()` calls `mediaEl.load()` which is asynchronous. `core.play()` is called synchronously on the very next line. The media element may not have loaded any data yet. On slow networks this silently fails because the autoplay rejection is only `console.warn`'ed, leaving `isPlaying` out of sync (it stays `false` while the UI may have been reset). A proper fix would wait for `canplay` before calling `play()`.

2. **`isPlaying` vs `play` event timing**: `_FPCore.toggle()` reads `this.isPlaying` which is set by the media element's `play` event — not immediately on `mediaEl.play()`. If the user clicks rapidly, two concurrent `play()` calls can be dispatched before either resolves.

3. **`_initAudio()` called inside `start()`** after `fp:play`: If the AudioContext creation fails silently (e.g., browser quota exceeded), `_audioReady` remains false and `start()` exits. The spectrum never activates without feedback to the user.

4. **`_applyVolume` initialization flag**: `_initialized` is a guard to apply the `data-volume` attribute exactly once. However, `_applyVolume` is called from the constructor before `_initialized` is set to `true` via the guard block, so the one-time logic runs correctly. This is non-obvious and fragile.

---

## 3. Audio/Video Codec Selection Logic

Codec selection is entirely delegated to the browser's built-in `<source>` element selection algorithm. The code does not perform any explicit `canPlayType()` probing.

### Audio source priority order (highest → lowest)

```
1. audio/flac           (data-src-flac)
2. audio/ogg; codecs=opus  (data-src-opus)
3. audio/mp4            (data-src-aac)
4. audio/mpeg           (data-src-mp3)
5. audio/mpeg           (data-src)      — generic fallback
```

### Video source priority order (highest → lowest)

```
1. video/mp4; codecs="av01.0.08M.08"   (data-src-av1)
2. video/mp4; codecs="hvc1"            (data-src-hevc)
3. video/mp4; codecs="avc1.42E01E"     (data-src-h264)
4. video/mp4                           (data-src)
```

### Fragile points

- `addSources()` (used at build time) and the inline `sourceMap` array inside `loadSrc()` duplicate the same priority order. If the two diverge (e.g., a codec is added to one but not the other), live track-swapping will behave differently from the initial load.
- The `mime` type string for AAC is `audio/mp4`, not `audio/aac`. This is technically correct (M4A container) but may confuse future maintainers.
- `data-src` at position 5 in audio always gets mime `audio/mpeg` regardless of actual extension. A `.flac` file accidentally in `data-src` would be served with the wrong MIME type.
- No `canPlayType()` pre-screening. On browsers that support FLAC in `<audio>` but with an unusual MIME string, the source will be skipped silently.

---

## 4. Playlist Management

Tracks are stored as a plain Array (`this.tracks`) of plain-object literals parsed from the DOM in `_readTracks()`. The DOM is the source of truth; there is no reactive state layer.

### Storage structure

```js
{
  index:    Number,
  title:    String,
  src:      String,   // generic fallback URL
  srcFlac:  String,
  srcOpus:  String,
  srcAac:   String,
  srcMp3:   String,
  duration: String,   // display string ("3:42" or "—")
  el:       HTMLElement
}
```

Note: `srcAv1`, `srcHevc`, and `srcH264` are not included in the track object. Video playlists are not supported — `_FPPlaylist` only reads audio source attributes. Trying to use a playlist with a video-type player will silently load no sources for video codecs.

### Navigation

- `next()` wraps around to index 0 after the last track.
- `prev()` has a "restart if > 3 s" behaviour matching common media player UX.
- Auto-advance on `fp:ended` is always on; there is no shuffle or repeat mode.
- Initial track loading is conditional: only auto-loads track 0 if the container has no `data-src*` attributes set directly. If the container already has a src, track 0 is highlighted in the UI but the media element keeps the container src.

### Fragile points

- `destroy()` clears `this.tracks` but does not remove the click event listeners attached to each track's DOM element. Those listeners retain closures referencing `self` (the playlist instance), creating a leak if the DOM nodes outlive the player.
- There is no `loadTrack` call when the user navigates to a track that is already active — clicking the active track will restart it, which is arguably correct but undocumented.

---

## 5. Spectrum / Visualizer

### AudioContext setup

`_initAudio()` is called lazily from `start()` (which is triggered by `fp:play`). It:
1. Creates `AudioContext` with webkit fallback.
2. Creates `AnalyserNode`: fftSize=2048 (1024 frequency bins), smoothingTimeConstant=0.8.
3. Wraps the media element with `createMediaElementSource()`, guarded by a `_fpSourceNode` sentinel property on the element itself to prevent double-connection across destroy/reinit cycles.
4. Routes: `MediaElementSource → Analyser → destination`.

A secondary `_resumeHandler` is registered once on `document` for `click` and `touchstart` to resume a suspended AudioContext — a pattern required by autoplay policy. These are `{ once: true }` listeners so they self-remove.

### Canvas setup

`_setupCanvas()` runs in the constructor (before `_initAudio()`). It finds `.frado-player__spectrum`, gets a `2d` context, reads `devicePixelRatio`, and calls `_resizeCanvas()`. A `ResizeObserver` is attached to the canvas element itself.

`_resizeCanvas()` resets the canvas `width` / `height` physical pixels and re-calls `ctx.scale(dpr, dpr)`. **Bug**: each call to `_resizeCanvas()` applies an additional `ctx.scale()` transform on top of any previous one (the context transform is cumulative). On the second resize the scale becomes `dpr²`, third resize `dpr³`, etc. The fix is to call `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` instead of `ctx.scale()`.

### Band building

`_buildBands()` creates 30 bands at logarithmically-spaced frequencies from 20 Hz to 20 kHz using the formula `freq = 20 × 1000^(i/29)`. Each band stores the FFT bin index closest to that frequency and a `currentHeight` accumulator.

### Animation loop

`_draw()` is a self-scheduling rAF loop:
- Reads `getByteFrequencyData` into `_dataArray`.
- For each of 30 bands: fast-attack (instant set if target > current), slow-decay (exponential blend at weight 0.75/0.25).
- Draws a linear gradient bar (top: `#CA8A04`, bottom: `rgba(202,138,4,0.45)`) for each band with height > 0.
- Gap between bars is 2 px; bar width is `(W - 58) / 30` minimum 2 px.

`collapse()` runs a separate rAF loop that decays all `currentHeight` by 0.85 per frame until all bands fall below 0.5, then clears the canvas and stops.

### Potential issues

- The collapse loop draws without gradient (plain `#CA8A04`) — visually inconsistent with the play loop which uses a gradient.
- `_collapseRaf` and `_raf` can theoretically both be active simultaneously if `start()` is called while `collapse()` hasn't finished. `start()` only cancels `_collapseRaf` and skips starting `_draw()` if `_raf` is already set, which is correct. However, the `collapse()` call in `stop()` path could cancel `_raf` while leaving `_collapseRaf` pending — if `start()` then runs and re-cancels `_collapseRaf` but `_draw()` re-reads stale band heights from the collapse mid-animation, the bars may jump.

---

## 6. Event Handling

### Media element events (on `mediaEl`)

| Event | Handler | Effect |
|---|---|---|
| `timeupdate` | anonymous | Updates `currentTime`, progress fill width, ARIA `aria-valuenow`, elapsed time display; fires `fp:timeupdate` |
| `loadedmetadata` | anonymous | Sets `this.duration`, updates duration display; fires `fp:trackloaded` |
| `ended` | anonymous | Sets `isPlaying = false`, calls `_setPlayState(false)`, fires `fp:ended` |
| `play` | anonymous | Sets `isPlaying = true`, calls `_setPlayState(true)`, fires `fp:play` |
| `pause` | anonymous | Sets `isPlaying = false`, calls `_setPlayState(false)`, fires `fp:pause` |

### Seekbar events (on `.frado-player__progress`)

| Event | Handler |
|---|---|
| `pointerdown` | Sets `seeking = true`, captures pointer, calls `_doSeek` |
| `pointermove` | Calls `_doSeek` if `seeking` |
| `pointerup` | Sets `seeking = false` |

Note: `pointercancel` is not handled on the seekbar; if the pointer is cancelled (e.g., browser scroll takeover on touch), `seeking` flag stays `true` and subsequent moves will continue seeking spuriously.

### Volume events (on `_trackEl` / `.frado-player__volume-group` / `_muteBtn`)

| Element | Event | Handler |
|---|---|---|
| `_trackEl` | `pointerdown` | Start drag, capture pointer |
| `_trackEl` | `pointermove` | Drag volume |
| `_trackEl` | `pointerup` | End drag |
| `_trackEl` | `pointercancel` | End drag |
| `.frado-player__volume-group` | `wheel` | ±5% volume, `passive:false` |
| `_muteBtn` | `click` | `toggleMute()` |

### Button events (registered in `FradoPlayer` constructor)

| Selector | Event | Handler |
|---|---|---|
| `.frado-player__btn--prev` | `click` | `playlist.prev()` |
| `.frado-player__btn--next` | `click` | `playlist.next()` |
| `.frado-player__btn--play` | `click` | `core.toggle()` |
| `.frado-player__btn--fullscreen` | `click` | `_toggleFullscreen()` |
| `.frado-player__btn--pip` | `click` | `_togglePiP()` |

### Container CustomEvent listeners

| Event | Listener location | Handler |
|---|---|---|
| `fp:play` | `_FPSpectrum` constructor | `spectrum.start()` |
| `fp:pause` | `_FPSpectrum` constructor | `spectrum.collapse()` |
| `fp:ended` | `_FPSpectrum` constructor | `spectrum.collapse()` |
| `fp:ended` | `_FPPlaylist._initAutoAdvance` | `playlist.next()` |
| `fp:trackloaded` | `_FPMediaSession` constructor | `_updateMetadata()` |
| `fp:fullscreen-request` | `FradoPlayer` constructor | `_toggleFullscreen()` |

### Keyboard events (on `document`)

| Key | Action |
|---|---|
| `Space` | `core.toggle()` |
| `ArrowLeft` | Seek −5 s |
| `ArrowRight` | Seek +5 s |
| `ArrowUp` | Volume +5% |
| `ArrowDown` | Volume −5% |
| `KeyM` | `volume.toggleMute()` |
| `KeyF` | Dispatches `fp:fullscreen-request` (no `e.preventDefault()` — letter F may type in focused elements despite tag guard) |

Guard: skips if `document.activeElement` is INPUT, TEXTAREA, or SELECT. Also skips if the player does not have focus AND there is more than one `.frado-player` on the page.

### Window resize event (in `_FPBottomSheet`)

| Element | Event | Handler |
|---|---|---|
| `window` | `resize` | Updates `this.isMobile = window.innerWidth < 768` |

This listener is never removed — neither in `destroy()` nor in any cleanup path. A leak.

### Document one-time events (in `_FPSpectrum`)

| Element | Event | Options |
|---|---|---|
| `document` | `click` | `{ once: true }` |
| `document` | `touchstart` | `{ once: true }` |

Both listeners resume a suspended AudioContext.

---

## 7. Volume / Mute Logic

Volume is stored internally as a 0-100 integer percentage (`pct`). The quadratic curve `(pct/100)²` converts it to the 0.0–1.0 `mediaEl.volume` value, approximating equal-loudness perception.

### Preference persistence

Volume and mute state are written to `localStorage` key `"frado-player-prefs"` as `{volume: <0-1 float>, muted: <bool>}` on every `setVolume()` and `toggleMute()` call. All localStorage access is wrapped in try/catch (handles private browsing and storage quota).

### Priority order for initial volume

1. localStorage `frado-player-prefs.volume` (highest priority — set `_hasStoredPrefs = true`)
2. `data-volume` attribute on the container (0.0–1.0 float, applied if no stored prefs)
3. Hardcoded default of 70% (lowest priority)

### Mute behaviour

- On mute: stores `_lastPct` (current pct or 70 if pct is 0), sets `mediaEl.muted = true`. The slider visually drops to 0 but `this.pct` is preserved.
- On unmute: restores `mediaEl.muted = false`. If `pct` was 0, calls `setVolume(_lastPct)` to restore audible level.
- Dragging the slider to > 0 while muted automatically unmutes.
- Mouse wheel on volume group above 0 also unmutes.

### Fragile points

- `_applyVolume()` checks `!this._initialized` to do the one-time `data-volume` read, but sets `this._initialized = true` inside that guard, then falls through to set `mediaEl.volume`. If `this.muted` is true (loaded from prefs), the `if (!this.muted)` block is skipped and `mediaEl.volume` is never initialized. On first unmute the volume will be whatever the browser default is rather than `pctToGain(this.pct)`.

---

## 8. Fullscreen Logic

Implemented in `FradoPlayer._toggleFullscreen()`.

### iOS path

Detected via `userAgent` match `iPad|iPhone|iPod` and absence of `window.MSStream`. If a `<video>` element is present, calls `videoEl.webkitEnterFullscreen()` and returns. There is no exit-fullscreen path for iOS — `webkitEnterFullscreen` handles its own exit via the system UI.

### Standard Fullscreen API path

Attempts to put `container.querySelector('.frado-player')` into fullscreen. If that selector returns null (e.g., the container IS the `.frado-player`), it falls back to `container`. Uses both standard `requestFullscreen` / `exitFullscreen` and webkit-prefixed variants.

There is no listener for `fullscreenchange` or `webkitfullscreenchange` events, meaning:
- No CSS class is toggled to indicate fullscreen state.
- No button icon change on enter/exit.
- If fullscreen is exited via the Escape key, the UI remains in whatever visual state it was.

### Picture-in-Picture

`FradoPlayer._togglePiP()` uses the standard PiP API. It checks `document.pictureInPictureEnabled` but does not check `videoEl.disablePictureInPicture`. Errors are silently swallowed with `.catch(function(){})`.

---

## 9. Destroy Method — Cleanup and Leak Analysis

`FradoPlayer.destroy()` calls `destroy()` on each sub-module:

| Sub-module | What is cleaned up | Potential leak |
|---|---|---|
| `_FPCore.destroy()` | Pauses media, removes mediaEl / video-wrap from DOM, nulls `mediaEl`, `progressEl`, `container` | Media element event listeners (`timeupdate`, `loadedmetadata`, `ended`, `play`, `pause`) are NOT explicitly removed. They are implicitly removed when the element is garbage-collected, but until GC runs, events may fire on a detached element. `_bindSeekbar` listeners also not removed. |
| `_FPSpectrum.destroy()` | Cancels both rAF loops, disconnects ResizeObserver, removes container `fp:*` listeners, closes AudioContext, clears canvas, nulls all refs | The `document` click/touchstart resume-handlers are `{ once: true }` — if they haven't fired yet, they remain on document forever (minor). |
| `_FPVolume.destroy()` | Nulls DOM element references | Does NOT remove the pointer/wheel/click event listeners attached to `_trackEl` and `_muteBtn`. Those elements still have live closures referencing the destroyed `_FPVolume` instance. |
| `_FPPlaylist.destroy()` | Clears `this.tracks` array | Click listeners on individual track elements are NOT removed. The `fp:ended` auto-advance listener on the container is NOT removed. Both retain live closures referencing the destroyed playlist instance. |
| `_FPMediaSession.destroy()` | Nulls all Media Session action handlers | No internal references to null. Clean. |
| `_FPKeyboard.destroy()` | Removes `document` keydown listener | Clean. |
| `_FPBottomSheet` | Not called from `FradoPlayer.destroy()` — **omitted entirely** | The `window` resize listener added in the constructor is never removed. `document.body.style.overflow` is restored only if `isOpen` is true. |

### Summary of confirmed leaks

1. `_FPVolume`: pointer/wheel/click listeners not removed on destroy.
2. `_FPPlaylist`: per-track click listeners and `fp:ended` listener not removed on destroy.
3. `_FPBottomSheet`: `window` resize listener never removed; `destroy()` not called from `FradoPlayer.destroy()`.
4. `_FPCore`: media element's five event listeners not removed (relying on GC).

---

## 10. Public API

The following are exposed after `new FradoPlayer(container)`:

### Properties

| Property | Type | Description |
|---|---|---|
| `instance.core` | `_FPCore` | Direct access to media core |
| `instance.core.mediaEl` | HTMLMediaElement | The underlying `<audio>` / `<video>` element |
| `instance.core.isPlaying` | boolean | Current play state |
| `instance.core.currentTime` | number | Mirrored currentTime (seconds) |
| `instance.core.duration` | number | Mirrored duration (seconds) |
| `instance.core.title` | string | Current track title |
| `instance.volume` | `_FPVolume` | Volume module |
| `instance.volume.pct` | number | Current volume 0-100 |
| `instance.volume.muted` | boolean | Current mute state |
| `instance.playlist` | `_FPPlaylist` | Playlist module |
| `instance.playlist.tracks` | Array | All parsed track objects |
| `instance.playlist.currentIndex` | number | Index of active track |
| `instance.spectrum` | `_FPSpectrum` | Visualizer module |
| `instance.session` | `_FPMediaSession` | MediaSession module |
| `instance.keyboard` | `_FPKeyboard` | Keyboard module |
| `instance.sheet` | `_FPBottomSheet` | Bottom sheet module |

### Methods

| Method | Description |
|---|---|
| `instance.destroy()` | Tears down all modules |
| `instance.core.play()` | Start playback (returns Promise) |
| `instance.core.pause()` | Pause playback |
| `instance.core.toggle()` | Toggle play/pause |
| `instance.core.seek(pct)` | Seek to 0-100% position |
| `instance.core.loadSrc(srcObj, title, durationStr)` | Load a new media source |
| `instance.volume.setVolume(pct)` | Set volume 0-100 |
| `instance.volume.toggleMute()` | Toggle mute |
| `instance.playlist.loadTrack(index)` | Jump to track by index |
| `instance.playlist.next()` | Advance to next track |
| `instance.playlist.prev()` | Go to previous track (or restart) |

### CustomEvents fired on the container element

| Event | `detail` payload | When |
|---|---|---|
| `fp:play` | `{}` | Media element fires `play` |
| `fp:pause` | `{}` | Media element fires `pause` |
| `fp:ended` | `{}` | Media element fires `ended` |
| `fp:timeupdate` | `{currentTime, duration, pct}` | Media element fires `timeupdate` |
| `fp:trackloaded` | `{title, duration}` | After `loadedmetadata` or `loadSrc()` |

All events have `bubbles: false`.

---

## 11. Globals and Side Effects

### Written to `window`

```js
window.FradoPlayer      = FradoPlayer;       // constructor
window.bootFradoPlayers = bootFradoPlayers;  // boot function
```

### Written to `element._fradoPlayer`

Each `.frado-player` element gets `el._fradoPlayer = new FradoPlayer(el)` during boot. This is a direct property on a DOM element — not on `window`, but it is a global side effect that prevents double-init.

### Written to `element._fpSourceNode`

The audio media element receives `mediaEl._fpSourceNode` storing the `MediaElementSourceNode`. This guards against double-connection to the AudioContext. It is never cleaned up in `destroy()`.

### Written to `localStorage`

Key `"frado-player-prefs"` stores `{volume, muted}`. All players on the same origin share this key. Multiple players on the same page will overwrite each other's preferences.

### Written to `document.body.style.overflow`

Set to `'hidden'` by `_FPBottomSheet.open()`, restored to `''` by `close()`. Direct style mutation on `<body>` can conflict with other scroll-locking mechanisms on the page.

### Boot side effect

On script load, if `document.readyState !== 'loading'` (i.e., the script is loaded deferred or async), `bootFradoPlayers()` runs immediately and queries all `.frado-player` elements. No `window.onload` wait.

---

## 12. Identified Bugs and Fragile Code

### B1 — `_resizeCanvas()` accumulates scale transforms (HIGH)

Every call to `_resizeCanvas()` runs `ctx.scale(dpr, dpr)` on the existing context state. The canvas `width` / `height` reset resets the bitmap but does NOT reset the context transform matrix. After two resizes at DPR=2, all drawing coordinates are scaled by 4×. Bars become 4× taller and offset incorrectly.

**Location:** `_FPSpectrum.prototype._resizeCanvas`, line ~489.

**v3 Fix:** Replace `ctx.scale(dpr, dpr)` with `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` -- Phase 1.

### B2 — `pointercancel` not handled on seekbar (MEDIUM)

If the browser cancels the pointer during a seek (e.g., an iOS scroll gesture takes over), the `seeking` flag stays `true` and the next `pointermove` event will continue seeking unexpectedly.

**Location:** `_FPCore.prototype._bindSeekbar`, lines ~194–208.

**v3 Fix:** Add `pointercancel` handler to reset `_seeking` flag -- Phase 1.

### B3 — `core.loadSrc()` then `core.play()` without waiting for `canplay` (MEDIUM)

`loadTrack()` calls `play()` synchronously after `loadSrc()` which calls `mediaEl.load()`. The media element likely has no data buffered. On slow connections or when the browser needs to re-negotiate a codec, this fails silently (autoplay rejection logged as `console.warn` only).

**Location:** `_FPPlaylist.prototype.loadTrack`, line ~998-999.

**v3 Fix:** Wrap `play()` in `canplay` listener inside `loadTrack` -- Phase 1.

### B4 — `_applyVolume` skips setting `mediaEl.volume` when muted on load (MEDIUM)

If `localStorage` muted state is `true`, `this.muted` is set in `_loadPrefs()`. Then `_applyVolume()` is called in the constructor. Because `if (!this.muted)` is false, `mediaEl.volume` is never set. The browser's default volume (usually 1.0) is used until the user unmutes.

**Location:** `_FPVolume.prototype._applyVolume`, lines ~819-822.

**v3 Fix:** Initialize `mediaEl.volume` before muting -- Phase 1.

### B5 — `_FPBottomSheet` not destroyed in `FradoPlayer.destroy()` (MEDIUM)

`this.sheet` is instantiated in the `FradoPlayer` constructor but `destroy()` never calls `this.sheet.destroy()`. The `window` resize listener is orphaned on every player teardown.

**Location:** `FradoPlayer.prototype.destroy`, lines ~1321-1328.

**v3 Fix:** Add `destroy()` call in `FradoPlayer.destroy()` -- Phase 1.

### B6 — `mediaEl._fpSourceNode` never removed on destroy (LOW)

The sentinel property persists on the detached DOM element. If the same element were reused (unlikely but possible in SPA frameworks), `_initAudio()` would skip creating a new source node, connecting the old orphaned node instead of the new AudioContext.

**Location:** `_FPSpectrum.prototype._initAudio`, line ~454.

**v3 Fix:** Close `AudioContext` in `destroy()` and delete `_fpSourceNode` sentinel -- Phase 1.

### B7 — Multiple players share one localStorage key (LOW)

If two `FradoPlayer` instances are on the same page, the last one to call `setVolume()` or `toggleMute()` wins in localStorage. On the next page load, all players restore to whatever the last active player saved. Expected behaviour would be per-player keying (e.g., include container `id`).

**Location:** `_FPVolume.prototype._loadPrefs` / `_savePrefs`, lines ~871–896.

**v3 Fix:** Not in v3 scope.

### B8 — `_FPBottomSheet` `isMobile` updated but never consumed (LOW)

`isMobile` is set in the constructor and on `window.resize`, but none of the open/close/drag methods branch on it. The flag is dead code.

**Location:** `_FPBottomSheet`, lines ~1172 and ~1183-1185.

**v3 Fix:** Not in v3 scope.

### B9 — `KeyF` fullscreen dispatch lacks `e.preventDefault()` (LOW)

Pressing F while no text field is focused dispatches `fp:fullscreen-request` but the keydown event is not prevented. In a page with a search input that is not focused, pressing F may still have side effects depending on the browser / ARIA roles.

**Location:** `_FPKeyboard` handler, lines ~1152-1156.

**v3 Fix:** `_FPKeyboard` v3 rewrite (Phase 2) calls `e.preventDefault()` on all handled keys.

### B10 — `_FPPlaylist._readTracks` does not read `srcAv1`/`srcHevc`/`srcH264` (LOW)

Video codec sources are omitted from the track data structure. A video player using a playlist would always load blank video source objects.

**Location:** `_FPPlaylist.prototype._readTracks`, lines ~950-961.

**v3 Fix:** Phase 1 partial -- `fromCard()` parses `srcAac`; existing video path fix via `addSources` refactor.

---

## Memory Leaks -- v3 Status

| Leak | Module | v3 Fix | Phase |
|------|--------|--------|-------|
| Pointer/wheel/click event listeners not removed | `_FPVolume` | Add `removeEventListener` in `destroy()` | Phase 1 |
| Per-track click listeners and `fp:ended` listener not removed | `_FPPlaylist` | Add `removeEventListener` in `destroy()` | Phase 1 |
| `mediaEl._fpSourceNode` sentinel never cleaned up | `_FPSpectrum` | Close `AudioContext` and delete sentinel in `destroy()` | Phase 1 |
| `window` resize listener never removed; `destroy()` not called | `_FPBottomSheet` | Add to `FradoPlayer.destroy()` call chain; add `removeEventListener` in `_FPBottomSheet.destroy()` | Phase 1 |

---

## 13. Missing Features vs v3 Needs

### Keyboard shortcuts — partial coverage

Present: Space (toggle), Arrow keys (seek ±5 s, volume ±5%), M (mute), F (fullscreen request).

Missing vs typical v3 requirements:
- `Home` / `End` — jump to start / end of track.
- `0`–`9` — jump to 0%–90% of track.
- `N` / `P` — next / previous track (without reaching into the playlist module's `next()`/`prev()` directly).
- `L` or `R` — repeat / shuffle toggle (neither feature exists).
- No visual keyboard shortcut hint overlay (e.g., an on-screen toast showing "⏸" on spacebar).

### ARIA live regions — absent

No `aria-live` region is updated when the track changes. A screen reader user pressing next/prev gets no announcement of the new track title. The current implementation only updates:
- `aria-valuenow` on the progress bar and volume track (present).
- `aria-label` on the play/pause button (present).

Missing:
- `aria-live="polite"` region for track title / artist changes.
- `role="status"` for "Now playing: X" announcements.
- `aria-label` on prev/next buttons (they may exist in HTML, but the JS never updates them for the active track).

**v3 Status:** Added in Phase 2 -- `_FPAccessibility` class manages `aria-live="polite"` region, `aria-busy`, `aria-pressed`, `aria-current`, and focus restoration.

### `prefers-reduced-motion` — absent

The spectrum visualizer and the collapse animation run unconditionally. Users with vestibular disorders who have set `prefers-reduced-motion: reduce` in their OS still get the animated canvas. No check for `window.matchMedia('(prefers-reduced-motion: reduce)')` is performed anywhere.

The bottom sheet open/close animation relies on a CSS class transition (320 ms `setTimeout`); the timeout is hardcoded and not conditioned on motion preference.

**v3 Status:** Phase 4 CSS block -- `@media (prefers-reduced-motion: reduce)` sets all `--fp-duration-*` tokens to `0ms`.

### Error recovery — minimal

- Codec/source errors (`error` event on `<source>` or `mediaEl`) are not handled. No `error` event listener exists. If all sources fail, the player silently shows no duration and stays paused indefinitely with no user feedback.
- Network stall (`waiting`, `stalled` events) is not handled. No loading spinner or buffering indicator logic exists.
- `mediaEl.error.code` / `mediaEl.networkState` are never inspected.
- AudioContext creation failure in `_initAudio()` logs a warning but does not hide the spectrum canvas or show a fallback (e.g., a static waveform image).

**v3 Status:** Phase 1 partial -- `_FPState` adds `error` state; `_FPCore` fires `fp:error` on media error. Full stall/buffering UI deferred.

### Additional missing v3 features (not in spec sections above)

- **Shuffle mode**: no `shuffle` property or randomised next/prev. **v3 Status:** Not in v3 scope.
- **Repeat modes**: no single-track repeat or playlist loop toggle. **v3 Status:** Not in v3 scope (but `loop` shortcode attribute added in Phase 4 for single-track loop).
- **Buffered progress**: no visual display of buffered ranges (`mediaEl.buffered`). **v3 Status:** Not in v3 scope.
- **Playback speed control**: no rate selector. **v3 Status:** Not in v3 scope.
- **Chapter/cue support**: no `VTTCue` or `TextTrack` integration. **v3 Status:** Not in v3 scope.
- **Lazy loading / intersection observer**: all players boot eagerly on DOMContentLoaded; off-screen players still create AudioContext connections. **v3 Status:** Not in v3 scope.
- **Download button**: not present. **v3 Status:** Not in v3 scope.
- **Share / embed**: not present. **v3 Status:** Not in v3 scope.
- **`_FPPlaylist` video codec attributes**: track objects do not include `srcAv1`/`srcHevc`/`srcH264`. **v3 Status:** Phase 1 -- `fromCard()` parses `srcAac`; existing video path fix via `addSources` refactor.
