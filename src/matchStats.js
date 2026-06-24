const API_BASE = 'https://wcup2026.org/api/data.php';
const SCORED_HYPE_MS = 90_000;

const API_TEAM_ALIASES = {
  'Bosnia & Herzegovina': 'Bosnia-Herzegovina',
  Curaçao: 'Curacao',
  'United States': 'USA',
  'Korea Republic': 'South Korea',
  'Korea, Republic of': 'South Korea',
};

let cache = {
  standings: null,
  upcoming: [],
  results: [],
  live: [],
  fetchedAt: 0,
  loading: null,
};

const statsByCountry = new Map();
const previousScores = new Map();
const scoredUntil = new Map();
const liveHypeListeners = new Set();
const teamPointsListeners = new Set();
let statsFetchStarted = false;

function normalizeTeam(name) {
  if (!name) return '';
  return API_TEAM_ALIASES[name] || name;
}

function teamEquals(apiName, canonicalTitle) {
  return normalizeTeam(apiName) === canonicalTitle;
}

async function fetchAction(action, params = '') {
  const url = `${API_BASE}?action=${action}${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Stats API ${action} failed (${res.status})`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Stats API ${action} error`);
  return data;
}

function matchKey(match) {
  return `${match.team1}|${match.team2}|${match.date || ''}|${match.datetime || ''}`;
}

function markScored(countryTitle) {
  if (!countryTitle) return;
  scoredUntil.set(countryTitle, Date.now() + SCORED_HYPE_MS);
}

function detectScoreChanges(matches) {
  matches.forEach((match) => {
    const score = match.score || [0, 0];
    const key = matchKey(match);
    const prev = previousScores.get(key);

    if (prev) {
      if (score[0] > prev[0]) markScored(normalizeTeam(match.team1));
      if (score[1] > prev[1]) markScored(normalizeTeam(match.team2));
    }

    previousScores.set(key, [score[0], score[1]]);
  });
}

function pruneScoredHype() {
  const now = Date.now();
  scoredUntil.forEach((until, country) => {
    if (until <= now) scoredUntil.delete(country);
  });
}

export function getLiveHypeMap() {
  pruneScoredHype();
  const hype = new Map();

  scoredUntil.forEach((_until, country) => {
    hype.set(country, 'scored');
  });

  const liveMatches = [
    ...cache.live,
    ...cache.upcoming.filter((match) => match.status === 'live'),
  ];

  liveMatches.forEach((match) => {
    [normalizeTeam(match.team1), normalizeTeam(match.team2)].forEach((team) => {
      if (team && !hype.has(team)) hype.set(team, 'live');
    });
  });

  return hype;
}

export function isCountryInLiveGame(countryTitle) {
  if (!countryTitle) return false;
  const hype = getLiveHypeMap().get(countryTitle);
  return hype === 'live' || hype === 'scored';
}

export function getLiveHostCities() {
  const cities = new Set();

  getLiveMatchesForHype().forEach((match) => {
    Object.keys(HOST_CITY_GROUNDS).forEach((cityName) => {
      if (groundMatchesCity(match.ground, cityName)) cities.add(cityName);
    });
  });

  return cities;
}

function getLiveMatchesForHype() {
  return [
    ...cache.live,
    ...cache.upcoming.filter((match) => match.status === 'live'),
  ];
}

export function getLiveMatchups() {
  const matchups = [];
  const seen = new Set();

  getLiveMatchesForHype().forEach((match) => {
    const team1 = normalizeTeam(match.team1);
    const team2 = normalizeTeam(match.team2);
    if (!team1 || !team2) return;

    const key = [team1, team2].sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);

    matchups.push({ team1, team2, key });
  });

  return matchups;
}

function notifyLiveHypeListeners() {
  const state = getLiveHypeMap();
  liveHypeListeners.forEach((listener) => listener(state));
}

function buildTeamPointsMap() {
  const map = new Map();
  if (!cache.standings) return map;

  Object.values(cache.standings).forEach((teams) => {
    teams.forEach((row) => {
      const country = normalizeTeam(row.team);
      if (country) map.set(country, Number(row.pts) || 0);
    });
  });

  return map;
}

function notifyTeamPointsListeners() {
  const map = buildTeamPointsMap();
  teamPointsListeners.forEach((listener) => listener(map));
}

function findStanding(countryTitle) {
  if (!cache.standings) return null;

  for (const [groupName, teams] of Object.entries(cache.standings)) {
    const index = teams.findIndex((row) => teamEquals(row.team, countryTitle));
    if (index >= 0) {
      const row = teams[index];
      return {
        group: groupName,
        rank: index + 1,
        played: row.p,
        wins: row.w,
        draws: row.d,
        losses: row.l,
        goalsFor: row.gf,
        goalsAgainst: row.ga,
        goalDiff: row.gd,
        points: row.pts,
        record: `${row.w}-${row.d}-${row.l}`,
      };
    }
  }
  return null;
}

function formatMatchScore(match, countryTitle) {
  if (!match.score) return null;
  const isHome = teamEquals(match.team1, countryTitle);
  const [home, away] = match.score;
  const ours = isHome ? home : away;
  const theirs = isHome ? away : home;
  return { ours, theirs, text: `${ours}-${theirs}` };
}

function formatResult(match, countryTitle) {
  const score = formatMatchScore(match, countryTitle);
  if (!score) return null;

  const opponent = teamEquals(match.team1, countryTitle)
    ? normalizeTeam(match.team2)
    : normalizeTeam(match.team1);

  let outcome = 'D';
  if (score.ours > score.theirs) outcome = 'W';
  if (score.ours < score.theirs) outcome = 'L';

  return {
    outcome,
    opponent,
    score: score.text,
    label: `${outcome} ${score.text} vs ${opponent}`,
    date: match.date,
  };
}

function findLiveMatch(countryTitle) {
  const fromLive = cache.live.find(
    (match) => teamEquals(match.team1, countryTitle) || teamEquals(match.team2, countryTitle)
  );
  if (fromLive) return { ...fromLive, status: 'live' };

  return (
    cache.upcoming.find(
      (match) =>
        match.status === 'live' &&
        (teamEquals(match.team1, countryTitle) || teamEquals(match.team2, countryTitle))
    ) || null
  );
}

function formatNextMatch(match, countryTitle) {
  const isHome = teamEquals(match.team1, countryTitle);
  const opponent = isHome ? normalizeTeam(match.team2) : normalizeTeam(match.team1);
  const prefix = 'vs';
  const isLive = match.status === 'live';
  const scoreInfo = isLive ? formatMatchScore(match, countryTitle) : null;
  const score = isLive ? scoreInfo?.text ?? '0-0' : null;

  return {
    opponent,
    prefix,
    isLive,
    liveMinute: match.live_minute,
    score,
    date: match.date,
    time: match.time,
    group: match.group,
    label: isLive
      ? `LIVE ${match.live_minute ?? 0}' · ${score} vs ${opponent}`
      : `${prefix} ${opponent}`,
    sublabel: isLive ? match.group : `${match.date}${match.time ? ` · ${match.time}` : ''}`,
  };
}

function buildCountryStats(countryTitle) {
  const standing = findStanding(countryTitle);

  const teamResults = cache.results
    .filter(
      (match) =>
        match.status === 'finished' &&
        (teamEquals(match.team1, countryTitle) || teamEquals(match.team2, countryTitle))
    )
    .sort((a, b) => b.datetime - a.datetime);

  const teamLive = findLiveMatch(countryTitle);

  const teamUpcoming = cache.upcoming
    .filter(
      (match) =>
        (match.status === 'upcoming' || match.status === 'scheduled') &&
        (teamEquals(match.team1, countryTitle) || teamEquals(match.team2, countryTitle))
    )
    .sort((a, b) => a.datetime - b.datetime);

  const lastResult = teamResults[0] ? formatResult(teamResults[0], countryTitle) : null;
  const nextMatch = teamLive
    ? formatNextMatch(teamLive, countryTitle)
    : teamUpcoming[0]
      ? formatNextMatch(teamUpcoming[0], countryTitle)
      : null;

  const recentResults = teamResults
    .slice(0, 3)
    .map((match) => formatResult(match, countryTitle))
    .filter(Boolean);

  return {
    country: countryTitle,
    standing,
    lastResult,
    nextMatch,
    recentResults,
    hasData: Boolean(standing || lastResult || nextMatch),
    updatedAt: cache.fetchedAt,
  };
}

function rebuildStatsIndex() {
  statsByCountry.clear();
  if (!cache.standings) return;

  const titles = new Set();
  Object.values(cache.standings).forEach((teams) => {
    teams.forEach((row) => titles.add(normalizeTeam(row.team)));
  });
  cache.results.forEach((match) => {
    titles.add(normalizeTeam(match.team1));
    titles.add(normalizeTeam(match.team2));
  });
  cache.upcoming.forEach((match) => {
    titles.add(normalizeTeam(match.team1));
    titles.add(normalizeTeam(match.team2));
  });
  cache.live.forEach((match) => {
    titles.add(normalizeTeam(match.team1));
    titles.add(normalizeTeam(match.team2));
  });

  titles.forEach((title) => {
    if (title) statsByCountry.set(title, buildCountryStats(title));
  });
}

async function loadAllStats() {
  const [standingsRes, upcomingRes, resultsRes, liveRes] = await Promise.all([
    fetchAction('standings'),
    fetchAction('upcoming', '&limit=40'),
    fetchAction('results', '&limit=40'),
    fetchAction('live'),
  ]);

  cache = {
    standings: standingsRes.standings || {},
    upcoming: upcomingRes.matches || [],
    results: resultsRes.matches || [],
    live: liveRes.matches || [],
    fetchedAt: Date.now(),
    loading: null,
  };

  detectScoreChanges(getLiveMatchesForHype());
  rebuildStatsIndex();
  notifyLiveHypeListeners();
  notifyTeamPointsListeners();
  return cache;
}

export function initMatchStats() {
  if (statsFetchStarted) return cache.loading;
  statsFetchStarted = true;

  cache.loading = loadAllStats().catch((err) => {
    console.warn('Match stats load failed', err);
    cache.loading = null;
    throw err;
  });

  return cache.loading;
}

export function initLiveHype(onUpdate) {
  if (onUpdate) liveHypeListeners.add(onUpdate);

  ensureStatsLoaded()
    .then(() => notifyLiveHypeListeners())
    .catch((err) => console.warn('Live hype init failed', err));

  return () => {
    if (onUpdate) liveHypeListeners.delete(onUpdate);
  };
}

export function initTeamPoints(onUpdate) {
  if (onUpdate) teamPointsListeners.add(onUpdate);

  ensureStatsLoaded()
    .then(() => notifyTeamPointsListeners())
    .catch((err) => console.warn('Team points init failed', err));

  return () => {
    if (onUpdate) teamPointsListeners.delete(onUpdate);
  };
}

export function getTeamPointsMap() {
  return buildTeamPointsMap();
}

const HOST_CITY_GROUNDS = {
  Atlanta: ['atlanta'],
  Boston: ['boston', 'foxborough'],
  Dallas: ['dallas', 'arlington'],
  Houston: ['houston'],
  'Kansas City': ['kansas city'],
  'Los Angeles': ['los angeles', 'inglewood'],
  Miami: ['miami'],
  'New York': ['new york', 'rutherford', 'east rutherford', 'new jersey'],
  Philadelphia: ['philadelphia'],
  'San Francisco': ['san francisco', 'santa clara', 'bay area'],
  Seattle: ['seattle'],
  Guadalajara: ['guadalajara', 'zapopan'],
  'Mexico City': ['mexico city', 'azteca'],
  Monterrey: ['monterrey'],
  Toronto: ['toronto'],
  Vancouver: ['vancouver'],
};

function groundMatchesCity(ground, cityName) {
  if (!ground) return false;
  const normalized = ground.toLowerCase();
  const aliases = HOST_CITY_GROUNDS[cityName] || [cityName.toLowerCase()];
  return aliases.some((alias) => normalized.includes(alias));
}

export async function getStadiumFixtures(cityName, limit = 4) {
  await ensureStatsLoaded();

  const matches = [
    ...cache.live.map((match) => ({ ...match, status: 'live' })),
    ...cache.upcoming.filter(
      (match) => match.status === 'upcoming' || match.status === 'scheduled' || match.status === 'live'
    ),
  ]
    .filter((match) => groundMatchesCity(match.ground, cityName))
    .sort((a, b) => a.datetime - b.datetime);

  const seen = new Set();
  const unique = [];

  matches.forEach((match) => {
    const key = `${match.team1}|${match.team2}|${match.datetime}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(match);
  });

  return unique.slice(0, limit);
}

export async function getUpcomingMatches(limit = 10) {
  await ensureStatsLoaded();

  const nowSec = Date.now() / 1000;

  return cache.upcoming
    .filter(
      (match) =>
        (match.status === 'upcoming' || match.status === 'scheduled') &&
        (!match.datetime || match.datetime >= nowSec)
    )
    .sort((a, b) => a.datetime - b.datetime)
    .slice(0, limit)
    .map((match) => ({
      team1: normalizeTeam(match.team1),
      team2: normalizeTeam(match.team2),
      datetime: match.datetime,
      group: match.group || match.round || '',
      ground: match.ground || '',
    }));
}

export async function getTopTeams(limit = 20) {
  await ensureStatsLoaded();
  if (!cache.standings) return [];

  const teams = [];

  Object.entries(cache.standings).forEach(([group, rows]) => {
    rows.forEach((row, index) => {
      teams.push({
        team: normalizeTeam(row.team),
        group,
        rankInGroup: index + 1,
        points: Number(row.pts) || 0,
        played: Number(row.p) || 0,
        wins: Number(row.w) || 0,
        draws: Number(row.d) || 0,
        losses: Number(row.l) || 0,
        goalDiff: Number(row.gd) || 0,
        goalsFor: Number(row.gf) || 0,
        record: `${row.w}-${row.d}-${row.l}`,
      });
    });
  });

  return teams
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDiff - a.goalDiff ||
        b.goalsFor - a.goalsFor ||
        a.team.localeCompare(b.team)
    )
    .slice(0, limit);
}

export async function ensureStatsLoaded() {
  if (cache.fetchedAt) return cache;
  if (!statsFetchStarted) initMatchStats();
  if (cache.loading) {
    try {
      await cache.loading;
    } catch {
      // logged in initMatchStats
    }
  }
  return cache;
}

export async function getCountryStats(countryTitle) {
  await ensureStatsLoaded();
  return statsByCountry.get(countryTitle) || buildCountryStats(countryTitle);
}

export function renderStatsHtml(stats) {
  if (!stats) {
    return '<div class="hover-card-stats hover-card-stats--empty">Stats unavailable</div>';
  }

  if (!stats.hasData) {
    return '<div class="hover-card-stats hover-card-stats--empty">No tournament data yet</div>';
  }

  const standingHtml = stats.standing
    ? `
      <div class="stats-row stats-row--highlight">
        <span class="stats-label">${stats.standing.group}</span>
        <span class="stats-value">${stats.standing.record} · ${stats.standing.points} pts</span>
      </div>
      <div class="stats-meta">${ordinal(stats.standing.rank)} in group · GD ${formatGd(stats.standing.goalDiff)}</div>
    `
    : '';

  const lastHtml = stats.lastResult
    ? `
      <div class="stats-section">
        <div class="stats-section-title">Last result</div>
        <div class="stats-match ${outcomeClass(stats.lastResult.outcome)}">${stats.lastResult.outcome} ${stats.lastResult.score} vs ${renderStatsCountryLink(stats.lastResult.opponent)}</div>
      </div>
    `
    : '';

  const nextHtml = stats.nextMatch
    ? `
      <div class="stats-section">
        <div class="stats-section-title">${stats.nextMatch.isLive ? 'Live now' : 'Next match'}</div>
        <div class="stats-match ${stats.nextMatch.isLive ? 'stats-match--live' : ''}">
          ${
            stats.nextMatch.isLive
              ? `<span class="stats-live-minute">LIVE ${stats.nextMatch.liveMinute ?? 0}'</span>
                 <span class="stats-live-score">${stats.nextMatch.score}</span>
                 <span class="stats-live-opponent">vs ${renderStatsCountryLink(stats.nextMatch.opponent)}</span>`
              : `${stats.nextMatch.prefix} ${renderStatsCountryLink(stats.nextMatch.opponent)}`
          }
        </div>
        ${stats.nextMatch.sublabel ? `<div class="stats-sublabel">${stats.nextMatch.sublabel}</div>` : ''}
      </div>
    `
    : '';

  const recentHtml =
    stats.recentResults.length > 1
      ? `
      <div class="stats-section stats-section--compact">
        <div class="stats-section-title">Recent</div>
        <ul class="stats-recent-list">
          ${stats.recentResults
            .map(
              (result) =>
                `<li class="${outcomeClass(result.outcome)}">${result.outcome} ${result.score} vs ${renderStatsCountryLink(result.opponent)}</li>`
            )
            .join('')}
        </ul>
      </div>
    `
      : '';

  const hasCountryLinks = Boolean(
    stats.lastResult?.opponent ||
      stats.nextMatch?.opponent ||
      stats.recentResults.some((result) => result.opponent)
  );

  const isMobileStatsCard = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const tipHtml =
    hasCountryLinks && !isMobileStatsCard
      ? '<p class="stats-explore-tip">Tip: click any country name to jump there</p>'
      : '';

  return `
    <div class="hover-card-stats">
      ${standingHtml}
      ${lastHtml}
      ${nextHtml}
      ${recentHtml}
      ${tipHtml}
    </div>
  `;
}

export function renderStatsLoadingHtml() {
  return `
    <div class="hover-card-stats hover-card-stats--loading" aria-busy="true">
      <div class="stats-skeleton"></div>
      <div class="stats-skeleton stats-skeleton--short"></div>
      <div class="stats-skeleton"></div>
    </div>
  `;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderStatsCountryLink(country) {
  return `<button type="button" class="stats-country-link" data-country="${escapeHtml(country)}">${escapeHtml(country)}</button>`;
}

function ordinal(n) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}

function formatGd(gd) {
  return gd > 0 ? `+${gd}` : String(gd);
}

function outcomeClass(outcome) {
  if (outcome === 'W') return 'stats-match--win';
  if (outcome === 'L') return 'stats-match--loss';
  return 'stats-match--draw';
}
