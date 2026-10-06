import './style.css';
import './site.js';
import { setProgress, reveal } from './loader.js';

const BASE = import.meta.env.BASE_URL;
// phones / tablets / small screens: get the lighter 3D scene (jet_low.glb), image only as fallback
const MOBILE = matchMedia('(max-width:760px), (pointer:coarse)').matches;
const SAVE_DATA = !!(navigator.connection && navigator.connection.saveData);
const hero = document.querySelector('.hero');
const wait = (ms) => new Promise((r) => setTimeout(() => r('timeout'), ms));

// the hero image (also the fallback if 3D can't run)
function showPoster() {
  if (document.getElementById('poster')) return Promise.resolve();
  const img = new Image();
  img.id = 'poster';
  img.alt = 'An F-15 Eagle banking over a dark ocean at sunset';
  img.fetchPriority = 'high';
  img.src = BASE + 'img/ocean_cine.jpg';
  hero.classList.add('static');
  hero.prepend(img);
  return Promise.race([(img.decode ? img.decode() : Promise.resolve()).catch(() => {}), wait(4000)]);
}

(async () => {
  // Data Saver on a phone: skip the 3D downloads and just show the image
  if (MOBILE && SAVE_DATA) {
    await showPoster();
    reveal();
    return;
  }

  // Same flow for desktop and mobile: the loading screen stays up until the 3D scene is ready.
  // Mobile uses the lite scene (jet_low.glb + daytime_low.exr). The image is only shown if 3D fails or times out.
  let result = false;
  try {
    const { startHero } = await import('./hero3d.js');
    result = await Promise.race([
      startHero({ onProgress: setProgress, lite: MOBILE }),
      wait(MOBILE ? 40000 : 30000),
    ]);
  } catch (e) {
    console.error(e);
  }
  if (result !== true) await showPoster();
  reveal();
})();
