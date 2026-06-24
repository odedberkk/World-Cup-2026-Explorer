import {
  getCountryDisplayName,
  getCountryLabelIdentifier,
  isParticipantCountry,
} from './countryMap.js';
import { HOST_CITIES } from './hostCities.js';
import { getLiveHostCities } from './matchStats.js';
import { createDayNightMaterial } from './dayNight.js';

const GEOJSON_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

const PARTICIPANT_COLOR = 'rgba(245, 185, 66, 0.85)';
const PARTICIPANT_STROKE = 'rgba(255, 214, 102, 0.9)';
const NON_PARTICIPANT_COLOR = 'rgba(0, 0, 0, 0)';
const NON_PARTICIPANT_STROKE = 'rgba(0, 0, 0, 0)';
const HOVER_COLOR = 'rgba(255, 214, 102, 1)';
const FOCUSED_COLOR = 'rgba(255, 232, 150, 1)';
const BASE_ALTITUDE = 0.006;
const HOVER_ALTITUDE = 0.02;
const FOCUSED_ALTITUDE = 0.068;
const POINTS_ALTITUDE_MAX = 0.058;
const TOP_STANDING_ALT = BASE_ALTITUDE + POINTS_ALTITUDE_MAX;
const LIVE_BREATH_FLOOR_ALT = BASE_ALTITUDE;
const LIVE_BREATH_PEAK_ALT = TOP_STANDING_ALT + 0.004;
const SCORED_BREATH_PEAK_ALT = TOP_STANDING_ALT + 0.006;

const POINTS_HEAT = {
  low: [255, 230, 70, 0.82],
  mid: [200, 255, 90, 0.88],
  high: [40, 220, 110, 0.95],
};

const LIVE_HYPE_COLORS = {
  live: {
    base: [72, 160, 255],
    pulse: [140, 210, 255],
    stroke: [100, 190, 255],
  },
  scored: {
    base: [40, 130, 255],
    pulse: [180, 230, 255],
    stroke: [120, 200, 255],
  },
};

function mixChannel(from, to, t) {
  return Math.round(from + (to - from) * t);
}

function liveHypeRgba(rgb, alpha) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function heatRgba(stops) {
  return `rgba(${stops[0]}, ${stops[1]}, ${stops[2]}, ${stops[3]})`;
}

function lerpHeatStop(t) {
  const clamped = Math.min(Math.max(t, 0), 1);

  if (clamped <= 0.5) {
    const u = clamped * 2;
    return [
      mixChannel(POINTS_HEAT.low[0], POINTS_HEAT.mid[0], u),
      mixChannel(POINTS_HEAT.low[1], POINTS_HEAT.mid[1], u),
      mixChannel(POINTS_HEAT.low[2], POINTS_HEAT.mid[2], u),
      POINTS_HEAT.low[3] + (POINTS_HEAT.mid[3] - POINTS_HEAT.low[3]) * u,
    ];
  }

  const u = (clamped - 0.5) * 2;
  return [
    mixChannel(POINTS_HEAT.mid[0], POINTS_HEAT.high[0], u),
    mixChannel(POINTS_HEAT.mid[1], POINTS_HEAT.high[1], u),
    mixChannel(POINTS_HEAT.mid[2], POINTS_HEAT.high[2], u),
    POINTS_HEAT.mid[3] + (POINTS_HEAT.high[3] - POINTS_HEAT.mid[3]) * u,
  ];
}

function getLiveHypeVisual(hypeType, phase) {
  const palette = LIVE_HYPE_COLORS[hypeType];
  const speed = hypeType === 'scored' ? 3.4 : 2.0;
  const t = (Math.sin(phase * speed) + 1) / 2;
  const rgb = [
    mixChannel(palette.base[0], palette.pulse[0], t),
    mixChannel(palette.base[1], palette.pulse[1], t),
    mixChannel(palette.base[2], palette.pulse[2], t),
  ];
  const strokeRgb = [
    mixChannel(palette.stroke[0], palette.pulse[0], t),
    mixChannel(palette.stroke[1], palette.pulse[1], t),
    mixChannel(palette.stroke[2], palette.pulse[2], t),
  ];

  return {
    cap: liveHypeRgba(rgb, 0.82 + t * 0.18),
    stroke: liveHypeRgba(strokeRgb, 0.75 + t * 0.25),
    breathT: t,
    sideAlpha: 0.55 + t * 0.25,
  };
}

function getFeatureName(feature) {
  const props = feature?.properties || {};
  return props.ADMIN || props.NAME || props.name || '';
}

function isParticipantFeature(feature) {
  return isParticipantCountry(getFeatureName(feature));
}

function getPolygonColor(feature) {
  return isParticipantFeature(feature) ? PARTICIPANT_COLOR : NON_PARTICIPANT_COLOR;
}

function getPolygonStroke(feature) {
  return isParticipantFeature(feature) ? PARTICIPANT_STROKE : NON_PARTICIPANT_STROKE;
}

function getFeatureCenter(feature) {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  function walkCoords(coords) {
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords;
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      return;
    }
    coords.forEach(walkCoords);
  }

  walkCoords(feature.geometry.coordinates);
  return {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
  };
}

function pointInRing(lat, lng, ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPolygonRings(rings, lat, lng) {
  if (!pointInRing(lat, lng, rings[0])) return false;

  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(lat, lng, rings[i])) return false;
  }

  return true;
}

function pointInFeature(lat, lng, feature) {
  const geometry = feature?.geometry;
  if (!geometry) return false;

  if (geometry.type === 'Polygon') {
    return pointInPolygonRings(geometry.coordinates, lat, lng);
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => pointInPolygonRings(polygon, lat, lng));
  }

  return false;
}

function emitCountryClick(feature, event, callbacks) {
  const name = getFeatureName(feature);
  if (!isParticipantCountry(name)) return;

  callbacks.onCountryClick?.({
    name,
    labelIdentifier: getCountryLabelIdentifier(name),
    feature,
    event,
  });
}

function initMobileTouchSelect(globe, container, getCountries, callbacks) {
  const TAP_MOVE_PX = 14;
  let touchStart = null;

  container.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length !== 1) {
        touchStart = null;
        return;
      }

      touchStart = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
    },
    { passive: true }
  );

  container.addEventListener(
    'touchend',
    (event) => {
      if (!touchStart || event.changedTouches.length !== 1) {
        touchStart = null;
        return;
      }

      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;
      touchStart = null;

      if (Math.hypot(dx, dy) > TAP_MOVE_PX) return;
      if (event.target.closest('.host-city-marker')) return;

      const coords = globe.toGlobeCoords(touch.clientX, touch.clientY);
      if (!coords) return;

      const countries = getCountries();
      const feature = countries.find(
        (country) => isParticipantFeature(country) && pointInFeature(coords.lat, coords.lng, country)
      );

      if (!feature) return;

      event.preventDefault();
      emitCountryClick(feature, event, callbacks);
    },
    { passive: false }
  );
}

function initHostCityLayer(globe) {
  globe
    .ringsData([])
    .ringLat('lat')
    .ringLng('lng')
    .ringColor('color')
    .ringMaxRadius(2.8)
    .ringPropagationSpeed(2.5)
    .ringRepeatPeriod(1400)
    .ringAltitude(0.012)
    .pointsData([])
    .pointLat('lat')
    .pointLng('lng')
    .pointColor('color')
    .pointAltitude(0.014)
    .pointRadius(0.35)
    .htmlElementsData([])
    .htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude(0.018)
    .htmlElement((city) => {
      const el = document.createElement('div');
      el.className = `host-city-marker${city.isLive ? ' host-city-marker--live' : ''}`;
      el.dataset.country = city.country;
      el.dataset.city = city.city;
      el.innerHTML = `
        <span class="host-city-glow" aria-hidden="true"></span>
        <span class="host-city-icon" aria-hidden="true">⚽</span>
        <div class="host-city-tooltip" role="tooltip">
          <span class="host-city-stadium">${city.stadium}</span>
          <span class="host-city-name">${city.city}</span>
        </div>
      `;
      return el;
    });
}

function setHostCityLayerData(globe, cities) {
  const liveCities = cities.filter((city) => city.isLive);

  globe
    .ringsData(liveCities)
    .pointsData(liveCities)
    .htmlElementsData(cities);
}

function buildHostCityLayerData() {
  const liveCities = getLiveHostCities();

  return HOST_CITIES.map((city) => ({
    ...city,
    isLive: liveCities.has(city.city),
  }));
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 768px), (hover: none) and (pointer: coarse)').matches;
}

export function createGlobe(container, callbacks) {
  const globe = Globe()(container)
    .backgroundImageUrl('https://cdn.jsdelivr.net/npm/three-globe/example/img/night-sky.png')
    .showAtmosphere(true)
    .atmosphereColor('rgba(100, 160, 255, 0.18)')
    .atmosphereAltitude(0.18)
    .polygonCapColor(getPolygonColor)
    .polygonSideColor((f) =>
      isParticipantFeature(f) ? 'rgba(0, 0, 0, 0.15)' : NON_PARTICIPANT_COLOR
    )
    .polygonStrokeColor(getPolygonStroke)
    .polygonAltitude(BASE_ALTITUDE)
    .polygonsTransitionDuration(200);

  let dayNightApi = null;

  function syncGlobeRotation(lng, lat) {
    if (lng == null || lat == null) {
      const pov = globe.pointOfView();
      lng = pov.lng;
      lat = pov.lat;
    }
    dayNightApi?.setGlobeRotation(lng, lat);
  }

  createDayNightMaterial()
    .then((api) => {
      dayNightApi = api;
      globe.globeMaterial(api.material);
      syncGlobeRotation();
    })
    .catch((err) => {
      console.warn('Day/night globe material failed, using default', err);
      globe
        .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
        .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png');
    });

  globe.onZoom(({ lng, lat }) => syncGlobeRotation(lng, lat));

  initHostCityLayer(globe);

  let countries = [];
  let hostCitiesVisible = true;

  function refreshHostCityLayer() {
    if (!hostCitiesVisible) {
      setHostCityLayerData(globe, []);
      return;
    }

    setHostCityLayerData(globe, buildHostCityLayerData());
  }

  refreshHostCityLayer();
  let hoveredFeature = null;
  let focusedFeature = null;
  let focusedRaised = false;
  let focusTimeout = null;
  let focusLowerTimeout = null;
  const FOCUS_HOLD_MS = 2000;
  let liveHypeMap = new Map();
  let teamPointsMap = new Map();
  let maxTeamPoints = 0;
  let pulsePhase = 0;
  let pulseFrameId = null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function getCountryTitle(feature) {
    return getCountryDisplayName(getFeatureName(feature));
  }

  function getLiveHypeForFeature(feature) {
    return liveHypeMap.get(getCountryTitle(feature)) || null;
  }

  function getPointsRatio(feature) {
    if (!isParticipantFeature(feature) || maxTeamPoints <= 0) return 0;

    const points = teamPointsMap.get(getCountryTitle(feature));
    if (points == null) return 0;

    return Math.min(Math.max(points / maxTeamPoints, 0), 1);
  }

  function getPointsHeatVisual(feature) {
    if (!isParticipantFeature(feature) || maxTeamPoints <= 0) return null;

    const t = getPointsRatio(feature);
    const cap = lerpHeatStop(t);

    return {
      cap: heatRgba(cap),
      stroke: heatRgba([
        mixChannel(255, 120, t),
        mixChannel(240, 255, t),
        mixChannel(100, 170, t),
        0.88 + t * 0.12,
      ]),
      side: heatRgba([
        mixChannel(140, 30, t),
        mixChannel(120, 150, t),
        mixChannel(30, 75, t),
        0.22 + t * 0.45,
      ]),
    };
  }

  function getPointsAltitudeBoost(feature) {
    if (!isParticipantFeature(feature)) return 0;

    const points = teamPointsMap.get(getCountryTitle(feature));
    if (points == null || maxTeamPoints <= 0) return 0;

    return (points / maxTeamPoints) * POINTS_ALTITUDE_MAX;
  }

  function getStandingAltitude(feature) {
    if (!isParticipantFeature(feature)) return 0;
    return BASE_ALTITUDE + getPointsAltitudeBoost(feature);
  }

  function stopPulseLoop() {
    if (pulseFrameId) {
      cancelAnimationFrame(pulseFrameId);
      pulseFrameId = null;
    }
  }

  function startPulseLoop() {
    if (pulseFrameId || reducedMotion) return;

    const tick = () => {
      if (!liveHypeMap.size) {
        pulseFrameId = null;
        return;
      }

      pulsePhase += 0.06;
      applyPolygonStyles();
      pulseFrameId = requestAnimationFrame(tick);
    };

    pulseFrameId = requestAnimationFrame(tick);
  }

  function setLiveHype(hypeMap) {
    liveHypeMap = hypeMap instanceof Map ? hypeMap : new Map();
    if (liveHypeMap.size > 0) startPulseLoop();
    else stopPulseLoop();
    applyPolygonStyles();
    refreshHostCityLayer();
  }

  function setTeamPoints(pointsMap) {
    teamPointsMap = pointsMap instanceof Map ? pointsMap : new Map();
    maxTeamPoints = teamPointsMap.size
      ? Math.max(...teamPointsMap.values(), 1)
      : 0;
    applyPolygonStyles();
  }

  function resize() {
    globe.width(container.clientWidth);
    globe.height(container.clientHeight);
  }

  function applyPolygonStyles() {
    globe.polygonsTransitionDuration(
      isMobileViewport()
        ? 0
        : liveHypeMap.size > 0 && !reducedMotion
          ? 0
          : 200
    );

    globe
      .polygonCapColor((f) => {
        if (focusedFeature && f === focusedFeature) return FOCUSED_COLOR;
        if (hoveredFeature && f === hoveredFeature) return HOVER_COLOR;

        const hypeType = getLiveHypeForFeature(f);
        if (hypeType) {
          const visual = getLiveHypeVisual(hypeType, reducedMotion ? 0 : pulsePhase);
          return visual.cap;
        }

        const heat = getPointsHeatVisual(f);
        if (heat) return heat.cap;

        return getPolygonColor(f);
      })
      .polygonSideColor((f) => {
        if (focusedFeature && f === focusedFeature) {
          return 'rgba(255, 200, 80, 0.65)';
        }

        const hypeType = getLiveHypeForFeature(f);
        if (hypeType) {
          const visual = getLiveHypeVisual(hypeType, reducedMotion ? 0 : pulsePhase);
          return liveHypeRgba(
            hypeType === 'scored' ? [32, 80, 160] : [24, 64, 120],
            visual.sideAlpha
          );
        }

        const heat = getPointsHeatVisual(f);
        if (heat) return heat.side;

        return isParticipantFeature(f) ? 'rgba(0, 0, 0, 0.15)' : NON_PARTICIPANT_COLOR;
      })
      .polygonStrokeColor((f) => {
        if (focusedFeature && f === focusedFeature) return 'rgba(255, 240, 180, 1)';

        const hypeType = getLiveHypeForFeature(f);
        if (hypeType) {
          return getLiveHypeVisual(hypeType, reducedMotion ? 0 : pulsePhase).stroke;
        }

        const heat = getPointsHeatVisual(f);
        if (heat) return heat.stroke;

        return getPolygonStroke(f);
      })
      .polygonAltitude((f) => {
        if (!isParticipantFeature(f)) return 0;

        const standingAlt = getStandingAltitude(f);

        if (focusedFeature && f === focusedFeature) {
          return focusedRaised
            ? Math.max(FOCUSED_ALTITUDE, standingAlt + 0.025)
            : standingAlt;
        }

        const hypeType = getLiveHypeForFeature(f);
        if (hypeType) {
          const visual = getLiveHypeVisual(hypeType, reducedMotion ? 0 : pulsePhase);
          const breathT = reducedMotion ? 0 : visual.breathT;
          const peakAlt =
            hypeType === 'scored' ? SCORED_BREATH_PEAK_ALT : LIVE_BREATH_PEAK_ALT;
          return LIVE_BREATH_FLOOR_ALT + (peakAlt - LIVE_BREATH_FLOOR_ALT) * breathT;
        }

        if (hoveredFeature && f === hoveredFeature) {
          return standingAlt + 0.01;
        }

        return standingAlt;
      });
  }

  function setHoveredFeature(feature) {
    hoveredFeature = feature;
    applyPolygonStyles();
  }

  function clearFocusedFeature() {
    if (focusTimeout) {
      clearTimeout(focusTimeout);
      focusTimeout = null;
    }
    if (focusLowerTimeout) {
      clearTimeout(focusLowerTimeout);
      focusLowerTimeout = null;
    }
    focusedFeature = null;
    focusedRaised = false;
    applyPolygonStyles();
  }

  function lowerFocusedCountry() {
    focusedRaised = false;
    globe.polygonsTransitionDuration(550);
    applyPolygonStyles();

    focusLowerTimeout = setTimeout(() => {
      focusedFeature = null;
      globe.polygonsTransitionDuration(200);
      applyPolygonStyles();
      focusLowerTimeout = null;
    }, 550);
  }

  function raiseFocusedCountry(feature) {
    if (focusTimeout) clearTimeout(focusTimeout);
    if (focusLowerTimeout) clearTimeout(focusLowerTimeout);

    focusedFeature = feature;
    focusedRaised = false;
    globe.polygonsTransitionDuration(0);
    applyPolygonStyles();

    requestAnimationFrame(() => {
      focusedRaised = true;
      globe.polygonsTransitionDuration(550);
      applyPolygonStyles();

      focusTimeout = setTimeout(() => {
        focusTimeout = null;
        lowerFocusedCountry();
      }, FOCUS_HOLD_MS);
    });
  }

  function findFeatureByTitle(countryTitle) {
    return countries.find(
      (feature) => getCountryDisplayName(getFeatureName(feature)) === countryTitle
    );
  }

  function lngDelta(a, b) {
    const diff = Math.abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
  }

  function getCountryScreenPosition(countryTitle, altitude = 0) {
    const feature = findFeatureByTitle(countryTitle);
    if (!feature) return null;

    const { lat, lng } = getFeatureCenter(feature);
    const coords = globe.getScreenCoords(lat, lng, altitude);
    if (!coords || !Number.isFinite(coords.x) || !Number.isFinite(coords.y)) return null;

    const rect = container.getBoundingClientRect();
    const clientX = rect.left + coords.x;
    const clientY = rect.top + coords.y;

    const hit = globe.toGlobeCoords(clientX, clientY);
    if (!hit) return null;

    if (lngDelta(hit.lng, lng) > 5 || Math.abs(hit.lat - lat) > 5) return null;

    return { x: clientX, y: clientY };
  }

  function playIntroAnimation({ onStart, onComplete } = {}) {
    const target = {
      lat: isMobileViewport() ? 36 : 38,
      lng: -96,
      altitude: isMobileViewport() ? 2.4 : 2.2,
    };
    const start = { lat: 8, lng: -140, altitude: 5.2 };
    const spinDegrees = target.lng - start.lng + 360;
    const duration = 3800;
    const curtain = document.getElementById('intro-curtain');
    const controls = globe.controls();

    if (reducedMotion) {
      globe.pointOfView(target, 0);
      syncGlobeRotation(target.lng, target.lat);
      globe.atmosphereColor('rgba(100, 160, 255, 0.18)').atmosphereAltitude(0.18);
      curtain?.classList.add('hidden');
      onStart?.();
      onComplete?.();
      return;
    }

    controls.enabled = false;
    globe.pointOfView(start, 0);
    globe.atmosphereColor('rgba(100, 160, 255, 0)').atmosphereAltitude(0);
    if (curtain) {
      curtain.classList.remove('hidden');
      curtain.style.opacity = '1';
    }

    onStart?.();

    const startTime = performance.now();

    function tick(now) {
      const raw = Math.min((now - startTime) / duration, 1);
      const eased = easeInOutCubic(raw);
      const lightT = Math.pow(eased, 0.65);

      globe.pointOfView(
        {
          lat: start.lat + (target.lat - start.lat) * eased,
          lng: start.lng + spinDegrees * eased,
          altitude: start.altitude + (target.altitude - start.altitude) * eased,
        },
        0
      );

      syncGlobeRotation(
        start.lng + spinDegrees * eased,
        start.lat + (target.lat - start.lat) * eased
      );

      globe
        .atmosphereAltitude(0.18 * lightT)
        .atmosphereColor(`rgba(100, 160, 255, ${0.18 * lightT})`);

      if (curtain) {
        curtain.style.opacity = String(1 - lightT);
      }

      if (raw < 1) {
        requestAnimationFrame(tick);
      } else {
        syncGlobeRotation(target.lng, target.lat);
        controls.enabled = true;
        enableAutoRotate();
        curtain?.classList.add('hidden');
        onComplete?.();
      }
    }

    requestAnimationFrame(tick);
  }

  globe
    .onPolygonHover((feature) => {
      if (!feature) {
        setHoveredFeature(null);
        callbacks.onCountryLeave?.();
        return;
      }

      const name = getFeatureName(feature);
      if (!isParticipantCountry(name)) {
        setHoveredFeature(null);
        callbacks.onCountryLeave?.();
        return;
      }

      callbacks.onCountryHover?.({
        name,
        labelIdentifier: getCountryLabelIdentifier(name),
        feature,
      });

      setHoveredFeature(feature);
    })
    .onPolygonClick((feature, event) => {
      if (!feature || isMobileViewport()) return;

      emitCountryClick(feature, event, callbacks);
    });

  if (isMobileViewport()) {
    initMobileTouchSelect(globe, container, () => countries, callbacks);
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });

  fetch(GEOJSON_URL)
    .then((res) => res.json())
    .then((data) => {
      countries = data.features || [];
      globe.polygonsData(countries);
      playIntroAnimation({
        onStart: () => callbacks.onReady?.(),
      });
    })
    .catch((err) => {
      console.error('Failed to load country GeoJSON', err);
      callbacks.onError?.(err);
    });

  globe.controls().enableDamping = true;
  globe.controls().dampingFactor = 0.08;
  globe.controls().rotateSpeed = 0.35;
  globe.controls().autoRotateSpeed = 0.35;
  globe.controls().autoRotate = false;
  globe.controls().minDistance = 180;
  globe.controls().maxDistance = 420;

  let autoRotatePauseCount = 0;

  function enableAutoRotate() {
    if (reducedMotion || autoRotatePauseCount > 0) return;
    globe.controls().autoRotate = true;
  }

  function pauseAutoRotate() {
    autoRotatePauseCount += 1;
    globe.controls().autoRotate = false;
  }

  function resumeAutoRotate() {
    if (autoRotatePauseCount <= 0) return;
    autoRotatePauseCount -= 1;
    if (autoRotatePauseCount === 0 && !reducedMotion) {
      globe.controls().autoRotate = true;
    }
  }

  if (isMobileViewport()) {
    globe.controls().rotateSpeed = 0.28;
  }

  return {
    globe,
    resize,
    clearHover() {
      setHoveredFeature(null);
    },
    clearFocus() {
      clearFocusedFeature();
    },
    setHostCitiesVisible(visible) {
      hostCitiesVisible = visible;
      refreshHostCityLayer();
    },
    isHostCitiesVisible() {
      return hostCitiesVisible;
    },
    pauseAutoRotate,
    resumeAutoRotate,
    getCountryScreenPosition,
    flyToCountry(countryTitle, transitionMs = 1200, { silent = false } = {}) {
      const feature = findFeatureByTitle(countryTitle);
      if (!feature) return false;

      clearFocusedFeature();
      hoveredFeature = null;
      globe.polygonsTransitionDuration(200);
      applyPolygonStyles();

      const { lat, lng } = getFeatureCenter(feature);
      const isMobile = isMobileViewport();

      globe.pointOfView(
        { lat, lng, altitude: isMobile ? 1.9 : 1.6 },
        transitionMs
      );

      setTimeout(() => syncGlobeRotation(lng, lat), transitionMs);

      if (!isMobile && !silent) {
        setTimeout(() => raiseFocusedCountry(feature), transitionMs);
      }

      return true;
    },
    setLiveHype,
    setTeamPoints,
  };
}
