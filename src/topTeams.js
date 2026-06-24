import { getCountryFlagUrl } from './countryFlags.js';
import { getTopTeams } from './matchStats.js';

const TOP_TEAMS_LIMIT = 20;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatGoalDiff(goalDiff) {
  return goalDiff > 0 ? `+${goalDiff}` : String(goalDiff);
}

export async function loadTopTeams() {
  return getTopTeams(TOP_TEAMS_LIMIT);
}

export function renderTopTeamsHtml(teams) {
  if (!teams?.length) {
    return '<p class="top-teams-empty">No standings recorded yet</p>';
  }

  const rows = teams
    .map((entry, index) => {
      const rank = index + 1;
      const flagUrl = getCountryFlagUrl(entry.team, 40);
      const rankClass =
        rank === 1 ? 'top-teams-item--gold' : rank <= 3 ? 'top-teams-item--podium' : '';

      const flagHtml = flagUrl
        ? `<img class="top-teams-flag" src="${flagUrl}" alt="" width="20" height="20" loading="lazy" decoding="async" />`
        : '';

      return `
        <li class="top-teams-item ${rankClass}" role="button" tabindex="0" data-country="${escapeHtml(entry.team)}">
          <span class="top-teams-rank" aria-hidden="true">${rank}</span>
          ${flagHtml}
          <div class="top-teams-meta">
            <span class="top-teams-name">${escapeHtml(entry.team)}</span>
            <span class="top-teams-detail">${escapeHtml(entry.group)} · ${escapeHtml(entry.record)} · GD ${formatGoalDiff(entry.goalDiff)}</span>
          </div>
          <span class="top-teams-points" aria-label="${entry.points} points">${entry.points}</span>
        </li>
      `;
    })
    .join('');

  return `<ol class="top-teams-list">${rows}</ol>`;
}

export function renderTopTeamsLoadingHtml() {
  return `
    <div class="top-teams-loading" aria-busy="true">
      ${Array.from({ length: 8 }, () => '<div class="top-teams-skeleton"></div>').join('')}
    </div>
  `;
}
