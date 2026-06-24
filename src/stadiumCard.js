import { getCountryFlagUrl } from './countryFlags.js';
import { HOST_CITIES } from './hostCities.js';
import { getStadiumFixtures } from './matchStats.js';

let activeCity = null;
let onMobileClose = null;
const stadiumImageCache = new Map();
const cardEl = () => document.getElementById('stadium-card');
const heroEl = () => document.getElementById('stadium-card-hero');
const bodyEl = () => document.getElementById('stadium-card-body');
const backdropEl = () => document.getElementById('mobile-backdrop');

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCapacity(value) {
  return Number(value).toLocaleString('en-US');
}

function preloadStadiumImage(imagePath) {
  if (!imagePath || stadiumImageCache.has(imagePath)) return;

  const img = new Image();
  const promise = new Promise((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
  });
  img.src = imagePath;
  stadiumImageCache.set(imagePath, { img, promise });
}

export function preloadStadiumImages() {
  HOST_CITIES.forEach((city) => preloadStadiumImage(city.image));
}

async function ensureStadiumImage(imagePath) {
  if (!imagePath) return;
  preloadStadiumImage(imagePath);
  await stadiumImageCache.get(imagePath)?.promise;
}

function heroGradient(country, accent) {
  if (country === 'Mexico') {
    return `linear-gradient(135deg, rgba(0, 80, 40, 0.95) 0%, rgba(0, 255, 136, 0.35) 55%, rgba(8, 12, 24, 0.92) 100%)`;
  }
  if (country === 'Canada') {
    return `linear-gradient(135deg, rgba(120, 12, 40, 0.95) 0%, rgba(255, 51, 102, 0.35) 55%, rgba(8, 12, 24, 0.92) 100%)`;
  }
  return `linear-gradient(135deg, rgba(0, 40, 80, 0.95) 0%, ${accent}55 55%, rgba(8, 12, 24, 0.92) 100%)`;
}

function renderHero(city) {
  const flagUrl = getCountryFlagUrl(city.country, 40);
  const flagHtml = flagUrl
    ? `<img class="stadium-card-flag" src="${flagUrl}" alt="" width="24" height="24" loading="lazy" decoding="async" />`
    : '';
  const photoHtml = city.image
    ? `<img class="stadium-card-hero-photo" src="${escapeHtml(city.image)}" alt="" decoding="async" />`
    : '';

  return `
    <div class="stadium-card-hero" style="background: ${heroGradient(city.country, city.color)};">
      ${photoHtml}
      <div class="stadium-card-hero-overlay" aria-hidden="true"></div>
      <div class="stadium-card-hero-pattern" aria-hidden="true"></div>
      <div class="stadium-card-hero-content">
        ${flagHtml}
        <span class="stadium-card-city">${escapeHtml(city.city)} · ${escapeHtml(city.country)}</span>
        <h2 class="stadium-card-stadium">${escapeHtml(city.stadium)}</h2>
        <p class="stadium-card-meta">${formatCapacity(city.capacity)} seats · ${escapeHtml(city.tagline)}</p>
      </div>
    </div>
  `;
}

function renderFixturesHtml(fixtures) {
  if (!fixtures.length) {
    return `
      <div class="stadium-card-section">
        <h3 class="stadium-card-section-title">Next fixtures</h3>
        <p class="stadium-card-empty">No upcoming matches scheduled here yet</p>
      </div>
    `;
  }

  const rows = fixtures
    .map((match) => {
      const isLive = match.status === 'live';
      const scoreHtml =
        isLive && match.score
          ? `<span class="stadium-fixture-score">${match.score[0]}-${match.score[1]}</span>`
          : '';

      return `
        <li class="stadium-fixture ${isLive ? 'stadium-fixture--live' : ''}">
          <div class="stadium-fixture-top">
            ${isLive ? '<span class="stadium-fixture-live">LIVE</span>' : `<span class="stadium-fixture-date">${escapeHtml(match.date)} · ${escapeHtml(match.time || '')}</span>`}
            <span class="stadium-fixture-group">${escapeHtml(match.group || match.round || '')}</span>
          </div>
          <div class="stadium-fixture-teams">
            <span>${escapeHtml(match.team1)}</span>
            <span class="stadium-fixture-vs">vs</span>
            <span>${escapeHtml(match.team2)}</span>
            ${scoreHtml}
          </div>
        </li>
      `;
    })
    .join('');

  return `
    <div class="stadium-card-section">
      <h3 class="stadium-card-section-title">Next fixtures</h3>
      <ul class="stadium-fixture-list">${rows}</ul>
    </div>
  `;
}

function positionCard(x, y) {
  const card = cardEl();
  if (!card || isCoarsePointerDevice()) return;

  const padding = 16;
  const cardRect = card.getBoundingClientRect();
  let left = x + 18;
  let top = y - cardRect.height / 2;

  if (left + cardRect.width > window.innerWidth - padding) {
    left = x - cardRect.width - 18;
  }
  if (top < padding) top = padding;
  if (top + cardRect.height > window.innerHeight - padding) {
    top = window.innerHeight - cardRect.height - padding;
  }

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function setBackdropVisible(visible) {
  const backdrop = backdropEl();
  if (!backdrop) return;
  backdrop.classList.toggle('hidden', !visible);
  backdrop.classList.toggle('visible', visible);
  backdrop.setAttribute('aria-hidden', String(!visible));
}

export function isCoarsePointerDevice() {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export function initStadiumCard({ onMobileClose: closeHandler } = {}) {
  onMobileClose = closeHandler ?? null;
  preloadStadiumImages();

  document.getElementById('stadium-card-close')?.addEventListener('click', hideStadiumCard);
}

export function isStadiumCardVisible() {
  const card = cardEl();
  return card && card.classList.contains('visible');
}

export function hideStadiumCard() {
  const card = cardEl();
  if (!card) return;

  activeCity = null;
  card.classList.add('hidden');
  card.classList.remove('visible', 'stadium-card--mobile');
  card.setAttribute('aria-hidden', 'true');
  setBackdropVisible(false);

  if (isCoarsePointerDevice()) onMobileClose?.();
}

export function updateStadiumCardPosition(x, y) {
  if (!isStadiumCardVisible() || !activeCity || isCoarsePointerDevice()) return;
  positionCard(x, y);
}

export async function showStadiumCard({ city, x = 0, y = 0 }) {
  const card = cardEl();
  const hero = heroEl();
  const body = bodyEl();
  if (!card || !hero || !body || !city) return;

  const isMobile = isCoarsePointerDevice();
  activeCity = city.city;

  if (city.image) await ensureStadiumImage(city.image);
  if (activeCity !== city.city) return;

  hero.innerHTML = renderHero(city);  body.innerHTML = `
    <div class="stadium-card-section">
      <h3 class="stadium-card-section-title">Next fixtures</h3>
      <div class="stadium-card-skeleton"></div>
      <div class="stadium-card-skeleton stadium-card-skeleton--short"></div>
      <div class="stadium-card-skeleton"></div>
    </div>
  `;
  body.setAttribute('aria-busy', 'true');

  card.classList.toggle('stadium-card--mobile', isMobile);
  card.classList.remove('hidden');
  card.classList.add('visible');
  card.setAttribute('aria-hidden', 'false');
  setBackdropVisible(isMobile);

  if (!isMobile) positionCard(x, y);

  try {
    const fixtures = await getStadiumFixtures(city.city);
    if (activeCity !== city.city) return;

    body.innerHTML = renderFixturesHtml(fixtures);
    body.removeAttribute('aria-busy');
    if (!isMobile) positionCard(x, y);
  } catch {
    if (activeCity !== city.city) return;
    body.innerHTML = `
      <div class="stadium-card-section">
        <h3 class="stadium-card-section-title">Next fixtures</h3>
        <p class="stadium-card-empty">Could not load fixtures</p>
      </div>
    `;
    body.removeAttribute('aria-busy');
  }
}

export function getActiveStadiumCity() {
  return activeCity;
}
