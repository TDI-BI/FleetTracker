# TDI-Brooks Fleet Tracker

Live map of the TDI-Brooks research vessels. A static site with no build step, embedded on tdi-bi.com.

## Architecture

```
index.html                         markup
css/style.css                      styles (light/dark via CSS variables)
scripts/fleet.js                   vessels (FLEET), shared state, formatting
scripts/places.js                  map labels (PLACES), "n nm NE of" text
scripts/map.js                     basemap, zoom, fitting the view, labels
scripts/cards.js                   vessel dots, cards and card placement
scripts/app.js                     vessel list, buttons, positions feed, startup
data/countries.topo.json           basemap, loaded by the page (generated)
data/countries.original.topo.json  full-detail basemap source
img/                               vessel photos
tools/                             map compression script (dev only)
```

- d3 and topojson-client load from CDNs and draw the map as SVG (Mercator).
- Positions come from the API on load and every 5 minutes (`REFRESH_MS`).
- A vessel whose last position is over 2 days old is drawn as stale (no pulse).
- Zoom is capped at port level (`MAX_ZOOM`).
- The scripts are plain `<script>` tags sharing globals, loaded in the order listed in `index.html`; `app.js` goes last and starts everything.

Most edits are config near the top of a file:
- `FLEET` (fleet.js): vessels, IDs, photos, links
- `PLACES` (places.js): map labels
- `MAX_ZOOM` (map.js), `POSITIONS_API` and `REFRESH_MS` (app.js)

## Development

```sh
python3 -m http.server 8000
```

Open http://localhost:8000/ (append `#marketing` for the marketing view). A server is needed because `fetch()` doesn't work on `file://` pages. Local pages call the live API; to use a local one, temporarily set `POSITIONS_API` to `http://localhost:1902/getFleetPositions`.

## API

```
GET https://todo.tdi-bi.com/getFleetPositions?sites=nautshipdash,gyreshipdash,...
```

```json
{ "brooks": { "pos": { "latitude": 28.9792, "longitude": -95.4167 }, "time": "2026-10-20T20:10:07Z" } }
```

- Each vessel's `site` in `FLEET` builds the `sites` list, and its `api` field matches the response key.
- The route must be HTTPS (the site is) and send CORS headers.
- Data comes from SharePoint and updates about every 5 minutes. Requests take about 1 s.

## Hosting

Any static host works: serve the repo root as-is. The page needs `index.html`, `css/`, `scripts/`, `data/countries.topo.json` and `img/`.

On GitHub Pages: Settings → Pages → Source: **Deploy from a branch** → `main`, `/ (root)`. Every push to `main` publishes.

## Embedding

WordPress Custom HTML block:

```html
<div style="position:relative;width:100%;height:clamp(380px,60vw,640px);border-radius:6px;overflow:hidden">
  <iframe src="https://<site-url>/#marketing" title="TDI-Brooks fleet positions"
          style="position:absolute;inset:0;width:100%;height:100%;border:0" loading="lazy"></iframe>
</div>
```

- `#marketing` hides the header and vessel list, shows every vessel's card (ship photos off by default), and needs Ctrl + scroll to zoom so the map doesn't hijack page scrolling.
- Drop `#marketing` to embed the full page.
- A TDI domain (e.g. `fleet.tdi-bi.com`, set up as a CNAME to the host) keeps the embed URL stable if hosting changes.

## Map compression

`data/countries.topo.json` is generated from the original by `tools/shrink-map.mjs`: 71 KB gzipped, down from 221 KB.

```sh
cd tools && npm install && npm run shrink-map
```

- Keeps 25% of coastline points (`KEEP`).
- Keeps every point of islands under 300 km² (`PROTECT_KM2`), so places like Roatán don't vanish.
- Snaps coordinates to a 10,000-step grid (`QUANTIZATION`).
- The lost detail doesn't show, because zoom is capped at port level.

Don't edit the generated file by hand. Both map files stay minified, and `.prettierignore` stops editors reformatting them. The script uses d3's topojson tools; mapshaper turns some countries inside out.
