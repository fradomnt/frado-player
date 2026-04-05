<?php
/**
 * Plugin Name:       Frado Player
 * Plugin URI:        https://github.com/fradomnt/frado-player
 * Description:       Self-contained audio/video player with spectrum analyzer, playlist, multi-codec negotiation, and WCAG 2.1 AA accessibility. Zero dependencies.
 * Version:           3.1.0
 * Requires at least: 5.5
 * Tested up to:      6.9
 * Requires PHP:      7.4
 * Author:            FRADO
 * Author URI:        https://frado.com.br
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       frado-player
 * Domain Path:       /languages
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'FRADO_PLAYER_VERSION', '3.1.0' );
define( 'FRADO_PLAYER_URL', plugin_dir_url( __FILE__ ) );

/* ── Load textdomain for i18n ──────────────────────────────────────────── */
add_action( 'init', 'frado_player_load_textdomain' );
function frado_player_load_textdomain() {
    load_plugin_textdomain( 'frado-player', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );
}

/* ── Register assets (enqueue only when shortcode is present) ───────────── */
add_action( 'wp_enqueue_scripts', 'frado_player_register_assets' );
function frado_player_register_assets() {
    wp_register_style(
        'frado-player',
        FRADO_PLAYER_URL . 'assets/frado-player.css',
        [],
        FRADO_PLAYER_VERSION
    );
    wp_register_script(
        'frado-player',
        FRADO_PLAYER_URL . 'assets/frado-player.js',
        [],
        FRADO_PLAYER_VERSION,
        true
    );
    wp_localize_script( 'frado-player', 'fradoPlayerI18n', array(
        'play'        => __( 'Play', 'frado-player' ),
        'pause'       => __( 'Pause', 'frado-player' ),
        'mute'        => __( 'Mute', 'frado-player' ),
        'unmute'      => __( 'Unmute', 'frado-player' ),
        'prevTrack'   => __( 'Previous track', 'frado-player' ),
        'nextTrack'   => __( 'Next track', 'frado-player' ),
        'progress'    => __( 'Progress', 'frado-player' ),
        'volume'      => __( 'Volume', 'frado-player' ),
        'track'       => __( 'Track', 'frado-player' ),
        'untitled'    => __( 'Untitled', 'frado-player' ),
        'errorMedia'  => __( 'Error loading media', 'frado-player' ),
        'playing'     => __( 'playing', 'frado-player' ),
        'paused'      => __( 'Paused', 'frado-player' ),
        'trackLabel'  => __( 'Track:', 'frado-player' ),
        'fradoPlayer' => __( 'Frado Player', 'frado-player' ),
    ) );
}

/* ── Parse tracks attribute ─────────────────────────────────────────────── */
function frado_player_parse_tracks( $tracks_str ) {
    if ( empty( $tracks_str ) ) return [];
    $tracks = [];
    $items  = explode( ',', $tracks_str );
    foreach ( $items as $i => $item ) {
        $parts = array_map( 'trim', explode( '|', trim( $item ) ) );

        $title = isset( $parts[0] ) && $parts[0] !== '' ? $parts[0] : __( 'Track', 'frado-player' ) . ' ' . ( $i + 1 );
        $mp3   = isset( $parts[1] ) ? $parts[1] : '';
        $flac  = isset( $parts[2] ) ? $parts[2] : '';
        $opus  = isset( $parts[3] ) ? $parts[3] : '';

        // v3 format: title|mp3|flac|opus|aac|duration|thumb (7 fields)
        // v2 format: title|mp3|flac|opus|duration           (5 fields)
        // Detection: if index 4 looks like a time format (M:SS or MM:SS), it's v2 (no aac)
        $aac      = '';
        $duration = '—';
        $thumb    = '';

        if ( isset( $parts[4] ) && $parts[4] !== '' ) {
            if ( preg_match( '/^\d{1,2}:\d{2}$/', $parts[4] ) ) {
                // v2 format — index 4 is duration (time pattern)
                $duration = $parts[4];
            } else {
                // v3 format — index 4 is aac URL
                $aac      = $parts[4];
                $duration = isset( $parts[5] ) && $parts[5] !== '' ? $parts[5] : '—';
                $thumb    = isset( $parts[6] ) ? $parts[6] : '';
            }
        }

        $tracks[] = [
            'title'    => $title,
            'mp3'      => $mp3,
            'flac'     => $flac,
            'opus'     => $opus,
            'aac'      => $aac,
            'duration' => $duration,
            'thumb'    => $thumb,
        ];
    }
    return $tracks;
}

/* ── Shortcode ──────────────────────────────────────────────────────────── */
add_shortcode( 'frado_player', 'frado_player_shortcode' );
function frado_player_shortcode( $atts ) {

    $atts = shortcode_atts( [
        'type'      => 'auto',
        'src'       => '',
        'src_flac'  => '',
        'src_opus'  => '',
        'src_aac'   => '',
        'src_mp3'   => '',
        'src_av1'   => '',
        'src_hevc'  => '',
        'src_h264'  => '',
        'title'     => __( 'Untitled', 'frado-player' ),
        'artist'    => '',
        'thumb'     => '',
        'duration'  => '0:00',
        'volume'    => '0.7',
        'tracks'    => '',
        'autoplay'  => '0',
        'loop'      => '0',
        'color'     => '',
    ], $atts, 'frado_player' );

    // Unique instance counter for multiple players per page
    static $instance = 0;
    $instance++;
    $player_id = 'frado-player-' . $instance;

    // Enqueue assets only on first instance (WordPress dedupes but this avoids wasted calls)
    if ( $instance === 1 ) {
        wp_enqueue_style( 'frado-player' );
        wp_enqueue_script( 'frado-player' );
    }

    // Sanitize scalar values
    $type      = in_array( $atts['type'], [ 'audio', 'video', 'auto' ], true ) ? $atts['type'] : 'auto';
    $src       = esc_url( $atts['src'] );
    $src_flac  = esc_url( $atts['src_flac'] );
    $src_opus  = esc_url( $atts['src_opus'] );
    $src_aac   = esc_url( $atts['src_aac'] );
    $src_mp3   = esc_url( $atts['src_mp3'] );
    $src_av1   = esc_url( $atts['src_av1'] );
    $src_hevc  = esc_url( $atts['src_hevc'] );
    $src_h264  = esc_url( $atts['src_h264'] );
    $thumb     = esc_url( $atts['thumb'] );
    $duration  = esc_html( sanitize_text_field( $atts['duration'] ) );
    $volume    = floatval( $atts['volume'] );
    $volume    = max( 0.0, min( 1.0, $volume ) );
    $vol_pct   = absint( $volume * 100 );

    // Fix double-escaping: store raw sanitized values for data attributes
    $title_raw  = sanitize_text_field( $atts['title'] );
    $artist_raw = sanitize_text_field( $atts['artist'] );

    // esc_html for text nodes
    $title  = esc_html( $title_raw );
    $artist = esc_html( $artist_raw );

    // New v3 shortcode attributes
    $autoplay = min( 1, absint( $atts['autoplay'] ) );
    $loop     = min( 1, absint( $atts['loop'] ) );
    $color    = $atts['color'];
    if ( $color !== '' && ! preg_match( '/^#[0-9A-Fa-f]{3,6}$/', $color ) ) {
        $color = '';
    }

    // Parse playlist tracks
    $tracks      = frado_player_parse_tracks( $atts['tracks'] );
    $track_count = count( $tracks );
    $tracks_html = '';
    foreach ( $tracks as $idx => $track ) {
        $active_class  = $idx === 0 ? ' frado-player__track--active' : '';
        $track_title   = esc_html( $track['title'] );
        $track_mp3     = esc_url( $track['mp3'] );
        $track_flac    = esc_url( $track['flac'] );
        $track_opus    = esc_url( $track['opus'] );
        $track_aac     = esc_url( $track['aac'] );
        $track_dur     = esc_html( $track['duration'] );
        $track_thumb   = esc_url( $track['thumb'] );
        $track_num     = absint( $idx + 1 );

        $aria_label = esc_attr( $track_num . '. ' . $track['title'] . ( $track['duration'] !== '—' && $track['duration'] !== '' ? ', ' . $track['duration'] : '' ) );

        $aac_attr = '';
        if ( $track_aac !== '' ) {
            $aac_attr = sprintf( ' data-src-aac="%s"', esc_attr( $track_aac ) );
        }

        $thumb_attr = '';
        if ( $track_thumb !== '' ) {
            $thumb_attr = sprintf( ' data-thumb="%s"', esc_attr( $track_thumb ) );
        }

        $tracks_html .= sprintf(
            '<li class="frado-player__track%1$s"'
            . ' data-title="%2$s"'
            . ' data-src="%3$s"'
            . ' data-src-flac="%4$s"'
            . ' data-src-opus="%5$s"'
            . ' data-src-mp3="%3$s"'
            . '%6$s'
            . ' data-duration="%7$s"'
            . '%8$s'
            . ' tabindex="0"'
            . ' aria-label="%9$s"'
            . ' aria-posinset="%10$d"'
            . ' aria-setsize="%11$d"'
            . ' aria-current="%12$s">'
            . '<span class="frado-player__track-num">%10$d</span>'
            . '<span class="frado-player__track-name">%2$s</span>'
            . '<span class="frado-player__track-duration">%7$s</span>'
            . '</li>' . "\n",
            esc_attr( $active_class ),   // 1
            $track_title,                // 2 — already esc_html'd
            esc_attr( $track_mp3 ),      // 3 — esc_attr on URL for data attr
            esc_attr( $track_flac ),     // 4
            esc_attr( $track_opus ),     // 5
            $aac_attr,                   // 6 — pre-formatted or empty
            $track_dur,                  // 7 — already esc_html'd
            $thumb_attr,                 // 8 — pre-formatted or empty
            $aria_label,                 // 9
            $track_num,                  // 10
            $track_count,                // 11
            $idx === 0 ? 'true' : 'false' // 12
        );
    }

    ob_start();
    ?>
<div class="frado-player"
     id="<?php echo esc_attr( $player_id ); ?>"
     role="region"
     aria-label="<?php echo esc_attr( __( 'Frado Player', 'frado-player' ) . ( $title_raw ? ' — ' . $title_raw : '' ) ); ?>"
     aria-busy="false"
     data-fp-state="idle"
     data-type="<?php echo esc_attr( $type ); ?>"
     data-src="<?php echo esc_attr( $src ); ?>"
     data-src-flac="<?php echo esc_attr( $src_flac ); ?>"
     data-src-opus="<?php echo esc_attr( $src_opus ); ?>"
     data-src-aac="<?php echo esc_attr( $src_aac ); ?>"
     data-src-mp3="<?php echo esc_attr( $src_mp3 ); ?>"
     data-src-av1="<?php echo esc_attr( $src_av1 ); ?>"
     data-src-hevc="<?php echo esc_attr( $src_hevc ); ?>"
     data-src-h264="<?php echo esc_attr( $src_h264 ); ?>"
     data-duration="<?php echo esc_attr( $duration ); ?>"
     data-title="<?php echo esc_attr( $title_raw ); ?>"
     data-artist="<?php echo esc_attr( $artist_raw ); ?>"
     data-thumb="<?php echo esc_attr( $thumb ); ?>"
     data-volume="<?php echo esc_attr( $volume ); ?>"
     data-autoplay="<?php echo $autoplay; ?>"
     data-loop="<?php echo $loop; ?>"
     tabindex="0"
     <?php if ( $color ): ?>style="--fp-accent:<?php echo esc_attr( $color ); ?>"<?php endif; ?>>

    <!-- Header: ícone animado + título da faixa + tempo -->
    <div class="frado-player__header">
        <div class="frado-player__spectrum-icon" aria-hidden="true">
            <span></span><span></span><span></span><span></span>
        </div>
        <span class="frado-player__track-title"><?php echo $title; ?></span>
        <span class="frado-player__time">
            <span class="frado-player__time-elapsed">0:00</span>
            <span> / </span>
            <span class="frado-player__time-duration"><?php echo $duration; ?></span>
        </span>
    </div>

    <!-- Seekbar -->
    <div class="frado-player__progress"
         role="slider"
         aria-label="<?php echo esc_attr__( 'Progress', 'frado-player' ); ?>"
         aria-valuemin="0"
         aria-valuemax="100"
         aria-valuenow="0">
        <div class="frado-player__progress-fill"></div>
    </div>

    <!-- Linha de controles: transport + spectrum canvas + volume -->
    <div class="frado-player__controls">

        <!-- Botões de transporte -->
        <div class="frado-player__transport">
            <button class="frado-player__btn frado-player__btn--prev" aria-label="<?php echo esc_attr__( 'Previous track', 'frado-player' ); ?>">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
                </svg>
            </button>
            <button class="frado-player__btn frado-player__btn--play" aria-label="<?php echo esc_attr__( 'Play', 'frado-player' ); ?>">
                <svg class="frado-player__icon-play" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <polygon points="5,3 19,12 5,21"/>
                </svg>
                <svg class="frado-player__icon-pause" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" hidden>
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
            </button>
            <button class="frado-player__btn frado-player__btn--next" aria-label="<?php echo esc_attr__( 'Next track', 'frado-player' ); ?>">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
            </button>
        </div>

        <!-- Canvas do spectrum analyzer (JS cuida do rendering) -->
        <canvas class="frado-player__spectrum" aria-hidden="true"></canvas>

        <!-- Volume -->
        <div class="frado-player__volume-group">
            <button class="frado-player__btn frado-player__btn--mute" aria-label="<?php echo esc_attr__( 'Mute', 'frado-player' ); ?>">
                <!-- Ícone volume alto (padrão) -->
                <svg class="frado-player__icon-vol-high" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
                <!-- Ícone volume médio -->
                <svg class="frado-player__icon-vol-mid" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" hidden>
                    <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
                </svg>
                <!-- Ícone volume baixo -->
                <svg class="frado-player__icon-vol-low" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" hidden>
                    <path d="M7 9v6h4l5 5V4l-5 5H7z"/>
                </svg>
                <!-- Ícone mutado -->
                <svg class="frado-player__icon-vol-muted" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" hidden>
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/>
                </svg>
            </button>
            <div class="frado-player__volume-track"
                 role="slider"
                 aria-label="<?php echo esc_attr__( 'Volume', 'frado-player' ); ?>"
                 aria-valuemin="0"
                 aria-valuemax="100"
                 aria-valuenow="<?php echo esc_attr( $vol_pct ); ?>"
                 tabindex="0">
                <div class="frado-player__volume-fill" style="width:<?php echo esc_attr( $vol_pct ); ?>%"></div>
                <div class="frado-player__volume-thumb"></div>
            </div>
        </div>

    </div>

    <!-- Playlist embutida (renderizada pelo PHP se tracks= presente) -->
    <ol class="frado-player__playlist">
        <?php echo $tracks_html; ?>
    </ol>

</div>
    <?php
    return ob_get_clean();
}
