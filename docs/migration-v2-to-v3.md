# Frado Player — Migration v2 → v3

**Date:** 2026-04-02
**Source documents:** architecture-v3.md, audit-php.md, audit-js.md
**Target audience:** implementing developer

---

## Pre-Migration

- [ ] Read `architecture-v3.md` (all 10 sections)
- [ ] Read `audit-php.md` and `audit-js.md` (all confirmed bugs)
- [ ] Run full regression test on v2 — document what works:
  - Audio player loads and plays single track
  - Audio player loads and plays multi-track playlist
  - Video player loads and plays
  - Volume drag, wheel, mute button
  - Keyboard shortcuts (Space, arrows, M, F)
  - Spectrum visualizer starts on play, collapses on pause
  - Bottom sheet opens/closes on mobile
  - Fullscreen / PiP on video
  - MediaSession metadata shows in OS controls
  - localStorage volume persistence across page loads
- [ ] Create git branch `feat/frado-player-v3`
- [ ] Back up current `frado-player.php`, `frado-player.js`, `frado-player.css`

---

## Phase 1 — Critical Fixes (frado-player.php) → v3.0.0

### 1.1 Fix double-escaping on title/artist data attributes

**Bug:** `esc_attr()` is called on values already escaped by `esc_html()`, producing double-encoded entities (`&amp;amp;` instead of `&amp;`).

**Ref:** audit-php.md Section 4, lines 151-152.

- [ ] Store raw sanitized values before any escaping, then apply context-appropriate escaping at output.

```diff
 // Near the top of frado_player_shortcode(), after shortcode_atts():

-// v2: $atts['title'] already has esc_html() applied by shortcode_atts
+$title_raw  = sanitize_text_field( $atts['title'] );
+$artist_raw = sanitize_text_field( $atts['artist'] );
```

```diff
 // In the HTML output (data attributes — attribute context):

-data-title="<?php echo esc_attr( $atts['title'] ); ?>"
-data-artist="<?php echo esc_attr( $atts['artist'] ); ?>"
+data-title="<?php echo esc_attr( $title_raw ); ?>"
+data-artist="<?php echo esc_attr( $artist_raw ); ?>"
```

```diff
 // In the HTML output (text nodes — HTML context):

-<span class="frado-player__track-title"><?php echo $atts['title']; ?></span>
+<span class="frado-player__track-title"><?php echo esc_html( $title_raw ); ?></span>
```

### 1.2 Fix URL data attributes — add explicit `esc_attr()` wrapper

**Bug:** URL data attributes are echoed raw without attribute-context escaping. `esc_url()` alone is insufficient in attribute context.

**Ref:** audit-php.md Section 4, lines 142-149.

- [ ] Wrap every `data-src*` output with `esc_attr()`.

```diff
-data-src="<?php echo $src; ?>"
-data-src-flac="<?php echo $src_flac; ?>"
-data-src-opus="<?php echo $src_opus; ?>"
-data-src-aac="<?php echo $src_aac; ?>"
-data-src-mp3="<?php echo $src_mp3; ?>"
-data-src-av1="<?php echo $src_av1; ?>"
-data-src-hevc="<?php echo $src_hevc; ?>"
-data-src-h264="<?php echo $src_h264; ?>"
+data-src="<?php echo esc_attr( $src ); ?>"
+data-src-flac="<?php echo esc_attr( $src_flac ); ?>"
+data-src-opus="<?php echo esc_attr( $src_opus ); ?>"
+data-src-aac="<?php echo esc_attr( $src_aac ); ?>"
+data-src-mp3="<?php echo esc_attr( $src_mp3 ); ?>"
+data-src-av1="<?php echo esc_attr( $src_av1 ); ?>"
+data-src-hevc="<?php echo esc_attr( $src_hevc ); ?>"
+data-src-h264="<?php echo esc_attr( $src_h264 ); ?>"
```

### 1.3 Move `touch-action:manipulation` from inline style to CSS

**Bug:** Inline `style="touch-action:manipulation"` violates CSP policies that block `style-src 'unsafe-inline'`.

**Ref:** audit-php.md Section 4, lines 176/234.

- [ ] Remove the inline `style` attribute from PHP output.
- [ ] Add the rule to `frado-player.css`.

```diff
 <!-- frado-player.php — progress bar -->

-<div class="frado-player__progress"
-     role="slider" aria-label="Progresso"
-     aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"
-     style="touch-action:manipulation">
+<div class="frado-player__progress"
+     role="slider" aria-label="Progresso"
+     aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
```

```diff
 <!-- frado-player.php — volume track -->

-<div class="frado-player__volume-track"
-     role="slider" aria-label="Volume"
-     aria-valuemin="0" aria-valuemax="100" aria-valuenow="..."
-     style="touch-action:manipulation">
+<div class="frado-player__volume-track"
+     role="slider" aria-label="Volume"
+     aria-valuemin="0" aria-valuemax="100" aria-valuenow="...">
```

```diff
 /* frado-player.css — add this rule */

+.frado-player__progress,
+.frado-player__volume-track {
+    touch-action: manipulation;
+}
```

### 1.4 Optimize asset enqueue — once per page, not per shortcode

**Bug:** `wp_enqueue_style` / `wp_enqueue_script` called once per shortcode instance. WordPress dedupes but wastes calls.

**Ref:** audit-php.md Section 6.

- [ ] Guard the enqueue calls with the `$instance` counter.

```diff
 static $instance = 0;
 $instance++;
 $player_id = 'frado-player-' . $instance;

-wp_enqueue_style( 'frado-player' );
-wp_enqueue_script( 'frado-player' );
+if ( $instance === 1 ) {
+    wp_enqueue_style( 'frado-player' );
+    wp_enqueue_script( 'frado-player' );
+}
```

### 1.5 Add AAC field to `tracks=` parser

**Bug:** `frado_player_parse_tracks()` supports 5 fields (`title|mp3|flac|opus|duration`) but the shortcode already has `src_aac`. Tracks with AAC sources cannot be specified in the `tracks=` attribute.

**Ref:** audit-php.md Section 2, Section 7.

- [ ] Extend parser to 7 fields: `title|mp3|flac|opus|aac|duration|thumb`. Old 5-field data still works (extra fields default to empty string).

```diff
 // frado_player_parse_tracks()

 function frado_player_parse_tracks( $tracks_str ) {
     $tracks = array();
     $items  = explode( ',', $tracks_str );
     foreach ( $items as $i => $item ) {
         $parts = array_map( 'trim', explode( '|', trim( $item ) ) );
         $tracks[] = array(
             'title'    => isset( $parts[0] ) && $parts[0] !== '' ? $parts[0] : 'Faixa ' . ( $i + 1 ),
             'mp3'      => isset( $parts[1] ) ? esc_url( $parts[1] ) : '',
             'flac'     => isset( $parts[2] ) ? esc_url( $parts[2] ) : '',
             'opus'     => isset( $parts[3] ) ? esc_url( $parts[3] ) : '',
-            'duration' => isset( $parts[4] ) ? esc_html( $parts[4] ) : '',
+            'aac'      => isset( $parts[4] ) ? esc_url( $parts[4] ) : '',
+            'duration' => isset( $parts[5] ) ? esc_html( $parts[5] ) : '',
+            'thumb'    => isset( $parts[6] ) ? esc_url( $parts[6] ) : '',
         );
     }
     return $tracks;
 }
```

```diff
 <!-- Track <li> output — add data-src-aac attribute -->

 <li class="frado-player__track"
     data-title="<?php echo esc_attr( $track['title'] ); ?>"
     data-src="<?php echo esc_attr( $track['mp3'] ); ?>"
     data-src-flac="<?php echo esc_attr( $track['flac'] ); ?>"
     data-src-opus="<?php echo esc_attr( $track['opus'] ); ?>"
+    data-src-aac="<?php echo esc_attr( $track['aac'] ); ?>"
     data-src-mp3="<?php echo esc_attr( $track['mp3'] ); ?>"
-    data-duration="<?php echo esc_attr( $track['duration'] ); ?>">
+    data-duration="<?php echo esc_attr( $track['duration'] ); ?>"
+    data-thumb="<?php echo esc_attr( $track['thumb'] ); ?>">
```

### 1.6 Bump version to 3.0.0

- [ ] Update version string in plugin header and asset enqueue calls.

```diff
 /*
  * Plugin Name: Frado Player
- * Version: 2.0.0
+ * Version: 3.0.0
  */
```

```diff
-wp_register_style( 'frado-player', ..., array(), '2.0.0' );
-wp_register_script( 'frado-player', ..., array(), '2.0.0', true );
+wp_register_style( 'frado-player', ..., array(), '3.0.0' );
+wp_register_script( 'frado-player', ..., array(), '3.0.0', true );
```

---

## Phase 1 — Critical Fixes (frado-player.js) → v3.0.0

### 1.7 Fix `_FPKeyboard` scope — bind to container, not document

**Bug:** With multiple players on a page, both fight for the same `document` keydown events. The `isOnlyPlayer` heuristic is brittle.

**Ref:** audit-js.md Section 6 ("Keyboard events"), architecture-v3.md Bug 1.

- [ ] Bind keydown listener to `container` instead of `document`.
- [ ] Remove the multi-player heuristic guard.
- [ ] Requires `tabindex="0"` on `.frado-player` (done in Phase 2 PHP, but already functional if user clicks the player which grants focus).

```diff
 function _FPKeyboard(container, core, playlist, volume) {
     this.container = container;
     this.core      = core;
     this.playlist  = playlist;
     this.volume    = volume;

     var self = this;
     this._handler = function(e) {
-        // v2: global scope guard
-        if (document.activeElement &&
-            /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
-        var players = document.querySelectorAll('.frado-player');
-        if (players.length > 1 && !self.container.contains(document.activeElement)) return;
+        // v3: container-scoped — skip only for text inputs inside the player
+        var tag = e.target.tagName;
+        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
+        if (e.ctrlKey || e.metaKey || e.altKey) return;

         switch (e.code) {
             // ... key handlers unchanged ...
         }
     };

-    document.addEventListener('keydown', this._handler);
+    container.addEventListener('keydown', this._handler);
 }

 _FPKeyboard.prototype.destroy = function() {
-    document.removeEventListener('keydown', this._handler);
+    this.container.removeEventListener('keydown', this._handler);
+    this.container = null;
 };
```

### 1.8 Fix `_resizeCanvas()` — use `setTransform` instead of cumulative `scale`

**Bug (B1 HIGH):** `ctx.scale(dpr, dpr)` is cumulative. After two resizes at DPR=2, drawing is at 4x scale. Bars become 4x taller and offset incorrectly.

**Ref:** audit-js.md Section 5 ("Canvas setup"), B1.

- [ ] Replace `ctx.scale()` with `ctx.setTransform()`.

```diff
 _FPSpectrum.prototype._resizeCanvas = function() {
     var rect = this._canvas.getBoundingClientRect();
     this._canvasW = rect.width;
     this._canvasH = rect.height;
     this._canvas.width  = this._canvasW * this._dpr;
     this._canvas.height = this._canvasH * this._dpr;
-    this._ctx2d.scale(this._dpr, this._dpr);
+    this._ctx2d.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
 };
```

### 1.9 Fix seekbar `pointercancel` — reset `seeking` flag

**Bug (B2 MEDIUM):** If the browser cancels the pointer (e.g., iOS scroll gesture takeover), the `seeking` flag stays `true` and subsequent `pointermove` events continue seeking spuriously.

**Ref:** audit-js.md Section 6 ("Seekbar events"), B2.

- [ ] Add `pointercancel` handler alongside `pointerup`.

```diff
 _FPCore.prototype._bindSeekbar = function() {
     var self    = this;
     var seeking = false;

     this.progressEl.addEventListener('pointerdown', function(e) {
         seeking = true;
         this.setPointerCapture(e.pointerId);
         self._doSeek(e);
     });

     this.progressEl.addEventListener('pointermove', function(e) {
         if (seeking) self._doSeek(e);
     });

     this.progressEl.addEventListener('pointerup', function() {
         seeking = false;
     });

+    this.progressEl.addEventListener('pointercancel', function() {
+        seeking = false;
+    });
 };
```

### 1.10 Fix `_FPBottomSheet` — include in `destroy()`

**Bug (B5 MEDIUM):** `this.sheet` is instantiated in `FradoPlayer` constructor but `destroy()` never calls `this.sheet.destroy()`. The `window` resize listener is orphaned on every player teardown.

**Ref:** audit-js.md Section 9, B5.

- [ ] Add `this.sheet.destroy()` to `FradoPlayer.destroy()`.
- [ ] Fix `_FPBottomSheet.destroy()` to remove the `window` resize listener.

```diff
 FradoPlayer.prototype.destroy = function() {
     this.core.destroy();
     this.spectrum.destroy();
     this.volume.destroy();
     this.playlist.destroy();
     this.session.destroy();
     this.keyboard.destroy();
+    this.sheet.destroy();
 };
```

```diff
 function _FPBottomSheet(container) {
     this.container = container;
     this.isOpen    = false;
     this.isMobile  = window.innerWidth < 768;

-    var self = this;
-    window.addEventListener('resize', function() {
+    this._resizeHandler = function() {
-        self.isMobile = window.innerWidth < 768;
-    });
+        this.isMobile = window.innerWidth < 768;
+    }.bind(this);
+    window.addEventListener('resize', this._resizeHandler);

     // ... rest of constructor ...
 }

 _FPBottomSheet.prototype.destroy = function() {
     if (this.isOpen) {
         document.body.style.overflow = '';
     }
+    window.removeEventListener('resize', this._resizeHandler);
+    this._resizeHandler = null;
+    this.container = null;
 };
```

### 1.11 Fix `aria-valuetext` on seekbar

**Bug:** Screen readers announce raw integers instead of formatted time strings for the seekbar.

**Ref:** architecture-v3.md Bug 9.

- [ ] Update the `timeupdate` handler to set `aria-valuetext` with the formatted time.

```diff
 // Inside _FPCore._bindMediaEvents(), in the timeupdate handler:

 this.progressEl.setAttribute('aria-valuenow', Math.round(pct));
+this.progressEl.setAttribute('aria-valuetext',
+    self._fmt(self.currentTime) + ' de ' + self._fmt(self.duration));
```

### 1.12 Fix `aria-valuetext` on volume slider

**Bug:** Screen readers announce raw volume integer. Should announce percentage.

**Ref:** architecture-v3.md Bug 9.

- [ ] Add `aria-valuetext` update inside `_FPVolume.setVolume()`.

```diff
 _FPVolume.prototype.setVolume = function(pct) {
     this.pct = Math.max(0, Math.min(100, Math.round(pct)));
     this._applyVolume();
     this._updateFill();
     this._updateThumb();
     this._updateIcons();
     this._savePrefs();

     if (this._trackEl) {
         this._trackEl.setAttribute('aria-valuenow', this.pct);
+        this._trackEl.setAttribute('aria-valuetext', this.pct + '%');
     }
 };
```

### 1.13 Fix mute button `aria-label`

**Bug:** Mute button uses `aria-label="Volume"` which is ambiguous. Does not describe the action or the current state.

**Ref:** architecture-v3.md Bug 10.

- [ ] Update `aria-label` on mute/unmute toggle.

```diff
 _FPVolume.prototype.toggleMute = function() {
     this.muted = !this.muted;

     if (this.muted) {
         this._lastPct = this.pct > 0 ? this.pct : 70;
         this.mediaEl.muted = true;
+        if (this._muteBtn) this._muteBtn.setAttribute('aria-label', 'Ativar som');
     } else {
         this.mediaEl.muted = false;
         if (this.pct === 0) this.setVolume(this._lastPct);
+        if (this._muteBtn) this._muteBtn.setAttribute('aria-label', 'Silenciar');
     }

     this._updateFill();
     this._updateIcons();
     this._savePrefs();
 };
```

```diff
 <!-- frado-player.php — initial mute button markup -->

-<button class="frado-player__btn frado-player__btn--mute" aria-label="Volume">
+<button class="frado-player__btn frado-player__btn--mute" aria-label="Silenciar">
```

### 1.14 Fix play button `aria-pressed`

**Bug:** Play button lacks `aria-pressed` attribute. Screen readers cannot report play/pause state.

**Ref:** architecture-v3.md Bug 11.

- [ ] Add `aria-pressed` to the play button in PHP markup (initial state: `false`).
- [ ] Update `aria-pressed` in `_setPlayState()`.

```diff
 <!-- frado-player.php — play button -->

-<button class="frado-player__btn frado-player__btn--play" aria-label="Reproduzir">
+<button class="frado-player__btn frado-player__btn--play"
+        aria-label="Reproduzir"
+        aria-pressed="false">
```

```diff
 // _FPCore.prototype._setPlayState

 _FPCore.prototype._setPlayState = function(playing) {
     var playBtn = this._el('.frado-player__btn--play');
     if (!playBtn) return;

     // Toggle play/pause icon visibility
     var iconPlay  = playBtn.querySelector('.frado-player__icon-play');
     var iconPause = playBtn.querySelector('.frado-player__icon-pause');
     if (iconPlay)  iconPlay.hidden  = playing;
     if (iconPause) iconPause.hidden = !playing;

     // Toggle CSS class
     if (playing) {
         this.container.classList.add('frado-player--playing');
     } else {
         this.container.classList.remove('frado-player--playing');
     }

     // Update aria-label
     playBtn.setAttribute('aria-label', playing ? 'Pausar' : 'Reproduzir');
+    playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
 };
```

---

## Phase 1 Verification Checklist

After completing all Phase 1 items, verify:

- [ ] Audio player loads and plays (no regressions)
- [ ] Title/artist display correctly with special characters (`&`, `"`, `<`)
- [ ] Data attribute URLs are properly escaped in source HTML
- [ ] No inline `style` attributes on progress/volume elements
- [ ] Assets load once even with 3 players on the same page
- [ ] AAC field appears in track `<li>` data attributes
- [ ] Keyboard shortcuts work only on the focused player (multi-player page)
- [ ] Spectrum does not grow/shrink incorrectly after window resize
- [ ] Seekbar drag works correctly after a cancelled touch (mobile)
- [ ] Bottom sheet `window` resize listener is cleaned up after `destroy()`
- [ ] Screen reader announces time position on seekbar (e.g., "1:23 de 4:56")
- [ ] Screen reader announces volume as percentage (e.g., "70%")
- [ ] Mute button label changes between "Silenciar" and "Ativar som"
- [ ] Play button reports pressed state to screen reader
- [ ] Version reads `3.0.0` in page source

---

## Phase 2 — New Classes: State Machine + Keyboard + ARIA (frado-player.js) → v3.1.0

### 2.1 Add `_FPState` class

**Purpose:** Formal state machine replacing the ad-hoc `isPlaying` boolean. Owns `container.dataset.fpState` and `aria-busy`.

**Ref:** architecture-v3.md Section 3.

- [ ] Add the `_FPState` constructor after `_FPCore` in the IIFE module order.

```js
// NEW CLASS — _FPState

function _FPState(container) {
    this.container = container;
    this.current   = 'idle';
    this._set('idle');

    var self = this;

    container.addEventListener('fp:play', function() {
        self._transition('playing');
    });
    container.addEventListener('fp:pause', function() {
        self._transition('paused');
    });
    container.addEventListener('fp:ended', function() {
        self._transition('idle');
    });
    container.addEventListener('fp:error', function() {
        self._transition('error');
    });
    container.addEventListener('fp:trackloaded', function() {
        // loading → playing is handled by fp:play;
        // this event means "media is ready" — used for aria-busy
        self.container.setAttribute('aria-busy', 'false');
    });
}

_FPState.prototype._set = function(state) {
    this.container.dataset.fpState = state;
    this.container.setAttribute('aria-busy',
        state === 'loading' ? 'true' : 'false');
};

_FPState.prototype._transition = function(to) {
    var from = this.current;
    if (from === to) return;
    this.current = to;
    this._set(to);
    this.container.dispatchEvent(new CustomEvent('fp:statechange', {
        bubbles: false,
        detail: { from: from, to: to }
    }));
};

_FPState.prototype.setLoading = function() {
    this._transition('loading');
};

_FPState.prototype.destroy = function() {
    this.container = null;
};
```

- [ ] Call `state.setLoading()` from `_FPCore.loadSrc()` before `mediaEl.load()`:

```diff
 _FPCore.prototype.loadSrc = function(srcObj, title, durationStr) {
+    // Signal loading state (if _FPState is wired in)
+    this._fire('fp:loading', {});
     // ... remove old sources, add new ones ...
     this.mediaEl.load();
     // ...
 };
```

### 2.2 Add `_FPAccessibility` class

**Purpose:** Manages live regions, `aria-busy`, `aria-current`, `aria-pressed` on mute, `aria-disabled` on prev/next.

**Ref:** architecture-v3.md Section 2 ("_FPAccessibility").

- [ ] Add the `_FPAccessibility` constructor after `_FPPlaylist` in the IIFE module order.

```js
// NEW CLASS — _FPAccessibility

function _FPAccessibility(container) {
    this.container = container;

    // Create hidden live region
    this._liveRegion = document.createElement('div');
    this._liveRegion.setAttribute('aria-live', 'polite');
    this._liveRegion.setAttribute('aria-atomic', 'true');
    this._liveRegion.setAttribute('role', 'status');
    this._liveRegion.className = 'frado-player__sr-only';
    this.container.appendChild(this._liveRegion);

    var self = this;

    container.addEventListener('fp:play', function(e) {
        var title = (e.detail && e.detail.title) || '';
        self.announce(title ? title + ' — em reprodução' : 'Em reprodução');
    });

    container.addEventListener('fp:pause', function() {
        self.announce('Pausado');
    });

    container.addEventListener('fp:trackloaded', function(e) {
        var title = (e.detail && e.detail.title) || '';
        if (title) {
            container.setAttribute('aria-label', 'Frado Player — ' + title);
        }
    });

    container.addEventListener('fp:statechange', function(e) {
        var to = e.detail && e.detail.to;
        container.setAttribute('aria-busy', to === 'loading' ? 'true' : 'false');
    });
}

_FPAccessibility.prototype.announce = function(text) {
    // Clear then set — forces AT to re-read even if same text
    this._liveRegion.textContent = '';
    var region = this._liveRegion;
    setTimeout(function() {
        region.textContent = text;
    }, 50);
};

_FPAccessibility.prototype.destroy = function() {
    if (this._liveRegion && this._liveRegion.parentNode) {
        this._liveRegion.parentNode.removeChild(this._liveRegion);
    }
    this._liveRegion = null;
    this.container   = null;
};
```

```css
/* frado-player.css — screen-reader-only utility */

.frado-player__sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}
```

### 2.3 Rewrite `_FPKeyboard` (full v3 key map)

**Purpose:** Container-scoped, full key map per keyboard-shortcuts.md. Adds `K`, `N`, `P`, `Home`, `End`, `Escape`, `1`-`9`.

**Ref:** architecture-v3.md Section 2 ("_FPKeyboard").

- [ ] Replace the v2 `_FPKeyboard` with the v3 rewrite.

```diff
-// v2 _FPKeyboard — 6 keys, document-scoped
+// v3 _FPKeyboard — 14+ keys, container-scoped

 function _FPKeyboard(container, core, playlist, volume) {
     this.container = container;
     this.core      = core;
     this.playlist  = playlist;
     this.volume    = volume;

     var self = this;
     this._handler = function(e) {
         var tag = e.target.tagName;
         if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
         if (e.ctrlKey || e.metaKey || e.altKey) return;

         switch (e.code) {
             case 'Space':
             case 'KeyK':
                 e.preventDefault();
                 self.core.toggle();
                 break;
             case 'ArrowLeft':
                 e.preventDefault();
                 self.core.seek(
                     Math.max(0, (self.core.currentTime - 5) / self.core.duration * 100)
                 );
                 break;
             case 'ArrowRight':
                 e.preventDefault();
                 self.core.seek(
                     Math.min(100, (self.core.currentTime + 5) / self.core.duration * 100)
                 );
                 break;
             case 'ArrowUp':
                 e.preventDefault();
                 self.volume.setVolume(self.volume.pct + 5);
                 break;
             case 'ArrowDown':
                 e.preventDefault();
                 self.volume.setVolume(self.volume.pct - 5);
                 break;
             case 'KeyM':
                 e.preventDefault();
                 self.volume.toggleMute();
                 break;
             case 'KeyF':
                 e.preventDefault();
                 self.container.dispatchEvent(
                     new CustomEvent('fp:fullscreen-request', { bubbles: false })
                 );
                 break;
             case 'KeyN':
                 e.preventDefault();
                 self.playlist.next();
                 break;
             case 'KeyP':
                 e.preventDefault();
                 self.playlist.prev();
                 break;
             case 'Home':
                 e.preventDefault();
                 self.core.seek(0);
                 break;
             case 'End':
                 e.preventDefault();
                 self.core.seek(100);
                 break;
             case 'Escape':
                 e.preventDefault();
                 self.container.dispatchEvent(
                     new CustomEvent('fp:sheet-close', { bubbles: false })
                 );
                 break;
+            default:
+                // 1-9 → jump to 10%-90%
+                if (/^Digit[1-9]$/.test(e.code)) {
+                    e.preventDefault();
+                    var digit = parseInt(e.code.charAt(5), 10);
+                    self.core.seek(digit * 10);
+                }
+                break;
         }
     };

-    document.addEventListener('keydown', this._handler);
+    container.addEventListener('keydown', this._handler);
 }

 _FPKeyboard.prototype.destroy = function() {
-    document.removeEventListener('keydown', this._handler);
+    this.container.removeEventListener('keydown', this._handler);
+    this.container = null;
+    this.core      = null;
+    this.playlist  = null;
+    this.volume    = null;
 };
```

### 2.4 Wire new classes into `FradoPlayer` constructor

- [ ] Instantiate `_FPState` and `_FPAccessibility` in the constructor, and destroy them in `destroy()`.

```diff
 function FradoPlayer(container) {
     this.core      = new _FPCore(container);
+    this.state     = new _FPState(container);
     this.spectrum  = new _FPSpectrum(container, this.core.mediaEl);
     this.volume    = new _FPVolume(container, this.core.mediaEl);
     this.playlist  = new _FPPlaylist(container, this.core);
+    this.a11y      = new _FPAccessibility(container);
     this.session   = new _FPMediaSession(container, this.core, this.playlist);
     this.keyboard  = new _FPKeyboard(container, this.core, this.playlist, this.volume);
     this.sheet     = new _FPBottomSheet(container);

     // ... button click wiring ...
 }
```

```diff
 FradoPlayer.prototype.destroy = function() {
     this.core.destroy();
+    this.state.destroy();
     this.spectrum.destroy();
     this.volume.destroy();
     this.playlist.destroy();
+    this.a11y.destroy();
     this.session.destroy();
     this.keyboard.destroy();
     this.sheet.destroy();
 };
```

---

## Phase 2 — PHP ARIA Additions → v3.1.0

### 2.5 `tabindex="0"` on root `.frado-player` element

**Why:** Keyboard shortcuts now bind to `container`, which needs to be focusable.

- [ ] Add `tabindex="0"` to the root `<div>`.

```diff
 <div class="frado-player"
      id="frado-player-<?php echo $instance; ?>"
+     tabindex="0"
      data-type="..."
      ...>
```

### 2.6 `role="region"` + `aria-label` on root element

**Why:** Identifies the player as a landmark for screen readers.

- [ ] Add `role="region"` and `aria-label` to the root `<div>`.

```diff
 <div class="frado-player"
      id="frado-player-<?php echo $instance; ?>"
      tabindex="0"
+     role="region"
+     aria-label="Frado Player — <?php echo esc_attr( $title_raw ); ?>"
+     aria-busy="false"
+     data-fp-state="idle"
      data-type="..."
      ...>
```

### 2.7 `tabindex="0"` on volume slider

**Why:** Volume slider needs to be keyboard-focusable for arrow key adjustments independent of the seekbar.

- [ ] Add `tabindex="0"` to the volume track element.

```diff
 <div class="frado-player__volume-track"
      role="slider" aria-label="Volume"
      aria-valuemin="0" aria-valuemax="100" aria-valuenow="<?php echo $vol_pct; ?>"
+     aria-valuetext="<?php echo $vol_pct; ?>%"
+     tabindex="0"
      >
```

### 2.8 ARIA attributes on playlist `<li>` items

**Why:** Screen readers need to announce active track and position in the set.

- [ ] Add `aria-current`, `aria-posinset`, `aria-setsize` to each `<li>`.

```diff
 <?php foreach ( $tracks as $i => $track ) : ?>
 <li class="frado-player__track<?php echo $i === 0 ? ' frado-player__track--active' : ''; ?>"
+    aria-current="<?php echo $i === 0 ? 'true' : 'false'; ?>"
+    aria-posinset="<?php echo $i + 1; ?>"
+    aria-setsize="<?php echo count( $tracks ); ?>"
     data-title="<?php echo esc_attr( $track['title'] ); ?>"
     ...>
```

- [ ] Update `_FPPlaylist._applyActiveClass()` in JS to toggle `aria-current`:

```diff
 _FPPlaylist.prototype._applyActiveClass = function(index) {
     for (var i = 0; i < this.tracks.length; i++) {
         var el = this.tracks[i].el;
         if (i === index) {
             el.classList.add('frado-player__track--active');
+            el.setAttribute('aria-current', 'true');
         } else {
             el.classList.remove('frado-player__track--active');
+            el.setAttribute('aria-current', 'false');
         }
     }
 };
```

---

## Phase 2 Verification Checklist

- [ ] `data-fp-state` attribute updates on play/pause/ended
- [ ] `aria-busy="true"` appears during track loading
- [ ] Live region announces track title on play, "Pausado" on pause
- [ ] `aria-label` on container updates when track changes
- [ ] All v3 keyboard shortcuts work (K, N, P, Home, End, Escape, 1-9)
- [ ] Keyboard shortcuts only fire on the focused player
- [ ] `aria-current="true"` on active playlist item, `"false"` on others
- [ ] Volume slider is focusable via Tab key
- [ ] Bump version to `3.1.0` in PHP header and enqueue

---

## Phase 3 — Factory + Theme Integration (frado-player.js + page-musica.php) → v3.2.0

### 3.1 Add `FradoPlayer.fromCard()` static factory

**Purpose:** Theme no longer needs to know player internals. One call replaces 20+ lines of setup.

**Ref:** architecture-v3.md Section 2 ("FradoPlayer.fromCard"), Section 7.

- [ ] Add the static method on `FradoPlayer`.

```js
// Add after FradoPlayer.prototype.destroy

FradoPlayer.fromCard = function(cardEl, containerEl) {
    // 1. Copy data-fp-* attributes from card to container as data-*
    var attrs = cardEl.dataset;
    for (var key in attrs) {
        if (attrs.hasOwnProperty(key) && key.indexOf('fp') === 0) {
            // Convert fpTitle → title, fpSrc → src, etc.
            var mapped = key.charAt(2).toLowerCase() + key.slice(3);
            containerEl.dataset[mapped] = attrs[key];
        }
    }

    // 2. Parse data-fp-tracks CSV into <li> DOM inside containerEl's <ol>
    var tracksStr = cardEl.dataset.fpTracks || '';
    if (tracksStr) {
        var ol = containerEl.querySelector('.frado-player__playlist');
        if (ol) {
            ol.innerHTML = '';
            var items = tracksStr.split(',');
            for (var i = 0; i < items.length; i++) {
                var parts = items[i].split('|');
                var li = document.createElement('li');
                li.className = 'frado-player__track' + (i === 0 ? ' frado-player__track--active' : '');
                li.dataset.title   = (parts[0] || '').trim();
                li.dataset.src     = (parts[1] || '').trim();
                li.dataset.srcFlac = (parts[2] || '').trim();
                li.dataset.srcOpus = (parts[3] || '').trim();
                li.dataset.srcAac  = (parts[4] || '').trim();
                li.dataset.srcMp3  = (parts[1] || '').trim();
                li.dataset.duration = (parts[5] || '').trim();
                li.setAttribute('aria-current', i === 0 ? 'true' : 'false');
                li.setAttribute('aria-posinset', i + 1);
                li.setAttribute('aria-setsize', items.length);

                li.innerHTML =
                    '<span class="frado-player__track-num">' + (i + 1) + '</span>' +
                    '<span class="frado-player__track-name">' +
                        ((parts[0] || '').trim() || ('Faixa ' + (i + 1))) +
                    '</span>' +
                    '<span class="frado-player__track-duration">' +
                        ((parts[5] || '').trim() || '') +
                    '</span>';
                ol.appendChild(li);
            }
        }
    }

    // 3. Instantiate and play immediately (card click = user gesture)
    var instance = new FradoPlayer(containerEl);
    instance.core.play();
    return instance;
};
```

### 3.2 Update `openArtistModal()` in page-musica.php

**What changes:** Remove the 60 ms + 150 ms `setTimeout` block and manual playlist `<li>` building. Replace with a single `FradoPlayer.fromCard()` call AFTER the modal is visible.

**Ref:** architecture-v3.md Section 7.

- [ ] Remove old initialization block.
- [ ] Add `fromCard()` call after `modal.classList.add('active')`.

```diff
 function openArtistModal(card) {
     var modal = document.getElementById('artist-modal');
     var fpEl  = modal.querySelector('.frado-player');

+    // Show modal first — canvas needs dimensions for spectrum init
+    modal.classList.add('active');
+    document.body.style.overflow = 'hidden';

-    // v2: manual playlist building
-    var ol = fpEl.querySelector('.frado-player__playlist');
-    if (ol) {
-        ol.innerHTML = '';
-        var tracksStr = card.dataset.fpTracks || '';
-        // ... 10+ lines of manual <li> creation ...
-    }
-
-    // v2: copy data-* attributes manually
-    fpEl.dataset.title  = card.dataset.fpTitle  || '';
-    fpEl.dataset.artist = card.dataset.fpArtist || '';
-    fpEl.dataset.thumb  = card.dataset.fpThumb  || '';
-    // ... more attribute copying ...
-
-    modal.classList.add('active');
-    document.body.style.overflow = 'hidden';
-
-    // v2: setTimeout hacks for initialization
-    setTimeout(function() {
-        if (window.FradoPlayer) {
-            fpEl._fradoPlayer = new window.FradoPlayer(fpEl);
-            setTimeout(function() {
-                if (fpEl._fradoPlayer && fpEl._fradoPlayer.core) {
-                    fpEl._fradoPlayer.core.play();
-                }
-            }, 150);
-        }
-    }, 60);

+    // v3: single factory call — no setTimeout needed
+    if (window.FradoPlayer && FradoPlayer.fromCard) {
+        fpEl._fradoPlayer = FradoPlayer.fromCard(card, fpEl);
+    } else if (window.FradoPlayer) {
+        // Graceful degradation for v2 plugin still loaded
+        fpEl._fradoPlayer = new FradoPlayer(fpEl);
+    }

     history.pushState({ fpModal: true }, '');
     window._fpModalStatePushed = true;
 }
```

### 3.3 Remove setTimeout hacks

- [ ] Verify no other `setTimeout` calls exist for FradoPlayer initialization in the theme.
- [ ] Search `page-musica.php` for any remaining `setTimeout` references to `FradoPlayer`, `fpEl`, or `fradoPlayer`.

### 3.4 Fix `fvideoToggle()` — handle Promise rejection

**Bug:** `fvideoToggle()` discards the Promise returned by `vid.play()`, causing `UnhandledPromiseRejection` under autoplay restrictions.

**Ref:** architecture-v3.md Bug 2.

- [ ] Add `.catch()` to the `play()` call.

```diff
 function fvideoToggle() {
     var vid = document.getElementById('fvideoEl');
     if (!vid) return;

     if (vid.paused) {
-        vid.play();
+        vid.play().catch(function(err) {
+            console.warn('[frado-video] Autoplay blocked:', err.message);
+        });
     } else {
         vid.pause();
     }
 }
```

### 3.5 Fix `fvideoPrev` / `fvideoNext` — prevent AbortError

**Bug:** `vid.play()` is called synchronously after `vid.load()`, producing `AbortError` because `load()` aborts any pending play Promise.

**Ref:** architecture-v3.md Bug 3.

- [ ] Wait for `canplay` before calling `play()`.

```diff
 function fvideoNext() {
     // ... determine next source ...
     vid.src = nextSrc;
-    vid.load();
-    vid.play();
+    vid.load();
+    vid.addEventListener('canplay', function handler() {
+        vid.removeEventListener('canplay', handler);
+        vid.play().catch(function(err) {
+            console.warn('[frado-video] Play failed:', err.message);
+        });
+    });
 }

 function fvideoPrev() {
     // ... determine prev source ...
     vid.src = prevSrc;
-    vid.load();
-    vid.play();
+    vid.load();
+    vid.addEventListener('canplay', function handler() {
+        vid.removeEventListener('canplay', handler);
+        vid.play().catch(function(err) {
+            console.warn('[frado-video] Play failed:', err.message);
+        });
+    });
 }
```

### 3.6 Add `fvideoInited` guard

**Bug:** Video player listeners in theme have no initialization guard, unlike the `fplayerInited` guard on audio.

**Ref:** architecture-v3.md Bug 15.

- [ ] Add guard variable and check before attaching listeners.

```diff
+var fvideoInited = false;

 function initVideoPlayer() {
+    if (fvideoInited) return;
+    fvideoInited = true;

     var vid = document.getElementById('fvideoEl');
     if (!vid) return;

     // ... attach event listeners ...
 }
```

---

## Phase 3 Verification Checklist

- [ ] Audio player opens via card click and plays immediately (no delay)
- [ ] Video player opens and plays
- [ ] No `setTimeout` references for FradoPlayer init in theme
- [ ] No `UnhandledPromiseRejection` in console on autoplay block
- [ ] No `AbortError` in console on video prev/next
- [ ] Video player does not double-init on repeated opens
- [ ] Back button closes modal correctly (history.pushState flow unchanged)
- [ ] `destroy()` on modal close works without errors
- [ ] Multiple card opens/closes in sequence do not leak players
- [ ] Bump version to `3.2.0` in PHP header and enqueue

---

## Phase 4 — Design Tokens + New Attributes → v3.3.0

### 4.1 Migrate CSS to `var(--fp-*)` design tokens

**Purpose:** All hardcoded color/spacing/timing values become CSS custom properties. Theme overrides become trivial.

**Ref:** architecture-v3.md Section 6.

- [ ] Add `:root` block with all `--fp-*` tokens at the top of `frado-player.css`.
- [ ] Replace all hardcoded values in component styles with `var(--fp-*)`.

```css
/* frado-player.css — prepend this block */

:root {
    /* Colors — Dark (default) */
    --fp-bg:          #0F0F23;
    --fp-surface:     #1B1B30;
    --fp-text:        #F8FAFC;
    --fp-text-muted:  #94A3B8;
    --fp-border:      rgba(255, 255, 255, 0.08);
    --fp-accent:      #CA8A04;
    --fp-accent-soft: rgba(202, 138, 4, 0.45);

    /* Spacing */
    --fp-gap:           8px;
    --fp-radius:        8px;
    --fp-progress-h:    6px;
    --fp-volume-w:      80px;

    /* Animation */
    --fp-duration-fade:     200ms;
    --fp-duration-slide:    320ms;
    --fp-duration-spectrum: 16ms;    /* ~60fps frame budget */

    /* Typography */
    --fp-font-size:   14px;
    --fp-font-family: inherit;
}
```

```diff
 /* Example: progress bar fill — before/after */

-.frado-player__progress-fill {
-    background: #CA8A04;
-    height: 6px;
-    border-radius: 3px;
-    transition: width 0.1s linear;
-}
+.frado-player__progress-fill {
+    background: var(--fp-accent);
+    height: var(--fp-progress-h);
+    border-radius: calc(var(--fp-progress-h) / 2);
+    transition: width var(--fp-duration-fade) linear;
+}
```

```diff
 /* Example: track title text — before/after */

-.frado-player__track-title {
-    color: #F8FAFC;
-    font-size: 14px;
-}
+.frado-player__track-title {
+    color: var(--fp-text);
+    font-size: var(--fp-font-size);
+}
```

### 4.2 Add `@media (prefers-reduced-motion: reduce)`

**Purpose:** Users with vestibular disorders should not see animations.

- [ ] Set all `--fp-duration-*` tokens to `0ms` inside the media query.

```css
@media (prefers-reduced-motion: reduce) {
    :root {
        --fp-duration-fade:     0ms;
        --fp-duration-slide:    0ms;
        --fp-duration-spectrum: 0ms;
    }

    .frado-player__spectrum {
        display: none;  /* Hide animated visualizer entirely */
    }
}
```

### 4.3 Add `@media (prefers-color-scheme: light)`

**Purpose:** Light mode support via system preference.

- [ ] Override surface/text tokens for light mode.

```css
@media (prefers-color-scheme: light) {
    :root {
        --fp-bg:         #F8FAFC;
        --fp-surface:    #E2E8F0;
        --fp-text:       #0F172A;
        --fp-text-muted: #64748B;
        --fp-border:     rgba(0, 0, 0, 0.10);
    }
}
```

### 4.4 Add `autoplay`, `loop`, `color` shortcode attributes

**Purpose:** New shortcode options for v3.

**Ref:** architecture-v3.md Section 5.

- [ ] Register new attributes in `shortcode_atts()`.

```diff
 $atts = shortcode_atts( array(
     'type'     => 'auto',
     'src'      => '',
     // ... existing attributes ...
     'tracks'   => '',
+    'autoplay' => '0',
+    'loop'     => '0',
+    'color'    => '',
 ), $atts, 'frado_player' );

+// Sanitize new attributes
+$autoplay = absint( $atts['autoplay'] ) ? '1' : '0';
+$loop     = absint( $atts['loop'] )     ? '1' : '0';
+$color    = '';
+if ( $atts['color'] && preg_match( '/^#[0-9a-fA-F]{3,6}$/', $atts['color'] ) ) {
+    $color = $atts['color'];
+}
```

### 4.5 PHP: emit `data-autoplay`, `data-loop`, and color override

- [ ] Add new data attributes and optional inline style for color.

```diff
 <div class="frado-player"
      id="frado-player-<?php echo $instance; ?>"
      tabindex="0"
      role="region"
      aria-label="Frado Player — <?php echo esc_attr( $title_raw ); ?>"
      aria-busy="false"
      data-fp-state="idle"
+     data-autoplay="<?php echo $autoplay; ?>"
+     data-loop="<?php echo $loop; ?>"
+     <?php if ( $color ) : ?>style="--fp-accent:<?php echo esc_attr( $color ); ?>"<?php endif; ?>
      data-type="..."
      ...>
```

### 4.6 JS: `bootFradoPlayers` reads `data-autoplay`

- [ ] Auto-play on `canplaythrough` if `data-autoplay="1"`.

```diff
 function bootFradoPlayers() {
     var players = document.querySelectorAll('.frado-player');
     for (var i = 0; i < players.length; i++) {
         var el = players[i];
         if (el._fradoPlayer) continue;  // already initialized
         el._fradoPlayer = new FradoPlayer(el);
+
+        // Auto-play if attribute is set
+        if (el.dataset.autoplay === '1') {
+            (function(instance) {
+                var media = instance.core.mediaEl;
+                media.addEventListener('canplaythrough', function handler() {
+                    media.removeEventListener('canplaythrough', handler);
+                    instance.core.play();
+                });
+            })(el._fradoPlayer);
+        }
     }
 }
```

### 4.7 JS: `_FPCore._buildMedia` reads `data-loop`

- [ ] Set `mediaEl.loop` based on the data attribute.

```diff
 _FPCore.prototype._buildMedia = function() {
     var type = this.type;
     this.mediaEl = document.createElement(type === 'video' ? 'video' : 'audio');
     this.mediaEl.preload = 'metadata';
+
+    // Loop attribute
+    if (this.container.dataset.loop === '1') {
+        this.mediaEl.loop = true;
+    }

     addSources(this.mediaEl, this.container, type);
     // ... rest of method ...
 };
```

---

## Phase 4 Verification Checklist

- [ ] All colors reference `var(--fp-*)` tokens (no hardcoded hex in component rules)
- [ ] `prefers-reduced-motion: reduce` hides spectrum and removes transitions
- [ ] `prefers-color-scheme: light` shows light surface/text colors
- [ ] `[frado_player color="#FF5733"]` overrides accent color on that player only
- [ ] `[frado_player autoplay="1"]` starts playback after `canplaythrough`
- [ ] `[frado_player loop="1"]` repeats the current track indefinitely
- [ ] Multiple players with different `color=` values display correctly on the same page
- [ ] Bump version to `3.3.0` in PHP header and enqueue

---

## Post-Migration Verification (all phases complete)

### Functional

- [ ] Audio player opens and plays (single track + multi-track playlist)
- [ ] Video player opens and plays
- [ ] Keyboard navigation works: `Space`/`K` (toggle), `ArrowLeft`/`ArrowRight` (seek), `ArrowUp`/`ArrowDown` (volume), `M` (mute), `F` (fullscreen), `N` (next), `P` (prev), `Home`/`End` (start/end), `1`-`9` (jump to %), `Escape` (close sheet)
- [ ] Screen reader announces track name on play ("Titulo — em reprodução")
- [ ] Screen reader announces "Pausado" on pause
- [ ] Screen reader reads seekbar position as "1:23 de 4:56"
- [ ] Screen reader reads volume as "70%"
- [ ] Back button closes modal correctly (popstate handler)
- [ ] Multiple players on same page work independently (keyboard scoped to focused player)
- [ ] `prefers-reduced-motion: reduce` disables spectrum and all animations
- [ ] `prefers-color-scheme: light` shows light mode colors
- [ ] `destroy()` on close does not leave event listener leaks (check with DevTools Performance Monitor)
- [ ] `color="#hex"` override works per-player
- [ ] `autoplay="1"` starts playback after buffer ready
- [ ] `loop="1"` loops the track

### Code Quality

- [ ] No `setTimeout` hacks remain for player initialization
- [ ] No `document.addEventListener('keydown', ...)` in player code
- [ ] No inline `style="touch-action:..."` in PHP output
- [ ] No double-escaped entities in data attributes (check with View Source)
- [ ] All `data-src-*` attributes have `esc_attr()` wrapper
- [ ] `_FPBottomSheet.destroy()` removes `window` resize listener
- [ ] IIFE module order matches architecture-v3.md Section 9

### Documentation

- [ ] CHANGELOG.md updated with v3.0.0, v3.1.0, v3.2.0, v3.3.0 entries
- [ ] README.md updated with new shortcode attributes, keyboard shortcuts, accessibility features
- [ ] Version bumped to `3.3.0` (or final phase version) in PHP header and enqueue calls

---

## Quick Reference — File Locations

| File | What Changes |
|---|---|
| `frado-player.php` | Double-escaping, URL attrs, touch-action, enqueue, tracks parser, ARIA markup, new attrs, version |
| `assets/frado-player.js` | Keyboard scope, resizeCanvas, pointercancel, BottomSheet destroy, aria-valuetext, aria-pressed, _FPState, _FPAccessibility, _FPKeyboard v3, fromCard, boot autoplay/loop |
| `assets/frado-player.css` | touch-action rule, sr-only class, design tokens, prefers-reduced-motion, prefers-color-scheme |
| `page-musica.php` (theme) | openArtistModal refactor, fvideoToggle Promise, fvideoPrev/Next canplay, fvideoInited guard |
