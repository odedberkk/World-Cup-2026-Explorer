import { getCountryFlagUrl } from './countryFlags.js';

const API_URL = 'https://wcup2026.org/api/data.php?action=scorers';
const TOP_SCORERS_LIMIT = 20;

const TEAM_TO_COUNTRY = {
  'Bosnia & Herzegovina': 'Bosnia-Herzegovina',
  Curaçao: 'Curacao',
  'United States': 'USA',
  'Korea Republic': 'South Korea',
  'Korea, Republic of': 'South Korea',
};

let cache = {
  scorers: [],
  updated: 0,
  loading: null,
};

function normalizeTeam(team) {
  if (!team) return '';
  return TEAM_TO_COUNTRY[team] || team;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let scorersFetchStarted = false;

async function loadTopScorers() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`Scorers API failed (${res.status})`);
  const data = await res.json();
  if (!data.ok) throw new Error('Scorers API error');

  cache = {
    scorers: (data.scorers || []).slice(0, TOP_SCORERS_LIMIT),
    updated: data.updated || Date.now(),
    loading: null,
  };

  return cache.scorers;
}

export function initTopScorers() {
  if (scorersFetchStarted) return cache.loading;
  scorersFetchStarted = true;

  cache.loading = loadTopScorers().catch((err) => {
    console.warn('Top scorers load failed', err);
    cache.loading = null;
    throw err;
  });

  return cache.loading;
}

export async function getTopScorers() {
  if (!scorersFetchStarted) initTopScorers();
  if (cache.loading) {
    try {
      await cache.loading;
    } catch {
      // logged in initTopScorers
    }
  }
  return cache.scorers;
}

export function renderTopScorersHtml(scorers) {
  if (!scorers?.length) {
    return '<p class="top-scorers-empty">No scorers recorded yet</p>';
  }

  const rows = scorers
    .map((scorer, index) => {
      const rank = index + 1;
      const country = normalizeTeam(scorer.team);
      const flagUrl = getCountryFlagUrl(country, 40);
      const rankClass =
        rank === 1 ? 'top-scorers-item--gold' : rank <= 3 ? 'top-scorers-item--podium' : '';

      const flagHtml = flagUrl
        ? `<img class="top-scorers-flag" src="${flagUrl}" alt="" width="20" height="20" loading="lazy" decoding="async" />`
        : '';

      return `
        <li class="top-scorers-item ${rankClass}" role="button" tabindex="0" data-country="${escapeHtml(country)}">
          <span class="top-scorers-rank" aria-hidden="true">${rank}</span>
          ${flagHtml}
          <div class="top-scorers-meta">
            <span class="top-scorers-name">${escapeHtml(scorer.name)}</span>
            <span class="top-scorers-team">${escapeHtml(country)}</span>
          </div>
          <span class="top-scorers-goals" aria-label="${scorer.goals} goals">${scorer.goals}</span>
        </li>
      `;
    })
    .join('');

  return `<ol class="top-scorers-list">${rows}</ol>`;
}

export function renderTopScorersLoadingHtml() {
  return `
    <div class="top-scorers-loading" aria-busy="true">
      ${Array.from({ length: 8 }, () => '<div class="top-scorers-skeleton"></div>').join('')}
    </div>
  `;
}
