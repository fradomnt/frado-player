# Audit — Audio Player & Modal JS (page-musica.php)

**File:** `page-musica.php` (lines 1340–1900)
**Date:** 2026-04-02

---

## 1. Audio Player Functions

### `fplayerFmtTime(s)`
Converts seconds to `M:SS` format. Handles `NaN` and `Infinity` gracefully (returns `'0:00'`).
No globals read/written. No edge case for negative numbers.

### `fplayerLoad(idx)`
Loads track by index into the audio element.

**Globals read:** `fplayerTracks[]`, `fplayerPlaying`, `fplayerCurrent`
**Globals written:** `fplayerCurrent`
**DOM elements modified:** `#fplayerAudio` (src, load), `#fplayerTrackName`, `#fplayerFill`, `#fplayerSeek`, `#fplayerDuration`, `.fplayer-track-item` (active class)

**Key behavior:** If `fplayerPlaying === true`, adds a one-time `canplay` listener that auto-plays the new track. No bounds check on `idx` — silently does nothing if `fplayerTracks[idx]` is undefined.

### `fplayerToggle()`
Play/pause toggle. Checks if `#fplayerAudio` exists. If `.paused` → `.play()`, else `.pause()`. Uses DOM state only, no globals.

---

## 2. openArtistModal() — Complete Map

**Input:** `card` (HTMLElement) — `.frado-album-card` with data attributes

### Step 1 — Extract Text from Card
Reads via `querySelector`:
- `.frado-album-card__artist-name` → modal artist name
- `.frado-album-card__title` → modal title
- `.frado-album-card__meta` → role/meta text
- `.frado-album-card__type` → badge text
- `.frado-album-card__cover > img` → cover image

### Step 2 — External Links
Reads `card.dataset`: `spotify`, `soundcloud`, `bandcamp`, `youtube`, `vimeo`, `globoplay`, `video`, `video2`.
Creates inline-styled pill anchor tags with brand colors. Section hidden if no links.

### Step 3 — Legacy Audio Player Path
Reads `data-audio1..4` + `data-audio1Label..4Label`.
Builds `fplayerTracks[]` array. Displays `#fradoAudioPlayer`. Calls `fplayerLoad(0)`.

### Step 4 — Legacy Video Player Path
Reads `data-video1..4` + labels.
Builds `fvideoTracks[]`. Displays `#fradoVideoPlayer`. Calls `fvideoLoad(0)`.

### Step 5 — FradoPlayer Plugin Integration (primary path)
Detected by: `card.dataset.fpTracks` OR `card.dataset.fpSrcMp3` OR `card.dataset.fpSrc`

If detected → hides audio/video legacy players, shows `#fradoFPWrapper`.

Populates `#fradoFPPlayer` element with data attributes:
```
data-type, data-title, data-artist, data-thumb
data-src, data-src-mp3, data-src-flac, data-src-opus, data-src-aac
data-duration, data-volume="0.7"
```

Parses `fpTracks` CSV (pipe-delimited: `name|url|flacUrl|opusUrl|duration`) into playlist DOM.

**Instantiation + Autoplay (lines ~1616–1626):**
```javascript
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
60ms delay for DOM readiness. 150ms delay for AudioContext unlock (card click = user gesture).

### Step 6 — Modal Activation & History Push
```javascript
modal.classList.add('active');
document.body.style.overflow = 'hidden';
history.pushState({ fpModal: true }, '');
window._fpModalStatePushed = true;
```

---

## 3. closeArtistModal() — Complete Map

### Guard
```javascript
if (!modal.classList.contains('active')) return;
```

### Sequence
1. `modal.classList.remove('active')` + `document.body.style.overflow = ''`
2. Audio cleanup: `audio.pause(); audio.src = ''; fplayerPlaying = false;` + reset icons
3. Video cleanup: `vid.pause(); vid.src = ''; fvideoPlaying = false;` + reset icons
4. FradoPlayer destroy:
```javascript
try { fpEl2._fradoPlayer.destroy(); } catch(e) {}
fpEl2._fradoPlayer = null;
fpWrapper2.style.display = 'none';
```
5. History guard:
```javascript
if (window._fpModalStatePushed) {
    window._fpModalStatePushed = false;
    history.back();
}
```

---

## 4. History API Implementation

**Pattern:** `pushState` on open, `popstate` listener for browser back, `_fpModalStatePushed` flag prevents double-back.

```javascript
// Open → push state
history.pushState({ fpModal: true }, '');
window._fpModalStatePushed = true;

// Browser back button
window.addEventListener('popstate', function() {
    if (modal.classList.contains('active')) {
        window._fpModalStatePushed = false;
        closeArtistModal();
    }
});

// Close button → triggers back
if (window._fpModalStatePushed) {
    window._fpModalStatePushed = false;
    history.back();  // fires popstate, but flag is false → no recursion
}
```

**Result:** Back button closes modal; X button pops history cleanly; no recursive close.

---

## 5. FradoPlayer Integration Contract

### Methods Called by Theme
| Method | When | Risk if Changed |
|---|---|---|
| `new FradoPlayer(el)` | On modal open | HIGH — constructor signature |
| `.core.play()` | 150ms after init | HIGH — `.core` property removed |
| `.destroy()` | On modal close | MEDIUM — semantics change |

### Data Attributes Plugin Reads from DOM
`data-type`, `data-title`, `data-artist`, `data-thumb`, `data-src`, `data-src-mp3`, `data-src-flac`, `data-src-opus`, `data-src-aac`, `data-duration`, `data-volume`

### DOM Structure Plugin Expects
`.frado-player__track-title`, `.frado-player__time-duration`, `.frado-player__playlist`, `.frado-player__track` items

### v3 Mitigation
Encapsulate in `FradoPlayer.fromCard(cardEl, targetEl)` factory method — theme stops needing to know plugin internals.

---

## 6. IntersectionObserver Setup

**Location:** Lines 1887–1899 (END of script, after all event listeners)

```javascript
var scrollObs = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
        if (entry.isIntersecting) {
            var delay = Array.prototype.indexOf.call(
                document.querySelectorAll('.frado-animate'), entry.target) * 0.05;
            entry.target.style.animationDelay = delay + 's';
            entry.target.classList.add('frado-visible');
            scrollObs.unobserve(entry.target);
        }
    });
}, { threshold: 0.1 });

document.querySelectorAll('.frado-animate').forEach(function(el) { scrollObs.observe(el); });
```

**Why it was broken:** Any null TypeError earlier in the script (e.g. `getElementById('fvideoFullscreen')` returning null → `.addEventListener` throwing) would stop execution before this block. Fixed by adding fullscreen button HTML.

**Stagger:** element index × 50ms delay. Max stagger for 20 elements = 1s total.

---

## 7. Data Attributes on Cards

### Text Content (via querySelector)
| Selector | Used For |
|---|---|
| `.frado-album-card__artist-name` | Modal artist name |
| `.frado-album-card__title` | Modal title |
| `.frado-album-card__meta` | Role/project line |
| `.frado-album-card__type` | Badge (TÉCNICO DE SOM etc.) |

### FradoPlayer Attributes (data-fp-*)
| Attribute | Purpose |
|---|---|
| `data-fp-tracks` | CSV playlist (pipe-delimited) |
| `data-fp-src` / `data-fp-src-mp3/flac/opus/aac` | Codec sources |
| `data-fp-title`, `data-fp-artist`, `data-fp-thumb` | Metadata |
| `data-fp-duration` | Display duration |

### Legacy Attributes
`data-audio1..4`, `data-audio1Label..4Label`, `data-video1..4`, `data-video1Label..4Label`

### External Links
`data-spotify`, `data-soundcloud`, `data-bandcamp`, `data-youtube`, `data-vimeo`, `data-globoplay`, `data-video`, `data-video2`

---

## 8. Consolidation Opportunity

### Move into Plugin (v3)
- FradoPlayer instantiation timing (60ms + 150ms)
- Data attribute marshaling (card → player element)
- Playlist CSV parsing
- `destroy()` lifecycle (already exists, needs `fromCard()` factory)

### Stay in Theme
- Modal open/close animations
- Text extraction from card DOM
- External links pill generation
- History API (modal-specific navigation)
- IntersectionObserver scroll animations
- Legacy audio/video player support

### Recommended Bridge Pattern (v3)
```javascript
// Plugin exposes factory — theme stays ignorant of internals
var instance = FradoPlayer.fromCard(card, fpWrapper);
fpWrapper._fpInstance = instance;
// On close:
fpWrapper._fpInstance.destroy();
```

---

## Summary

| Function | Globals | DOM Elements | Risk |
|---|---|---|---|
| `fplayerFmtTime()` | None | None | Low |
| `fplayerLoad()` | fplayerCurrent, fplayerTracks, fplayerPlaying | Audio + UI | Medium |
| `fplayerToggle()` | None | Audio only | Low |
| `openArtistModal()` | All player globals | Modal + 3 players | High |
| `closeArtistModal()` | All player globals | Modal + 3 players | High |
| FradoPlayer bridge | window.FradoPlayer | Plugin element | High |
| History API | `_fpModalStatePushed` | window.history | Medium |
| IntersectionObserver | scrollObs | .frado-animate | Low |
