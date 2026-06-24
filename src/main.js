import { createGlobe } from './globe.js';
import {
  findCountryTitle,
  getParticipantCountries,
  getCountryDisplayName,
  getCountryLabelIdentifier,
  isParticipantCountry,
} from './countryMap.js';
import {
  hideHoverCard,
  getActiveCountry,
  initBlaze,
  isCardVisible,
  isCoarsePointerDevice,
  notifyLiveMatchLabelsReady,
  playHighlights,
  showHoverCard,
} from './blaze.js';
import { initMatchStats, initLiveHype, initTeamPoints } from './matchStats.js';
import {
  getTopScorers,
  initTopScorers,
  renderTopScorersHtml,
  renderTopScorersLoadingHtml,
} from './topScorers.js';
import {
  loadUpcomingMatches,
  renderUpcomingMatchesHtml,
  renderUpcomingMatchesLoadingHtml,
} from './upcomingMatches.js';
import {
  loadTopTeams,
  renderTopTeamsHtml,
  renderTopTeamsLoadingHtml,
} from './topTeams.js';
import { findHostCity } from './hostCities.js';
import { fadePlayerCurtainIn, fadePlayerCurtainOut } from './playerCurtain.js';
import {
  hideStadiumCard,
  initStadiumCard,
  isStadiumCardVisible,
  showStadiumCard,
  updateStadiumCardPosition,
} from './stadiumCard.js';
import { initAccessGate } from './gate.js';

let rankingPanelClosers = {
  scorers: null,
  teams: null,
  upcoming: null,
};

let rankingPanelRestorers = {
  scorers: null,
  teams: null,
};

let rankingPanelOpenState = {
  scorers: () => false,
  teams: () => false,
};

let upcomingDismissedBothRankings = false;

function isUpcomingPanelOpen() {
  const panel = document.getElementById('upcoming-matches-panel');
  return panel && !panel.classList.contains('hidden');
}

function bindRankingToggle(toggle, setOpen, isOpenRef, panelKind) {
  toggle.addEventListener('click', () => {
    const wasOpen = isOpenRef();

    if (
      !isTouchDevice &&
      isUpcomingPanelOpen() &&
      !wasOpen
    ) {
      const scorersOpen = rankingPanelOpenState.scorers();
      const teamsOpen = rankingPanelOpenState.teams();
      const otherIsOpen =
        panelKind === 'scorers' ? teamsOpen && !scorersOpen : scorersOpen && !teamsOpen;

      if (otherIsOpen) rankingPanelClosers.upcoming?.();
    }

    setOpen(!wasOpen);
  });
}

const HOVER_DELAY_MS = 400;
const STADIUM_HOVER_DELAY_MS = 220;
const SELECTED_COUNTRY_STATS_MS = 5000;
const FLY_TRANSITION_MS = 1200;
const FOCUSED_SCREEN_ALTITUDE = 0.068;

let stadiumHoverTimeout = null;
let stadiumLeaveTimeout = null;

const isTouchDevice = isCoarsePointerDevice();

let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let hoverTimeout = null;
let leaveTimeout = null;
let pendingCountryKey = null;
let selectedCountryStatsTimeout = null;
let selectedCountryAutoDismiss = false;
let selectedCardRevealTimer = null;
let globeApi = null;

function initStarfield() {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const isMobile = window.innerWidth < 768;
  const starCount = isMobile ? 180 : 420;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let stars = [];
  let startTime = performance.now();

  function createStar() {
    const sparkle = Math.random() < 0.14;
    return {
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.4 + 0.3,
      a: Math.random() * 0.6 + 0.2,
      sparkle,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 1.2,
      glow: 1.8 + Math.random() * 2.2,
    };
  }

  function resize() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    stars = Array.from({ length: starCount }, createStar);
    startTime = performance.now();
  }

  function draw(now) {
    const t = (now - startTime) / 1000;

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    stars.forEach((star) => {
      let alpha = star.a;
      let radius = star.r;

      if (star.sparkle && !reducedMotion) {
        const pulse = (Math.sin(t * star.speed + star.phase) + 1) / 2;
        alpha = star.a * (0.42 + pulse * 0.95);
        radius = star.r * (0.88 + pulse * 0.32);

        const glowRadius = star.r * star.glow * (0.75 + pulse * 0.45);
        const glow = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, glowRadius);
        glow.addColorStop(0, `rgba(255, 255, 255, ${0.14 + pulse * 0.18})`);
        glow.addColorStop(0.45, `rgba(210, 225, 255, ${0.04 + pulse * 0.06})`);
        glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.beginPath();
        ctx.arc(star.x, star.y, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(star.x, star.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });
  requestAnimationFrame(draw);
}

function initPlanets() {
  const container = document.getElementById('planets');
  if (!container) return;

  const isMobile = window.innerWidth < 768;
  const count = 0;  
  // const count = isMobile ? 2 : 4;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  for (let i = 0; i < count; i += 1) {
    const planet = document.createElement('div');
    planet.className = 'planet';
    const size = (isMobile ? 28 : 36) + Math.random() * (isMobile ? 24 : 40);
    planet.style.width = `${size}px`;
    planet.style.height = `${size}px`;
    planet.style.left = `${Math.random() * 90}%`;
    planet.style.top = `${Math.random() * 90}%`;

    const img = document.createElement('img');
    img.src = 'assets/world-cup-ball.png?v=2';
    img.alt = '';
    img.draggable = false;
    planet.appendChild(img);

    if (!reducedMotion) {
      const duration = 18 + Math.random() * 22;
      const delay = Math.random() * -duration;
      planet.style.animation = `planet-drift-${i % 4} ${duration}s ${delay}s ease-in-out infinite`;
    }

    container.appendChild(planet);
  }

  if (!document.getElementById('planet-keyframes')) {
    const style = document.createElement('style');
    style.id = 'planet-keyframes';
    style.textContent = `
      @keyframes planet-drift-0 {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        50% { transform: translate(30px, -40px) rotate(180deg); }
      }
      @keyframes planet-drift-1 {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        50% { transform: translate(-35px, 25px) rotate(-160deg); }
      }
      @keyframes planet-drift-2 {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        50% { transform: translate(20px, 35px) rotate(120deg); }
      }
      @keyframes planet-drift-3 {
        0%, 100% { transform: translate(0, 0) rotate(0deg); }
        50% { transform: translate(-25px, -30px) rotate(-120deg); }
      }
    `;
    document.head.appendChild(style);
  }
}

function isPointerOverTopBarChrome(clientX = lastPointer.x, clientY = lastPointer.y) {
  if (isTouchDevice) return false;
  const target = document.elementFromPoint(clientX, clientY);
  return Boolean(
    target?.closest('.country-search-wrap') || target?.closest('.top-bar-title-wrap')
  );
}

function trackPointer(event) {
  lastPointer = { x: event.clientX, y: event.clientY };
  if (!isTouchDevice) {
    updateStadiumCardPosition(lastPointer.x, lastPointer.y);
    if (isPointerOverTopBarChrome()) {
      clearTimeout(hoverTimeout);
      pendingCountryKey = null;
      globeApi?.clearHover();
      if (isCardVisible() && !selectedCountryAutoDismiss) {
        scheduleHideHoverCard();
      }
    }
    return;
  }
}

function scheduleSelectedCountryDismiss() {
  clearTimeout(selectedCountryStatsTimeout);
  selectedCountryStatsTimeout = setTimeout(() => {
    selectedCountryStatsTimeout = null;
    selectedCountryAutoDismiss = false;
    hideHoverCard();
    setGlobeRotationPausedFor('stats', false);
    globeApi?.clearHover();
  }, SELECTED_COUNTRY_STATS_MS);
}

function clearSelectedCardRevealTimer() {
  if (selectedCardRevealTimer) {
    clearTimeout(selectedCardRevealTimer);
    selectedCardRevealTimer = null;
  }
}

function clearSelectedCountryAutoDismiss() {
  clearTimeout(selectedCountryStatsTimeout);
  selectedCountryStatsTimeout = null;
  selectedCountryAutoDismiss = false;
  clearSelectedCardRevealTimer();
}

function cancelSelectedCountryAutoDismiss() {
  if (!selectedCountryAutoDismiss) return;
  clearTimeout(selectedCountryStatsTimeout);
  selectedCountryStatsTimeout = null;
  selectedCountryAutoDismiss = false;
}

function getGlobeCenterClientPosition() {
  const container = document.getElementById('globe-container');
  if (!container) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const rect = container.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function getCountryCardAnchor(countryName) {
  const pos = globeApi?.getCountryScreenPosition(countryName, FOCUSED_SCREEN_ALTITUDE);
  const fallback = getGlobeCenterClientPosition();
  return {
    x: pos?.x ?? fallback.x,
    y: pos?.y ?? fallback.y,
  };
}

function showSelectedCountryStatsCard(labelIdentifier, countryName) {
  clearSelectedCountryAutoDismiss();
  clearTimeout(hoverTimeout);
  clearTimeout(leaveTimeout);
  pendingCountryKey = null;

  setGlobeRotationPausedFor('stats', true);
  selectedCountryAutoDismiss = true;

  selectedCardRevealTimer = setTimeout(() => {
    selectedCardRevealTimer = null;
    if (!selectedCountryAutoDismiss) return;

    const anchor = getCountryCardAnchor(countryName);
    showHoverCard({
      labelIdentifier,
      countryName,
      x: anchor.x,
      y: anchor.y,
    });
    scheduleSelectedCountryDismiss();
  }, FLY_TRANSITION_MS + 50);
}

function dismissCountryHoverCard() {
  clearSelectedCountryAutoDismiss();
  clearTimeout(hoverTimeout);
  clearTimeout(leaveTimeout);
  pendingCountryKey = null;
  hideHoverCard();
  setGlobeRotationPausedFor('stats', false);
  globeApi?.clearHover();
}

const rotationPauseReasons = { stadium: false, stats: false, player: false };

function setGlobeRotationPausedFor(reason, paused) {
  if (reason !== 'player' && isTouchDevice) return;
  if (rotationPauseReasons[reason] === paused) return;
  rotationPauseReasons[reason] = paused;
  if (paused) globeApi?.pauseAutoRotate();
  else globeApi?.resumeAutoRotate();
}

function pauseGlobeAutoRotate() {
  setGlobeRotationPausedFor('stadium', true);
}

function resumeGlobeAutoRotate() {
  setGlobeRotationPausedFor('stadium', false);
}

function dismissStadiumCard() {
  hideStadiumCard();
  resumeGlobeAutoRotate();
}

function scheduleShowStadiumCard(city, x, y) {
  if (isTouchDevice) return;

  pauseGlobeAutoRotate();
  clearTimeout(stadiumLeaveTimeout);
  clearTimeout(stadiumHoverTimeout);
  stadiumHoverTimeout = setTimeout(() => {
    dismissCountryHoverCard();
    showStadiumCard({ city, x, y });
  }, STADIUM_HOVER_DELAY_MS);
}

function scheduleHideStadiumCard() {
  clearTimeout(stadiumHoverTimeout);
  stadiumLeaveTimeout = setTimeout(dismissStadiumCard, 160);
}

function selectCountry(countryTitle) {
  const resolvedTitle = findCountryTitle(countryTitle) || countryTitle;
  if (!isParticipantCountry(resolvedTitle)) return;

  const labelId = getCountryLabelIdentifier(resolvedTitle);

  if (isTouchDevice) {
    dismissStadiumCard();
    globeApi?.flyToCountry(resolvedTitle);
    showHoverCard({
      labelIdentifier: labelId,
      countryName: resolvedTitle,
      x: 0,
      y: 0,
    });
  } else if (!globeApi?.flyToCountry(resolvedTitle)) {
    return;
  } else {
    showSelectedCountryStatsCard(labelId, resolvedTitle);
  }

  const input = document.getElementById('country-search');
  const results = document.getElementById('country-search-results');
  if (input) {
    input.value = '';
    input.blur();
  }
  if (results) {
    results.classList.add('hidden');
    results.innerHTML = '';
    input?.setAttribute('aria-expanded', 'false');
  }
}

function getHostCityFromMarker(marker) {
  return findHostCity(marker?.dataset?.city);
}

function scheduleHoverCard(payload) {
  cancelSelectedCountryAutoDismiss();
  const countryKey = payload.labelIdentifier || payload.countryName;
  clearTimeout(leaveTimeout);
  dismissStadiumCard();
  setGlobeRotationPausedFor('stats', true);

  if (pendingCountryKey === countryKey && hoverTimeout) return;
  if (getActiveCountry() === getCountryDisplayName(payload.countryName)) {
    return;
  }

  clearTimeout(hoverTimeout);
  pendingCountryKey = countryKey;

  hoverTimeout = setTimeout(() => {
    pendingCountryKey = null;
    showHoverCard({
      labelIdentifier: payload.labelIdentifier,
      countryName: payload.countryName,
      x: lastPointer.x,
      y: lastPointer.y,
    });
  }, HOVER_DELAY_MS);
}

function scheduleHideHoverCard() {
  clearTimeout(leaveTimeout);
  leaveTimeout = setTimeout(() => {
    clearSelectedCountryAutoDismiss();
    clearTimeout(hoverTimeout);
    pendingCountryKey = null;
    hideHoverCard();
    setGlobeRotationPausedFor('stats', false);
  }, 180);
}

function hideLoading() {
  document.getElementById('loading')?.classList.add('hidden');
}

function initTopScorersPanel() {
  const toggle = document.getElementById('top-scorers-toggle');
  const panel = document.getElementById('top-scorers-panel');
  const body = document.getElementById('top-scorers-body');
  if (!toggle || !panel || !body) return;

  let isOpen = false;
  let loaded = false;

  function loadScorers() {
    if (loaded) return;
    body.innerHTML = renderTopScorersLoadingHtml();
    getTopScorers()
      .then((scorers) => {
        loaded = true;
        body.innerHTML = renderTopScorersHtml(scorers);
      })
      .catch(() => {
        body.innerHTML = '<p class="top-scorers-empty">Could not load scorers</p>';
      });
  }

  body.addEventListener('click', (e) => {
    const item = e.target.closest('.top-scorers-item');
    if (!item?.dataset.country) return;
    selectCountry(item.dataset.country);
  });

  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = e.target.closest('.top-scorers-item');
    if (!item?.dataset.country) return;
    e.preventDefault();
    selectCountry(item.dataset.country);
  });

  function showPinnedPanel() {
    isOpen = true;
    toggle.setAttribute('aria-expanded', 'true');
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    loadScorers();
  }

  function setOpen(open) {
    isOpen = open;
    toggle.setAttribute('aria-expanded', String(open));
    panel.classList.toggle('hidden', !open);
    panel.setAttribute('aria-hidden', String(!open));

    if (open) {
      if (isTouchDevice) {
        rankingPanelClosers.teams?.();
        rankingPanelClosers.upcoming?.();
      }
      loadScorers();
    }
  }

  rankingPanelClosers.scorers = () => setOpen(false);
  rankingPanelOpenState.scorers = () => isOpen;

  if (!isTouchDevice) {
    rankingPanelRestorers.scorers = showPinnedPanel;
    panel.classList.add('top-scorers-panel--pinned');
    toggle.classList.add('top-scorers-toggle--static');
    isOpen = true;
    toggle.setAttribute('aria-expanded', 'true');
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    loadScorers();
    initTopScorers();
    bindRankingToggle(toggle, setOpen, () => isOpen, 'scorers');
    return;
  }

  toggle.addEventListener('click', () => setOpen(!isOpen));

  document.addEventListener('click', (e) => {
    if (!isOpen) return;
    if (e.target.closest('.globe-controls')) return;
    setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) setOpen(false);
  });

  initTopScorers();
}

function initTopTeamsPanel() {
  const toggle = document.getElementById('top-teams-toggle');
  const panel = document.getElementById('top-teams-panel');
  const body = document.getElementById('top-teams-body');
  if (!toggle || !panel || !body) return;

  let isOpen = false;
  let loaded = false;

  function loadTeams() {
    if (loaded) return;
    body.innerHTML = renderTopTeamsLoadingHtml();
    loadTopTeams()
      .then((teams) => {
        loaded = true;
        body.innerHTML = renderTopTeamsHtml(teams);
      })
      .catch(() => {
        body.innerHTML = '<p class="top-teams-empty">Could not load teams</p>';
      });
  }

  body.addEventListener('click', (e) => {
    const item = e.target.closest('.top-teams-item');
    if (!item?.dataset.country) return;
    selectCountry(item.dataset.country);
  });

  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = e.target.closest('.top-teams-item');
    if (!item?.dataset.country) return;
    e.preventDefault();
    selectCountry(item.dataset.country);
  });

  function showPinnedPanel() {
    isOpen = true;
    toggle.setAttribute('aria-expanded', 'true');
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    loadTeams();
  }

  function setOpen(open) {
    isOpen = open;
    toggle.setAttribute('aria-expanded', String(open));
    panel.classList.toggle('hidden', !open);
    panel.setAttribute('aria-hidden', String(!open));

    if (open) {
      if (isTouchDevice) {
        rankingPanelClosers.scorers?.();
        rankingPanelClosers.upcoming?.();
      }
      loadTeams();
    }
  }

  rankingPanelClosers.teams = () => setOpen(false);
  rankingPanelOpenState.teams = () => isOpen;

  if (!isTouchDevice) {
    rankingPanelRestorers.teams = showPinnedPanel;
    panel.classList.add('top-teams-panel--pinned');
    toggle.classList.add('top-teams-toggle--static');
    isOpen = true;
    toggle.setAttribute('aria-expanded', 'true');
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    loadTeams();
    bindRankingToggle(toggle, setOpen, () => isOpen, 'teams');
    return;
  }

  toggle.addEventListener('click', () => setOpen(!isOpen));

  document.addEventListener('click', (e) => {
    if (!isOpen) return;
    if (e.target.closest('.globe-controls')) return;
    setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) setOpen(false);
  });
}

function initUpcomingMatchesPanel() {
  const toggle = document.getElementById('upcoming-matches-toggle');
  const panel = document.getElementById('upcoming-matches-panel');
  const body = document.getElementById('upcoming-matches-body');
  if (!toggle || !panel || !body) return;

  let isOpen = false;
  let loaded = false;

  function loadMatches() {
    if (loaded) return;
    body.innerHTML = renderUpcomingMatchesLoadingHtml();
    loadUpcomingMatches()
      .then((matches) => {
        loaded = true;
        body.innerHTML = renderUpcomingMatchesHtml(matches);
      })
      .catch(() => {
        body.innerHTML = '<p class="upcoming-matches-empty">Could not load matches</p>';
      });
  }

  body.addEventListener('click', (e) => {
    const team = e.target.closest('.upcoming-match-team');
    if (!team?.dataset.country) return;
    selectCountry(team.dataset.country);
  });

  function setOpen(open) {
    isOpen = open;
    toggle.setAttribute('aria-expanded', String(open));
    panel.classList.toggle('hidden', !open);
    panel.setAttribute('aria-hidden', String(!open));

    if (open) {
      if (isTouchDevice) {
        rankingPanelClosers.scorers?.();
        rankingPanelClosers.teams?.();
      } else {
        const bothRankingsOpen =
          rankingPanelOpenState.scorers() && rankingPanelOpenState.teams();
        if (bothRankingsOpen) {
          rankingPanelClosers.scorers?.();
          rankingPanelClosers.teams?.();
          upcomingDismissedBothRankings = true;
        } else {
          upcomingDismissedBothRankings = false;
        }
      }
      loadMatches();
    } else if (!isTouchDevice && upcomingDismissedBothRankings) {
      rankingPanelRestorers.scorers?.();
      rankingPanelRestorers.teams?.();
      upcomingDismissedBothRankings = false;
    }
  }

  rankingPanelClosers.upcoming = () => setOpen(false);

  toggle.addEventListener('click', () => setOpen(!isOpen));

  document.addEventListener('click', (e) => {
    if (!isOpen) return;
    if (e.target.closest('.globe-controls')) return;
    setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) setOpen(false);
  });
}

function initHostCitiesToggle() {
  const toggle = document.getElementById('host-cities-toggle');
  if (!toggle) return;

  function updateToggleState(visible) {
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.setAttribute('aria-label', visible ? 'Hide stadiums' : 'Show stadiums');
    toggle.querySelector('.host-cities-toggle-label').textContent = visible
      ? 'Hide Stadiums'
      : 'Show Stadiums';
  }

  toggle.addEventListener('click', () => {
    const nextVisible = !globeApi?.isHostCitiesVisible();
    globeApi?.setHostCitiesVisible(nextVisible);
    updateToggleState(nextVisible);
    if (!nextVisible) dismissStadiumCard();
  });

  document.addEventListener('click', (e) => {
    if (!isTouchDevice) return;

    const marker = e.target.closest('.host-city-marker');
    if (!marker) return;

    const city = getHostCityFromMarker(marker);
    if (!city) return;

    e.stopPropagation();
    dismissCountryHoverCard();
    showStadiumCard({ city, x: 0, y: 0 });
  });

  if (!isTouchDevice) {
    document.addEventListener('mouseover', (e) => {
      const marker = e.target.closest('.host-city-marker');
      if (marker) {
        const city = getHostCityFromMarker(marker);
        if (city) scheduleShowStadiumCard(city, e.clientX, e.clientY);
        return;
      }

      if (e.target.closest('#stadium-card')) {
        pauseGlobeAutoRotate();
        clearTimeout(stadiumLeaveTimeout);
        clearTimeout(stadiumHoverTimeout);
        dismissCountryHoverCard();
        return;
      }

      if (isStadiumCardVisible()) scheduleHideStadiumCard();
    });
  }

  updateToggleState(globeApi?.isHostCitiesVisible() ?? false);
}

function initTipsPanel() {
  const toggle = document.getElementById('tips-toggle');
  const panel = document.getElementById('tips-panel');
  const closeBtn = document.getElementById('tips-panel-close');
  if (!toggle || !panel) return;

  let isOpen = false;

  function setOpen(open) {
    isOpen = open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Hide tips' : 'Show tips');
    panel.classList.toggle('hidden', !open);
    panel.setAttribute('aria-hidden', String(!open));
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!isOpen);
  });

  closeBtn?.addEventListener('click', () => setOpen(false));

  document.addEventListener('click', (e) => {
    if (!isOpen) return;
    if (e.target.closest('.top-bar-title-wrap')) return;
    setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) setOpen(false);
  });
}

function initCountrySearch() {
  const input = document.getElementById('country-search');
  const results = document.getElementById('country-search-results');
  if (!input || !results) return;

  const countries = getParticipantCountries();
  let activeIndex = -1;

  function hideResults() {
    results.classList.add('hidden');
    results.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
  }

  function showResults(matches) {
    results.innerHTML = '';
    if (!matches.length) {
      hideResults();
      return;
    }

    matches.slice(0, 8).forEach((country, index) => {
      const item = document.createElement('li');
      item.textContent = country;
      item.setAttribute('role', 'option');
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectCountry(country);
        hideResults();
      });
      if (index === activeIndex) item.classList.add('active');
      results.appendChild(item);
    });

    results.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
  }

  function filterCountries(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return countries.filter((country) => country.toLowerCase().includes(q));
  }

  function submitSearch() {
    const match = findCountryTitle(input.value);
    if (match) {
      selectCountry(match);
      hideResults();
    }
  }

  input.addEventListener('input', () => {
    activeIndex = -1;
    showResults(filterCountries(input.value));
  });

  input.addEventListener('keydown', (e) => {
    const items = results.querySelectorAll('li');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.classList.contains('hidden')) {
        showResults(filterCountries(input.value));
        return;
      }
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      items.forEach((item, i) => item.classList.toggle('active', i === activeIndex));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      items.forEach((item, i) => item.classList.toggle('active', i === activeIndex));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && items[activeIndex]) {
        selectCountry(items[activeIndex].textContent);
      } else {
        submitSearch();
      }
      return;
    }

    if (e.key === 'Escape') {
      hideResults();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(hideResults, 150);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.country-search-wrap')) hideResults();
  });
}

function handleMobileCountrySelect(country) {
  hideStadiumCard();
  showHoverCard({
    labelIdentifier: country.labelIdentifier,
    countryName: country.name,
    x: 0,
    y: 0,
  });
}

function flyToCountrySilently(countryName) {
  const displayName = getCountryDisplayName(countryName);
  if (!displayName) return;
  globeApi?.flyToCountry(displayName, FLY_TRANSITION_MS, { silent: true });
}

async function openDesktopHighlights(labelIdentifier, countryName) {
  await fadePlayerCurtainIn();
  const started = await playHighlights(labelIdentifier, countryName);
  if (!started) await fadePlayerCurtainOut();
}

function initGlobeInteractions() {
  const container = document.getElementById('globe-container');

  globeApi = createGlobe(container, {
    onReady: hideLoading,
    onError: hideLoading,
    onCountryHover: (country) => {
      if (isTouchDevice) return;
      if (isPointerOverTopBarChrome()) return;
      scheduleHoverCard({
        labelIdentifier: country.labelIdentifier,
        countryName: country.name,
      });
    },
    onCountryLeave: () => {
      if (isTouchDevice) return;
      scheduleHideHoverCard();
    },
    onCountryClick: (country) => {
      flyToCountrySilently(country.name);

      if (isTouchDevice) {
        handleMobileCountrySelect(country);
        return;
      }

      if (!country.labelIdentifier) return;

      dismissCountryHoverCard();
      openDesktopHighlights(country.labelIdentifier, country.name);
    },
  });

  if (!isTouchDevice) {
    document.addEventListener('mousemove', trackPointer, { passive: true });

    document.addEventListener('mouseover', (e) => {
      if (e.target.closest('#hover-card')) {
        cancelSelectedCountryAutoDismiss();
        setGlobeRotationPausedFor('stats', true);
        clearTimeout(leaveTimeout);
        clearTimeout(hoverTimeout);
      }
    });
  } else {
    container?.addEventListener(
      'touchend',
      (e) => {
        if (e.target.closest('.host-city-marker')) return;
        if (e.target.closest('#stadium-card')) return;
        if (e.target.closest('#hover-card')) return;
        if (e.target.closest('.globe-controls')) return;
        if (isStadiumCardVisible()) dismissStadiumCard();
      },
      { passive: true }
    );
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dismissStadiumCard();
      dismissCountryHoverCard();
      globeApi?.clearFocus();
    }
  });
}

function waitForSdk() {
  return new Promise((resolve) => {
    document.addEventListener('onBlazeSDKConnect', () => resolve(), { once: true });
  });
}

async function boot() {
  initStarfield();
  initPlanets();
  initBlaze({
    onMobileClose: () => globeApi?.clearFocus(),
    onDismissStadiumCard: () => dismissStadiumCard(),
    onPlayerDidAppear: () => {
      setGlobeRotationPausedFor('player', true);
      const controls = globeApi?.globe?.controls?.();
      if (controls) controls.enabled = false;
    },
    onPlayerDismissed: () => {
      setGlobeRotationPausedFor('player', false);
      const controls = globeApi?.globe?.controls?.();
      if (controls) controls.enabled = true;
      if (!isTouchDevice) fadePlayerCurtainOut();
    },
    onStatsCountrySelect: selectCountry,
  });
  initStadiumCard();
  initMatchStats();
  initGlobeInteractions();
  initLiveHype((hypeMap) => {
    globeApi?.setLiveHype(hypeMap);
    notifyLiveMatchLabelsReady();
  });
  initTeamPoints((pointsMap) => {
    globeApi?.setTeamPoints(pointsMap);
  });
  initTopScorersPanel();
  initTopTeamsPanel();
  initUpcomingMatchesPanel();
  initHostCitiesToggle();
  initTipsPanel();
  initCountrySearch();
  await waitForSdk();
}

initAccessGate(() => boot());
