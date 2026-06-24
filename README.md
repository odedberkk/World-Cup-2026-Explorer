# World Cup 2026 Explorer

Interactive 3D globe for FIFA World Cup 2026 — explore host cities, live match stats, and team standings, with Blaze-powered highlights and live stories on tap.

## Features

- **3D globe** — Participant countries rendered on an interactive Globe.gl earth with day/night shading
- **Standings heatmap** — Countries rise and color-shift from yellow to green based on group-stage points
- **Live match hype** — Live fixtures pulse on the globe; countries in active games get animated highlights
- **Host stadiums** — 16 host-city markers across USA, Mexico, and Canada with stadium detail cards
- **Country stats** — Click or tap a country for standings, next match, recent results, and form
- **Blaze playback** — Watch highlights or live stories per country via the Blaze Web SDK
- **Rankings panels** — Golden Boot scorers, top teams, and upcoming fixtures
- **Mobile-first** — Touch-optimized panels, search, and full-screen stats cards

## Tech stack


| Layer | Technology                                                          |
| ----- | ------------------------------------------------------------------- |
| Globe | [Globe.gl](https://github.com/vasturiano/globe.gl)                  |
| Video | [Blaze Web SDK](https://dev.wsc-sports.com/docs/web-blazesdk-class) |
| Stats | [wcup2026.org](https://wcup2026.org) API                            |
| App   | Vanilla ES modules — no build step                                  |


## Project structure

```
├── index.html          # Entry point
├── styles.css          # Layout and UI
├── assets/             # Stadium photos, logos
├── src/
│   ├── main.js         # Boot, panels, interactions
│   ├── globe.js        # 3D globe, heatmap, live hype
│   ├── blaze.js        # Blaze SDK, highlights, mobile cards
│   ├── matchStats.js   # Stats API, live fixtures
│   ├── countryMap.js   # Team → Blaze label mapping
│   ├── hostCities.js   # 2026 venue data
│   └── …               # Scorers, teams, upcoming, day/night
└── .github/workflows/  # GitHub Pages deploy
```

## Local development

1. Copy `src/blaze.config.example.js` to `src/blaze.config.js` and set your Blaze API key.
2. Generate `src/gate.config.js` from your access password (PBKDF2-SHA256 + salt):

```bash
cp src/blaze.config.example.js src/blaze.config.js
node scripts/generate-gate-config.js "your-password"
```

3. Serve the project root as static files. Python works well:

```bash
python -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080). Enter the password to unlock the globe. A valid unlock persists for the browser tab session.

## Deployment

Pushes to `main` deploy automatically to **GitHub Pages** via `.github/workflows/deploy-pages.yml`. Enable Pages under **Settings → Pages → GitHub Actions** on first setup.

Add repository secrets under **Settings → Secrets and variables → Actions**:

- `BLAZE_API_KEY` — injected into `src/blaze.config.js` at build time
- `GATE_PASSWORD` — hashed into `src/gate.config.js` at build time (plain password is never committed)

The access gate is client-side only: it blocks casual access but is not a substitute for server-side authentication on a public static site.

## Data sources

- **Match stats, standings, scorers** — `wcup2026.org/api/data.php`
- **Country polygons** — [Natural Earth 110m countries GeoJSON](https://github.com/nvkelso/natural-earth-vector)
- **Flags** — [flagcdn.com](https://flagcdn.com)
- **Blaze content** — Per-country label identifiers in `src/countryMap.js`

