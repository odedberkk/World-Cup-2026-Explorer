const FADE_MS = 450;
const curtainEl = () => document.getElementById('player-curtain');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fadePlayerCurtainIn() {
  const curtain = curtainEl();
  if (!curtain) return;

  if (reducedMotion) {
    curtain.classList.add('visible');
    curtain.setAttribute('aria-hidden', 'false');
    return;
  }

  curtain.classList.remove('visible');
  void curtain.offsetWidth;
  curtain.classList.add('visible');
  curtain.setAttribute('aria-hidden', 'false');
  await wait(FADE_MS);
}

export async function fadePlayerCurtainOut() {
  const curtain = curtainEl();
  if (!curtain || !curtain.classList.contains('visible')) return;

  curtain.classList.remove('visible');
  curtain.setAttribute('aria-hidden', 'true');

  if (reducedMotion) return;
  await wait(FADE_MS);
}
