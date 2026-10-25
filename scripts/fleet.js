/* Fleet config, shared state and text formatting. Loaded first; no dependencies. */
const EMBED = location.hash === '#embed';
if (EMBED) {
  document.documentElement.classList.add('embed');
  document.getElementById('scaleNote').textContent = matchMedia(
    '(pointer: coarse)'
  ).matches
    ? 'Drag to pan · pinch or +/− to zoom'
    : 'Drag to pan · Ctrl + scroll or +/− to zoom';
}
const FLEET = [
  {
    id: 'nautilus',
    site: 'nautshipdash', // sites= param for getFleetPositions
    api: 'nautilus', // key in the getFleetPositions response
    tdi: 'https://www.tdi-bi.com/r-v-nautilus/',
    name: 'RV Nautilus',
    mmsi: '577030000',
    imo: '9223708',
    flag: 'Vanuatu',
    short: 'RV NAUTILUS',
    c: '--v1',
    photo: 'img/nautilus.webp',
    ar: 440 / 309,
  },
  {
    id: 'gyre',
    site: 'gyreshipdash', // sites= param for getFleetPositions
    api: 'gyre', // key in the getFleetPositions response
    tdi: 'https://www.tdi-bi.com/r-v-gyre/',
    name: 'RV Gyre',
    mmsi: '577275000',
    imo: '7318999',
    flag: 'Vanuatu',
    short: 'RV GYRE',
    c: '--v2',
    photo: 'img/gyre.webp',
    ar: 440 / 231,
  },
  {
    id: 'proteus',
    site: 'proteusshipdash', // sites= param for getFleetPositions
    api: 'proteus', // key in the getFleetPositions response
    tdi: 'https://www.tdi-bi.com/r-v-proteus/',
    name: 'RV Proteus',
    mmsi: '577207000',
    imo: '7634290',
    flag: 'Vanuatu',
    short: 'RV PROTEUS',
    c: '--v3',
    photo: 'img/proteus.webp',
    ar: 440 / 217,
  },
  {
    id: 'brooks-mccall',
    site: 'shipdash', // sites= param for getFleetPositions
    api: 'brooks', // key in the getFleetPositions response
    tdi: 'https://www.tdi-bi.com/r-v-brooks-mccall/',
    name: 'RV Brooks McCall',
    mmsi: '338257000',
    imo: '8964367',
    flag: 'USA',
    short: 'RV BROOKS McCALL',
    c: '--v4',
    photo: 'img/brooks-mccall.webp',
    ar: 440 / 171,
  },
  {
    id: 'miss-emma-mccall',
    site: 'emmashipdash', // sites= param for getFleetPositions
    api: 'emma', // key in the getFleetPositions response
    tdi: 'https://www.tdi-bi.com/r-v-miss-emma-mccall/',
    name: 'RV Miss Emma McCall',
    mmsi: '577759000',
    imo: '9289659',
    flag: 'Vanuatu',
    short: 'RV MISS EMMA McCALL',
    c: '--v5',
    photo: 'img/miss-emma-mccall.webp',
    ar: 420 / 238,
  },
];
const pos = {};
let selected = null,
  hover = null;

/* ---------- formatting ---------- */
function dm(v, isLat) {
  const h = isLat ? (v >= 0 ? 'N' : 'S') : v >= 0 ? 'E' : 'W';
  const a = Math.abs(v);
  const d = Math.floor(a);
  const m = (a - d) * 60;
  return (
    String(d).padStart(isLat ? 2 : 3, '0') +
    '°' +
    m.toFixed(3).padStart(6, '0') +
    '′' +
    h
  );
}
function ago(iso) {
  if (!iso) return '—';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (isNaN(s)) return '—';
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago';
  if (s < 172800) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' d ago';
}
function fresh(iso) {
  const h = (Date.now() - Date.parse(iso)) / 3.6e6;
  if (!(h >= 0)) return ['mute', 'No fix'];
  if (h < 6) return ['ok', 'Fresh'];
  if (h < 48) return ['warn', 'Aging'];
  return ['bad', 'Stale'];
}

function esc(t) {
  return String(t ?? '').replace(
    /[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
}
function utc(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}
