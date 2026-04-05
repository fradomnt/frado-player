# Frado Player v3 — WordPress Theme Integration Guide

**Plugin:** `frado-player/frado-player.php`
**Shortcode:** `[frado_player]`
**Maintained by:** fradomnt
**Last updated:** 2026-04-02

---

## Table of Contents

1. [Overview](#1-overview)
2. [The fromCard() Factory Pattern](#2-the-fromcard-factory-pattern)
3. [Modal Integration Pattern — openArtistModal()](#3-modal-integration-pattern--openartistmodal)
4. [closeArtistModal() Pattern](#4-closeartistmodal-pattern)
5. [Event System](#5-event-system)
6. [Card Data Attributes Reference](#6-card-data-attributes-reference)
7. [Theme Bug Fixes Required](#7-theme-bug-fixes-required)
8. [v2 Backward Compatibility Notes](#8-v2-backward-compatibility-notes)

---

## 1. Overview

### What Changed in v3

v3 introduces **`FradoPlayer.fromCard()`** — a static factory method that replaces the manual data-attribute marshaling, playlist DOM building, and double-setTimeout initialization that the theme previously had to do.

**Before (v2):** The theme read `data-fp-*` attributes from the card, wrote them onto a persistent `.frado-player` element, manually built `<li>` elements for the playlist, then used a 60ms + 150ms `setTimeout` chain to instantiate and autoplay.

**After (v3):** The theme calls one method. The plugin handles everything internally.

```js
// v3 — one line replaces ~40 lines of v2 theme code
var instance = FradoPlayer.fromCard(card, fpEl);
```

### Who Owns What

| Layer | Responsibility |
|---|---|
| **Plugin** (`frado-player.php` + `frado-player.js`) | Renders `<audio>`/`<video>` DOM, manages AudioContext, handles codec fallback, fires events, parses card data attributes, builds playlist DOM |
| **Theme PHP** | Renders cards with `data-fp-*` attributes, provides the `.frado-player` container element inside the modal |
| **Theme JS** | Calls `FradoPlayer.fromCard()` after showing the modal, calls `instance.destroy()` on modal close, reacts to player events |

The theme must **never**:
- Create `Audio()` or `HTMLAudioElement` objects directly
- Set `audio.src` or `video.src` from theme JavaScript
- Call `audio.play()` or `audio.pause()` directly
- Manipulate `.frado-player__*` DOM internals
- Build playlist `<li>` elements manually (the plugin does this now)

---

## 2. The fromCard() Factory Pattern

### Signature

```js
FradoPlayer.fromCard(cardEl, containerEl)
```

| Parameter | Type | Description |
|---|---|---|
| `cardEl` | `HTMLElement` | The `.frado-album-card` element. Must have `data-fp-*` attributes. |
| `containerEl` | `HTMLElement` | The `.frado-player` wrapper div inside the modal. Must already be visible in the DOM (not `display:none`). |

**Returns:** `FradoPlayer` instance, already playing.

### Card Element Requirements

The card element must carry `data-fp-*` attributes that describe the media. See [Section 6](#6-card-data-attributes-reference) for the full reference.

Minimal example:

```html
<div class="frado-album-card"
     data-fp-title="Nome da Faixa"
     data-fp-artist="Artista"
     data-fp-src-mp3="/audio/faixa.mp3"
     data-fp-duration="3:42">
    ...
</div>
```

### Container Element Requirements

The container must be a `.frado-player` element with the correct internal DOM structure (as rendered by the `[frado_player]` shortcode). Specifically, it must contain:

- `.frado-player__header`
- `.frado-player__progress` (with `role="slider"`)
- `.frado-player__controls` (containing `.frado-player__transport`, `canvas.frado-player__spectrum`, `.frado-player__volume-group`)
- `ol.frado-player__playlist`

The container must be **visible** (not `display:none`) when `fromCard()` is called. This is because the spectrum canvas needs measurable dimensions to initialize correctly.

### What fromCard() Does Internally (Step by Step)

```
1. Read data-fp-* attributes from cardEl
2. Write corresponding data-* attributes onto containerEl
   (data-type, data-title, data-artist, data-thumb, data-src,
    data-src-mp3, data-src-flac, data-src-opus, data-src-aac,
    data-duration, data-volume)
3. Parse data-fp-tracks CSV into <li> DOM elements inside
   containerEl's <ol class="frado-player__playlist">
4. Instantiate new FradoPlayer(containerEl)
5. Call instance.play() immediately
   — no setTimeout needed because:
     a. The card click IS the user gesture (AudioContext can start)
     b. The container is already visible (canvas has dimensions)
6. Return the instance
```

### Before and After: Complete Comparison

**v2 — Theme had to know plugin internals:**

```javascript
// ~40 lines of manual data marshaling + DOM building + setTimeout chain
var hasFP = card.dataset.fpTracks || card.dataset.fpSrcMp3 || card.dataset.fpSrc;
if (hasFP) {
    fpEl.dataset.type     = 'audio';
    fpEl.dataset.title    = card.dataset.fpTitle || '';
    fpEl.dataset.artist   = card.dataset.fpArtist || '';
    fpEl.dataset.thumb    = card.dataset.fpThumb || '';
    fpEl.dataset.src      = card.dataset.fpSrc || '';
    fpEl.dataset.srcMp3   = card.dataset.fpSrcMp3 || '';
    fpEl.dataset.srcFlac  = card.dataset.fpSrcFlac || '';
    fpEl.dataset.srcOpus  = card.dataset.fpSrcOpus || '';
    fpEl.dataset.srcAac   = card.dataset.fpSrcAac || '';
    fpEl.dataset.duration = card.dataset.fpDuration || '';
    fpEl.dataset.volume   = '0.7';

    // Manual playlist DOM construction
    var playlistEl = fpEl.querySelector('.frado-player__playlist');
    playlistEl.innerHTML = '';
    var fpTracksStr = card.dataset.fpTracks || '';
    if (fpTracksStr) {
        fpTracksStr.split(',').forEach(function(item, idx) {
            var parts = item.split('|');
            var li = document.createElement('li');
            li.className = 'frado-player__track';
            li.dataset.title   = parts[0] || 'Faixa ' + (idx + 1);
            li.dataset.src     = parts[1] || '';
            li.dataset.srcFlac = parts[2] || '';
            li.dataset.srcOpus = parts[3] || '';
            li.dataset.duration = parts[4] || '';
            if (idx === 0) li.classList.add('frado-player__track--active');
            li.innerHTML = '<span>' + li.dataset.title + '</span><span>' + li.dataset.duration + '</span>';
            playlistEl.appendChild(li);
        });
    }

    // Double setTimeout — fragile on slow devices
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
}
```

**v3 — Theme calls one method:**

```javascript
if (window.FradoPlayer && FradoPlayer.fromCard) {
    fpEl._fradoPlayer = FradoPlayer.fromCard(card, fpEl);
}
```

---

## 3. Modal Integration Pattern — openArtistModal()

### Complete Pattern

```javascript
function openArtistModal(card) {
    var modal = document.getElementById('fradoArtistModal');

    // --- 1. Populate modal metadata (unchanged from v2) ---
    var artistName = (card.querySelector('.frado-album-card__artist-name') || {}).textContent || '';
    var albumTitle = (card.querySelector('.frado-album-card__title') || {}).textContent || '';
    var roleMeta   = (card.querySelector('.frado-album-card__meta') || {}).textContent || '';
    var badgeText  = (card.querySelector('.frado-album-card__type') || {}).textContent || '';

    document.getElementById('fradoModalArtistName').textContent = artistName;
    document.getElementById('fradoModalTitle').textContent      = albumTitle;
    // ... other metadata fields, external links, cover background ...

    // --- 2. Show modal FIRST ---
    // IMPORTANT: The modal must be visible before fromCard() is called.
    // The spectrum canvas needs measurable dimensions to initialize.
    // This is why the v2 setTimeout was needed — it waited for display
    // to propagate. In v3, we simply show the modal first.
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // --- 3. Initialize player ---
    var fpEl = document.getElementById('fradoFPPlayer');

    if (window.FradoPlayer && FradoPlayer.fromCard) {
        // v3 path — one call does everything
        fpEl._fradoPlayer = FradoPlayer.fromCard(card, fpEl);
    } else if (window.FradoPlayer) {
        // Graceful degradation — v2 plugin still loaded
        // Fall back to manual data marshaling (keep v2 code as fallback)
        fpEl._fradoPlayer = new FradoPlayer(fpEl);
    }

    // --- 4. History state ---
    history.pushState({ fpModal: true }, '');
    window._fpModalStatePushed = true;
}
```

### Why No setTimeout Is Needed

The v2 code had two `setTimeout` calls:

| Delay | v2 Purpose | v3 Solution |
|---|---|---|
| 60ms | Wait for `display:none` to `display:block` to propagate so the canvas could measure its dimensions | Call `fromCard()` **after** `modal.classList.add('active')` — the container is already visible |
| 150ms | Wait for AudioContext to be unlockable after the user gesture | The card click **is** the user gesture. `play()` is safe immediately within the same event handler call stack |

### The Graceful Degradation Fallback

The `if/else` pattern above ensures the theme works with both v2 and v3 versions of the plugin:

```javascript
if (window.FradoPlayer && FradoPlayer.fromCard) {
    // v3 plugin is loaded — use the factory
    fpEl._fradoPlayer = FradoPlayer.fromCard(card, fpEl);
} else if (window.FradoPlayer) {
    // v2 plugin is loaded — fromCard() does not exist yet
    // Keep the v2 manual initialization as fallback
    fpEl._fradoPlayer = new FradoPlayer(fpEl);
}
```

This allows the theme to ship the v3 integration code before the plugin update is deployed. When the plugin updates, `fromCard()` becomes available and the cleaner path activates automatically.

---

## 4. closeArtistModal() Pattern

### Complete Pattern

```javascript
function closeArtistModal() {
    var modal = document.getElementById('fradoArtistModal');
    if (!modal.classList.contains('active')) return;

    // --- 1. Destroy player BEFORE removing DOM ---
    // destroy() releases AudioContext, removes all listeners,
    // cancels all RAF loops, and nulls all DOM references.
    var fpEl = document.getElementById('fradoFPPlayer');
    if (fpEl && fpEl._fradoPlayer) {
        try {
            fpEl._fradoPlayer.destroy();
        } catch (e) {
            // Defensive: destroy() should never throw, but guard anyway
        }
        fpEl._fradoPlayer = null;
    }

    // --- 2. Hide modal ---
    modal.classList.remove('active');
    document.body.style.overflow = '';

    // --- 3. Sync history state ---
    if (window._fpModalStatePushed) {
        window._fpModalStatePushed = false;
        history.back();
    }
}

// Browser back button closes modal without navigating away
window.addEventListener('popstate', function() {
    var modal = document.getElementById('fradoArtistModal');
    if (modal && modal.classList.contains('active')) {
        window._fpModalStatePushed = false;
        closeArtistModal();
    }
});
```

### What destroy() Guarantees

After `destroy()` returns, the following is true:

| # | Guarantee |
|---|---|
| 1 | Media element is paused and removed from DOM |
| 2 | AudioContext is closed |
| 3 | All event listeners are removed (including `_FPBottomSheet`'s `window` resize listener) |
| 4 | All `requestAnimationFrame` loops are cancelled |
| 5 | All internal property references are nulled |

**Critical:** Always set the reference to `null` after calling `destroy()`:

```javascript
fpEl._fradoPlayer.destroy();
fpEl._fradoPlayer = null;  // prevents stale reference + double-destroy
```

**Critical:** Always call `destroy()` before replacing innerHTML or hiding the container. Skipping `destroy()` leaves the previous AudioContext running in the background, consuming memory and potentially producing audio that cannot be stopped.

`destroy()` is idempotent — calling it multiple times on the same instance is safe.

---

## 5. Event System

### Subscribing and Unsubscribing

FradoPlayer instances expose `.on(event, callback)` and `.off(event, callback)`:

```javascript
var instance = FradoPlayer.fromCard(card, fpEl);

// Subscribe — do this right after getting the instance
instance.on('play', function(detail) {
    card.classList.add('is-playing');
});

instance.on('pause', function(detail) {
    card.classList.remove('is-playing');
});

instance.on('trackchange', function(detail) {
    document.getElementById('fradoModalTitle').textContent = detail.title;
});

instance.on('error', function(detail) {
    console.error('[FradoPlayer] Playback error:', detail.message);
});

instance.on('end', function(detail) {
    closeArtistModal();
});

// Unsubscribe — use the same function reference
function onTimeUpdate(detail) {
    console.log(detail.pct + '% played');
}
instance.on('timeupdate', onTimeUpdate);
// Later:
instance.off('timeupdate', onTimeUpdate);
```

### Complete Event Reference

| Event | Detail Payload | Fired When |
|---|---|---|
| `'play'` | `{ title }` | Playback starts or resumes |
| `'pause'` | `{}` | Playback pauses |
| `'ended'` | `{}` | The last track in the playlist ends (no auto-advance remaining) |
| `'trackchange'` | `{ index, title, duration }` | Active playlist track changes (user skip or auto-advance) |
| `'error'` | `{ message }` | Source fails to load or decode |
| `'timeupdate'` | `{ currentTime, duration, pct }` | Fires continuously during playback (~4Hz). `pct` is 0-100. |
| `'volumechange'` | `{ volume, muted }` | Volume level changes or mute toggles. `volume` is 0-100. |

### Internal CustomEvent Mapping

These are the `CustomEvent` names fired on the container element. The `.on()` API maps them to the public names above:

| Internal CustomEvent | Public `.on()` Name |
|---|---|
| `fp:play` | `'play'` |
| `fp:pause` | `'pause'` |
| `fp:ended` | `'ended'` |
| `fp:trackloaded` | `'trackchange'` |
| `fp:error` | `'error'` |
| `fp:timeupdate` | `'timeupdate'` |
| `fp:volumechange` | `'volumechange'` |

---

## 6. Card Data Attributes Reference

These are the `data-fp-*` attributes that `fromCard()` reads from the card element. Set them in your PHP template.

### Media Source Attributes

| Attribute | Type | Required | Description |
|---|---|---|---|
| `data-fp-src` | URL | No | Generic source (type auto-detected by file extension) |
| `data-fp-src-mp3` | URL | No | MP3 audio source |
| `data-fp-src-flac` | URL | No | FLAC audio source |
| `data-fp-src-opus` | URL | No | Opus audio source |
| `data-fp-src-aac` | URL | No | AAC audio source |
| `data-fp-src-av1` | URL | No | AV1 video source |
| `data-fp-src-hevc` | URL | No | HEVC/H.265 video source |
| `data-fp-src-h264` | URL | No | H.264 video source |

At least one source attribute is required. The player picks the first format the browser supports. Codec preference order: FLAC > Opus > AAC > MP3 (audio), AV1 > HEVC > H.264 (video).

### Metadata Attributes

| Attribute | Type | Default | Description |
|---|---|---|---|
| `data-fp-title` | string | `Sem titulo` | Track or album title |
| `data-fp-artist` | string | _(empty)_ | Artist name |
| `data-fp-thumb` | URL | _(empty)_ | Album art / thumbnail URL |
| `data-fp-duration` | string | `0:00` | Display duration (e.g. `3:42`) |
| `data-fp-type` | `audio` / `video` | `audio` | Force media type. If omitted, auto-detected from sources. |

### Playlist Attribute

| Attribute | Type | Description |
|---|---|---|
| `data-fp-tracks` | string | CSV playlist. See format below. |

**Track string format:** Each track is a `|`-delimited record. Tracks are separated by `,`:

```
title|mp3_url|flac_url|opus_url|aac_url|duration|thumb_url
```

| Position | Field | Notes |
|---|---|---|
| 0 | `title` | Track name. Falls back to `Faixa N` if blank. |
| 1 | `mp3` | MP3 URL |
| 2 | `flac` | FLAC URL (optional) |
| 3 | `opus` | Opus URL (optional) |
| 4 | `aac` | AAC URL (optional, new in v3) |
| 5 | `duration` | Display string e.g. `4:02` (position shifted from v2 index 4) |
| 6 | `thumb` | Per-track thumbnail URL (optional, new in v3) |

All fields after `mp3` are optional and default to empty string. The v3 parser is backward compatible with the v2 5-field format.

### PHP Example — Card with All Attributes

```php
<div class="frado-album-card"
     tabindex="0"
     role="button"
     data-fp-title="<?php echo esc_attr( $artist['album_title'] ); ?>"
     data-fp-artist="<?php echo esc_attr( $artist['name'] ); ?>"
     data-fp-thumb="<?php echo esc_attr( $artist['cover_url'] ); ?>"
     data-fp-type="<?php echo esc_attr( $artist['media_type'] ?? 'audio' ); ?>"
     data-fp-tracks="<?php echo esc_attr( $tracks_str ); ?>"
     data-desc="<?php echo esc_attr( $artist['description'] ); ?>"
     data-spotify="<?php echo esc_attr( $artist['spotify_url'] ?? '' ); ?>"
     data-soundcloud="<?php echo esc_attr( $artist['soundcloud_url'] ?? '' ); ?>">

    <div class="frado-album-card__cover">
        <img src="<?php echo esc_url( $artist['cover_url'] ); ?>"
             alt="<?php echo esc_attr( $artist['album_title'] ); ?>"
             loading="lazy">
    </div>
    <div class="frado-album-card__info">
        <span class="frado-album-card__type"><?php echo esc_html( $artist['type_label'] ); ?></span>
        <h3 class="frado-album-card__title"><?php echo esc_html( $artist['album_title'] ); ?></h3>
        <p class="frado-album-card__artist-name"><?php echo esc_html( $artist['name'] ); ?></p>
        <p class="frado-album-card__meta"><?php echo esc_html( $artist['role'] ); ?></p>
    </div>
</div>
```

---

## 7. Theme Bug Fixes Required

These bugs exist in `page-musica.php` regardless of whether the v2 or v3 plugin is loaded. They should be fixed in the theme JS independently of the plugin migration.

### 7.1 fvideoToggle() — Promise Catch

**Bug:** `vid.play()` returns a Promise. The current code discards it, causing `UnhandledPromiseRejection` when autoplay is blocked by the browser.

**Before (buggy):**

```javascript
function fvideoToggle() {
    var vid = document.getElementById('fvideoEl');
    if (vid.paused) {
        vid.play();  // Promise discarded
    } else {
        vid.pause();
    }
}
```

**After (fixed):**

```javascript
function fvideoToggle() {
    var vid = document.getElementById('fvideoEl');
    if (vid.paused) {
        vid.play().catch(function(err) {
            console.warn('[fvideo] Autoplay blocked:', err.message);
        });
    } else {
        vid.pause();
    }
}
```

### 7.2 fvideoPrev / fvideoNext — canplay Pattern

**Bug:** After calling `vid.load()`, the code calls `vid.play()` synchronously. The browser may not have buffered enough data yet, producing an `AbortError` (the `load()` aborts the pending `play()` Promise).

**Before (buggy):**

```javascript
function fvideoLoad(idx) {
    var vid = document.getElementById('fvideoEl');
    vid.src = fvideoTracks[idx].src;
    vid.load();
    if (fvideoPlaying) {
        vid.play();  // AbortError — load() not finished
    }
}
```

**After (fixed):**

```javascript
function fvideoLoad(idx) {
    var vid = document.getElementById('fvideoEl');
    vid.src = fvideoTracks[idx].src;
    vid.load();
    if (fvideoPlaying) {
        vid.addEventListener('canplay', function onCanPlay() {
            vid.removeEventListener('canplay', onCanPlay);
            vid.play().catch(function(err) {
                console.warn('[fvideo] Play after load failed:', err.message);
            });
        });
    }
}
```

### 7.3 fvideoInited Guard

**Bug:** The video player event listeners (fullscreen button, progress bar, etc.) are attached without checking whether the DOM elements exist. If the video player section is hidden or not rendered, `getElementById('fvideoFullscreen')` returns `null` and `.addEventListener` throws a `TypeError`, which stops all subsequent JS execution — including the `IntersectionObserver` scroll animations at the bottom of the script.

The audio player already has a `fplayerInited` guard. The video player needs the same pattern.

**Fix:**

```javascript
var fvideoInited = false;
var fvideoFullscreenBtn = document.getElementById('fvideoFullscreen');
if (fvideoFullscreenBtn) {
    fvideoInited = true;
    fvideoFullscreenBtn.addEventListener('click', function() { /* ... */ });
    // ... rest of video player event listeners ...
}
```

---

## 8. v2 Backward Compatibility Notes

### What Still Works Unchanged from v2

These patterns require **no theme changes** when upgrading from v2 to v3 plugin:

| Pattern | Status |
|---|---|
| `new FradoPlayer(el)` constructor | Unchanged |
| `.destroy()` method | Unchanged (v3 additionally destroys `_FPBottomSheet` — strictly additive) |
| `.core.play()` | Still works |
| All `data-*` attribute names on `.frado-player` | Unchanged |
| All CSS class names (`.frado-player__*`) | Unchanged |
| `CustomEvent` names (`fp:play`, `fp:pause`, `fp:ended`, `fp:trackloaded`) | Unchanged, still fire on container |
| `.on()` / `.off()` event API | Unchanged |
| `tracks=` shortcode attribute with 5-field format | Still parsed correctly (extra fields are optional) |

### What Requires Theme Changes

| # | Change | Impact | Action |
|---|---|---|---|
| 1 | `FradoPlayer.fromCard()` available | **Optional** — v2 manual init still works | Adopt `fromCard()` to remove ~40 lines of theme code |
| 2 | `_FPKeyboard` scoped to container | `.frado-player` needs `tabindex="0"` (added by PHP in v3) | No theme action needed if using plugin-rendered HTML |
| 3 | `aria-busy`, `data-fp-state` written by JS | Low — don't hard-code these in theme PHP or CSS | Verify no theme CSS targets `[data-fp-state]` with conflicting styles |
| 4 | `tracks=` format: 7 fields (added `aac`, `thumb`) | **Zero** — old 5-field data still works | Update `frado_player_tracks_str()` helper to emit fields 5-7 if desired |
| 5 | CSS custom property names (`--fp-*`) | Low — only affects custom overrides | Update any theme CSS that overrides renamed `--fp-*` tokens |
| 6 | `touch-action:manipulation` removed from inline style | **Zero** — moved to CSS file | No action needed |

### Recommended Migration Sequence

1. **Fix theme bugs first** (Section 7) — these are independent of plugin version
2. **Add the graceful degradation `if/else`** (Section 3) — works with both v2 and v3 plugin
3. **Deploy plugin update** — `fromCard()` becomes available, cleaner path activates
4. **Remove v2 fallback code** — once confirmed working in production
5. **Remove legacy audio/video player code** — `fplayerLoad()`, `fvideoLoad()`, `fplayerToggle()`, `fvideoToggle()`, and all associated globals and DOM elements
