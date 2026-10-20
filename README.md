# TDI-Brooks Fleet Tracker

A live map of the TDI-Brooks research vessels (RV Nautilus, RV Gyre, RV Proteus, RV Brooks McCall, RV Miss Emma McCall). It is a static site, built to be embedded on tdi-bi.com.

## How it works

- `index.html` is the page markup. Styles are in `css/style.css` and the app is `scripts/app.js`.
- On load, and again every 5 minutes, the page requests vessel positions from the internal `getFleetPositions` API (`POSITIONS_API` in `scripts/app.js`).
- The basemap (world countries and US states) is TopoJSON in `data/`, drawn with d3 and topojson-client from CDNs.
- The page marks a position older than 6 hours "Aging" and older than 2 days "Stale".
- Clicking a ship opens its page on tdi-bi.com.

## Running locally

Browsers block `fetch()` on `file://` pages, so serve the folder:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000/ (or http://localhost:8000/#embed for the embed view). The positions API must also be running at the URL in `POSITIONS_API`.

## Positions API

`GET /getFleetPositions?sites=<site>,<site>,...` returns one entry per vessel:

```json
{
  "brooks": { "pos": { "latitude": 28.9792, "longitude": -95.4167 }, "time": "2026-10-20T20:10:07Z" }
}
```

The `sites` list is built from each vessel's `site` in `FLEET`, and each response key is matched to a vessel by its `api` field. The API must send CORS headers allowing the page's origin.

## Hosting

GitHub Pages, deployed from the `main` branch: Repository → Settings → Pages → Build and deployment → Source: **Deploy from a branch** → `main`, `/ (root)`. Every push to `main` publishes the site.

## Putting it on tdi-bi.com

Add a Custom HTML block to the WordPress page and paste:

```html
<div style="position:relative;width:100%;height:clamp(380px,60vw,640px);border-radius:6px;overflow:hidden">
  <iframe src="https://broussardbrandt.github.io/FleetTracker/#embed"
          title="TDI-Brooks fleet positions"
          style="position:absolute;inset:0;width:100%;height:100%;border:0"
          loading="lazy"></iframe>
</div>
```

The height scales with screen width: 640px on a desktop, about 380px on a phone.

`#embed` shows the map on its own, without the header and vessel list, and needs Ctrl + scroll to zoom so it doesn't hijack scrolling on the website. Leave `#embed` off to embed the full page with the vessel list.

To serve it from a TDI address such as `fleet.tdi-bi.com`: add a CNAME DNS record pointing `fleet` to `<your-account>.github.io`, then enter the domain under Settings → Pages → Custom domain.

## Changing things

- **Vessel details, MMSIs, photos, TDI links, API keys:** the `FLEET` list near the top of `scripts/app.js`. Photos are in `img/`.
- **Positions API URL:** `POSITIONS_API` in `scripts/app.js`.
- **Map place names:** the `PLACES` list in `scripts/app.js`.
- **Refresh interval:** `REFRESH_MS` in `scripts/app.js`.
