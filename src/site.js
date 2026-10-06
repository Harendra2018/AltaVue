// compare slider, signup form, year
const B = import.meta.env.BASE_URL;
const IMG = {
  ocean: [B + 'img/ocean_cine.jpg', B + 'img/ocean_sim.jpg'],
  isles: [B + 'img/isles_cine.jpg', B + 'img/isles_sim.jpg'],
  mountains: [B + 'img/mountains_cine.jpg', B + 'img/mountains_sim.jpg'],
};
const s = document.getElementById('slider'), r = document.getElementById('range');
const set = (v) => s.style.setProperty('--p', v + '%');
r.addEventListener('input', (e) => set(e.target.value));
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  const [a, c] = IMG[b.dataset.k];
  document.getElementById('imgAfter').src = a;
  document.getElementById('imgBefore').src = c;
  r.value = 50; set(50);
}));
set(50);
document.getElementById('yr').textContent = new Date().getFullYear();

// Replace the form action with your email service (Formspree, Buttondown, etc.) when ready.
document.getElementById('form').addEventListener('submit', (e) => {
  const f = e.target;
  if (f.getAttribute('action') === '#') {
    e.preventDefault();
    document.getElementById('msg').textContent = 'Thanks! Signup will open once the site is live.';
  }
});
