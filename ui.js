/* ============================================================================
   ГРАНЬ® — интерактив UI-слоя (меню, корзина, reveal при скролле).
   Полностью независим от логики скраббинга видео в script.js.
   ========================================================================== */

const menuToggle = document.querySelector('.menu-toggle');
const menu       = document.getElementById('menu');
const body       = document.body;

/* ── Полноэкранное меню ───────────────────────────────────────────────────── */
function openMenu() {
  menu.hidden = false;
  requestAnimationFrame(() => menu.classList.add('is-open'));
  menuToggle.setAttribute('aria-expanded', 'true');
  menuToggle.setAttribute('aria-label', 'Закрыть меню');
  body.classList.add('menu-open');
}

function closeMenu() {
  menu.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Открыть меню');
  body.classList.remove('menu-open');
  const done = () => { menu.hidden = true; menu.removeEventListener('transitionend', done); };
  menu.addEventListener('transitionend', done);
}

function toggleMenu() {
  if (menuToggle.getAttribute('aria-expanded') === 'true') closeMenu();
  else openMenu();
}

if (menuToggle && menu) {
  menuToggle.addEventListener('click', toggleMenu);
  menu.querySelectorAll('.menu__link').forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') closeMenu();
  });
}

/* ── Корзина ──────────────────────────────────────────────────────────────── */
// «В корзину» увеличивает общий счётчик — маленький живой отклик без
// какой-либо коммерческой логики.
let cartItems = 0;

function addToCart() {
  cartItems += 1;
  document.querySelectorAll('.cart-count, .menu__cart').forEach((el) => {
    el.textContent = String(cartItems);
  });
  const badge = document.querySelector('.cart-count');
  if (badge) {
    badge.classList.remove('is-bumped');
    void badge.offsetWidth; // рефлоу, чтобы перезапустить анимацию
    badge.classList.add('is-bumped');
  }
}

document.querySelectorAll('[data-add]').forEach((btn) => btn.addEventListener('click', addToCart));

/* ── Reveal при появлении в вьюпорте (мягко, каскадом) ────────────────────── */
const revealEls = document.querySelectorAll('[data-reveal]');
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Задаём каждой карточке задержку по её порядку среди «соседей» с [data-reveal]
// в том же контейнере — так группа (сетка преимуществ, список характеристик,
// текст hero) появляется каскадом, а не резко и разом.
const STEP = 90;   // мс между соседними элементами
const CAP  = 6;    // максимум шагов, чтобы длинные списки не тянулись слишком долго
revealEls.forEach((el) => {
  const parent = el.parentElement;
  if (!parent) return;
  const group = Array.from(parent.children).filter((c) => c.hasAttribute('data-reveal'));
  const idx = group.indexOf(el);
  const delay = Math.min(idx, CAP) * STEP;
  el.style.setProperty('--reveal-delay', `${delay}ms`);
});

if (prefersReduced || !('IntersectionObserver' in window)) {
  // Без анимации — сразу показываем всё.
  revealEls.forEach((el) => { el.style.setProperty('--reveal-delay', '0ms'); el.classList.add('is-in'); });
} else {
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        obs.unobserve(entry.target); // один раз
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  revealEls.forEach((el) => io.observe(el));
}
