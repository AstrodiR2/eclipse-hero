/* ============================================================================
   prmpt® — UI chrome interactions (menu, cart).
   Completely independent of the video-scrubbing logic in script.js.
   ========================================================================== */

const menuToggle = document.querySelector('.menu-toggle');
const menu       = document.getElementById('menu');
const body       = document.body;

/* ── Full-screen menu ─────────────────────────────────────────────────────── */
function openMenu() {
  menu.hidden = false;
  // next frame so the transition runs from the hidden state
  requestAnimationFrame(() => menu.classList.add('is-open'));
  menuToggle.setAttribute('aria-expanded', 'true');
  menuToggle.setAttribute('aria-label', 'Close menu');
  body.classList.add('menu-open');
}

function closeMenu() {
  menu.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open menu');
  body.classList.remove('menu-open');
  // hide after the fade so it's removed from the a11y tree
  const done = () => { menu.hidden = true; menu.removeEventListener('transitionend', done); };
  menu.addEventListener('transitionend', done);
}

function toggleMenu() {
  if (menuToggle.getAttribute('aria-expanded') === 'true') closeMenu();
  else openMenu();
}

if (menuToggle && menu) {
  menuToggle.addEventListener('click', toggleMenu);

  // Close when a menu link is chosen…
  menu.querySelectorAll('.menu__link').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  // …and on Escape.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') closeMenu();
  });
}

/* ── Cart micro-interaction ───────────────────────────────────────────────── */
// "Add to Archive" bumps a shared cart counter — a small touch that shows the
// chrome is alive without pulling in any commerce logic.
let cartItems = 0;

function addToCart() {
  cartItems += 1;
  document.querySelectorAll('.cart-count, .menu__cart').forEach((el) => {
    el.textContent = `(${cartItems})`;
  });
  const badge = document.querySelector('.cart-count');
  if (badge) {
    badge.classList.remove('is-bumped');
    // reflow to restart the animation
    void badge.offsetWidth;
    badge.classList.add('is-bumped');
  }
}

document.querySelectorAll('.btn-fill').forEach((btn) => {
  btn.addEventListener('click', addToCart);
});
