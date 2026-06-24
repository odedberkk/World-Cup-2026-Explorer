// Blaze label title → labelIdentifier (from labels API)
export const LABEL_BY_TITLE = {
  Tunisia: '137999',
  Uzbekistan: '138005',
  Colombia: '138926',
  'DR Congo': '945939',
  Jordan: '137923',
  Austria: '137864',
  Algeria: '137854',
  Iraq: '138932',
  Norway: '137960',
  Senegal: '137980',
  'New Zealand': '137961',
  Egypt: '137891',
  Spain: '137911',
  'Cape Verde': '137970',
  Sweden: '137994',
  'Ivory Coast': '138012',
  Ecuador: '137892',
  Japan: '137922',
  Curacao: '137882',
  Turkey: '138000',
  Haiti: '137910',
  Scotland: '137992',
  Qatar: '138021',
  Paraguay: '138927',
  'Bosnia-Herzegovina': '137873',
  'Czech Republic': '137886',
  'South Africa': '137969',
  Switzerland: '137993',
  'Saudi Arabia': '138019',
  Morocco: '137949',
  Australia: '89',
  Cameroon: '115',
  'South Korea': '137930',
  Croatia: '137881',
  USA: '138004',
  Iran: '137916',
  Netherlands: '137912',
  Mexico: '137953',
  Canada: '137926',
  Belgium: '137868',
  Uruguay: '138003',
  Germany: '137957',
  Portugal: '137968',
  England: '137856',
  France: '137899',
  Brazil: '137875',
  Argentina: '137860',
};

// FIFA World Cup 2026 participants (48 teams)
export const PARTICIPANT_TITLES = [
  'Algeria',
  'Argentina',
  'Australia',
  'Austria',
  'Belgium',
  'Bosnia-Herzegovina',
  'Brazil',
  'Canada',
  'Cape Verde',
  'Colombia',
  'Croatia',
  'Curacao',
  'Czech Republic',
  'DR Congo',
  'Ecuador',
  'Egypt',
  'England',
  'France',
  'Germany',
  'Ghana',
  'Haiti',
  'Iran',
  'Iraq',
  'Ivory Coast',
  'Japan',
  'Jordan',
  'Mexico',
  'Morocco',
  'Netherlands',
  'New Zealand',
  'Norway',
  'Panama',
  'Paraguay',
  'Portugal',
  'Qatar',
  'Saudi Arabia',
  'Scotland',
  'Senegal',
  'South Africa',
  'South Korea',
  'Spain',
  'Sweden',
  'Switzerland',
  'Tunisia',
  'Turkey',
  'USA',
  'Uruguay',
  'Uzbekistan',
];

const PARTICIPANT_SET = new Set(PARTICIPANT_TITLES);

// GeoJSON ADMIN / NAME aliases → canonical participant title
export const GEOJSON_ALIASES = {
  'united states of america': 'USA',
  'united states': 'USA',
  usa: 'USA',
  'dem. rep. congo': 'DR Congo',
  'democratic republic of the congo': 'DR Congo',
  'congo, dem. rep.': 'DR Congo',
  'congo (kinshasa)': 'DR Congo',
  'cabo verde': 'Cape Verde',
  'cote d\'ivoire': 'Ivory Coast',
  "côte d'ivoire": 'Ivory Coast',
  'ivory coast': 'Ivory Coast',
  'korea, rep.': 'South Korea',
  'republic of korea': 'South Korea',
  'south korea': 'South Korea',
  'korea, south': 'South Korea',
  'bosnia and herzegovina': 'Bosnia-Herzegovina',
  czechia: 'Czech Republic',
  'czech republic': 'Czech Republic',
  curaçao: 'Curacao',
  curacao: 'Curacao',
  'united kingdom': 'England',
  england: 'England',
  scotland: 'Scotland',
  türkiye: 'Turkey',
  turkey: 'Turkey',
  'iran (islamic republic of)': 'Iran',
  iran: 'Iran',
  'saudi arabia': 'Saudi Arabia',
  'new zealand': 'New Zealand',
  'south africa': 'South Africa',
  ghana: 'Ghana',
  panama: 'Panama',
  'united arab emirates': null,
};

export function resolveParticipantTitle(geoName) {
  if (!geoName) return null;

  const normalized = geoName.trim().toLowerCase();
  const aliasTitle = GEOJSON_ALIASES[normalized];
  if (aliasTitle === null) return null;
  if (aliasTitle && PARTICIPANT_SET.has(aliasTitle)) return aliasTitle;

  const direct = PARTICIPANT_TITLES.find((title) => title.toLowerCase() === normalized);
  return direct || null;
}

export function getCountryLabelIdentifier(geoName) {
  const title = resolveParticipantTitle(geoName) || geoName;
  if (!title) return null;
  return LABEL_BY_TITLE[title] ?? null;
}

export function getCountryDisplayName(geoName) {
  return resolveParticipantTitle(geoName) || geoName || '';
}

export function isParticipantCountry(geoName) {
  return Boolean(resolveParticipantTitle(geoName));
}

export function hasCountryHighlights(geoName) {
  return Boolean(getCountryLabelIdentifier(geoName));
}

export function getParticipantCountries() {
  return [...PARTICIPANT_TITLES].sort((a, b) => a.localeCompare(b));
}

export function findCountryTitle(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const exact = PARTICIPANT_TITLES.find((title) => title.toLowerCase() === q);
  if (exact) return exact;

  const alias = GEOJSON_ALIASES[q];
  if (alias && PARTICIPANT_SET.has(alias)) return alias;

  const startsWith = PARTICIPANT_TITLES.find((title) => title.toLowerCase().startsWith(q));
  if (startsWith) return startsWith;

  return PARTICIPANT_TITLES.find((title) => title.toLowerCase().includes(q)) || null;
}

export const PARTICIPANT_COUNT = PARTICIPANT_TITLES.length;
