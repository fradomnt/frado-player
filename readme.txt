=== Frado Player ===
Contributors: fradomnt
Tags: audio player, video player, media player, spectrum analyzer, playlist, accessibility
Requires at least: 5.5
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 3.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Self-contained audio/video player with spectrum analyzer, playlist, and WCAG 2.1 AA accessibility.

== Description ==

Frado Player is a unified audio and video player for WordPress. Drop it in, use the shortcode, done.

**Features:**

* Real-time spectrum analyzer with Web Audio API
* Embedded playlist with multi-track support
* Automatic codec negotiation (MP3, FLAC, Opus, AAC, OGG)
* Video playback (MP4, WebM, HLS)
* Full ARIA accessibility (WCAG 2.1 AA)
* Keyboard shortcuts (Space, arrows, M, F)
* Media Session API (lock screen controls)
* 60+ CSS design tokens for theming
* Mobile/iOS optimized with bottom sheet playlist
* Zero external dependencies — no jQuery, no CDN
* Works with any WordPress theme

**Shortcode:**

`[frado_player src="song.mp3" title="My Song" artist="Artist Name"]`

== Installation ==

1. Upload the `frado-player` folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Use the `[frado_player]` shortcode in any post or page

Or install directly from WordPress:

1. Go to Plugins > Add New
2. Search for "Frado Player"
3. Click Install Now, then Activate

== Frequently Asked Questions ==

= Does it require jQuery? =
No. Frado Player has zero external dependencies.

= Can I customize the colors? =
Yes. Use the `color` attribute: `[frado_player color="#FF5733" src="..."]`
Or override any of the 60+ CSS design tokens.

= Does it work on mobile? =
Yes. Fully responsive with iOS/Android optimizations and bottom sheet playlist.

= Does it support video? =
Yes. MP4, WebM, and HLS are supported. Use `type="video"` in the shortcode.

= Is it accessible? =
Yes. Full ARIA roles, keyboard navigation, screen reader support, and reduced-motion respect. WCAG 2.1 AA compliant.

== Screenshots ==

1. Audio player with spectrum analyzer — dark theme
2. Playlist with multiple tracks
3. Video player with overlay controls
4. Custom color theming
5. Mobile responsive view

== Changelog ==

= 3.1.0 =
* WordPress.org Plugin Directory release
* Added internationalization (i18n) support
* Scoped CSS tokens to prevent global namespace pollution
* Security hardening: replaced innerHTML with DOM methods
* Added uninstall.php for clean removal

= 3.0.3 =
* Fixed codec negotiation for Safari/iOS
* Improved spectrum analyzer performance

= 3.0.0 =
* Complete rewrite with modular architecture
* Added playlist support
* Added spectrum analyzer
* Added keyboard shortcuts
* Added Media Session API
* Added design token system

== Upgrade Notices ==

= 3.1.0 =
First release on WordPress.org. No breaking changes from 3.0.x.
