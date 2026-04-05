# Frado Player v2.0.0 - PHP Code Audit

**Audit Date:** 2026-04-02
**File:** frado-player.php
**Version:** 2.0.0

---

## 1. Shortcode Attributes — Estado Atual

| Attribute | Default | Type | Sanitization | Gaps / Issues |
|-----------|---------|------|--------------|---------------|
| `type` | `'auto'` | string | Whitelist validation | ✓ Safe (whitelist: audio/video/auto) |
| `src` | `''` | string (URL) | `esc_url()` | ✓ Correct |
| `src_flac` | `''` | string (URL) | `esc_url()` | ✓ Correct |
| `src_opus` | `''` | string (URL) | `esc_url()` | ✓ Correct |
| `src_aac` | `''` | string (URL) | `esc_url()` | ✓ Correct |
| `src_mp3` | `''` | string (URL) | `esc_url()` | ✓ Correct |
| `src_av1` | `''` | string (URL) | `esc_url()` | ✓ Correct |
| `src_hevc` | `''` | string (URL) | `esc_url()` | ✓ Correct |
| `src_h264` | `''` | string (URL) | `esc_url()` | ✓ Correct |
| `title` | `'Sem título'` | string | `esc_html()` | ✓ Correct for text content |
| `artist` | `''` | string | `esc_html()` | ✓ Correct for text content |
| `thumb` | `''` | string (URL) | `esc_url()` | ✓ Correct |
| `duration` | `'0:00'` | string | `esc_html()` | ✓ Correct for time format |
| `volume` | `'0.7'` | string/float | `floatval()` + range clamp | ✓ Correct (0.0–1.0 bounds enforced) |
| `tracks` | `''` | string (CSV) | **None** | ⚠️ **GAP: No sanitization on raw string parsing** |

**Issues:**
- `tracks` attribute is never sanitized before `frado_player_parse_tracks()`. Individual track fields (title, URLs) are sanitized when output, but comma/pipe-delimited injection is theoretically possible if untrusted.

---

## 2. frado_player_parse_tracks() Analysis

**Location:** Lines 38–53

**Supported Fields (pipe-delimited per track):**
1. `title` — Track title (index 0)
2. `mp3` — MP3 URL (index 1)
3. `flac` — FLAC URL (index 2)
4. `opus` — Opus URL (index 3)
5. `duration` — Display duration (index 4)

**Missing Features:**
- ❌ AAC codec field (despite `src_aac` existing in shortcode attributes)
- ❌ Per-track thumbnail image
- ❌ Per-track type indicator (audio vs video)
- ❌ Per-track artist attribution

**Edge Cases & Risks:**

| Edge Case | Current Behavior | Risk |
|-----------|-----------------|------|
| Commas in titles | Breaks parsing (premature split) | **HIGH** — "Artist, The" becomes 2 tracks |
| Pipes in titles | Breaks parsing (premature field split) | **HIGH** — "Title \| Remix" misaligned |
| Empty title | Falls back to "Faixa N" (good fallback) | LOW — Handled well |
| Missing URL fields | Defaults to empty string (safe) | LOW — Graceful degradation |
| Whitespace inconsistency | `trim()` applied to parts | LOW — Safe |
| Special chars in URLs | Not validated, relies on output escaping | MEDIUM |
| XSS via track title | Escaped at output with `esc_html()` | LOW — Mitigated |

---

## 3. WordPress Hooks

| Hook Type | Function Name | Line | Purpose |
|-----------|---------------|------|---------|
| `add_action` | `wp_enqueue_scripts` → `frado_player_register_assets()` | 20 | Register CSS + JS (lazy-load on shortcode) |
| `wp_register_style` | (internal) | 22–27 | Register `frado-player` stylesheet |
| `wp_register_script` | (internal) | 28–34 | Register `frado-player` JS (footer, `true`) |
| `add_shortcode` | `frado_player` → `frado_player_shortcode()` | 56 | Main shortcode handler |
| `wp_enqueue_style` | (inside shortcode) | 78 | Enqueue CSS on shortcode presence |
| `wp_enqueue_script` | (inside shortcode) | 79 | Enqueue JS on shortcode presence |

**Notes:**
- Assets use semantic versioning (v2.0.0 cache busting).
- Lazy enqueuing: CSS/JS only load if `[frado_player]` is present on the page.
- Footer JS enqueue (`true` param) avoids render-blocking.

---

## 4. Sanitization Gaps

### ✓ Correctly Sanitized:
- All `src_*` URLs: `esc_url()`
- `title`, `artist`, `duration`: `esc_html()`
- `thumb`: `esc_url()`
- `type`: Whitelist validation (`in_array()`)
- `volume`: Type cast + range bounds
- All track title/URL outputs: `esc_html()` / `esc_url()`

### ⚠️ Gaps Identified:

1. **Lines 151–152 — Double-escaping:**
   ```php
   data-title="<?php echo esc_attr( $atts['title'] ); ?>"
   data-artist="<?php echo esc_attr( $atts['artist'] ); ?>"
   ```
   Using `esc_attr()` on already-`esc_html()`-escaped values. Should use raw `$atts['title']` inside `esc_attr()`.

2. **Lines 142–149 — Missing `esc_attr()` wrapper on data-URL attributes:**
   ```php
   data-src="<?php echo $src; ?>"
   ```
   `esc_url()` is sufficient for URLs, but best practice is explicit `esc_attr()` wrapper for HTML attributes.

3. **Lines 176, 234 — Inline `style` attributes:**
   ```php
   style="touch-action:manipulation"
   ```
   Should be moved to CSS classes for CSP compliance.

4. **`tracks` input:** No pre-sanitization before parsing (output sanitization mitigates risk).

---

## 5. HTML Output Structure

### Complete DOM Tree:

```html
<div class="frado-player"
     id="frado-player-{N}"
     data-type="audio|video|auto"
     data-src="..." data-src-flac="..." data-src-opus="..."
     data-src-aac="..." data-src-mp3="..."
     data-src-av1="..." data-src-hevc="..." data-src-h264="..."
     data-duration="HH:MM" data-title="..." data-artist="..."
     data-thumb="..." data-volume="0.0-1.0">

    <div class="frado-player__header">
        <div class="frado-player__spectrum-icon" aria-hidden="true">
            <span></span><span></span><span></span><span></span>
        </div>
        <span class="frado-player__track-title">[title]</span>
        <span class="frado-player__time">
            <span class="frado-player__time-elapsed">0:00</span>
            <span> / </span>
            <span class="frado-player__time-duration">[duration]</span>
        </span>
    </div>

    <div class="frado-player__progress"
         role="slider" aria-label="Progresso"
         aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"
         style="touch-action:manipulation">        <!-- ⚠️ inline style -->
        <div class="frado-player__progress-fill"></div>
    </div>

    <div class="frado-player__controls">
        <div class="frado-player__transport">
            <button class="frado-player__btn frado-player__btn--prev" aria-label="Faixa anterior">...</button>
            <button class="frado-player__btn frado-player__btn--play" aria-label="Reproduzir">
                <svg class="frado-player__icon-play">...</svg>
                <svg class="frado-player__icon-pause" hidden>...</svg>
            </button>
            <button class="frado-player__btn frado-player__btn--next" aria-label="Próxima faixa">...</button>
        </div>
        <canvas class="frado-player__spectrum" aria-hidden="true"></canvas>
        <div class="frado-player__volume-group">
            <button class="frado-player__btn frado-player__btn--mute" aria-label="Volume">
                <!-- 4 volume SVG icons -->
            </button>
            <div class="frado-player__volume-track"
                 role="slider" aria-label="Volume"
                 aria-valuemin="0" aria-valuemax="100" aria-valuenow="[vol_pct]"
                 style="touch-action:manipulation">  <!-- ⚠️ inline style -->
                <div class="frado-player__volume-fill" style="width:[vol_pct]%"></div>
                <div class="frado-player__volume-thumb"></div>
            </div>
        </div>
    </div>

    <ol class="frado-player__playlist">
        <li class="frado-player__track frado-player__track--active"
            data-title="..." data-src="..." data-src-flac="..."
            data-src-opus="..." data-src-mp3="..." data-duration="...">
            <span class="frado-player__track-num">1</span>
            <span class="frado-player__track-name">[title]</span>
            <span class="frado-player__track-duration">[duration]</span>
        </li>
    </ol>

</div>
```

---

## 6. Multiple Players per Page

```php
static $instance = 0;
$instance++;
$player_id = 'frado-player-' . $instance;
```

✓ **Strengths:** Simple, reliable, no collisions.

⚠️ **Issues:**
- `wp_enqueue_style/script` called once per shortcode — WordPress dedupes but wastes calls. Fix: enqueue only when `$instance === 1`.
- No JS localization — each player reads data from DOM `data-*` attributes.

---

## 7. Missing Features vs v3 Needs

| Feature | v2 Status | v3 Target | Priority |
|---------|-----------|-----------|----------|
| AAC in tracks= parser | ❌ Missing | ✓ Add as 5th field | HIGH |
| Per-track thumbnail | ❌ Missing | ✓ Add as 7th field | MEDIUM |
| `autoplay` attribute | ❌ Missing | ✓ `autoplay="0\|1"` | MEDIUM |
| `loop` attribute | ❌ Missing | ✓ `loop="0\|1"` | MEDIUM |
| `color` override | ❌ Missing | ✓ `color="#hex"` | LOW |
| Per-track artist | ❌ Missing | ✓ Add field | LOW |

### Recommended v3 tracks= Format:
```
título|mp3|flac|opus|aac|duração|thumb
```
Backward compatible — extra fields are optional.

---

## 8. PHP Compatibility

**Minimum:** PHP 5.6+ / WordPress 5.0+

| Function | Min PHP |
|----------|---------|
| `array_map()` with closure | 5.3 |
| `explode()`, `trim()`, `isset()` | 3.x |
| `esc_url()`, `esc_html()`, `esc_attr()` | WP 2.8+ |
| `shortcode_atts()` | WP 2.5+ |
| `ob_start()` / `ob_get_clean()` | 4.0.4 |

✓ No deprecated functions identified.
✓ PHP 8.0+ compatible.

---

## Summary & Priority Actions

### Critical
1. Fix double-escaping lines 151–152 (use raw values in `esc_attr()`)
2. Add `esc_attr()` wrapper to data-URL attributes (lines 142–149)

### High Priority
1. Add AAC field to `frado_player_parse_tracks()`
2. Optimize asset enqueuing (once per page, not per shortcode)
3. Move `touch-action:manipulation` to CSS

### Medium Priority
1. Redesign tracks parser: support thumb, aac, artist per track
2. Add `autoplay`, `loop` shortcode attributes
3. Pre-sanitize `tracks` attribute input before parsing
