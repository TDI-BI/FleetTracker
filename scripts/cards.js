/* Vessel dots, their cards and leader lines, and where the cards go.
   Uses: fleet.js (FLEET, pos, selected, formatting), places.js (where),
   map.js (svg layers, proj, T, MAX_ZOOM, box, declutter). */
function drawMarkers() {
  const [w, h] = size();
  const data = FLEET.filter(v => pos[v.id])
    .map(v => {
      const p = pos[v.id];
      const [x, y] = T.apply(proj([p.lon, p.lat]));
      return { v, p, x, y };
    })
    .sort((a, b) => (a.v.id === selected) - (b.v.id === selected) || a.y - b.y);
  mkG
    .selectAll('a.mk')
    .data(data, d => d.v.id)
    .join(enter => {
      const g = enter
        .append('a')
        .attr('class', 'mk')
        .attr('href', d => d.v.tdi)
        .attr('target', '_blank')
        .attr('rel', 'noopener')
        .attr('aria-label', d => d.v.name + ' on the TDI-Brooks website');
      g.append('title').text(d => 'Open ' + d.v.name + ' on tdi-bi.com');
      g.append('circle')
        .attr('class', 'pulse')
        .attr('r', 6)
        .style('stroke', d => `var(${d.v.c})`);
      g.append('circle')
        .attr('class', 'halo')
        .attr('r', 9)
        .style('stroke', d => `var(${d.v.c})`);
      g.append('circle')
        .attr('class', 'body')
        .attr('r', 5)
        .style('fill', d => `var(${d.v.c})`);
      // invisible, steady click target; the visible circles ignore the mouse
      g.append('circle').attr('class', 'hit').attr('r', 16);
      return g;
    })
    .order()
    .attr('transform', d => `translate(${d.x},${d.y})`)
    .classed('sel', d => selected === d.v.id)
    .classed('stale', d => stale(d.p.fixTime));
  drawCards(data, w, h);
  declutter();
}
/* vessel cards. Marketing mode: a full card for every vessel.
   Dashboard: a full card for the vessel selected in the list, and a mini card (name and
   coordinates) for the rest while vessel labels are on. */
let showLabels = true; // dashboard vessel labels; set by the checkbox in app.js
function cardHtml({ v, p }, mini) {
  if (mini)
    return `<div class="ctext"><div class="cname">${esc(v.name)} <span class="carrow" aria-hidden="true">↗</span></div><div class="cpos">${dm(p.lat, true)} ${dm(p.lon, false)}</div></div>`;
  return `<div class="ctext"><div class="cname">${esc(v.name)} <span class="carrow" aria-hidden="true">↗</span></div>
<div class="cline">${esc(where(p))}</div><div class="cpos">${dm(p.lat, true)} ${dm(p.lon, false)}</div><div class="cupd">Last updated: ${ago(p.fixTime)}</div><div class="cgo">Click for the vessel page ↗</div></div>
<img class="cphoto" src="${v.photo}" alt="" width="440" height="${Math.round(440 / v.ar)}">`;
}
/* card placement: each card tries spots around its dot and takes the one that hides
   the least land, without covering other cards, vessel dots or the map controls */
let landFeatures = null,
  needsPlace = true,
  placedIds = '';
const placement = {}; // vessel id -> card offset from its dot, { dx, dy }
const MASK = 0.25; // land mask resolution relative to screen pixels
// Rasterises the land into an mw×mh mask, with m mapping projected coords to mask px.
// Returns view => (box [l, t, r, b] in that view's screen px => land area in screen px²),
// so one mask can score many candidate views.
function landMask(m, mw, mh) {
  mw = Math.ceil(mw);
  mh = Math.ceil(mh);
  // summed-area table: any box's land count in four lookups
  const sat = new Int32Array((mw + 1) * (mh + 1));
  // (a zero-size canvas can't be read, e.g. before the chart has been laid out)
  if (landFeatures && mw && mh) {
    const canvas = Object.assign(document.createElement('canvas'), {
      width: mw,
      height: mh,
    });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(m.k, 0, 0, m.k, m.x, m.y);
    ctx.beginPath();
    d3.geoPath(proj, ctx)({ type: 'FeatureCollection', features: landFeatures });
    ctx.fill();
    const px = ctx.getImageData(0, 0, mw, mh).data;
    for (let y = 0; y < mh; y++) {
      let row = 0;
      for (let x = 0; x < mw; x++) {
        row += px[(y * mw + x) * 4 + 3] > 127;
        sat[(y + 1) * (mw + 1) + x + 1] = sat[y * (mw + 1) + x + 1] + row;
      }
    }
  }
  const at = (x, y) => sat[y * (mw + 1) + x];
  return t => {
    const s = m.k / t.k; // mask px per screen px
    const cx = v => Math.max(0, Math.min(mw, Math.round((v - t.x) * s + m.x))),
      cy = v => Math.max(0, Math.min(mh, Math.round((v - t.y) * s + m.y)));
    return ([l, tp, r, b]) => {
      const x0 = cx(l),
        x1 = cx(r),
        y0 = cy(tp),
        y1 = cy(b);
      return (at(x1, y1) - at(x0, y1) - at(x1, y0) + at(x0, y0)) / s ** 2;
    };
  };
}
// land lookup for the current view
const viewLand = (w, h) =>
  landMask({ k: T.k * MASK, x: T.x * MASK, y: T.y * MASK }, w * MASK, h * MASK)(T);
const overlap = (a, b) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
  Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const DIRS = [
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
  [1, 0],
  [-1, 0],
  [0, -1],
  [0, 1],
];
// cards: [{ d, cw, ch }]; data: every vessel on screen (their dots are obstacles);
// land: land lookup for the view being scored. Returns each card's box and the total score.
function placeCards(cards, data, w, h, land = viewLand(w, h)) {
  const cr = box(document.getElementById('chart'));
  const ui = [
    ...document.querySelectorAll('.zoom, .photo-toggle, .marketing-badge, .scale-note'),
  ]
    .map(box)
    .filter(b => b[2] > b[0])
    .map(b => [b[0] - cr[0] - 6, b[1] - cr[1] - 6, b[2] - cr[0] + 6, b[3] - cr[1] + 6]);
  const dots = data.map(d => [d.x - 12, d.y - 12, d.x + 12, d.y + 12]);
  const inside = [8, 8, w - 8, h - 8];
  const rects = {};
  // lower is better, in px²: land hidden, plus heavy penalties for anything worse
  function score(r, id, gap) {
    const area = (r[2] - r[0]) * (r[3] - r[1]);
    let s = land(r) + gap * 150;
    s += (area - overlap(r, inside)) * 20;
    for (const u of ui) s += overlap(r, u) * 20;
    for (const k in rects) if (k !== id) s += overlap(r, rects[k]) * 20;
    for (const b of dots) if (overlap(r, b)) s += 1e6;
    return s;
  }
  // a second pass lets early cards move out of the way of later ones
  let total = 0;
  for (let pass = 0; pass < 2; pass++)
    for (const { d, cw, ch } of cards) {
      let best = null;
      for (const gap of [40, 90, 150])
        for (const [ux, uy] of DIRS) {
          const l = ux > 0 ? d.x + gap : ux < 0 ? d.x - gap - cw : d.x - cw / 2,
            t = uy > 0 ? d.y + gap : uy < 0 ? d.y - gap - ch : d.y - ch / 2,
            r = [l, t, l + cw, t + ch],
            s = score(r, d.v.id, gap);
          if (!best || s < best.s) best = { s, r };
        }
      rects[d.v.id] = best.r;
      if (pass === 1) total += best.s;
    }
  return { rects, score: total };
}
function drawCards(data, w, h) {
  const focus = selected;
  const mini = d => !MARKETING && d.v.id !== focus;
  const cards = data.filter(
    d =>
      (MARKETING || showLabels || d.v.id === focus) &&
      d.x > -50 &&
      d.x < w + 50 &&
      d.y > -50 &&
      d.y < h + 50
  );
  const els = d3
    .select('#callouts')
    .selectAll('.callout')
    .data(cards, d => d.v.id)
    // every card, full or mini, is a link to the vessel page, like its dot
    .join('a')
    .attr('class', d => (mini(d) ? 'callout mini' : 'callout'))
    .attr('href', d => d.v.tdi)
    .attr('target', '_blank')
    .attr('rel', 'noopener')
    .attr('aria-label', d => d.v.name + ' on the TDI-Brooks website')
    .style('--c', d => `var(${d.v.c})`)
    .each(function (d) {
      // only rebuild when the text changes, so the photo isn't reloaded on every zoom frame
      const html = cardHtml(d, mini(d));
      if (this.__html !== html) this.innerHTML = this.__html = html;
    });
  // re-place when the set of cards changes, or which one is full-size
  const ids = cards.map(d => d.v.id).join() + '|' + focus;
  if (needsPlace || ids !== placedIds) {
    const { rects } = placeCards(
      els.nodes().map(el => ({ d: el.__data__, cw: el.offsetWidth, ch: el.offsetHeight })),
      data,
      w,
      h
    );
    for (const d of cards)
      placement[d.v.id] = { dx: rects[d.v.id][0] - d.x, dy: rects[d.v.id][1] - d.y };
    needsPlace = false;
    placedIds = ids;
  }
  const leads = [];
  els.each(function (d) {
    const cw = this.offsetWidth,
      ch = this.offsetHeight,
      o = placement[d.v.id];
    const left = Math.max(8, Math.min(w - cw - 8, d.x + o.dx)),
      top = Math.max(8, Math.min(h - ch - 8, d.y + o.dy));
    this.style.left = left + 'px';
    this.style.top = top + 'px';
    // leader line ends at the nearest point on the card's edge
    const ex = Math.max(left, Math.min(left + cw, d.x)),
      ey = Math.max(top, Math.min(top + ch, d.y));
    if (ex !== d.x || ey !== d.y) leads.push({ d, ex, ey });
  });
  leadG
    .selectAll('line')
    .data(leads, l => l.d.v.id)
    .join('line')
    .attr('class', 'lead')
    .style('stroke', l => `var(${l.d.v.c})`)
    .attr('x1', l => l.d.x)
    .attr('y1', l => l.d.y)
    .attr('x2', l => l.ex)
    .attr('y2', l => l.ey);
}

/* nudge a fitted view so the cards on screen have the most comfortable spots:
   tries a few zooms and pans around it and keeps the one placeCards scores best */
function roomForCards(base, w, h) {
  const sizes = d3
    .selectAll('#callouts .callout')
    .nodes()
    .map(el => ({ v: el.__data__.v, cw: el.offsetWidth, ch: el.offsetHeight }));
  if (!sizes.length) return base;
  // projected point at the centre of the fitted view
  const cx = (w / 2 - base.x) / base.k,
    cy = (h / 2 - base.y) / base.k;
  const ZOOMS = [1.15, 1, 0.85, 0.7, 0.55],
    PAN = 0.15;
  const kOf = z => Math.max(60, Math.min(MAX_ZOOM, base.k * z));
  // one land mask covering every candidate view, at the closest view's resolution
  const kMin = kOf(Math.min(...ZOOMS)),
    res = kOf(Math.max(...ZOOMS)) * MASK,
    mw = (2 * (0.5 + PAN) * w * res) / kMin,
    mh = (2 * (0.5 + PAN) * h * res) / kMin;
  const landFor = landMask({ k: res, x: mw / 2 - cx * res, y: mh / 2 - cy * res }, mw, mh);
  let best = null;
  for (const z of ZOOMS)
    for (const fx of [-PAN, 0, PAN])
      for (const fy of [-PAN, 0, PAN]) {
        const k = kOf(z);
        const t = d3.zoomIdentity
          .translate(w / 2 + fx * w, h / 2 + fy * h)
          .scale(k)
          .translate(-cx, -cy);
        const data = FLEET.filter(v => pos[v.id]).map(v => {
          const [x, y] = t.apply(proj([pos[v.id].lon, pos[v.id].lat]));
          return { v, x, y };
        });
        // every vessel must stay comfortably on screen
        if (data.some(d => d.x < 30 || d.x > w - 30 || d.y < 30 || d.y > h - 30))
          continue;
        const cards = sizes.map(c => ({ ...c, d: data.find(d => d.v === c.v) }));
        // zooming out costs a little, so a closer view wins when it's nearly as good
        const s = placeCards(cards, data, w, h, landFor(t)).score + (1 - z) * 100000;
        if (!best || s < best.s) best = { s, t };
      }
  return best ? best.t : base;
}
