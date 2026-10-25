/* The chart: basemap, zoom, fitting the view, place-name labels.
   Uses: fleet.js (EMBED, pos), places.js (PLACES),
   cards.js (drawMarkers, roomForCards, landFeatures, needsPlace). */
/* ---------- chart ---------- */
const svg = d3.select('#map'),
  root = svg.append('g'),
  landG = root.append('g'),
  plG = svg.append('g'),
  leadG = svg.append('g'), // lines from each dot to its card
  mkG = svg.append('g');
const proj = d3.geoMercator().scale(1).translate([0, 0]);
const path = d3.geoPath(proj);
/* basemap: world countries (TopoJSON), drawn once it arrives */
async function loadBasemap() {
  const r = await fetch('data/countries.topo.json');
  if (!r.ok) throw new Error(`countries.topo.json: ${r.status}`);
  const topo = await r.json();
  landFeatures = topojson.feature(topo, topo.objects.countries).features;
  landG
    .selectAll('path')
    .data(landFeatures)
    .join('path')
    .attr('class', 'land')
    .attr('d', path);
  landG
    .append('path')
    .datum(topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b))
    .attr('class', 'borders')
    .attr('d', path);
  needsPlace = true; // card spots can now account for land
  drawMarkers();
}

function tierNow() {
  const k = T.k;
  return k >= 2500 ? 3 : k >= 900 ? 2 : k >= 300 ? 1 : 0;
}
function drawPlaces() {
  const [w, h] = size(),
    tier = tierNow();
  const vis = PLACES.filter(p => p[4] <= tier)
    .map(p => {
      const [x, y] = T.apply(proj([p[0], p[1]]));
      return { p, x, y };
    })
    .filter(d => d.x > -150 && d.x < w + 150 && d.y > -40 && d.y < h + 40);
  const dotted = d => /city|hq/.test(d.p[3]);
  plG
    .selectAll('circle.pl-dot')
    .data(vis.filter(dotted), d => d.p[2])
    .join('circle')
    .attr('class', 'pl-dot')
    .attr('r', d => (d.p[3] === 'hq' ? 4 : 2.8))
    .attr('cx', d => d.x)
    .attr('cy', d => d.y);
  plG
    .selectAll('text.pl')
    .data(vis, d => d.p[2] + d.p[0]) // + lon: the Pacific is named on both edges
    .join('text')
    .attr('class', d => 'pl ' + d.p[3])
    .attr('text-anchor', d => (dotted(d) ? 'start' : 'middle'))
    .attr('x', d => (dotted(d) ? d.x + 6 : d.x))
    .attr('y', d => (dotted(d) ? d.y + 4 : d.y))
    .text(d => d.p[2]);
}
let T = d3.zoomIdentity;
// past this the coastline data is too coarse to be meaningful (~port level)
const MAX_ZOOM = 2500;
const motionMs = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 750;
const zoom = d3
  .zoom()
  .scaleExtent([60, MAX_ZOOM])
  // cards keep their spot while the view moves, and pick a new one once it settles
  .on('end', () => {
    needsPlace = true;
    drawMarkers();
  })
  .on('zoom', e => {
    T = e.transform;
    root.attr('transform', T);
    drawPlaces();
    drawMarkers();
  });

if (EMBED)
  zoom.filter(e =>
    e.type === 'wheel'
      ? e.ctrlKey || e.metaKey
      : (!e.ctrlKey || e.type === 'wheel') && !e.button
  );
svg.call(zoom).on('dblclick.zoom', null);
function size() {
  const r = document.getElementById('chart').getBoundingClientRect();
  return [r.width, r.height];
}
function fit(features, pad = 60) {
  const [w, h] = size();
  if (!w || !h) return;
  const b = path.bounds({ type: 'FeatureCollection', features });
  let dx = b[1][0] - b[0][0],
    dy = b[1][1] - b[0][1];
  const minSpan = 0.02;
  if (dx < minSpan) {
    b[0][0] -= minSpan / 2;
    b[1][0] += minSpan / 2;
    dx = minSpan;
  }
  if (dy < minSpan) {
    b[0][1] -= minSpan / 2;
    b[1][1] += minSpan / 2;
    dy = minSpan;
  }
  const k = Math.min(MAX_ZOOM, (w - pad * 2) / dx, (h - pad * 2) / dy);
  const t = d3.zoomIdentity
    .translate(w / 2, h / 2)
    .scale(k)
    .translate(-(b[0][0] + b[1][0]) / 2, -(b[0][1] + b[1][1]) / 2);
  svg.transition().duration(motionMs()).call(zoom.transform, roomForCards(t, w, h));
}
const point = coordinates => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates },
});
function fitFleet() {
  const pts = Object.values(pos).map(p => [p.lon, p.lat]);
  if (pts.length) {
    // extra point to the NE leaves room for the vessel cards
    const e = Math.max(...pts.map(c => c[0]));
    const n = Math.max(...pts.map(c => c[1]));
    fit([...pts, [e + 14, n + 6]].map(point), 90);
  } else
    fit(
      [
        {
          type: 'Feature',
          geometry: {
            type: 'MultiPoint',
            coordinates: [
              [-120, -40],
              [60, 65],
            ],
          },
        },
      ],
      10
    );
}
function flyTo(id) {
  const p = pos[id];
  if (!p) return;
  const [w, h] = size();
  const xy = proj([p.lon, p.lat]);
  const k = Math.max(T.k, 2500);
  svg
    .transition()
    .duration(motionMs())
    .call(
      zoom.transform,
      d3.zoomIdentity
        .translate(w / 2, h / 2)
        .scale(k)
        .translate(-xy[0], -xy[1])
    );
}

/* screen-space boxes [left, top, right, bottom] for label collision checks */
const box = el => {
  const r = el.getBoundingClientRect();
  return [r.left, r.top, r.right, r.bottom];
};
const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
function declutter() {
  const boxes = [];
  // keep place names clear of the vessel dots and their cards
  mkG.selectAll('a.mk').each(function () {
    const r = box(this);
    boxes.push([r[0] - 4, r[1] - 4, r[2] + 4, r[3] + 4]);
  });
  d3.selectAll('#callouts .callout').each(function () {
    boxes.push(box(this));
  });
  const order = {
    ocean: 0,
    'country big': 1,
    sea: 2,
    hq: 3,
    country: 4,
    region: 5,
    city: 6,
  };
  const nodes = plG.selectAll('text.pl').nodes();
  nodes.forEach(n => (n.style.display = ''));
  nodes.sort(
    (a, b) =>
      (order[a.__data__.p[3]] ?? 9) - (order[b.__data__.p[3]] ?? 9) ||
      a.__data__.p[4] - b.__data__.p[4]
  );
  const kept = new Set();
  const cr = box(document.getElementById('chart'));
  for (const n of nodes) {
    const r = box(n);
    const b = [r[0] - 2, r[1] - 1, r[2] + 2, r[3] + 1];
    const ok =
      r[0] >= cr[0] &&
      r[2] <= cr[2] &&
      r[1] >= cr[1] &&
      r[3] <= cr[3] &&
      !boxes.some(x => hit(b, x));
    n.style.display = ok ? '' : 'none';
    if (ok) {
      boxes.push(b);
      kept.add(n.__data__.p[2]);
    }
  }
  plG
    .selectAll('circle.pl-dot')
    .style('display', d => (kept.has(d.p[2]) ? '' : 'none'));
}
