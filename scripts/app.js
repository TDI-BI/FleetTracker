/* Vessel list, buttons, positions feed, and startup. Loaded last.
   Uses everything in fleet.js, places.js, map.js and cards.js. */
/* ---------- list ---------- */
function renderList() {
  const L = document.getElementById('list');
  L.innerHTML = FLEET.map(v => {
    const p = pos[v.id];
    const mt = `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${v.mmsi}`;
    const vf = `https://www.vesselfinder.com/vessels/details/${v.imo}`;
    const ms = `https://www.myshiptracking.com/vessels/mmsi-${v.mmsi}`;
    return `<div class="vessel${selected === v.id ? ' sel' : ''}" style="--c:var(${v.c})" role="button" tabindex="0" data-id="${v.id}">
<div class="vhead">
  <div class="vname">${esc(v.name)}</div>
</div>
<img class="thumb" src="${v.photo}" alt="">
${
  p
    ? `<dl class="facts">
  <div><dt>Position</dt><dd class="where">${esc(where(p))}</dd></div>
  <div><dt>Last updated</dt><dd title="${utc(p.fixTime)}">${ago(p.fixTime)}</dd></div>
</dl>`
    : ''
}
<div class="ids">MMSI ${v.mmsi} · IMO ${v.imo} · ${esc(v.flag)}</div>
<div class="links"><a class="tdi" href="${v.tdi}" target="_blank" rel="noopener">TDI vessel page ↗</a><a href="${mt}" target="_blank" rel="noopener">MarineTraffic</a><a href="${vf}" target="_blank" rel="noopener">VesselFinder</a><a href="${ms}" target="_blank" rel="noopener">MyShipTracking</a></div>
</div>`;
  }).join('');
}
// picking a vessel in the list zooms to it; picking it again goes back to the whole fleet
function pick(id) {
  if (id === selected) showWholeFleet();
  else select(id, true);
}
document.getElementById('list').addEventListener('click', e => {
  if (e.target.closest('a')) return;
  const el = e.target.closest('.vessel');
  if (el) pick(el.dataset.id);
});
document.getElementById('list').addEventListener('keydown', e => {
  const el = e.target.closest('.vessel');
  if (el && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    pick(el.dataset.id);
  }
});
function select(id, fly) {
  selected = id;
  renderList();
  drawMarkers();
  if (fly) flyTo(id);
}

function showWholeFleet() {
  selected = null;
  renderList();
  drawMarkers();
  fitFleet();
}
document.getElementById('fitBtn').onclick = showWholeFleet;
document.getElementById('zfit').onclick = showWholeFleet;
// show/hide the vessel list; the chart takes the freed width
document.getElementById('listBtn').onclick = e => {
  const hide = document.body.classList.toggle('list-hidden');
  e.currentTarget.setAttribute('aria-expanded', String(!hide));
};
// top-right checkbox: ship photos in marketing mode (off by default),
// vessel labels in the dashboard (on by default); remembered per browser and per mode
const cardToggle = document.getElementById('cardToggle');
const TOGGLE_KEY = MARKETING ? 'shipPhotosMarketing' : 'vesselLabels';
document.getElementById('cardToggleText').textContent = MARKETING
  ? 'Ship photos'
  : 'Vessel labels';
cardToggle.checked = !MARKETING;
try {
  const saved = localStorage.getItem(TOGGLE_KEY);
  if (saved) cardToggle.checked = saved === 'on';
} catch {}
function applyCardToggle() {
  if (MARKETING)
    document.documentElement.classList.toggle('no-photos', !cardToggle.checked);
  else showLabels = cardToggle.checked;
}
applyCardToggle();
cardToggle.onchange = () => {
  try {
    localStorage.setItem(TOGGLE_KEY, cardToggle.checked ? 'on' : 'off');
  } catch {}
  applyCardToggle();
  needsPlace = true; // cards change size, so re-place them
  drawMarkers();
};
document.getElementById('zin').onclick = () =>
  svg.transition().duration(250).call(zoom.scaleBy, 2);
document.getElementById('zout').onclick = () =>
  svg.transition().duration(250).call(zoom.scaleBy, 0.5);
new ResizeObserver(() => {
  needsPlace = true;
  drawPlaces();
  drawMarkers();
}).observe(document.getElementById('chart'));

setInterval(() => {
  renderList();
  drawMarkers();
}, 60000);

loadBasemap().catch(e => console.error('Basemap failed to load', e));
renderList();
requestAnimationFrame(() => fitFleet());

/* ---------- positions feed: internal getFleetPositions API ---------- */
const POSITIONS_API = 'https://todo.tdi-bi.com/getFleetPositions';
const REFRESH_MS = 5 * 60 * 1000;
/* API response: { <api key>: { pos: { latitude, longitude }, time } } -> pos[<fleet id>] */
function readFleetPositions(j) {
  let newest = null;
  for (const v of FLEET) {
    const x = j[v.api];
    const lat = x?.pos?.latitude,
      lon = x?.pos?.longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    pos[v.id] = { lat, lon, fixTime: x.time };
    if (x.time && (!newest || x.time > newest)) newest = x.time;
  }
  return newest;
}
let firstFit = false;
function setFeed(live, text) {
  document.getElementById('feed').innerHTML =
    `<span class="dot${live ? ' live' : ''}"></span><span>${esc(text)}</span>`;
  document.getElementById('marketingBadge').textContent = text;
}
async function loadPositions() {
  try {
    const sites = FLEET.map(v => v.site).join(',');
    const r = await fetch(`${POSITIONS_API}?sites=${sites}`, {
      cache: 'no-store',
    });
    if (!r.ok) throw new Error(r.status);
    const updated = readFleetPositions(await r.json());
    setFeed(true, `Updated ${ago(updated)} (${utc(updated)})`);
    renderList();
    drawPlaces();
    needsPlace = true;
    drawMarkers();
    if (!firstFit) {
      firstFit = true;
      fitFleet();
    }
  } catch (e) {
    setFeed(false, "Couldn't load positions. Retrying in 5 minutes.");
  }
}
loadPositions();
setInterval(loadPositions, REFRESH_MS);
