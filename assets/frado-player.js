/* ── Frado Player v3.0.0 ─────────────────────────────────── */
(function (window, document) {
    'use strict';

    // ── i18n lookup (populated by wp_localize_script) ──────
    var L = window.fradoPlayerI18n || {};

    // ── MODULO CORE ──────────────────────────────────────────

    // Constantes de deteccao
    var VIDEO_EXTS = ['mp4', 'webm', 'ogv', 'mov'];
    var AUDIO_EXTS = ['mp3', 'm4a', 'aac', 'ogg', 'flac', 'wav', 'opus'];

    /**
     * Detecta se o player deve ser audio ou video.
     * Prioridade: data-type forcado > sources de video > extensao do src principal.
     */
    function detectType(container) {
        var forced = container.dataset.type;
        if (forced && forced !== 'auto') return forced;

        // Se tem src de video → video
        if (container.dataset.srcAv1 || container.dataset.srcHevc || container.dataset.srcH264) {
            return 'video';
        }

        // Detecta pela extensao do src principal
        var src = container.dataset.src || container.dataset.srcMp3 || container.dataset.srcFlac || '';
        if (!src) return 'audio'; // default

        var ext = src.split('?')[0].split('.').pop().toLowerCase();
        return VIDEO_EXTS.indexOf(ext) > -1 ? 'video' : 'audio';
    }

    /**
     * Adiciona elementos <source> ao mediaEl conforme dataset do container.
     */
    function addSources(mediaEl, container, type) {
        var sources = type === 'video'
            ? [
                { attr: 'srcAv1',  mime: 'video/mp4; codecs="av01.0.08M.08"' },
                { attr: 'srcHevc', mime: 'video/mp4; codecs="hvc1"' },
                { attr: 'srcH264', mime: 'video/mp4; codecs="avc1.42E01E"' },
                { attr: 'src',     mime: 'video/mp4' }
              ]
            : [
                { attr: 'srcFlac', mime: 'audio/flac' },
                { attr: 'srcOpus', mime: 'audio/ogg; codecs=opus' },
                { attr: 'srcAac',  mime: 'audio/mp4' },
                { attr: 'srcMp3',  mime: 'audio/mpeg' },
                { attr: 'src',     mime: 'audio/mpeg' }
              ];

        sources.forEach(function (s) {
            var url = container.dataset[s.attr];
            if (!url) return;
            var el = document.createElement('source');
            el.src = url;
            el.type = s.mime;
            mediaEl.appendChild(el);
        });
    }

    /**
     * @param {HTMLElement} container — elemento .frado-player
     */
    function _FPCore(container) {
        var self = this;

        // Propriedades publicas
        this.container   = container;
        this.type        = detectType(container);
        this.title       = container.dataset.title  || '';
        this.artist      = container.dataset.artist || '';
        this.thumb       = container.dataset.thumb  || '';
        this.duration    = 0;
        this.currentTime = 0;
        this.isPlaying   = false;

        // Cria elemento de midia
        this.mediaEl = this._buildMedia();

        // Referencia do progress bar (seekbar)
        this.progressEl = this._el('.frado-player__progress');

        // Bind de eventos do elemento de midia
        this._bindMediaEvents();

        // Bind da seekbar
        this._bindSeekbar();
    }

    _FPCore.prototype._buildMedia = function () {
        var mediaEl;

        if (this.type === 'video') {
            // Cria wrapper de video
            var wrap = document.createElement('div');
            wrap.className = 'frado-player__video-wrap';

            mediaEl = document.createElement('video');
            mediaEl.className = 'frado-player__media';
            mediaEl.setAttribute('playsinline', '');
            mediaEl.setAttribute('webkit-playsinline', '');
            mediaEl.preload = 'metadata';

            addSources(mediaEl, this.container, 'video');

            var overlay = document.createElement('div');
            overlay.className = 'frado-player__video-overlay';

            wrap.appendChild(mediaEl);
            wrap.appendChild(overlay);

            // Insere como primeiro filho do container
            this.container.insertBefore(wrap, this.container.firstChild);
        } else {
            // Audio
            mediaEl = document.createElement('audio');
            mediaEl.className = 'frado-player__media';
            mediaEl.preload = 'metadata';
            mediaEl.style.display = 'none';

            addSources(mediaEl, this.container, 'audio');

            this.container.insertBefore(mediaEl, this.container.firstChild);
        }

        return mediaEl;
    };

    _FPCore.prototype._bindMediaEvents = function () {
        var self = this;
        var mediaEl = this.mediaEl;

        // timeupdate
        mediaEl.addEventListener('timeupdate', function () {
            var ct  = mediaEl.currentTime;
            var dur = mediaEl.duration || 0;
            var pct = dur > 0 ? (ct / dur) * 100 : 0;

            self.currentTime = ct;

            // Atualiza DOM
            var fillEl = self._el('.frado-player__progress-fill');
            if (fillEl) fillEl.style.width = pct + '%';

            var progressBar = self._el('.frado-player__progress[aria-valuenow]');
            if (progressBar) {
                progressBar.setAttribute('aria-valuenow', Math.round(pct));
                // B-aria: set aria-valuetext on seekbar
                progressBar.setAttribute('aria-valuetext', self._fmt(ct) + ' de ' + self._fmt(dur));
            }

            var elapsedEl = self._el('.frado-player__time-elapsed');
            if (elapsedEl) elapsedEl.textContent = self._fmt(ct);

            // Dispara evento
            self._fire('fp:timeupdate', { currentTime: ct, duration: dur, pct: pct });
        });

        // loadedmetadata
        mediaEl.addEventListener('loadedmetadata', function () {
            self.duration = mediaEl.duration;

            var durEl = self._el('.frado-player__time-duration');
            if (durEl) durEl.textContent = self._fmt(mediaEl.duration);

            self._fire('fp:trackloaded', { title: self.title, duration: self._fmt(mediaEl.duration) });
        });

        // ended
        mediaEl.addEventListener('ended', function () {
            self.isPlaying = false;
            self._setPlayState(false);
            self._fire('fp:ended');
        });

        // play (disparado pelo proprio elemento)
        mediaEl.addEventListener('play', function () {
            self.isPlaying = true;
            self._setPlayState(true);
            self._fire('fp:play', { title: self.title });
        });

        // pause (disparado pelo proprio elemento)
        mediaEl.addEventListener('pause', function () {
            self.isPlaying = false;
            self._setPlayState(false);
            self._fire('fp:pause');
        });

        // error
        mediaEl.addEventListener('error', function () {
            self._fire('fp:error', { message: (L.errorMedia || 'Error loading media') });
        });
    };

    _FPCore.prototype._bindSeekbar = function () {
        var self = this;
        var progressEl = this.progressEl;
        if (!progressEl) return;

        var seeking = false;

        progressEl.addEventListener('pointerdown', function (e) {
            seeking = true;
            progressEl.setPointerCapture(e.pointerId);
            self._doSeek(e);
        });

        progressEl.addEventListener('pointermove', function (e) {
            if (!seeking) return;
            self._doSeek(e);
        });

        progressEl.addEventListener('pointerup', function () {
            seeking = false;
        });

        // B2: Fix seekbar pointercancel — reset seeking flag
        progressEl.addEventListener('pointercancel', function (e) {
            seeking = false;
            if (progressEl.releasePointerCapture) {
                progressEl.releasePointerCapture(e.pointerId);
            }
        });
    };

    _FPCore.prototype._doSeek = function (e) {
        var rect = this.progressEl.getBoundingClientRect();
        var pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        if (this.mediaEl.duration) {
            this.mediaEl.currentTime = (pct / 100) * this.mediaEl.duration;
        }
    };

    /**
     * Inicia reproducao. Retorna Promise para tratar autoplay policy.
     */
    _FPCore.prototype.play = function () {
        var self = this;
        var promise = this.mediaEl.play();
        if (promise && promise.catch) {
            promise.catch(function (err) {
                // Autoplay bloqueado — silenciosamente ignora
                console.warn('FradoPlayer: autoplay blocked', err);
            });
        }
        return promise;
    };

    /**
     * Pausa reproducao.
     */
    _FPCore.prototype.pause = function () {
        this.mediaEl.pause();
    };

    /**
     * Alterna play/pause.
     */
    _FPCore.prototype.toggle = function () {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    };

    /**
     * Seek por porcentagem (0-100).
     */
    _FPCore.prototype.seek = function (pct) {
        pct = Math.max(0, Math.min(100, pct));
        if (this.mediaEl.duration) {
            this.mediaEl.currentTime = (pct / 100) * this.mediaEl.duration;
        }
    };

    /**
     * Troca a faixa atual.
     * @param {Object} srcObj — { src, srcFlac, srcOpus, srcAac, srcMp3, srcAv1, srcHevc, srcH264 }
     * @param {string} title
     * @param {string} durationStr — duracao formatada (ex: '3:42') exibida antes do metadata
     */
    _FPCore.prototype.loadSrc = function (srcObj, title, durationStr) {
        var self = this;

        // 1. Pausa
        this.pause();

        // 2. Remove todos os <source> filhos
        var sources = this.mediaEl.querySelectorAll('source');
        for (var i = sources.length - 1; i >= 0; i--) {
            this.mediaEl.removeChild(sources[i]);
        }

        // 3. Adiciona novos sources
        var sourceMap = this.type === 'video'
            ? [
                { key: 'srcAv1',  mime: 'video/mp4; codecs="av01.0.08M.08"' },
                { key: 'srcHevc', mime: 'video/mp4; codecs="hvc1"' },
                { key: 'srcH264', mime: 'video/mp4; codecs="avc1.42E01E"' },
                { key: 'src',     mime: 'video/mp4' }
              ]
            : [
                { key: 'srcFlac', mime: 'audio/flac' },
                { key: 'srcOpus', mime: 'audio/ogg; codecs=opus' },
                { key: 'srcAac',  mime: 'audio/mp4' },
                { key: 'srcMp3',  mime: 'audio/mpeg' },
                { key: 'src',     mime: 'audio/mpeg' }
              ];

        sourceMap.forEach(function (s) {
            var url = srcObj[s.key];
            if (!url) return;
            var el = document.createElement('source');
            el.src = url;
            el.type = s.mime;
            self.mediaEl.appendChild(el);
        });

        // 4. Reset e reload — remove atributo src para browser usar <source> children
        this.mediaEl.removeAttribute('src');
        this.mediaEl.load();

        // 5. Atualiza titulo
        this.title = title || '';

        // 6. Atualiza DOM — titulo
        var titleEl = this._el('.frado-player__track-title');
        if (titleEl) titleEl.textContent = this.title;

        // 7. Atualiza DOM — duracao (antes do metadata carregar)
        var durEl = this._el('.frado-player__time-duration');
        if (durEl) durEl.textContent = durationStr || '0:00';

        // 8. Reseta progress fill
        var fillEl = this._el('.frado-player__progress-fill');
        if (fillEl) fillEl.style.width = '0%';

        // 9. Reseta tempo decorrido
        var elapsedEl = this._el('.frado-player__time-elapsed');
        if (elapsedEl) elapsedEl.textContent = '0:00';

        // 10. Dispara evento
        this._fire('fp:trackloaded', { title: this.title, duration: durationStr || '0:00' });
    };

    /**
     * Destroi a instancia: remove listeners, remove mediaEl do DOM.
     */
    _FPCore.prototype.destroy = function () {
        // Pausa antes de destruir
        try { this.mediaEl.pause(); } catch (e) { /* noop */ }

        // Remove o elemento de midia (ou seu wrapper de video) do DOM
        if (this.type === 'video') {
            var wrap = this.mediaEl.parentElement;
            if (wrap && wrap.classList.contains('frado-player__video-wrap')) {
                wrap.parentElement.removeChild(wrap);
            }
        } else {
            if (this.mediaEl.parentElement) {
                this.mediaEl.parentElement.removeChild(this.mediaEl);
            }
        }

        // Limpa referencias
        this.mediaEl    = null;
        this.progressEl = null;
        this.container  = null;
    };

    /**
     * Atalho para querySelector dentro do container.
     */
    _FPCore.prototype._el = function (selector) {
        return this.container.querySelector(selector);
    };

    /**
     * Formata segundos em 'm:ss'.
     */
    _FPCore.prototype._fmt = function (sec) {
        sec = Math.max(0, Math.floor(sec || 0));
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    };

    /**
     * Dispara CustomEvent no container.
     */
    _FPCore.prototype._fire = function (name, detail) {
        this.container.dispatchEvent(new CustomEvent(name, {
            detail: detail || {},
            bubbles: false
        }));
    };

    /**
     * Atualiza estado visual de play/pause (icones, classe, aria-label, aria-pressed).
     */
    _FPCore.prototype._setPlayState = function (playing) {
        var iconPlay  = this.container.querySelector('.frado-player__icon-play');
        var iconPause = this.container.querySelector('.frado-player__icon-pause');

        if (iconPlay)  iconPlay.hidden  =  playing;
        if (iconPause) iconPause.hidden = !playing;

        this.container.classList.toggle('frado-player--playing', playing);

        var btn = this.container.querySelector('.frado-player__btn--play');
        if (btn) {
            btn.setAttribute('aria-label', playing ? (L.pause || 'Pause') : (L.play || 'Play'));
            // B-aria: set aria-pressed on play button
            btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
        }
    };

    // ── MODULO STATE (NEW) ──────────────────────────────────

    function _FPState(container) {
        this._container = container;
        this._current = 'idle';
        var self = this;

        container.addEventListener('fp:play',        function() { self._transition('playing'); });
        container.addEventListener('fp:pause',       function() { self._transition('paused'); });
        container.addEventListener('fp:ended',       function() { self._transition('idle'); });
        container.addEventListener('fp:error',       function() { self._transition('error'); });
        container.addEventListener('fp:trackloaded', function() { self._transition('loading'); });
    }

    _FPState.prototype = {
        _transition: function(to) {
            var from = this._current;
            if (from === to) return;
            this._current = to;
            this._container.dataset.fpState = to;
            this._container.setAttribute('aria-busy', to === 'loading' ? 'true' : 'false');
            var ev = new CustomEvent('fp:statechange', { detail: { from: from, to: to }, bubbles: false });
            this._container.dispatchEvent(ev);
        },
        destroy: function() {
            this._container = null;
        }
    };

    Object.defineProperty(_FPState.prototype, 'current', {
        get: function() { return this._current; }
    });

    // ── MODULO SPECTRUM ──────────────────────────────────────

    function _FPSpectrum(container, mediaEl) {
        this.container = container;
        this.mediaEl   = mediaEl;
        this._raf         = null;
        this._collapseRaf = null;
        this._audioReady  = false;
        this._audioCtx    = null;
        this._analyser    = null;
        this._dataArray   = null;
        this._bands       = [];
        this._canvas      = null;
        this._ctx2d       = null;
        this._dpr         = 1;
        this._canvasW     = 0;
        this._canvasH     = 0;
        this._resizeObs   = null;

        // Setup canvas primeiro (nao precisa de AudioContext)
        this._setupCanvas();

        // Audio inicializa so no start() para respeitar autoplay policy

        // Escutar eventos do player
        var self = this;
        this._onPlay  = function() { self.start(); };
        this._onPause = function() { self.collapse(); };
        this._onEnded = function() { self.collapse(); };

        container.addEventListener('fp:play',  this._onPlay);
        container.addEventListener('fp:pause', this._onPause);
        container.addEventListener('fp:ended', this._onEnded);

        // Resume AudioContext na primeira interacao (se suspended)
        this._resumeHandler = function() {
            if (self._audioCtx && self._audioCtx.state === 'suspended') {
                self._audioCtx.resume();
            }
        };
        document.addEventListener('click',      this._resumeHandler, { once: true });
        document.addEventListener('touchstart', this._resumeHandler, { once: true });
    }

    _FPSpectrum.prototype._initAudio = function() {
        if (this._audioCtx) return; // ja iniciado

        try {
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            this._audioCtx = new AudioCtx();
            this._analyser = this._audioCtx.createAnalyser();
            this._analyser.fftSize = 2048;
            this._analyser.smoothingTimeConstant = 0.8; // decay suave ~150 ms

            // createMediaElementSource so pode ser chamado UMA vez por elemento
            if (!this.mediaEl._fpSourceNode) {
                this.mediaEl._fpSourceNode = this._audioCtx.createMediaElementSource(this.mediaEl);
            }
            this.mediaEl._fpSourceNode.connect(this._analyser);
            this._analyser.connect(this._audioCtx.destination);

            this._dataArray  = new Uint8Array(this._analyser.frequencyBinCount); // 1024 valores
            this._audioReady = true;
        } catch (e) {
            console.warn('FradoSpectrum: Web Audio API nao disponivel', e);
            this._audioReady = false;
        }
    };

    _FPSpectrum.prototype._setupCanvas = function() {
        this._canvas = this.container.querySelector('.frado-player__spectrum');
        if (!this._canvas) return;
        this._ctx2d = this._canvas.getContext('2d');
        this._dpr   = window.devicePixelRatio || 1;
        this._resizeCanvas();

        // Resize observer para quando o layout muda
        if (window.ResizeObserver) {
            var self = this;
            this._resizeObs = new ResizeObserver(function() { self._resizeCanvas(); });
            this._resizeObs.observe(this._canvas);
        }
    };

    // B1: Fix _resizeCanvas() cumulative scale bug — use setTransform instead of scale
    _FPSpectrum.prototype._resizeCanvas = function() {
        if (!this._canvas) return;
        var w = this._canvas.offsetWidth;
        var h = this._canvas.offsetHeight || 32;
        this._canvas.width  = w * this._dpr;
        this._canvas.height = h * this._dpr;
        this._ctx2d.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
        this._canvasW = w;
        this._canvasH = h;
    };

    _FPSpectrum.prototype._buildBands = function() {
        this._bands = [];
        var sampleRate = this._audioCtx.sampleRate;
        var binCount   = this._analyser.frequencyBinCount;
        var nyquist    = sampleRate / 2;

        for (var i = 0; i < 30; i++) {
            var freq = 20 * Math.pow(1000, i / 29);

            var binIndex = Math.round(freq * binCount / nyquist);
            binIndex = Math.max(0, Math.min(binCount - 1, binIndex));

            this._bands.push({
                freq: freq,
                binIndex: binIndex,
                currentHeight: 0
            });
        }
    };

    _FPSpectrum.prototype._draw = function() {
        var self = this;
        if (!this._audioReady || !this._canvas || !this._ctx2d) return;

        this._raf = requestAnimationFrame(function() { self._draw(); });

        // Busca dados FFT
        this._analyser.getByteFrequencyData(this._dataArray);

        var ctx = this._ctx2d;
        var W   = this._canvasW;
        var H   = this._canvasH;
        var N   = 30;
        var gap = 2;
        var barW = Math.max(2, (W - gap * (N - 1)) / N);

        ctx.clearRect(0, 0, W, H);

        for (var i = 0; i < N; i++) {
            var band     = this._bands[i];
            var rawValue = this._dataArray[band.binIndex];

            var targetHeight = (rawValue / 255) * H;

            if (targetHeight > band.currentHeight) {
                band.currentHeight = targetHeight;
            } else {
                band.currentHeight = band.currentHeight * 0.75 + targetHeight * 0.25;
            }

            var barH = Math.max(0, Math.min(H, band.currentHeight));

            var x = i * (barW + gap);
            var y = H - barH;

            if (barH > 0) {
                var grad = ctx.createLinearGradient(0, y, 0, H);
                grad.addColorStop(0, '#CA8A04');
                grad.addColorStop(1, 'rgba(202,138,4,0.45)');
                ctx.fillStyle = grad;
                ctx.fillRect(x, y, barW, barH);
            }
        }
    };

    _FPSpectrum.prototype.start = function() {
        if (!this._audioReady) {
            this._initAudio();
            if (!this._audioReady) return;
        }
        // Se canvas estava oculto na inicializacao (ex: dentro de modal), recalcula tamanho
        if (this._canvas && !this._canvasW) {
            this._resizeCanvas();
        }
        if (this._audioCtx.state === 'suspended') {
            this._audioCtx.resume();
        }
        if (this._collapseRaf) {
            cancelAnimationFrame(this._collapseRaf);
            this._collapseRaf = null;
        }
        if (!this._raf) {
            this._buildBands();
            this._draw();
        }
    };

    _FPSpectrum.prototype.stop = function() {
        if (this._raf) {
            cancelAnimationFrame(this._raf);
            this._raf = null;
        }
    };

    _FPSpectrum.prototype.collapse = function() {
        var self = this;
        this.stop();

        if (!this._bands.length) return;

        var collapseLoop = function() {
            var allZero = true;
            var i;
            for (i = 0; i < self._bands.length; i++) {
                self._bands[i].currentHeight *= 0.85;
                if (self._bands[i].currentHeight > 0.5) allZero = false;
            }

            if (self._ctx2d && self._canvasW) {
                var ctx = self._ctx2d;
                var W   = self._canvasW;
                var H   = self._canvasH;
                var N   = 30;
                var gap = 2;
                var barW = Math.max(2, (W - gap * (N - 1)) / N);
                ctx.clearRect(0, 0, W, H);
                for (var j = 0; j < N; j++) {
                    var barH = self._bands[j].currentHeight;
                    if (barH > 0.5) {
                        var x = j * (barW + gap);
                        ctx.fillStyle = '#CA8A04';
                        ctx.fillRect(x, H - barH, barW, barH);
                    }
                }
            }

            if (!allZero) {
                self._collapseRaf = requestAnimationFrame(collapseLoop);
            } else {
                if (self._ctx2d) {
                    self._ctx2d.clearRect(0, 0, self._canvasW, self._canvasH);
                }
                self._collapseRaf = null;
            }
        };

        if (this._collapseRaf) cancelAnimationFrame(this._collapseRaf);
        this._collapseRaf = requestAnimationFrame(collapseLoop);
    };

    _FPSpectrum.prototype.destroy = function() {
        this.stop();
        if (this._collapseRaf) {
            cancelAnimationFrame(this._collapseRaf);
            this._collapseRaf = null;
        }
        if (this._resizeObs) this._resizeObs.disconnect();

        this.container.removeEventListener('fp:play',  this._onPlay);
        this.container.removeEventListener('fp:pause', this._onPause);
        this.container.removeEventListener('fp:ended', this._onEnded);

        if (this._audioCtx) {
            try { this._audioCtx.close(); } catch (e) { /* ignore */ }
        }

        if (this._ctx2d && this._canvasW) {
            this._ctx2d.clearRect(0, 0, this._canvasW, this._canvasH);
        }

        this._canvas     = null;
        this._ctx2d      = null;
        this._audioCtx   = null;
        this._analyser   = null;
        this._dataArray  = null;
        this._bands      = [];
        this._audioReady = false;
    };

    // ── MODULO VOLUME ────────────────────────────────────────

    function pctToGain(pct) {
        return Math.pow(pct / 100, 2);
    }

    function _FPVolume(container, mediaEl) {
        this.container    = container;
        this.mediaEl      = mediaEl;
        this.pct             = 70;
        this.muted           = false;
        this._lastPct        = 70;
        this._initialized    = false;
        this._hasStoredPrefs = false;
        this._vol            = 0.7; // internal linear 0-1 for keyboard access

        // Elementos DOM
        this._trackEl = container.querySelector('.frado-player__volume-track');
        this._fillEl  = container.querySelector('.frado-player__volume-fill');
        this._thumbEl = container.querySelector('.frado-player__volume-thumb');
        this._muteBtn = container.querySelector('.frado-player__btn--mute');

        // Carregar prefs salvas (sobrescreve os defaults acima)
        this._loadPrefs();

        // B4: Fix localStorage muted volume initialization
        // If muted from saved prefs, ensure mediaEl.volume is set to the saved value
        // (not relying on browser default 1.0) before muting
        if (this.muted && this.mediaEl) {
            this.mediaEl.volume = pctToGain(this.pct);
        }

        // Aplicar estado inicial no mediaEl
        this._applyVolume();
        this._updateFill();
        this._updateThumb();
        this._updateIcons();

        // Aria inicial
        if (this._trackEl) {
            this._trackEl.setAttribute('aria-valuenow', Math.round(this.pct));
            // B-aria: set initial aria-valuetext on volume slider
            this._trackEl.setAttribute('aria-valuetext', Math.round(this.pct) + '%');
        }

        // B-aria: set initial mute button aria
        if (this._muteBtn) {
            this._muteBtn.setAttribute('aria-pressed', this.muted ? 'true' : 'false');
            this._muteBtn.setAttribute('aria-label', this.muted ? (L.unmute || 'Unmute') : (L.mute || 'Mute'));
        }

        // Listeners
        this._initDrag();
        this._initWheel();
        this._initMuteBtn();

        // Track internal volume for keyboard access
        this._vol = this.pct / 100;
    }

    _FPVolume.prototype._initDrag = function () {
        var self     = this;
        var dragging = false;

        if (!this._trackEl) return;

        this._trackEl.addEventListener('pointerdown', function (e) {
            dragging = true;
            self._trackEl.setPointerCapture(e.pointerId);
            self._trackEl.classList.add('frado-player__volume-track--dragging');
            self._setFromEvent(e);
        });

        this._trackEl.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            self._setFromEvent(e);
        });

        var endDrag = function () {
            dragging = false;
            if (self._trackEl) {
                self._trackEl.classList.remove('frado-player__volume-track--dragging');
            }
        };

        this._trackEl.addEventListener('pointerup',     endDrag);
        this._trackEl.addEventListener('pointercancel', endDrag);
    };

    _FPVolume.prototype._setFromEvent = function (e) {
        var rect = this._trackEl.getBoundingClientRect();
        var pct  = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));

        if (this.muted && pct > 0) {
            this.muted = false;
            if (this.mediaEl) this.mediaEl.muted = false;
        }

        this.setVolume(pct);
    };

    _FPVolume.prototype._initWheel = function () {
        var self  = this;
        var group = this.container.querySelector('.frado-player__volume-group');
        if (!group) return;

        group.addEventListener('wheel', function (e) {
            e.preventDefault();
            var delta  = e.deltaY < 0 ? 5 : -5;
            var newPct = Math.max(0, Math.min(100, self.pct + delta));

            if (self.muted && newPct > 0) {
                self.muted = false;
                if (self.mediaEl) self.mediaEl.muted = false;
            }

            self.setVolume(newPct);
        }, { passive: false });
    };

    _FPVolume.prototype._initMuteBtn = function () {
        var self = this;
        if (!this._muteBtn) return;

        this._muteBtn.addEventListener('click', function () {
            self.toggleMute();
        });
    };

    _FPVolume.prototype.toggleMute = function () {
        this.muted = !this.muted;

        if (this.muted) {
            this._lastPct = this.pct > 0 ? this.pct : 70;
            if (this.mediaEl) this.mediaEl.muted = true;
        } else {
            if (this.mediaEl) this.mediaEl.muted = false;
            if (this.pct === 0) this.setVolume(this._lastPct);
        }

        this._updateFill();
        this._updateThumb();
        this._updateIcons();
        this._savePrefs();

        // B-aria: update mute button aria
        if (this._muteBtn) {
            this._muteBtn.setAttribute('aria-pressed', this.muted ? 'true' : 'false');
            this._muteBtn.setAttribute('aria-label', this.muted ? (L.unmute || 'Unmute') : (L.mute || 'Mute'));
        }

        if (navigator.vibrate) navigator.vibrate(8);
    };

    _FPVolume.prototype.setVolume = function (pct) {
        this.pct = Math.max(0, Math.min(100, pct));
        this._vol = this.pct / 100;
        this._applyVolume();
        this._updateFill();
        this._updateThumb();
        this._updateIcons();
        this._savePrefs();

        if (this._trackEl) {
            this._trackEl.setAttribute('aria-valuenow', Math.round(this.pct));
            // B-aria: set aria-valuetext on volume slider
            this._trackEl.setAttribute('aria-valuetext', Math.round(this.pct) + '%');
        }
    };

    _FPVolume.prototype._applyVolume = function () {
        if (!this.mediaEl) return;

        if (!this._initialized) {
            // data-volume e o fallback inicial; localStorage tem prioridade
            if (!this._hasStoredPrefs) {
                var initVol = parseFloat(this.container.dataset ? this.container.dataset.volume : 0);
                if (!isNaN(initVol) && initVol > 0) {
                    // Keep float precision — no Math.round, continuous fader.
                    this.pct = initVol * 100;
                }
            }
            this._initialized = true;
        }

        if (!this.muted) {
            this.mediaEl.volume = pctToGain(this.pct);
            this.mediaEl.muted  = false;
        }
    };

    _FPVolume.prototype._updateFill = function () {
        if (!this._fillEl) return;
        var displayPct = this.muted ? 0 : this.pct;
        this._fillEl.style.width = displayPct + '%';
    };

    _FPVolume.prototype._updateThumb = function () {
        if (!this._thumbEl) return;
        var displayPct = this.muted ? 0 : this.pct;
        var thumbW     = 12;

        if (this._trackEl) {
            var trackW  = this._trackEl.offsetWidth;
            var leftPx  = (displayPct / 100) * trackW - (thumbW / 2);
            leftPx      = Math.max(0, Math.min(trackW - thumbW, leftPx));
            this._thumbEl.style.left = leftPx + 'px';
        }
    };

    _FPVolume.prototype._updateIcons = function () {
        var icons = {
            high:  this.container.querySelector('.frado-player__icon-vol-high'),
            mid:   this.container.querySelector('.frado-player__icon-vol-mid'),
            low:   this.container.querySelector('.frado-player__icon-vol-low'),
            muted: this.container.querySelector('.frado-player__icon-vol-muted')
        };

        var keys = Object.keys(icons);
        for (var i = 0; i < keys.length; i++) {
            if (icons[keys[i]]) icons[keys[i]].hidden = true;
        }

        var active;
        if (this.muted || this.pct === 0) {
            active = icons.muted;
        } else if (this.pct <= 33) {
            active = icons.low;
        } else if (this.pct <= 66) {
            active = icons.mid;
        } else {
            active = icons.high;
        }

        if (active) active.hidden = false;
    };

    _FPVolume.prototype._loadPrefs = function () {
        try {
            var raw = localStorage.getItem('frado-player-prefs');
            if (!raw) return;
            var prefs = JSON.parse(raw);
            if (typeof prefs.volume === 'number') {
                // Full-precision float — the custom track/thumb slider is
                // already continuous when dragged; we must not quantize on
                // reload or every reopen would snap to an integer and the
                // user would hear a tiny volume step.
                this.pct             = Math.max(0, Math.min(1, prefs.volume)) * 100;
                this._hasStoredPrefs = true;
            }
            if (typeof prefs.muted === 'boolean') {
                this.muted = prefs.muted;
            }
        } catch (e) {
            // localStorage bloqueado ou JSON invalido — ignorar silenciosamente
        }
    };

    _FPVolume.prototype._savePrefs = function () {
        try {
            localStorage.setItem('frado-player-prefs', JSON.stringify({
                volume: this.pct / 100,
                muted:  this.muted
            }));
        } catch (e) {
            // Quota excedida ou modo privado — ignorar silenciosamente
        }
    };

    _FPVolume.prototype.destroy = function () {
        this.container = null;
        this.mediaEl   = null;
        this._trackEl  = null;
        this._fillEl   = null;
        this._thumbEl  = null;
        this._muteBtn  = null;
    };

    // ── MODULO PLAYLIST + EXTENSIONS ────────────────────────

    /**
     * @param {Element} container  .frado-player
     * @param {Object}  core       instancia de _FPCore
     */
    function _FPPlaylist(container, core) {
        this.container    = container;
        this.core         = core;
        this.currentIndex = 0;
        this.tracks       = [];

        this._readTracks();
        this._initClickHandlers();
        this._initAutoAdvance();

        // Carregar primeira faixa se houver
        if (this.tracks.length > 0) {
            this._applyActiveClass(0);
            // Precarregar sources da faixa 0 quando o container nao tem src proprio
            // (ex: player inicializado dinamicamente no modal com data-src* vazios)
            var hasSrc = container.dataset.src || container.dataset.srcMp3 ||
                         container.dataset.srcFlac || container.dataset.srcAac ||
                         container.dataset.srcOpus;
            if (!hasSrc) {
                var t0 = this.tracks[0];
                this.core.loadSrc(
                    { src: t0.src, srcFlac: t0.srcFlac, srcOpus: t0.srcOpus,
                      srcAac: t0.srcAac, srcMp3: t0.srcMp3 },
                    t0.title, t0.duration
                );
            }
        }
    }

    _FPPlaylist.prototype._readTracks = function() {
        var items = this.container.querySelectorAll('.frado-player__track');
        var self  = this;

        items.forEach(function(li, i) {
            var nameEl = li.querySelector('.frado-player__track-name');

            self.tracks.push({
                index:    i,
                title:    li.dataset.title    || (nameEl ? nameEl.textContent : ''),
                src:      li.dataset.src      || '',
                srcFlac:  li.dataset.srcFlac  || '',
                srcOpus:  li.dataset.srcOpus  || '',
                srcAac:   li.dataset.srcAac   || '',
                srcMp3:   li.dataset.srcMp3   || '',
                duration: li.dataset.duration || '\u2014',
                el:       li
            });
        });
    };

    _FPPlaylist.prototype._initClickHandlers = function() {
        var self = this;

        this.tracks.forEach(function(track) {
            track.el.addEventListener('click', function() {
                self.loadTrack(track.index);
            });
        });
    };

    _FPPlaylist.prototype._initAutoAdvance = function() {
        var self = this;

        this.container.addEventListener('fp:ended', function() {
            self.next();
        });
    };

    // B3: Fix loadTrack play timing — use canplay listener instead of synchronous play()
    _FPPlaylist.prototype.loadTrack = function(index) {
        if (index < 0 || index >= this.tracks.length) return;

        var track = this.tracks[index];
        this.currentIndex = index;

        this._applyActiveClass(index);

        var srcObj = {
            src:     track.src,
            srcFlac: track.srcFlac,
            srcOpus: track.srcOpus,
            srcAac:  track.srcAac,
            srcMp3:  track.srcMp3
        };

        var wasPlaying = this.core.isPlaying;

        if (wasPlaying) {
            // Add one-time canplay listener before loading new source
            var core = this.core;
            var onCanPlay = function() {
                core.mediaEl.removeEventListener('canplay', onCanPlay);
                core.play();
            };
            this.core.mediaEl.addEventListener('canplay', onCanPlay);
            this.core.loadSrc(srcObj, track.title, track.duration);
        } else {
            this.core.loadSrc(srcObj, track.title, track.duration);
        }
    };

    _FPPlaylist.prototype.next = function() {
        var nextIndex = this.currentIndex + 1;
        if (nextIndex >= this.tracks.length) nextIndex = 0;
        this.loadTrack(nextIndex);
    };

    _FPPlaylist.prototype.prev = function() {
        if (this.core.mediaEl && this.core.mediaEl.currentTime > 3) {
            this.core.seek(0);
            return;
        }
        var prevIndex = this.currentIndex - 1;
        if (prevIndex < 0) prevIndex = this.tracks.length - 1;
        this.loadTrack(prevIndex);
    };

    // v3: _applyActiveClass also sets aria-current on active track
    _FPPlaylist.prototype._applyActiveClass = function(activeIndex) {
        this.tracks.forEach(function(track, i) {
            track.el.classList.toggle('frado-player__track--active', i === activeIndex);
            track.el.setAttribute('aria-current', i === activeIndex ? 'true' : 'false');
        });
    };

    _FPPlaylist.prototype.destroy = function() {
        this.tracks = [];
    };

    // ── MODULO ACCESSIBILITY (NEW) ──────────────────────────

    function _FPAccessibility(container, opts) {
        // opts: { playBtn, muteBtn, prevBtn, nextBtn }
        this._container = container;
        this._playBtn = opts.playBtn;
        this._muteBtn = opts.muteBtn;
        this._prevBtn = opts.prevBtn;
        this._nextBtn = opts.nextBtn;

        // Create aria-live region
        this._liveEl = document.createElement('div');
        this._liveEl.className = 'frado-player__live-region';
        this._liveEl.setAttribute('aria-live', 'polite');
        this._liveEl.setAttribute('aria-atomic', 'true');
        this._liveEl.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)';
        container.appendChild(this._liveEl);

        var self = this;
        this._onPlay = function(e) {
            var title = e.detail && e.detail.title ? e.detail.title : '';
            self.announce(title ? title + ' \u2014 ' + (L.playing || 'playing') : (L.play || 'Play'));
            self._setPlayPressed(true);
        };
        this._onPause = function() {
            self.announce(L.paused || 'Paused');
            self._setPlayPressed(false);
        };
        this._onTrackChange = function(e) {
            var d = e.detail || {};
            if (d.title) {
                self.announce((L.trackLabel || 'Track:') + ' ' + d.title + (d.duration ? ', ' + d.duration : ''));
            }
        };
        this._onStateChange = function(e) {
            var to = e.detail && e.detail.to;
            if (to === 'error') {
                self.announce((L.errorMedia || 'Error loading media') + '.');
            }
        };

        container.addEventListener('fp:play',        this._onPlay);
        container.addEventListener('fp:pause',       this._onPause);
        container.addEventListener('fp:trackloaded', this._onTrackChange);
        container.addEventListener('fp:statechange', this._onStateChange);
    }

    _FPAccessibility.prototype = {
        announce: function(text) {
            this._liveEl.textContent = '';
            var self = this;
            setTimeout(function() { self._liveEl.textContent = text; }, 50);
        },
        _setPlayPressed: function(playing) {
            if (this._playBtn) {
                this._playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
            }
        },
        setMutePressed: function(muted) {
            if (this._muteBtn) {
                this._muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
                this._muteBtn.setAttribute('aria-label', muted ? (L.unmute || 'Unmute') : (L.mute || 'Mute'));
            }
        },
        setNavDisabled: function(prevDisabled, nextDisabled) {
            if (this._prevBtn) this._prevBtn.setAttribute('aria-disabled', prevDisabled ? 'true' : 'false');
            if (this._nextBtn) this._nextBtn.setAttribute('aria-disabled', nextDisabled ? 'true' : 'false');
        },
        destroy: function() {
            this._container.removeEventListener('fp:play',        this._onPlay);
            this._container.removeEventListener('fp:pause',       this._onPause);
            this._container.removeEventListener('fp:trackloaded', this._onTrackChange);
            this._container.removeEventListener('fp:statechange', this._onStateChange);
            if (this._liveEl && this._liveEl.parentNode) {
                this._liveEl.parentNode.removeChild(this._liveEl);
            }
            this._liveEl = this._container = this._playBtn = this._muteBtn = null;
        }
    };

    /* ── _FPMediaSession ── */

    function _FPMediaSession(container, core, playlist) {
        if (!('mediaSession' in navigator)) return;

        this.container = container;
        this.core      = core;
        this.playlist  = playlist;

        var self = this;

        container.addEventListener('fp:trackloaded', function() {
            self._updateMetadata();
        });

        navigator.mediaSession.setActionHandler('play', function() {
            core.play();
        });

        navigator.mediaSession.setActionHandler('pause', function() {
            core.pause();
        });

        navigator.mediaSession.setActionHandler('previoustrack', function() {
            if (playlist) playlist.prev();
        });

        navigator.mediaSession.setActionHandler('nexttrack', function() {
            if (playlist) playlist.next();
        });

        navigator.mediaSession.setActionHandler('seekto', function(e) {
            if (e.seekTime !== undefined && core.mediaEl && core.mediaEl.duration) {
                core.mediaEl.currentTime = e.seekTime;
            }
        });

        this._updateMetadata();
    }

    _FPMediaSession.prototype._updateMetadata = function() {
        if (!('mediaSession' in navigator)) return;

        var thumb   = this.container.dataset.thumb || '';
        var artwork = thumb
            ? [{ src: thumb, sizes: '512x512', type: 'image/jpeg' }]
            : [];

        navigator.mediaSession.metadata = new MediaMetadata({
            title:   this.core.title  || this.container.dataset.title  || '',
            artist:  this.core.artist || this.container.dataset.artist || '',
            artwork: artwork
        });
    };

    _FPMediaSession.prototype.destroy = function() {
        if (!('mediaSession' in navigator)) return;

        var actions = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto'];
        actions.forEach(function(action) {
            try {
                navigator.mediaSession.setActionHandler(action, null);
            } catch (e) {
                // Browser pode nao suportar todos os actions — ignora silenciosamente
            }
        });
    };

    /* ── _FPKeyboard v3 — container-scoped rewrite ── */

    function _FPKeyboard(container, player) {
        this._container = container;
        this._player = player;
        var self = this;

        this._handler = function(e) {
            // Guard: modifier keys
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            // Guard: input elements
            var tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            // Guard: must be focused inside this container
            if (!container.contains(document.activeElement) && document.activeElement !== container) return;

            var key = e.key;
            var handled = true;

            if (key === ' ' || key === 'k' || key === 'K') {
                player.core && player.core.toggle();
            } else if (key === 'ArrowLeft') {
                var ct = player.core && player.core.mediaEl ? player.core.mediaEl.currentTime : 0;
                if (player.core && player.core.mediaEl && player.core.mediaEl.duration) {
                    player.core.mediaEl.currentTime = Math.max(0, ct - 5);
                }
            } else if (key === 'ArrowRight') {
                var ct2 = player.core && player.core.mediaEl ? player.core.mediaEl.currentTime : 0;
                var dur = player.core && player.core.mediaEl ? player.core.mediaEl.duration : 0;
                if (dur) {
                    player.core.mediaEl.currentTime = Math.min(dur, ct2 + 5);
                }
            } else if (key === 'ArrowUp') {
                var vol = player.volume ? Math.min(100, (player.volume._vol || 0.7) * 100 + 10) : null;
                if (vol !== null && player.volume) player.volume.setVolume(vol);
            } else if (key === 'ArrowDown') {
                var vol2 = player.volume ? Math.max(0, (player.volume._vol || 0.7) * 100 - 10) : null;
                if (vol2 !== null && player.volume) player.volume.setVolume(vol2);
            } else if (key === 'm' || key === 'M') {
                if (player.volume && player.volume.toggleMute) player.volume.toggleMute();
            } else if (key === 'f' || key === 'F') {
                container.dispatchEvent(
                    new CustomEvent('fp:fullscreen-request', { bubbles: false })
                );
            } else if (key === 'n' || key === 'N') {
                if (player.playlist && player.playlist.tracks.length > 1) {
                    player.playlist.next();
                }
            } else if (key === 'p' || key === 'P') {
                if (player.playlist && player.playlist.tracks.length > 1) {
                    player.playlist.prev();
                }
            } else if (key === 'Home') {
                if (player.core && player.core.mediaEl) {
                    player.core.mediaEl.currentTime = 0;
                }
            } else if (key === 'End') {
                if (player.core && player.core.mediaEl && player.core.mediaEl.duration) {
                    player.core.mediaEl.currentTime = Math.max(0, player.core.mediaEl.duration - 10);
                }
            } else if (key === 'Escape') {
                // Close bottom sheet if open
                var sheet = container.querySelector('.frado-player__sheet--open');
                if (sheet) {
                    container.dispatchEvent(
                        new CustomEvent('fp:sheet-close', { bubbles: false })
                    );
                } else if (document.fullscreenElement || document.webkitFullscreenElement) {
                    if (document.exitFullscreen) document.exitFullscreen();
                    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                } else {
                    if (player.core) player.core.pause();
                    container.blur();
                }
            } else if (key >= '1' && key <= '9') {
                var trackNum = parseInt(key, 10);
                if (player.playlist && trackNum <= player.playlist.tracks.length) {
                    player.playlist.loadTrack(trackNum - 1);
                } else {
                    handled = false;
                }
            } else {
                handled = false;
            }

            if (handled) e.preventDefault();
        };

        container.addEventListener('keydown', this._handler);
    }

    _FPKeyboard.prototype.destroy = function() {
        this._container.removeEventListener('keydown', this._handler);
        this._container = this._player = this._handler = null;
    };

    /* ── _FPBottomSheet ── */

    function _FPBottomSheet(container) {
        this.container = container;
        this.isOpen    = false;
        this.isMobile  = window.innerWidth < 768;

        this._backdrop = container.querySelector('.frado-player__sheet-backdrop');
        this._sheet    = container.querySelector('.frado-player__sheet');

        if (!this._backdrop || !this._sheet) return;

        this._initDragHandle();
        this._initBackdropClick();

        var self = this;
        // B5: Store resize handler reference for cleanup
        this._resizeHandler = function() {
            self.isMobile = window.innerWidth < 768;
        };
        window.addEventListener('resize', this._resizeHandler);

        // Listen for fp:sheet-close custom event
        this._sheetCloseHandler = function() {
            self.close();
        };
        container.addEventListener('fp:sheet-close', this._sheetCloseHandler);
    }

    _FPBottomSheet.prototype.open = function() {
        if (!this._sheet || !this._backdrop) return;
        this.isOpen = true;

        this._backdrop.style.display = 'block';
        this._sheet.style.display    = 'block';

        void this._sheet.offsetHeight;

        this._sheet.classList.add('frado-player__sheet--open');
        document.body.style.overflow = 'hidden';
    };

    _FPBottomSheet.prototype.close = function() {
        if (!this._sheet || !this._backdrop) return;
        this.isOpen = false;

        var self = this;
        this._sheet.classList.remove('frado-player__sheet--open');
        document.body.style.overflow = '';

        setTimeout(function() {
            if (!self.isOpen) {
                self._sheet.style.display    = 'none';
                self._backdrop.style.display = 'none';
            }
        }, 320);
    };

    _FPBottomSheet.prototype._initBackdropClick = function() {
        var self = this;

        if (this._backdrop) {
            this._backdrop.addEventListener('click', function() {
                self.close();
            });
        }
    };

    _FPBottomSheet.prototype._initDragHandle = function() {
        var self   = this;
        var handle = this._sheet && this._sheet.querySelector('.frado-player__sheet-handle');
        if (!handle) return;

        var startY = 0;

        handle.addEventListener('pointerdown', function(e) {
            startY = e.clientY;
            handle.setPointerCapture(e.pointerId);
        });

        handle.addEventListener('pointermove', function(e) {
            var delta = e.clientY - startY;
            if (delta > 60) self.close();
        });
    };

    // B5: Fix _FPBottomSheet memory leak — add proper destroy that removes window resize listener
    _FPBottomSheet.prototype.destroy = function() {
        if (this.isOpen) {
            document.body.style.overflow = '';
        }
        // Remove window resize listener
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        // Remove fp:sheet-close listener
        if (this._sheetCloseHandler && this.container) {
            this.container.removeEventListener('fp:sheet-close', this._sheetCloseHandler);
            this._sheetCloseHandler = null;
        }
        this.container = null;
        this._backdrop = null;
        this._sheet    = null;
    };

    // ── ORQUESTRADOR ─────────────────────────────────────────

    function FradoPlayer(container) {
        if (!container) return;
        var self = this;

        // Inicializar modulos em ordem
        this.core      = new _FPCore(container);
        this.state     = new _FPState(container);
        this.spectrum  = new _FPSpectrum(container, this.core.mediaEl);
        this.volume    = new _FPVolume(container, this.core.mediaEl);
        this.playlist  = new _FPPlaylist(container, this.core);
        this.a11y      = new _FPAccessibility(container, {
            playBtn: container.querySelector('.frado-player__btn--play'),
            muteBtn: container.querySelector('.frado-player__btn--mute'),
            prevBtn: container.querySelector('.frado-player__btn--prev'),
            nextBtn: container.querySelector('.frado-player__btn--next')
        });
        this.session   = new _FPMediaSession(container, this.core, this.playlist);
        this.keyboard  = new _FPKeyboard(container, this);
        this.sheet     = new _FPBottomSheet(container);

        // Set initial aria-pressed on play button
        var btnPlay = container.querySelector('.frado-player__btn--play');
        if (btnPlay && !btnPlay.hasAttribute('aria-pressed')) {
            btnPlay.setAttribute('aria-pressed', 'false');
        }

        // Conectar botoes prev/next da transport ao playlist
        var btnPrev = container.querySelector('.frado-player__btn--prev');
        var btnNext = container.querySelector('.frado-player__btn--next');

        if (btnPrev) btnPrev.addEventListener('click', function() { self.playlist.prev(); });
        if (btnNext) btnNext.addEventListener('click', function() { self.playlist.next(); });
        if (btnPlay) btnPlay.addEventListener('click', function() { self.core.toggle(); });

        // Wire a11y nav disabled state on track change
        var a11yRef = this.a11y;
        var playlistRef = this.playlist;
        container.addEventListener('fp:trackloaded', function() {
            if (a11yRef && playlistRef) {
                var singleTrack = playlistRef.tracks.length <= 1;
                var onFirst = playlistRef.currentIndex === 0;
                var onLast = playlistRef.currentIndex === playlistRef.tracks.length - 1;
                a11yRef.setNavDisabled(singleTrack || onFirst, singleTrack || onLast);
            }
        });

        // Wire a11y mute pressed state on volume mute toggle
        var volumeRef = this.volume;
        var origToggleMute = volumeRef.toggleMute.bind(volumeRef);
        volumeRef.toggleMute = function() {
            origToggleMute();
            if (a11yRef) {
                a11yRef.setMutePressed(volumeRef.muted);
            }
        };

        // Fullscreen request (disparado pelo keyboard F)
        container.addEventListener('fp:fullscreen-request', function() {
            self._toggleFullscreen();
        });

        // Fullscreen button (video)
        var btnFs = container.querySelector('.frado-player__btn--fullscreen');
        if (btnFs) btnFs.addEventListener('click', function() { self._toggleFullscreen(); });

        // PiP button
        var btnPip = container.querySelector('.frado-player__btn--pip');
        if (btnPip) btnPip.addEventListener('click', function() { self._togglePiP(); });
    }

    FradoPlayer.prototype._toggleFullscreen = function() {
        var container = this.core.container;
        var videoEl = container.querySelector('video.frado-player__media');
        var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

        if (isIOS && videoEl) {
            if (videoEl.webkitEnterFullscreen) videoEl.webkitEnterFullscreen();
            return;
        }

        var el = container.querySelector('.frado-player');
        if (!el) el = container;

        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (el.requestFullscreen) el.requestFullscreen();
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
    };

    FradoPlayer.prototype._togglePiP = function() {
        var videoEl = this.core && this.core.container && this.core.container.querySelector('video');
        if (!videoEl || !document.pictureInPictureEnabled) return;
        if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(function(){});
        } else {
            videoEl.requestPictureInPicture().catch(function(){});
        }
    };

    FradoPlayer.prototype.destroy = function() {
        if (this.core)     this.core.destroy();
        if (this.spectrum) this.spectrum.destroy();
        if (this.volume)   this.volume.destroy();
        if (this.playlist) this.playlist.destroy();
        if (this.session)  this.session.destroy();
        if (this.keyboard) this.keyboard.destroy();
        if (this.a11y)     this.a11y.destroy();
        if (this.state)    this.state.destroy();
        // B5: Fix _FPBottomSheet memory leak — include sheet.destroy() in FradoPlayer.destroy()
        if (this.sheet && this.sheet.destroy) this.sheet.destroy();
    };

    // ── FradoPlayer.fromCard() Static Factory ───────────────

    FradoPlayer.fromCard = function(cardEl, containerEl) {
        // 1. Read scalar fp-* attributes from cardEl.dataset
        var fpTitle    = cardEl.dataset.fpTitle    || (cardEl.querySelector('.frado-album-card__title')    ? cardEl.querySelector('.frado-album-card__title').textContent.trim()    : '');
        var fpArtist   = cardEl.dataset.fpArtist   || (cardEl.querySelector('.frado-album-card__artist-name') ? cardEl.querySelector('.frado-album-card__artist-name').textContent.trim() : '');
        var fpThumb    = cardEl.dataset.fpThumb    || (cardEl.querySelector('.frado-album-card__cover img') ? cardEl.querySelector('.frado-album-card__cover img').src : '');
        var fpSrc      = cardEl.dataset.fpSrc      || '';
        var fpSrcMp3   = cardEl.dataset.fpSrcMp3   || '';
        var fpSrcFlac  = cardEl.dataset.fpSrcFlac  || '';
        var fpSrcOpus  = cardEl.dataset.fpSrcOpus  || '';
        var fpSrcAac   = cardEl.dataset.fpSrcAac   || '';
        var fpDuration = cardEl.dataset.fpDuration || '0:00';
        var fpTracks   = cardEl.dataset.fpTracks   || '';
        var fpType     = cardEl.dataset.fpType     || 'auto';

        // 2. Write attributes to containerEl
        containerEl.dataset.type     = fpType;
        containerEl.dataset.title    = fpTitle;
        containerEl.dataset.artist   = fpArtist;
        containerEl.dataset.thumb    = fpThumb;
        containerEl.dataset.src      = fpSrc;
        containerEl.dataset.srcMp3   = fpSrcMp3;
        containerEl.dataset.srcFlac  = fpSrcFlac;
        containerEl.dataset.srcOpus  = fpSrcOpus;
        containerEl.dataset.srcAac   = fpSrcAac;
        containerEl.dataset.duration = fpDuration;

        // 3. Parse fpTracks CSV and build playlist DOM
        var ol = containerEl.querySelector('.frado-player__playlist');
        if (ol && fpTracks) {
            ol.innerHTML = '';
            var tracks = fpTracks.split(',');
            tracks.forEach(function(trackStr, i) {
                var parts = trackStr.trim().split('|');
                var title    = (parts[0] || '').trim() || ((L.track || 'Track') + ' ' + (i + 1));
                var mp3      = (parts[1] || '').trim();
                var flac     = (parts[2] || '').trim();
                var opus     = (parts[3] || '').trim();
                // Detect v3 format (aac at index 4) vs old format (duration at index 4)
                var hasAac   = parts[4] && !/^\d+:\d+$/.test(parts[4].trim());
                var aac      = hasAac ? (parts[4] || '').trim() : '';
                var duration = hasAac ? (parts[5] || '').trim() : (parts[4] || '').trim();
                var thumb    = hasAac ? (parts[6] || '').trim() : '';

                var li = document.createElement('li');
                li.className = 'frado-player__track' + (i === 0 ? ' frado-player__track--active' : '');
                li.dataset.title    = title;
                li.dataset.src      = mp3; // primary src
                li.dataset.srcFlac  = flac;
                li.dataset.srcOpus  = opus;
                li.dataset.srcAac   = aac;
                li.dataset.duration = duration;
                if (thumb) li.dataset.thumb = thumb;
                li.setAttribute('tabindex', '0');
                li.setAttribute('aria-label', (i + 1) + '. ' + title + (duration ? ', ' + duration : ''));
                li.setAttribute('aria-posinset', i + 1);
                li.setAttribute('aria-setsize', tracks.length);
                li.setAttribute('aria-current', i === 0 ? 'true' : 'false');
                var numSpan = document.createElement('span');
                numSpan.className = 'frado-player__track-num';
                numSpan.textContent = (i + 1);
                var nameSpan = document.createElement('span');
                nameSpan.className = 'frado-player__track-name';
                nameSpan.textContent = title;
                var durSpan = document.createElement('span');
                durSpan.className = 'frado-player__track-duration';
                durSpan.textContent = duration;
                li.appendChild(numSpan);
                li.appendChild(nameSpan);
                li.appendChild(durSpan);
                ol.appendChild(li);
            });
        }

        // 4. Instantiate and return
        var instance = new FradoPlayer(containerEl);
        // 5. Play immediately — card click was the user gesture (AudioContext already unlocked)
        if (instance.core) {
            instance.core.play().catch(function() {
                // Autoplay blocked — UI remains in paused state, user can manually play
            });
        }
        return instance;
    };

    // ── BOOT ─────────────────────────────────────────────────

    function bootFradoPlayers() {
        document.querySelectorAll('.frado-player').forEach(function(el) {
            if (!el._fradoPlayer) {
                el._fradoPlayer = new FradoPlayer(el);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootFradoPlayers);
    } else {
        bootFradoPlayers();
    }

    window.FradoPlayer       = FradoPlayer;
    window.bootFradoPlayers  = bootFradoPlayers;

}(window, document));
