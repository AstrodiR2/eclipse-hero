/* ============================================================================
   Interactive Hero Video — Mouse/Touch-controlled phone rotation.

   Одно видео с записанным поворотом телефона. Оно НЕ воспроизводится:
   его currentTime жёстко привязан к позиции курсора по X, а к целевому
   времени мы «подтягиваемся» через lerp в цикле requestAnimationFrame,
   создавая ощущение дорогой инерции (как у Apple / Nothing / Samsung).

   Таймлайн видео (длительность ~5.00s):
     0.00s → 1.95s   телефон смотрит влево  → поворачивается к центру
     1.95s → 2.22s   нейтральная зона (смотрит прямо)
     2.22s → 5.00s   телефон поворачивается из центра вправо

   Плавность скраббинга на мобильных обеспечивают три вещи:
     1) отдельная лёгкая версия видео (720p, all-intra) для слабых декодеров;
     2) троттлинг seek-ов — не шлём новый currentTime, пока идёт предыдущий seek;
     3) активация интерактива только после буферизации (readyState ≥ 3).
   ========================================================================== */

// ── Опорные точки таймлайна (в секундах) ──────────────────────────────────
const T_LEFT_EDGE    = 0.00;   // левый край экрана
const T_CENTER_LEFT  = 1.95;   // центр со стороны левой половины
const T_CENTER_RIGHT = 2.22;   // центр со стороны правой половины
const T_RIGHT_EDGE   = 5.00;   // правый край экрана
const T_NEUTRAL      = (T_CENTER_LEFT + T_CENTER_RIGHT) / 2; // ≈ 2.085s

// ── Определяем устройство ───────────────────────────────────────────────────
// Мобильным считаем узкий экран ИЛИ «грубый» указатель (палец).
const isMobile = window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;

// ── Источники видео ─────────────────────────────────────────────────────────
// Десктоп — 1080p all-intra; мобильные — лёгкая 720p all-intra версия,
// которую слабый аппаратный декодер перематывает без рывков.
const SRC_DESKTOP  = 'hero-scrub.mp4';
const SRC_MOBILE   = 'hero-scrub-mobile.mp4';
const SRC_FALLBACK = 'hero.mp4';

// ── Настройки ощущения ─────────────────────────────────────────────────────
const DEAD_ZONE    = 50;                 // ±px от центра: держим нейтраль (без дёрганья на стыке)
const LERP         = isMobile ? 0.08 : 0.1; // мягче инерция на мобильных → реже фактические seek-и
const EPSILON      = 0.0008;             // ниже этого порога не трогаем currentTime (экономим seek)
const SEEK_TIMEOUT = 300;                // мс: если seek «завис», всё же разрешаем следующий

// ── Состояние ───────────────────────────────────────────────────────────────
const state = {
  pointerX: window.innerWidth / 2, // последняя X-координата указателя
  active: false,                    // курсор/палец находится над hero
  duration: T_RIGHT_EDGE,           // реальная длительность (уточним из метаданных)
  seekStartedAt: 0,                 // время последнего выданного seek (performance.now)
  running: false,                   // rAF-цикл уже запущен?
};

const video = document.getElementById('hero-video');
const hero  = document.querySelector('.hero');

// Пользователь просит меньше движения — держим статичный нейтральный кадр.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * getTargetTime(x) — целевое время видео по X-координате курсора.
 * Экран делится центром (innerWidth / 2) на левую и правую половины,
 * с «мёртвой зоной» вокруг центра для устранения рывка на стыке логик.
 * @param {number} x — координата указателя по X (в px от левого края окна)
 * @returns {number} целевое время видео в секундах
 */
function getTargetTime(x) {
  const width  = window.innerWidth;
  const center = width / 2;
  const offset = x - center;

  // Dead zone: вблизи центра не считаем «прыгающую» формулу, а плавно
  // тянемся к среднему нейтральному времени — стык левой/правой логики
  // не вызывает скачка currentTime.
  if (Math.abs(offset) <= DEAD_ZONE) return T_NEUTRAL;

  if (x < center) {
    // Левая половина: x ∈ [0, center] → time ∈ [0.00, 1.95], линейно.
    const p = center > 0 ? x / center : 0;           // 0 у левого края → 1 у центра
    return T_LEFT_EDGE + p * (T_CENTER_LEFT - T_LEFT_EDGE);
  }

  // Правая половина: x ∈ [center, width] → time ∈ [2.22, 5.00], линейно.
  const span = width - center;
  const p = span > 0 ? (x - center) / span : 0;      // 0 у центра → 1 у правого края
  return T_CENTER_RIGHT + p * (T_RIGHT_EDGE - T_CENTER_RIGHT);
}

/**
 * animateVideo() — rAF-цикл. Каждый кадр вычисляет целевое время и с
 * инерцией (lerp) подтягивает к нему video.currentTime. Никаких play()/pause().
 */
function animateVideo() {
  // Троттлинг: если декодер ещё обрабатывает предыдущий seek — не шлём новый,
  // иначе на мобильных запросы копятся в очередь и видео «не поспевает за пальцем».
  // Страховка по таймауту — на случай потерянного события 'seeked'.
  const busy = video.seeking && (performance.now() - state.seekStartedAt) < SEEK_TIMEOUT;
  if (busy) {
    requestAnimationFrame(animateVideo);
    return;
  }

  // Активны — считаем цель по курсору (getTargetTime уже учитывает dead zone);
  // не активны (курсор ушёл / палец отпущен) — плавно возвращаемся в нейтраль.
  const target = state.active ? getTargetTime(state.pointerX) : T_NEUTRAL;

  const current = video.currentTime;
  const delta   = target - current;

  // Обновляем только при заметной разнице — меньше лишних seek-ов, ровно 60 FPS.
  if (Math.abs(delta) > EPSILON) {
    let next = current + delta * LERP;               // инерционное сближение
    next = Math.max(0, Math.min(next, state.duration)); // держим в пределах видео
    video.currentTime = next;
    state.seekStartedAt = performance.now();         // отметили момент выдачи seek
  }

  requestAnimationFrame(animateVideo);
}

/**
 * handlePointerMove(e) — десктоп: обновляем целевую X-координату.
 * @param {PointerEvent|MouseEvent} e
 */
function handlePointerMove(e) {
  state.active = true;
  state.pointerX = e.clientX;
}

/**
 * handleTouchMove(e) — мобильные: то же по первому касанию.
 * @param {TouchEvent} e
 */
function handleTouchMove(e) {
  if (e.touches.length === 0) return;
  state.active = true;
  state.pointerX = e.touches[0].clientX;
}

/**
 * handlePointerLeave() — курсор ушёл с области: плавный возврат в нейтраль.
 */
function handlePointerLeave() {
  state.active = false;
}

/**
 * handleTouchEnd() — палец отпущен: плавный возврат в нейтраль (~2.08s).
 */
function handleTouchEnd() {
  state.active = false;
}

/**
 * primeVideo() — одноразовая «разморозка» декодера для мобильных браузеров
 * (iOS/Safari отдают кадры по currentTime только после жеста воспроизведения).
 * Это НЕ цикл: сыграли беззвучно один тик и сразу поставили на паузу.
 */
function primeVideo() {
  const p = video.play();
  if (p && typeof p.then === 'function') {
    p.then(() => video.pause()).catch(() => { /* автоплей заблокирован — ок */ });
  } else {
    video.pause();
  }
}

/**
 * startScrubbing() — включаем интерактив. Вызывается только когда видео
 * достаточно забуферизовано (readyState ≥ 3), чтобы seek не попадал в
 * незагруженные участки и не подвисал.
 */
function startScrubbing() {
  if (state.running || reduceMotion) return;
  state.running = true;

  // ── Слушатели. passive: true — не блокируем скролл, без layout thrashing. ──
  hero.addEventListener('pointermove', handlePointerMove, { passive: true });
  hero.addEventListener('pointerleave', handlePointerLeave, { passive: true });
  hero.addEventListener('touchmove', handleTouchMove, { passive: true });
  hero.addEventListener('touchend', handleTouchEnd, { passive: true });
  hero.addEventListener('touchcancel', handleTouchEnd, { passive: true });

  // Разморозим декодер по первому касанию/клику (для мобильных).
  const prime = () => {
    primeVideo();
    hero.removeEventListener('pointerdown', prime);
    hero.removeEventListener('touchstart', prime);
  };
  hero.addEventListener('pointerdown', prime, { passive: true, once: true });
  hero.addEventListener('touchstart', prime, { passive: true, once: true });

  requestAnimationFrame(animateVideo);
}

/**
 * onMetadata() — известны длительность и первый кадр: ставим телефон «прямо».
 */
function onMetadata() {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    state.duration = video.duration;
  }
  try { video.currentTime = T_NEUTRAL; } catch (_) { /* до готовности — не критично */ }
}

/**
 * whenReady(readyLevel, fn) — вызвать fn, когда video.readyState достигнет
 * нужного уровня (учитывая, что событие могло уже произойти из кэша).
 */
function whenReady(readyLevel, eventName, fn) {
  if (video.readyState >= readyLevel) fn();
  else video.addEventListener(eventName, fn, { once: true });
}

/**
 * init() — выбираем источник под устройство, грузим и по готовности стартуем.
 */
function init() {
  // Подбираем источник под устройство ДО загрузки (media-атрибут на <source>
  // современные браузеры для video игнорируют — поэтому выбираем в JS).
  video.src = isMobile ? SRC_MOBILE : SRC_DESKTOP;

  // Фолбэк на исходный файл, если оптимизированный не загрузился.
  video.addEventListener('error', () => {
    if (video.src.indexOf(SRC_FALLBACK) === -1) {
      video.src = SRC_FALLBACK;
      video.load();
    }
  }, { once: true });

  whenReady(1 /* HAVE_METADATA */, 'loadedmetadata', onMetadata);
  // Интерактив включаем только после HAVE_FUTURE_DATA — так seek идёт по
  // уже буферизованным данным и не вызывает подвисаний.
  whenReady(3 /* HAVE_FUTURE_DATA */, 'canplay', startScrubbing);

  video.load(); // применяем выбранный src
}

init();
