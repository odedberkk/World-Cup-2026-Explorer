import { getCountryDisplayName, getCountryLabelIdentifier } from './countryMap.js';
import { getCountryFlagUrl } from './countryFlags.js';
import {
  getCountryStats,
  getLiveMatchups,
  isCountryInLiveGame,
  renderStatsHtml,
  renderStatsLoadingHtml,
} from './matchStats.js';
import { BLAZE_API_KEY } from './blaze.config.js';

const LIVE_STORY_PROBE_CONTAINER_ID = 'blaze-live-story-probe';
const LIVE_STORY_PROBE_TTL_MS = 45_000;
const LIVE_STORY_PROBE_TIMEOUT_MS = 8_000;

let sdkReady = false;
let activeCountry = null;
let activeLabelIdentifier = null;
let activePlaybackMode = 'moment';
let onMobileCardClose = null;
let onDismissStadiumCard = null;
let onPlayerDismissedCallback = null;
let onPlayerDidAppearCallback = null;
let onStatsCountrySelect = null;
let playerOpen = false;

let liveStoryProbeWidget = null;
let liveStoryProbeSeq = 0;
let liveStoryProbePending = null;
const liveStoryProbeCache = new Map();
const liveStoryProbeFlights = new Map();
let liveMatchLabelsReady = false;
let liveStoryPrefetchInFlight = null;
let sdkConnectHandled = false;
let overlayReleaseTimers = [];

const MOBILE_SHEET_ELEVATED_CLASS = 'mobile-sheet-elevated';
const SDK_OVERLAY_RELEASE_FOLLOWUP_MS = [16, 50, 100, 200, 400];

const SDK_MODAL_SELECTORS = [
  'blaze-widget-moment-modal',
  'blaze-widget-story-modal',
  'blaze-video-modal',
  'blaze-modal',
  'blaze-widget-modal',
];
const hoverCardEl = () => document.getElementById('hover-card');
const hoverCardHeaderEl = () => document.getElementById('hover-card-header');
const hoverCardBodyEl = () => document.getElementById('hover-card-body');
const hoverCardActionsEl = () => document.getElementById('hover-card-actions');
const mobileBackdropEl = () => document.getElementById('mobile-backdrop');
const watchHighlightsBtnEl = () => document.getElementById('watch-highlights-btn');

const WATCH_HIGHLIGHTS_LABEL = 'Watch Highlights ➔';
const WATCH_LIVE_STORY_LABEL = 'WATCH LIVE STORY';

export function isCoarsePointerDevice() {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

function buildMatchupLabelExpression(label1, label2) {
  const id1 = label1 ? String(label1) : 'placeholder';
  const id2 = label2 ? String(label2) : 'placeholder';

  if (id1 !== id2) {
    return BlazeSDK.LabelBuilder().atLeastOneOf(id1, id2);
  }

  const single = id1 || id2;
  return single ? BlazeSDK.LabelBuilder().singleLabel(single) : null;
}

function buildMatchupDataSource(label1, label2, { liveFirst = false } = {}) {
  const labels = buildMatchupLabelExpression(label1, label2);
  if (!labels) return null;

  const params = {
    labels,
    orderType: 'RecentlyUpdatedFirst',
    maxItems: 5,
  };

  if (liveFirst) params.advancedOrdering = 'LiveFirst';

  return BlazeSDK.DataSourceBuilder().labels(params);
}

function buildCountryDataSource(labelIdentifier, { liveFirst = false } = {}) {
  if (!labelIdentifier) return null;

  const params = {
    labels: BlazeSDK.LabelBuilder().singleLabel(String(labelIdentifier)),
    orderType: 'RecentlyUpdatedFirst',
    maxItems: 5,
  };

  if (liveFirst) params.advancedOrdering = 'LiveFirst';

  return BlazeSDK.DataSourceBuilder().labels(params);
}

function getLiveMatchupProbeTargets() {
  return getLiveMatchups()
    .map(({ team1, team2 }) => {
      const label1 = getCountryLabelIdentifier(team1);
      const label2 = getCountryLabelIdentifier(team2);
      if (!label1 && !label2) return null;

      const matchupKey = [label1, label2].filter(Boolean).sort().join('|');
      return { matchupKey, label1, label2, team1, team2 };
    })
    .filter(Boolean);
}

function findMatchupForLabel(labelIdentifier) {
  if (!labelIdentifier) return null;
  return getLiveMatchupProbeTargets().find(
    (matchup) => matchup.label1 === labelIdentifier || matchup.label2 === labelIdentifier
  );
}

function getMatchupCacheKey(labelIdentifier) {
  return findMatchupForLabel(labelIdentifier)?.matchupKey ?? labelIdentifier;
}

function getCachedLiveStoryProbeByKey(cacheKey) {
  const entry = liveStoryProbeCache.get(cacheKey);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.hasLiveStory;
}

function getCachedLiveStoryProbe(labelIdentifier) {
  return getCachedLiveStoryProbeByKey(getMatchupCacheKey(labelIdentifier));
}

function cacheLiveStoryProbe(cacheKey, hasLiveStory) {
  liveStoryProbeCache.set(cacheKey, {
    hasLiveStory,
    expiresAt: Date.now() + LIVE_STORY_PROBE_TTL_MS,
  });
}

function finishLiveStoryProbe(cacheKey, hasLiveStory) {
  cacheLiveStoryProbe(cacheKey, hasLiveStory);
  return hasLiveStory;
}

function disposeLiveStoryProbeWidget() {
  if (liveStoryProbeWidget?.destroy) {
    liveStoryProbeWidget.destroy();
  }

  liveStoryProbeWidget = null;

  const container = document.getElementById(LIVE_STORY_PROBE_CONTAINER_ID);
  if (container) container.replaceChildren();
}

function runLiveStoryProbe(matchup) {
  const { matchupKey, label1, label2 } = matchup;

  const cached = getCachedLiveStoryProbeByKey(matchupKey);
  if (cached !== null) return Promise.resolve(cached);

  const existing = liveStoryProbeFlights.get(matchupKey);
  if (existing) return existing;

  let settleProbe;
  const flight = new Promise((resolve) => {
    settleProbe = resolve;
  }).finally(() => {
    liveStoryProbeFlights.delete(matchupKey);
  });

  liveStoryProbeFlights.set(matchupKey, flight);

  disposeLiveStoryProbeWidget();

  const seq = ++liveStoryProbeSeq;
  const timeoutId = setTimeout(() => {
    if (!liveStoryProbePending || liveStoryProbePending.seq !== seq) return;

    liveStoryProbePending = null;
    disposeLiveStoryProbeWidget();
    settleProbe(finishLiveStoryProbe(matchupKey, false));
  }, LIVE_STORY_PROBE_TIMEOUT_MS);

  liveStoryProbePending = { matchupKey, resolve: settleProbe, seq, timeoutId };

  if (!document.getElementById(LIVE_STORY_PROBE_CONTAINER_ID)) {
    clearTimeout(timeoutId);
    liveStoryProbePending = null;
    settleProbe(false);
    return flight;
  }

  const dataSource = buildMatchupDataSource(label1, label2, { liveFirst: true });
  if (!dataSource) {
    clearTimeout(timeoutId);
    liveStoryProbePending = null;
    settleProbe(false);
    return flight;
  }

  liveStoryProbeWidget = BlazeSDK.WidgetCustomView(LIVE_STORY_PROBE_CONTAINER_ID, {
    contentType: 'story',
    dataSource,
    customRenderer: {
      render(contents) {
        if (!liveStoryProbePending || liveStoryProbePending.seq !== seq) return;
        if (liveStoryProbePending.matchupKey !== matchupKey) return;

        const pending = liveStoryProbePending;
        liveStoryProbePending = null;
        clearTimeout(pending.timeoutId);
        disposeLiveStoryProbeWidget();
        pending.resolve(finishLiveStoryProbe(matchupKey, contentsHaveLiveStory(contents)));
      },
    },
  });

  return flight;
}

function contentsHaveLiveStory(contents) {
  return Array.isArray(contents) && contents.some((item) => item.isLive === true);
}

function probeLiveStory(labelIdentifier) {
  if (!sdkReady || !labelIdentifier) return Promise.resolve(false);

  const matchup = findMatchupForLabel(labelIdentifier);
  if (!matchup) return Promise.resolve(false);

  return runLiveStoryProbe(matchup);
}

function refreshActivePlaybackButton() {
  if (!activeCountry || !activeLabelIdentifier) return;
  if (!isCountryInLiveGame(activeCountry)) return;
  updateWatchHighlightsButton(activeCountry, activeLabelIdentifier);
}

function prefetchLiveStoryProbes() {
  if (!sdkReady || typeof BlazeSDK === 'undefined') return Promise.resolve();

  const matchups = getLiveMatchupProbeTargets();
  if (!matchups.length) return Promise.resolve();

  return matchups
    .reduce((chain, matchup) => {
      return chain.then(() => {
        if (getCachedLiveStoryProbeByKey(matchup.matchupKey) !== null) return;
        return runLiveStoryProbe(matchup);
      });
    }, Promise.resolve())
    .then(refreshActivePlaybackButton);
}

function waitForSdkReady(timeoutMs = 15000) {
  if (sdkReady) return Promise.resolve(true);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);

    document.addEventListener(
      'onBlazeSDKConnect',
      () => {
        clearTimeout(timeout);
        resolve(true);
      },
      { once: true }
    );
  });
}

async function tryPrefetchLiveStoryProbes() {
  if (!liveMatchLabelsReady) return;

  if (liveStoryPrefetchInFlight) return liveStoryPrefetchInFlight;

  const prefetch = (async () => {
    if (!sdkReady) {
      await waitForSdkReady();
    }

    if (!sdkReady) return;

    await prefetchLiveStoryProbes();
  })().finally(() => {
    if (liveStoryPrefetchInFlight === prefetch) {
      liveStoryPrefetchInFlight = null;
    }
  });

  liveStoryPrefetchInFlight = prefetch;
  return prefetch;
}

export function notifyLiveMatchLabelsReady() {
  liveMatchLabelsReady = true;
  void tryPrefetchLiveStoryProbes();
}

function handleSdkConnect() {
  if (sdkConnectHandled) return;
  sdkConnectHandled = true;

  sdkReady = true;
  setupSdkPlayerDelegates();
  void tryPrefetchLiveStoryProbes().then(() => {
    if (activeCountry && activeLabelIdentifier) {
      updateWatchHighlightsButton(activeCountry, activeLabelIdentifier);
    }
  });
}

async function resolvePlaybackMode(labelIdentifier, countryTitle) {
  if (!labelIdentifier || !countryTitle || !isCountryInLiveGame(countryTitle)) {
    return 'moment';
  }

  const cached = getCachedLiveStoryProbe(labelIdentifier);
  if (cached !== null) return cached ? 'live-story' : 'moment';

  const matchup = findMatchupForLabel(labelIdentifier);
  if (matchup) {
    const inFlight = liveStoryProbeFlights.get(matchup.matchupKey);
    if (inFlight) {
      const hasLiveStory = await inFlight;
      return hasLiveStory ? 'live-story' : 'moment';
    }
  }

  const hasLiveStory = await probeLiveStory(labelIdentifier);
  return hasLiveStory ? 'live-story' : 'moment';
}

function positionHoverCard(x, y) {
  const card = hoverCardEl();
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

function setMobileBackdropVisible(visible) {
  const backdrop = mobileBackdropEl();
  if (!backdrop) return;
  backdrop.classList.toggle('hidden', !visible);
  backdrop.classList.toggle('visible', visible);
  backdrop.setAttribute('aria-hidden', String(!visible));
}

function setMobileActionsVisible(visible) {
  const actions = hoverCardActionsEl();
  if (!actions) return;
  actions.classList.toggle('hidden', !visible);
}

function setWatchHighlightsButtonState({ label, live = false } = {}) {
  const btn = watchHighlightsBtnEl();
  if (!btn || !isCoarsePointerDevice()) return;

  const labelEl = btn.querySelector('.watch-highlights-btn-label');
  const liveEl = btn.querySelector('.watch-highlights-btn-live');

  if (labelEl) labelEl.textContent = label;
  if (liveEl) liveEl.classList.toggle('hidden', !live);
}

async function updateWatchHighlightsButton(countryTitle, labelIdentifier = activeLabelIdentifier) {
  if (!isCoarsePointerDevice()) return;

  if (!countryTitle || !labelIdentifier) {
    activePlaybackMode = 'moment';
    setWatchHighlightsButtonState({ label: WATCH_HIGHLIGHTS_LABEL, live: false });
    return;
  }

  if (!isCountryInLiveGame(countryTitle)) {
    activePlaybackMode = 'moment';
    setWatchHighlightsButtonState({ label: WATCH_HIGHLIGHTS_LABEL, live: false });
    return;
  }

  const cached = getCachedLiveStoryProbe(labelIdentifier);
  if (cached !== null) {
    activePlaybackMode = cached ? 'live-story' : 'moment';
    setWatchHighlightsButtonState({
      label: cached ? WATCH_LIVE_STORY_LABEL : WATCH_HIGHLIGHTS_LABEL,
      live: cached,
    });
    return;
  }

  activePlaybackMode = 'moment';
  setWatchHighlightsButtonState({ label: WATCH_HIGHLIGHTS_LABEL, live: false });

  const playbackMode = await resolvePlaybackMode(labelIdentifier, countryTitle);
  if (activeCountry !== getCountryDisplayName(countryTitle) || activeLabelIdentifier !== labelIdentifier) {
    return;
  }

  activePlaybackMode = playbackMode;
  const isLiveStory = playbackMode === 'live-story';
  setWatchHighlightsButtonState({
    label: isLiveStory ? WATCH_LIVE_STORY_LABEL : WATCH_HIGHLIGHTS_LABEL,
    live: isLiveStory,
  });
}

function renderHeader(displayName) {
  const header = hoverCardHeaderEl();
  if (!header) return;

  const flagUrl = getCountryFlagUrl(displayName);
  const badgeHtml = flagUrl
    ? `<img class="country-flag" src="${flagUrl}" alt="" width="28" height="28" loading="lazy" decoding="async" />`
    : `<span class="country-flag-fallback" aria-hidden="true">⚽</span>`;

  header.innerHTML = `
    <span class="country-badge">${badgeHtml}</span>
    <span class="country-name">${displayName}</span>
  `;
}

function renderBody(html) {
  const body = hoverCardBodyEl();
  if (!body) return;
  body.innerHTML = html;
}

export function isCardVisible() {
  const card = hoverCardEl();
  return card && card.classList.contains('visible');
}

function closeMobileCard() {
  hideHoverCard();
  if (document.getElementById('stadium-card')?.classList.contains('visible')) {
    onDismissStadiumCard?.();
  }
  onMobileCardClose?.();
}

function isMobileSheetOpen() {
  const hoverOpen = isCardVisible();
  const stadiumOpen = document.getElementById('stadium-card')?.classList.contains('visible');
  return hoverOpen || stadiumOpen;
}

function restoreMobileBackdrop() {
  if (!isCoarsePointerDevice()) return;
  if (isMobileSheetOpen()) setMobileBackdropVisible(true);
}

function elevateMobileSheetsIfOpen() {
  if (!isCoarsePointerDevice()) return;

  if (isCardVisible()) hoverCardEl()?.classList.add(MOBILE_SHEET_ELEVATED_CLASS);
  if (isMobileSheetOpen()) mobileBackdropEl()?.classList.add(MOBILE_SHEET_ELEVATED_CLASS);
}

function clearMobileSheetElevation() {
  hoverCardEl()?.classList.remove(MOBILE_SHEET_ELEVATED_CLASS);
  mobileBackdropEl()?.classList.remove(MOBILE_SHEET_ELEVATED_CLASS);
  document.getElementById('stadium-card')?.classList.remove(MOBILE_SHEET_ELEVATED_CLASS);
}

function neutralizeBlazeShadowRoot(root) {
  if (!root) return;

  root.querySelectorAll('*').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.style.pointerEvents = 'none';
  });
}

function restoreBlazeSdkModalLayers(root) {
  if (!root) return;

  SDK_MODAL_SELECTORS.forEach((selector) => {
    root.querySelectorAll(selector).forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      node.style.removeProperty('pointer-events');
      node.style.removeProperty('visibility');
      node.style.removeProperty('display');
    });
  });
}

function releaseSdkPlayerOverlay() {
  document.body.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('overflow');
  document.body.style.removeProperty('position');

  document.querySelectorAll('blaze-sdk').forEach((host) => {
    host.style.pointerEvents = 'none';
    host.style.setProperty('touch-action', 'auto', 'important');

    const root = host.shadowRoot;
    if (!root) return;

    neutralizeBlazeShadowRoot(root);

    SDK_MODAL_SELECTORS.forEach((selector) => {
      root.querySelectorAll(selector).forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        node.style.pointerEvents = 'none';
        node.style.visibility = 'hidden';
        node.style.display = 'none';
      });
    });
  });

  elevateMobileSheetsIfOpen();
}

function activateBlazeSdkForPlayer() {
  document.querySelectorAll('blaze-sdk').forEach((host) => {
    host.style.removeProperty('pointer-events');
    host.style.removeProperty('touch-action');

    const root = host.shadowRoot;
    if (!root) return;

    restoreBlazeSdkModalLayers(root);
  });
}

function cancelOverlayReleaseTimers() {
  overlayReleaseTimers.forEach(clearTimeout);
  overlayReleaseTimers = [];
}

function scheduleSdkOverlayReleaseFollowUp() {
  cancelOverlayReleaseTimers();

  SDK_OVERLAY_RELEASE_FOLLOWUP_MS.forEach((delay) => {
    overlayReleaseTimers.push(
      setTimeout(() => {
        if (playerOpen) return;
        releaseSdkPlayerOverlay();
        restoreMobileBackdrop();
      }, delay)
    );
  });
}

function handlePlayerDidAppear() {
  playerOpen = true;
  cancelOverlayReleaseTimers();
  clearMobileSheetElevation();
  activateBlazeSdkForPlayer();
  onPlayerDidAppearCallback?.();

  if (isCoarsePointerDevice() && !isMobileSheetOpen()) {
    setMobileBackdropVisible(false);
  }
}

function handlePlayerDismissed() {
  playerOpen = false;
  onPlayerDismissedCallback?.();
  releaseSdkPlayerOverlay();
  restoreMobileBackdrop();
  scheduleSdkOverlayReleaseFollowUp();
}

function setupSdkPlayerDelegates() {
  BlazeSDK.addDelegateListener(BlazeSDK.Delegations.onPlayerDidAppear, handlePlayerDidAppear);
  BlazeSDK.addDelegateListener(BlazeSDK.Delegations.onPlayerDismissed, handlePlayerDismissed);

  const storyDismissed = BlazeSDK.Delegations.onStoryPlayerDismissed;
  if (storyDismissed) {
    BlazeSDK.addDelegateListener(storyDismissed, handlePlayerDismissed);
  }

  const widgetDismissed = BlazeSDK.Delegations.onWidgetPlayerDismissed;
  if (widgetDismissed) {
    BlazeSDK.addDelegateListener(widgetDismissed, handlePlayerDismissed);
  }
}

async function populateStats(displayName, x, y, { keepPosition = false } = {}) {
  try {
    const stats = await getCountryStats(displayName);
    if (activeCountry !== displayName) return;

    renderBody(renderStatsHtml(stats));
    updateWatchHighlightsButton(displayName, activeLabelIdentifier);
    if (!keepPosition || isCoarsePointerDevice()) {
      positionHoverCard(x, y);
    }
  } catch {
    if (activeCountry !== displayName) return;
    renderBody('<div class="hover-card-stats hover-card-stats--empty">Could not load stats</div>');
    if (!keepPosition || isCoarsePointerDevice()) {
      positionHoverCard(x, y);
    }
  }
}

export function initBlaze({
  onMobileClose,
  onDismissStadiumCard: dismissStadium,
  onPlayerDismissed,
  onPlayerDidAppear,
  onStatsCountrySelect: onCountrySelect,
} = {}) {
  onMobileCardClose = onMobileClose ?? null;
  onDismissStadiumCard = dismissStadium ?? null;
  onPlayerDismissedCallback = onPlayerDismissed ?? null;
  onPlayerDidAppearCallback = onPlayerDidAppear ?? null;
  onStatsCountrySelect = onCountrySelect ?? null;

  document.addEventListener('onBlazeSDKConnect', handleSdkConnect, { once: true });

  if (typeof BlazeSDK !== 'undefined' && BlazeSDK.isInitialized?.()) {
    handleSdkConnect();
  } else if (!BlazeSDK.isInitialized()) {
    BlazeSDK.Initialize(BLAZE_API_KEY, {
      runInShadowDom: true,
      shouldModifyUrlWithContentId: false,
    });
  }

  document.getElementById('hover-card-close')?.addEventListener('click', closeMobileCard);
  mobileBackdropEl()?.addEventListener('click', closeMobileCard);

  const dismissMobileCard = (e) => {
    if (playerOpen) return;
    e.preventDefault();
    closeMobileCard();
  };

  document.getElementById('hover-card-close')?.addEventListener('touchend', dismissMobileCard, {
    passive: false,
  });
  mobileBackdropEl()?.addEventListener('touchend', dismissMobileCard, { passive: false });

  document.getElementById('watch-highlights-btn')?.addEventListener('click', () => {
    if (activeLabelIdentifier) playHighlights(activeLabelIdentifier, activeCountry);
  });

  hoverCardBodyEl()?.addEventListener('click', (e) => {
    const link = e.target.closest('.stats-country-link');
    if (!link?.dataset.country) return;
    onStatsCountrySelect?.(link.dataset.country);
  });
}

export function isSdkReady() {
  return sdkReady;
}

export function hideHoverCard() {
  const card = hoverCardEl();
  if (!card) return;

  activeCountry = null;
  activeLabelIdentifier = null;
  activePlaybackMode = 'moment';
  card.classList.add('hidden');
  card.classList.remove('visible', 'hover-card--mobile', MOBILE_SHEET_ELEVATED_CLASS);
  card.setAttribute('aria-hidden', 'true');
  setMobileBackdropVisible(false);
  clearMobileSheetElevation();
  setMobileActionsVisible(false);
  setWatchHighlightsButtonState({ label: WATCH_HIGHLIGHTS_LABEL, live: false });
  renderBody('');
}

export function updateHoverCardPosition(x, y) {
  if (!isCardVisible() || !activeCountry) return;
  positionHoverCard(x, y);
}

export function showHoverCard({
  labelIdentifier = null,
  countryName,
  x,
  y,
  keepPosition = false,
}) {
  if (!countryName) return;

  const card = hoverCardEl();
  if (!card) return;

  const displayName = getCountryDisplayName(countryName);
  const sameCountry = activeCountry === displayName && isCardVisible();
  const isMobile = isCoarsePointerDevice();
  const anchorCard = isMobile || (!keepPosition && !sameCountry);

  activeCountry = displayName;
  activeLabelIdentifier = labelIdentifier;
  activePlaybackMode = 'moment';
  renderHeader(displayName);

  if (!sameCountry) {
    renderBody(renderStatsLoadingHtml());
  }

  if (anchorCard) {
    positionHoverCard(x, y);
  }

  card.classList.toggle('hover-card--mobile', isMobile);
  setMobileActionsVisible(isMobile && Boolean(labelIdentifier));
  updateWatchHighlightsButton(displayName, labelIdentifier);
  setMobileBackdropVisible(isMobile);
  if (isMobile) elevateMobileSheetsIfOpen();

  card.classList.remove('hidden');
  card.classList.add('visible');
  card.setAttribute('aria-hidden', 'false');

  populateStats(displayName, x, y, { keepPosition: !anchorCard });
}

export async function playHighlights(labelIdentifier, countryName) {
  if (!sdkReady || !labelIdentifier) return false;

  const displayName = countryName
    ? getCountryDisplayName(countryName)
    : activeCountry;

  let contentType = 'moment';
  if (displayName && isCountryInLiveGame(displayName)) {
    const playbackMode = await resolvePlaybackMode(labelIdentifier, displayName);
    contentType = playbackMode === 'live-story' ? 'story' : 'moment';
  }

  BlazeSDK.playContent(contentType, {
    dataSource: (() => {
      const liveFirst = contentType === 'story';
      const matchup = liveFirst ? findMatchupForLabel(labelIdentifier) : null;
      if (matchup) {
        return buildMatchupDataSource(matchup.label1, matchup.label2, { liveFirst: true });
      }
      return buildCountryDataSource(labelIdentifier, { liveFirst });
    })(),
  });

  return true;
}

export function getActiveCountry() {
  return activeCountry;
}
