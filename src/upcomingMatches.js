import { getCountryFlagUrl } from './countryFlags.js';
import { getUpcomingMatches } from './matchStats.js';

const UPCOMING_MATCHES_LIMIT = 10;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatLocalizedKickoff(datetime) {
  if (!datetime) return { label: '', iso: '' };

  const ms = datetime > 1e12 ? datetime : datetime * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return { label: '', iso: '' };

  const label = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);

  return { label, iso: date.toISOString() };
}

function renderTeam(team) {
  const flagUrl = getCountryFlagUrl(team, 40);
  const flagHtml = flagUrl
    ? `<img class="upcoming-match-flag" src="${flagUrl}" alt="" width="18" height="18" loading="lazy" decoding="async" />`
    : '';

  return `
    <button class="upcoming-match-team" type="button" data-country="${escapeHtml(team)}">
      ${flagHtml}
      <span class="upcoming-match-team-name">${escapeHtml(team)}</span>
    </button>
  `;
}

export async function loadUpcomingMatches() {
  return getUpcomingMatches(UPCOMING_MATCHES_LIMIT);
}

export function renderUpcomingMatchesHtml(matches) {
  if (!matches?.length) {
    return '<p class="upcoming-matches-empty">No upcoming matches scheduled</p>';
  }

  const rows = matches
    .map((match) => {
      const kickoff = formatLocalizedKickoff(match.datetime);
      const meta = [match.group, match.ground].filter(Boolean).join(' · ');

      return `
        <li class="upcoming-match-item">
          <time class="upcoming-match-time" datetime="${escapeHtml(kickoff.iso)}">${escapeHtml(kickoff.label)}</time>
          <div class="upcoming-match-teams">
            ${renderTeam(match.team1)}
            <span class="upcoming-match-vs" aria-hidden="true">vs</span>
            ${renderTeam(match.team2)}
          </div>
          ${meta ? `<span class="upcoming-match-meta">${escapeHtml(meta)}</span>` : ''}
        </li>
      `;
    })
    .join('');

  return `<ol class="upcoming-matches-list">${rows}</ol>`;
}

export function renderUpcomingMatchesLoadingHtml() {
  return `
    <div class="upcoming-matches-loading" aria-busy="true">
      ${Array.from({ length: 6 }, () => '<div class="upcoming-matches-skeleton"></div>').join('')}
    </div>
  `;
}
