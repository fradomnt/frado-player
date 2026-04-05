# Audit: Video Player inline — page-musica.php

**Arquivo auditado:** `wordpress-theme/page-musica.php`, linhas 1220–1901
**Data da auditoria:** 2026-04-02
**Auditor:** Claude Sonnet 4.6 (via Claude Code)

---

## 1. HTML Structure do Video Player

O player de vídeo vive dentro de `#fradoVideoPlayer` (linha 1220). Abaixo o mapa completo de cada elemento.

### Container raiz

| Elemento | ID | Classe | Propósito |
|---|---|---|---|
| `<div>` | `fradoVideoPlayer` | — | Container raiz; inicia com `display:none`, é mostrado via JS quando o card tem faixas de vídeo. Inline style `margin-bottom:16px`. |

### Área de vídeo

| Elemento | ID | Classe | Atributos / Propósito |
|---|---|---|---|
| `<div>` | — | `fvideo-wrap` | Wrapper preto com `border-radius:10px; overflow:hidden; position:relative`. Contém apenas o `<video>`. |
| `<video>` | `fvideoEl` | — | **preload="metadata"**, **playsinline** (essencial para iOS inline). `width:100%`, `max-height:170px`, `object-fit:contain`. Sem `src` inicial — src é atribuído em `fvideoLoad()`. Sem `controls` nativo (UI customizada). |

### Barra "Now Playing"

| Elemento | ID | Classe | Propósito |
|---|---|---|---|
| `<div>` | — | `fplayer-now` | Linha horizontal: EQ + nome da faixa + botão fullscreen + duração. |
| `<div>` | `fvideoEq` | `fplayer-eq` | Animação EQ (4 `<span>` filhos). Recebe/remove classe `playing` via JS. |
| `<span>` | `fvideoTrackName` | `fplayer-trackname` | Nome da faixa atual. Valor inicial `—`. Muda para `"Carregando..."` (waiting), nome real (canplay/loadedmetadata) ou mensagem de erro. |
| `<button>` | `fvideoFullscreen` | `fplayer-btn-fullscreen` | Dispara fullscreen (iOS: `webkitEnterFullscreen`; web: `requestFullscreen` / `webkitRequestFullscreen`). `title="Tela cheia"`. SVG inline (expand icon). **Sem aria-label.** |
| `<span>` | `fvideoDuration` | `fplayer-duration` | Exibe `currentTime / duration` no formato `M:SS / M:SS`. Valor inicial `0:00 / 0:00`. |

### Barra de progresso

| Elemento | ID | Classe | Atributos / Propósito |
|---|---|---|---|
| `<div>` | — | `fplayer-progress-wrap` | Wrapper da barra de progresso. |
| `<div>` | `fvideoBarBg` | `fplayer-bar-bg` | Área clicável de seek por click direto. Recebe listener `click`. |
| `<div>` | `fvideoFill` | `fplayer-bar-fill` | Barra de preenchimento; largura alterada por `timeupdate`. |
| `<input type="range">` | `fvideoSeek` | `fplayer-seek` | **min="0" max="100" step="0.1" value="0"**. Seek por drag. Sem `aria-label`, sem `aria-valuetext`. |

### Controles de transporte e volume

| Elemento | ID | Classe | Propósito |
|---|---|---|---|
| `<div>` | — | `fplayer-controls` | Linha de botões: prev / play / next / volume. |
| `<button>` | `fvideoPrev` | `fplayer-btn` | Faixa anterior. `title="Anterior"`. SVG skip-previous inline. **Sem aria-label.** |
| `<button>` | `fvideoPlay` | `fplayer-btn fplayer-btn-play` | Play/Pause. `title="Play/Pause"`. Contém `<svg id="fvideoPlayIcon">` cujo `innerHTML` é trocado entre play e pause SVG. **Sem aria-label.** |
| `<button>` | `fvideoNext` | `fplayer-btn` | Próxima faixa. `title="Próxima"` (HTML entity `&oacute;`). SVG skip-next inline. **Sem aria-label.** |
| `<div>` | — | `fplayer-vol-wrap` | Contém ícone de volume (span decorativo) + range de volume. |
| `<span>` | — | `fplayer-vol-icon` | SVG de volume decorativo. Não é botão, não tem comportamento de mute. |
| `<input type="range">` | `fvideoVol` | `fplayer-vol` | **min="0" max="1" step="0.05" value="0.8"**. Controle de volume contínuo. Sem `aria-label`. |

### Tracklist

| Elemento | ID | Classe | Propósito |
|---|---|---|---|
| `<div>` | `fvideoTracklist` | `fplayer-tracklist` | Container da lista de faixas. Populado dinamicamente em `openArtistModal()`. Cada item `div.fplayer-track-item` tem `data-idx`, `.fplayer-track-num`, `.fplayer-track-lbl`, `.fplayer-track-dur` (id `vdur_N`). |

---

## 2. JavaScript Functions

### `fvideoLoad(idx)` — linha 1369

**Parâmetros:** `idx` (number) — índice da faixa em `fvideoTracks`.

**O que faz:**
1. Resolve `document.getElementById('fvideoEl')`.
2. Guard: retorna se `vid` ou `fvideoTracks[idx]` for falsy.
3. Escreve `fvideoCurrent = idx`.
4. Define `vid.src` e chama `vid.load()`.
5. Atualiza `#fvideoTrackName`, zera `#fvideoFill`, `#fvideoSeek`, `#fvideoDuration`.
6. Marca o item ativo em `#fvideoTracklist .fplayer-track-item` via `classList.toggle('active', i === idx)`.
7. Se `fvideoPlaying === true`, registra um listener `canplay` one-shot que faz `vid.play()` (com `.catch(()=>{})` silencioso).

**Estado global lido:** `fvideoTracks`, `fvideoPlaying`
**Estado global escrito:** `fvideoCurrent`

---

### `fvideoToggle()` — linha 1390

**Parâmetros:** nenhum.

**O que faz:**
1. Resolve `document.getElementById('fvideoEl')`.
2. Guard: retorna se `vid` for null.
3. Se `vid.paused` → `vid.play()`; senão → `vid.pause()`.

**Estado global lido:** nenhum diretamente (lê `vid.paused` do DOM).
**Estado global escrito:** nenhum diretamente (o evento `play`/`pause` do elemento atualiza `fvideoPlaying` via listener).

**Nota:** não captura a Promise retornada por `vid.play()` — potencial UnhandledPromiseRejection em ambientes restritos (ver seção 8).

---

### `fplayerFmtTime(s)` — linha 1358

**Parâmetros:** `s` (number) — segundos.

**O que faz:** Formata segundos para string `M:SS`. Retorna `'0:00'` se `isNaN(s) || s === Infinity`.

**Estado global:** nenhum.

---

### `fplayerLoad(idx)` — linha 1397

Equivalente de `fvideoLoad` para o player de áudio. Mesma lógica aplicada ao `<audio id="fplayerAudio">`.

**Estado global lido:** `fplayerTracks`, `fplayerPlaying`
**Estado global escrito:** `fplayerCurrent`

---

### `fplayerToggle()` — linha 1418

Equivalente de `fvideoToggle` para o player de áudio. Mesma lógica. Mesmo problema: `audio.play()` sem `.catch`.

---

### `openArtistModal(card)` — linha 1438 (interna a DOMContentLoaded)

**Parâmetros:** `card` (HTMLElement) — `.frado-album-card` clicado.

**O que faz:**
1. Extrai textos e imagem do card.
2. Popula todos os campos do modal (nome, título, role, badge, desc).
3. Cria pill-buttons de links externos a partir de `card.dataset`.
4. Coleta `data-video1..4` e `data-video1Label..4Label` → array `vTracks`.
5. Se `vTracks.length > 0`: mostra `#fradoVideoPlayer`, oculta `#fradoAudioPlayer`, popula tracklist de vídeo, zera `fvideoPlaying`, chama `fvideoLoad(0)`.
6. Senão: oculta player de vídeo, para e limpa `vid.src`.
7. Coleta `data-audio1..4` → array `tracks`. Se há tracks: mostra `#fradoAudioPlayer`, popula tracklist, chama `fplayerLoad(0)`.
8. Lida com Frado Player v2 (`data-fp-*`): destrói instância anterior, popula `data-*` no `#fradoFPPlayer`, popula `<ol.frado-player__playlist>`, mostra `#fradoFPWrapper`, e após `setTimeout(60ms)` instancia `new window.FradoPlayer(fpEl)`, com segundo `setTimeout(150ms)` para autoplay.
9. Define background do modal com imagem do card.
10. Adiciona classe `active` no modal, trava scroll do body.
11. Chama `history.pushState({ fpModal: true }, '')` e seta `window._fpModalStatePushed = true`.

**Estado global escrito:** `fvideoTracks`, `fvideoCurrent` (via fvideoLoad), `fvideoPlaying`, `fplayerTracks`, `fplayerCurrent` (via fplayerLoad), `fplayerPlaying`, `window._fpModalStatePushed`.

---

### `closeArtistModal()` — linha 1650 (interna a DOMContentLoaded)

**O que faz:**
1. Guard: retorna se modal não tem classe `active`.
2. Remove classe `active`, restaura `body.style.overflow`.
3. Para e limpa audio (`fplayerAudio`), reseta `fplayerPlaying` e ícones.
4. Para e limpa vídeo (`fvideoEl`), reseta `fvideoPlaying` e ícones.
5. Destrói instância Frado Player v2 se existir.
6. Oculta `#fradoFPWrapper`.
7. Se `window._fpModalStatePushed`, seta para `false` e chama `history.back()`.

---

## 3. Global Variables

Todas declaradas com `var` a nível de `<script>` (escopo global da página), linhas 1352–1367.

| Variável | Valor inicial | Propósito |
|---|---|---|
| `fplayerCurrent` | `0` | Índice da faixa de áudio atualmente carregada. |
| `fplayerTracks` | `[]` | Array de objetos `{ url, label }` para o player de áudio. Populado em `openArtistModal`. |
| `fplayerPlaying` | `false` | Estado play/pause do player de áudio. Usado como flag para auto-continuar ao trocar de faixa. |
| `fvideoCurrent` | `0` | Índice da faixa de vídeo atualmente carregada. |
| `fvideoTracks` | `[]` | Array de objetos `{ url, label }` para o player de vídeo. Populado em `openArtistModal`. |
| `fvideoPlaying` | `false` | Estado play/pause do player de vídeo. Usado como flag para auto-continuar ao trocar de faixa. |

**Variáveis de flag em `window` (não declaradas com `var`, implicitamente globais):**

| Variável | Onde setada | Propósito |
|---|---|---|
| `window.fplayerInited` | linha 1706 | Guard de uma única inicialização dos listeners do player de áudio. |
| `window._fpModalStatePushed` | linha 1647 | Rastreia se `history.pushState` foi chamado para o modal, para evitar `history.back()` duplo. |

---

## 4. Event Listeners Registrados

### No elemento `<video id="fvideoEl">`

Os listeners de vídeo são registrados incondicionalmente dentro de `DOMContentLoaded` — **não há guard de "init once"** equivalente ao `window.fplayerInited` do áudio. Isso significa que cada reabertura do modal (se a página não for recarregada) NÃO re-registra esses listeners (o modal não é destruído e recriado), mas se o script de alguma forma rodar novamente, os listeners seriam duplicados.

| Elemento | Evento | O que o handler faz | Guard null-check |
|---|---|---|---|
| `vid` (`#fvideoEl`) | `play` | Seta `fvideoPlaying = true`, troca ícone para pause SVG, adiciona classe `playing` no EQ. | Não (vid resolvido por `getElementById` antes do bloco — pode ser null se elemento sumiu do DOM) |
| `vid` | `pause` | Seta `fvideoPlaying = false`, troca ícone para play SVG, remove classe `playing` do EQ. | Não |
| `vid` | `ended` | Se há próxima faixa: seta `fvideoPlaying = true` e chama `fvideoLoad(fvideoCurrent + 1)`. Senão: reseta estado. | Não |
| `vid` | `timeupdate` | Atualiza `#fvideoFill` width, `#fvideoSeek` value, `#fvideoDuration` text. Guard `if (!vid.duration)`. | Sim (duration guard) |
| `vid` | `waiting` | Seta `#fvideoTrackName` para `'Carregando...'` com classe `loading`. | Sim (`if (tn)`) |
| `vid` | `canplay` | Restaura nome da faixa em `#fvideoTrackName`. | Sim (`if (tn && fvideoTracks[fvideoCurrent])`) |
| `vid` | `error` | Seta `#fvideoTrackName` para mensagem de erro `⚠ Erro ao carregar vídeo`. Remove `playing` do EQ. | Sim (`if (tn)`) |
| `vid` | `loadedmetadata` | Restaura nome, atualiza `#vdur_N` (duração no tracklist), atualiza `#fvideoDuration`. | Sim (`if (tn && ...)` e `if (durSpan)`) |

### Em controles de vídeo

| Elemento | Evento | O que o handler faz | Guard null-check |
|---|---|---|---|
| `#fvideoSeek` (range) | `input` | Se `vid.duration`: `vid.currentTime = (value/100) * duration`. | Sim |
| `#fvideoBarBg` | `click` | Click direto na barra: calcula pct pela posição do click via `getBoundingClientRect`. Guard `if (!vid.duration)`. | Sim |
| `#fvideoVol` (range) | `input` | `vid.volume = vVolEl.value` | Não (vid pode ser stale se DOM mudar) |
| `#fvideoPlay` | `click` | Chama `fvideoToggle()`. | Sim (dentro de `fvideoToggle`) |
| `#fvideoPrev` | `click` | `fvideoLoad(fvideoCurrent > 0 ? fvideoCurrent - 1 : 0)`. Depois: `if (fvideoPlaying) vid.play().catch(()=>{})`. | Parcial (catch silencioso) |
| `#fvideoNext` | `click` | `fvideoLoad(fvideoCurrent < fvideoTracks.length - 1 ? ... : fvideoCurrent)`. Depois: `if (fvideoPlaying) vid.play().catch(()=>{})`. | Parcial (catch silencioso) |
| `#fvideoTracklist` | `click` (delegado) | `e.target.closest('.fplayer-track-item')`. Seta `fvideoPlaying = true` e chama `fvideoLoad(parseInt(item.dataset.idx))`. | Sim (`if (!item) return`) |
| `#fvideoFullscreen` | `click` | `webkitEnterFullscreen()` → retorna imediatamente se disponível. Senão tenta `requestFullscreen()` / `webkitRequestFullscreen()`. Guard `if (!el) return`. | Sim |

### Nos elementos do modal / página

| Elemento | Evento | O que o handler faz | Guard |
|---|---|---|---|
| `window` | `popstate` | Se modal está ativo: seta `_fpModalStatePushed = false` e chama `closeArtistModal()`. | Sim (`classList.contains`) |
| `.frado-album-card` (cada) | `click` | Chama `openArtistModal(card)`. Exclui cards `<a>` com href real. | N/A |
| `.frado-album-card` (cada) | `keydown` | Enter ou Space: `e.preventDefault()` + `openArtistModal(card)`. | N/A |
| `#fradoArtistModalClose` | `click` | Chama `closeArtistModal()`. | N/A |
| `#fradoArtistModal` | `click` | Se `e.target === modal` (click no overlay): `closeArtistModal()`. | Sim |
| `document` | `keydown` | Se `e.key === 'Escape'`: `closeArtistModal()`. | N/A |

---

## 5. Funcionalidades Implementadas

- [x] **Playlist de vídeo** — até 4 faixas (`data-video1..4`) com labels opcionais.
- [x] **Prev / Next** — navegação entre faixas com continuidade de playback se já estava tocando.
- [x] **Seekbar por drag** — `<input type="range">` com sincronização bidirecional via `timeupdate` + `input`.
- [x] **Seekbar por click direto** — click em `#fvideoBarBg` calcula posição pela geometria do elemento.
- [x] **Volume contínuo** — range 0–1, step 0.05, valor inicial 0.8.
- [x] **Fullscreen iOS** — `video.webkitEnterFullscreen()` com prioridade sobre o método web-padrão.
- [x] **Fullscreen web** — `requestFullscreen()` com fallback `webkitRequestFullscreen()`.
- [x] **Display de duração** — `M:SS / M:SS` atualizado em `timeupdate`.
- [x] **Duração individual por faixa no tracklist** — preenchida em `loadedmetadata` via `#vdur_N`.
- [x] **Carregamento de faixa** — `fvideoLoad` chama `vid.load()` e opcionalmente auto-continua playback.
- [x] **Auto-play ao trocar de faixa** — via canplay one-shot listener quando `fvideoPlaying` é true.
- [x] **Indicador visual de faixa ativa** — classe `active` no item do tracklist.
- [x] **Animação EQ** — classe `playing` em `#fvideoEq` ativada em `play`, removida em `pause`/`ended`/`error`.
- [x] **Estado loading** — `waiting` muda track name para `"Carregando..."` com classe CSS.
- [x] **Estado de erro básico** — `error` muda track name para mensagem de erro com classe CSS.
- [x] **Parada ao fechar modal** — `closeArtistModal` para vídeo e limpa `src`.
- [x] **Integração com Frado Player v2** — para cards `data-fp-*` com `window.FradoPlayer`, destrói e recria a instância.
- [x] **Histórico de browser** — `history.pushState` / `history.back()` e listener `popstate` para fechar o modal com botão Voltar.

---

## 6. Funcionalidades FALTANDO vs UX Spec

### Acessibilidade

- [ ] **`aria-label` em todos os botões** — `#fvideoPrev`, `#fvideoPlay`, `#fvideoNext`, `#fvideoFullscreen` têm apenas `title` (tooltip de hover). `title` não é lido por screen readers de forma confiável. Precisam de `aria-label="Faixa anterior"`, `aria-label="Reproduzir"` / `"Pausar"` (dinâmico), `aria-label="Próxima faixa"`, `aria-label="Tela cheia"`.
- [ ] **`aria-valuetext` no seekbar** — `#fvideoSeek` não tem `aria-valuetext`. Screen readers anunciam o valor numérico 0–100 em vez do tempo formatado (ex: `"1:23 de 4:56"`).
- [ ] **`aria-label` no controle de volume** — `#fvideoVol` sem label semântico.
- [ ] **`role` e `aria-live` no track name** — `#fvideoTrackName` muda dinamicamente; sem `aria-live="polite"` screen readers não anunciam a mudança.

### Teclado

- [ ] **Atalhos de teclado** — nenhum atalho implementado para o player de vídeo: sem `↑`/`↓` para volume, sem `M` para mute, sem `F` para fullscreen, sem `Space`/`K` para play/pause, sem `←`/`→` para seek. (O `document keydown` só trata `Escape` para fechar o modal.)
- [ ] **Foco visível nos botões** — não é possível confirmar via leitura de PHP, mas a ausência de `aria-label` sugere que o foco via Tab pode não ter feedback visual adequado.

### UX / Visual

- [ ] **Loading skeleton** — ao carregar uma nova faixa, não há placeholder animado visível na area de vídeo. O estado `waiting` só muda o texto do track name, sem spinner nem skeleton na área do `<video>`.
- [ ] **Estado de erro com botão Retry** — `error` muda o texto, mas não exibe um botão para retentar o carregamento. O usuário não tem ação disponível.
- [ ] **`active:scale` / press feedback nos botões** — sem feedback tátil de clique (escala ou opacidade via CSS `active:` ou `transition`).
- [ ] **Ícone de volume dinâmico** — o `<span class="fplayer-vol-icon">` é decorativo e estático; não muda para indicar nível de volume nem para muted (diferente do Frado Player v2 que tem 4 ícones de estado).
- [ ] **Botão de mute dedicado** — player de vídeo não tem botão mute. Apenas o range de volume.

### Técnico

- [ ] **`preload="none"` na tag de vídeo** — o atributo atual é `preload="metadata"`. Isso inicia uma requisição de rede para cada vídeo assim que a página carrega o modal, mesmo que o usuário não vá assistir. Deveria ser `preload="none"` com carregamento apenas em `fvideoLoad`.
- [ ] **Faixa de vídeo 5+ não suportada** — coleta apenas `data-video1..4`. Mais de 4 faixas seria ignorado silenciosamente.

---

## 7. Código para Consolidar no Plugin v3

### O que MOVE para `frado-player.js` (plugin)

| Código atual | Destino no plugin v3 |
|---|---|
| Variáveis globais `fvideoCurrent`, `fvideoTracks`, `fvideoPlaying` | Estado interno de uma classe/módulo `FradoVideoPlayer`, sem poluição de `window`. |
| Função `fvideoLoad(idx)` | Método `load(idx)` da classe `FradoVideoPlayer`. |
| Função `fvideoToggle()` | Método `toggle()` da classe, com `.catch()` explícito e atualização de `aria-label` no botão. |
| Função `fplayerFmtTime(s)` | Utilitário `formatTime(s)` compartilhado (já deve existir no player de áudio v3). |
| Todos os `addEventListener` do `<video>` e seus controles | Método `_bindEvents()` inicializado no construtor. Com guard de `_inited` para evitar duplicação. |
| Lógica de fullscreen (`webkitEnterFullscreen` + `requestFullscreen` + `webkitRequestFullscreen`) | Método `enterFullscreen()` no plugin. |
| Lógica de UI (swap de SVGs play/pause, toggle de classe `playing` no EQ, update de duração) | Handlers internos do plugin. |
| Parsing de `data-video1..4` e `data-video1Label..4Label` | Método estático `FradoVideoPlayer.parseTracksFromCard(card)` ou equivalente no inicializador do modal. |

### O que FICA no tema (`page-musica.php`)

| Código | Justificativa |
|---|---|
| HTML do `#fradoVideoPlayer` e seus elementos filhos | É estrutura do template WordPress; pode ser extraído para um partial PHP, mas não vai para o plugin JS. |
| `openArtistModal(card)` — lógica de extrair dados do card e popular o modal | É lógica de negócio do tema (artist modal), não do player genérico. A chamada `FradoVideoPlayer.load(tracks)` substituiria apenas a parte de inicialização do player. |
| `closeArtistModal()` — parar/limpar players ao fechar | Permanece no tema; chama `player.destroy()` ou `player.stop()` nos objetos do plugin. |
| Links externos (Spotify, SoundCloud, etc.) | Lógica de apresentação do tema. |
| `history.pushState` / `popstate` para o modal | Lógica de navegação do tema, não do player. |
| Scroll animations (`IntersectionObserver` em `.frado-animate`) | Tema. |

---

## 8. Bugs e Problemas Identificados

### Bug 1: Listeners de vídeo sem guard de "init once" (risco de duplicação)

**Localização:** linhas 1793–1884, dentro de `DOMContentLoaded`.

**Problema:** Os listeners do player de áudio são protegidos por `if (!window.fplayerInited)` (linha 1705). Os listeners do player de **vídeo** não têm guard equivalente. Se o script `DOMContentLoaded` for executado mais de uma vez (ex: navegação SPA, hot-reload de dev), os listeners de vídeo seriam registrados múltiplas vezes, causando handlers duplicados para `play`, `pause`, `ended`, `timeupdate`, etc. Isso levaria a atualizações de UI duplicadas e comportamento imprevisível.

**Severidade:** Média (no WordPress estático sem SPA não ocorre, mas é um risco latente e uma inconsistência de padrão).

---

### Bug 2: `fvideoToggle()` não captura Promise de `vid.play()`

**Localização:** linha 1393 (`vid.play()`).

**Problema:** `HTMLMediaElement.play()` retorna uma Promise. Em `fvideoToggle()`, a Promise é descartada sem `.catch()`. Browsers modernos (Chrome, Firefox, Safari) emitem `UnhandledPromiseRejection` quando o browser bloqueia o autoplay (ex: políticas de autoplay, tab em background). O player vai parecer quebrado silenciosamente.

**Comparação:** `fvideoLoad()` trata corretamente com `.catch(function(){})` no listener `canplay`. Os handlers de `prev`/`next` também usam `.catch`. Apenas `fvideoToggle` está incorreto.

**Severidade:** Alta (ocorre na interação principal do usuário em ambientes com política de autoplay restrita).

---

### Bug 3: `vid.play()` não aguarda `canplay` em `fvideoPrev` / `fvideoNext`

**Localização:** linhas 1866–1870.

**Problema:** Os handlers de `prev` e `next` chamam `fvideoLoad(...)` seguido imediatamente de `if (fvideoPlaying) vid.play().catch(...)`. `fvideoLoad` chama `vid.load()` internamente, o que invalida o estado do elemento. Chamar `vid.play()` sincronicamente após `vid.load()` pode resultar em erro `AbortError` ("The play() request was interrupted by a call to pause() or by a new load request") porque o buffer ainda está sendo inicializado.

**Nota:** `fvideoLoad` já registra um listener `canplay` para auto-play quando `fvideoPlaying` é true, então o `vid.play()` adicional nos handlers prev/next é redundante E problemático. Resulta em duas tentativas de play concorrentes.

**Severidade:** Alta (causa `AbortError` no console e pode travar o playback).

---

### Bug 4: Race condition no setTimeout duplo do Frado Player v2

**Localização:** linhas 1616–1626.

**Problema:** A instanciação de `new window.FradoPlayer(fpEl)` é envolta em `setTimeout(60ms)`, e o autoplay subsequente usa `setTimeout(150ms)` adicional. Esses valores hardcoded são heurísticos. Em dispositivos lentos ou com CPU ocupada, 60ms pode não ser suficiente para o DOM renderizar e o plugin inicializar, fazendo o autoplay falhar. Em dispositivos rápidos é tempo desperdiçado.

**Severidade:** Baixa (degradação de UX em low-end devices, não é crash).

---

### Bug 5: Null-safety ausente em `vPlayIcon` e `vEqEl` nos listeners de `play`/`pause`

**Localização:** linhas 1806–1815.

**Problema:** `vPlayIcon` e `vEqEl` são resolvidos por `getElementById` antes do bloco de listeners (linhas 1796–1797). Se por qualquer razão o elemento não estiver no DOM nesse momento, ambas as variáveis são `null`. Os listeners de `play` e `pause` acessam `vPlayIcon.innerHTML` e `vEqEl.classList` sem verificar null, causando `TypeError: Cannot set property 'innerHTML' of null`.

**Comparação:** Os listeners `waiting`, `canplay`, `error`, `loadedmetadata` usam `getElementById` dentro do handler e verificam com `if (tn)`. Os listeners `play`/`pause` usam variáveis capturadas em closure sem guard.

**Severidade:** Média (causa quebra silenciosa se o HTML for modificado; em produção com HTML fixo não ocorre, mas é frágil).

---

### Bug 6: Track label do áudio remove prefixo musical incorretamente

**Localização:** linha 1491.

**Problema:** `label = (card.dataset[k + 'Label'] || ...).replace(/^\u266A\s*/, '')` remove o caractere `♪` do início do label. Isso é uma normalização específica de conteúdo misturada com a lógica de parsing do player. Se os labels de vídeo também tiverem esse prefixo, eles não são normalizados (linha 1502 não tem o `.replace`). Inconsistência entre os dois players.

**Severidade:** Baixa (cosmética).
