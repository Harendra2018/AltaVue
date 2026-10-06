// full-screen loading step shown until the page is ready
const el = document.getElementById('loader');
const bar = document.getElementById('ldBar');
const txt = document.getElementById('ldTxt');
let target = 0, shown = 0, raf = 0, finished = false;

function paint() {
  bar.style.transform = 'scaleX(' + shown + ')';
  txt.textContent = 'Loading 3D scene ' + Math.round(shown * 100) + '%';
}
function tick() {
  shown += (target - shown) * 0.12;
  if (Math.abs(target - shown) < 0.002) shown = target;
  paint();
  raf = shown < target ? requestAnimationFrame(tick) : 0;
}

// f: 0..1 (monotonic; never goes backwards)
export function setProgress(f) {
  if (!el || finished) return;
  target = Math.max(target, Math.min(f, 1));
  el.classList.add('det');
  if (!raf) raf = requestAnimationFrame(tick);
}

// fade the loader out and let the page scroll
export function reveal() {
  if (!el || finished) return;
  finished = true;
  cancelAnimationFrame(raf);
  if (el.classList.contains('det')) { shown = 1; paint(); }
  setTimeout(() => {
    document.documentElement.classList.remove('is-loading');
    el.classList.add('done');
    setTimeout(() => el.remove(), 900);
  }, el.classList.contains('det') ? 250 : 0);
}
