"use strict";

const DATA = "data/";
const LABEL = { NO2: "NO₂", PM10: "PM10", "PM2.5": "PM2.5" };
const DISPLAY_MAX = { NO2: 80, PM10: 120, "PM2.5": 80 };
const BLUES = [[22, 50, 104], [44, 104, 176], [128, 182, 234]];
const REDS = [[253, 226, 140], [249, 146, 64], [222, 56, 42], [140, 22, 38], [72, 10, 28]];
const INK = { ink: "#1b2430", muted: "#6b7480", grid: "#e1e6ec", lid: "#2b7bd3", block: "#a3acb6" };
const MOLE_M = 167.5;
const PROFILE_TOP_M = 200;

const S = {
  meta: null, pol: "NO2", mode: "daily", episode: null, index: 0, scenario: 0, playing: null,
  daily: {}, episodes: {}, traffic: {}, pop: null, popTotal: 0, unc: null,
  stations: [], met: null, sites: [], selected: null, lut: {}, lang: "en", seriesCache: {},
  fc: null, fcBin: null, tab: "twin", fcI: null,
  winters: [], wdir: "",
};
const FC_BLUE = "#2a78d6";

const $ = (id) => document.getElementById(id);
const TOUR = new URLSearchParams(location.search).has("tour");
const L = () => I18N[S.lang];
const fmt = (v, d = 0) => (v == null || !isFinite(v) ? "–"
  : v.toLocaleString(L().locale, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false }));

const get = (f) => fetch(DATA + f, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(f); return r; });

async function load() {
  S.winters = await get("winters.json").then((r) => r.json()).catch(() => [{ id: "", label: "2024–25" }]);
  await loadWinter("");
  S.pop = new Float32Array(await (await get("population.bin")).arrayBuffer());
  S.popTotal = S.pop.reduce((a, b) => a + b, 0);
  S.sites = await get("sites.json").then((r) => r.json()).catch(() => []);
  S.mesh = new Float32Array(await (await get("air_mesh.bin")).arrayBuffer());
  S.fc = await get("forecast_no2.json").then((r) => r.json()).catch(() => null);
}

async function loadWinter(id) {
  const dir = id ? `${id}/` : "";
  const meta = await (await get(dir + "meta.json")).json();
  const bin = async (f) => new Uint8Array(await (await get(dir + f)).arrayBuffer());
  const daily = {}, episodes = {}, traffic = {}, lut = {};
  for (const p of meta.pollutants) {
    const k = p.replace(".", "");
    daily[p] = await bin(`${k}_daily.bin`);
    if (meta.episode_times.length) episodes[p] = await bin(`${k}_episodes.bin`);
    if (meta.local_layer[p] && meta.edition !== "public") traffic[p] = await bin(`${k}_traffic.bin`);
    lut[p] = Float32Array.from({ length: 256 }, (_, i) => meta.scales[p] * (i / 255) ** 2);
  }
  const unc = await bin("uncertainty.bin").catch(() => null);
  const stations = await (await get(dir + "stations.json")).json();
  const met = await (await get(dir + "met.json")).json();
  Object.assign(S, { meta, daily, episodes, traffic, lut, unc, stations, met, wdir: id, seriesCache: {} });
  S.meta.winter = S.meta.winter || "2024–25";
  S.cells = meta.grid.nx * meta.grid.ny;
}

async function switchWinter(id) {
  if (id === S.wdir) return;
  if (S.playing) $("play").click();
  $("when").textContent = L().loading;
  await loadWinter(id);
  map.getSource("stations").setData({ type: "FeatureCollection", features: S.stations.map((s) => ({
    type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: { id: s.id, type: s.type } })) });
  buildEpisodes();
  const worst = S.meta.days.indexOf(S.meta.episodes.worst_pm10);
  S.index = S.mode === "daily" && worst >= 0 ? worst : 0;
  S.fcI = null;
  applyLang();
  resetSlider();
  update();
}


function frameCount() {
  return S.mode === "daily" ? S.meta.days.length : episodeRange().length;
}
function episodeRange() {
  const day = S.meta.episodes[S.episode];
  const idx = [];
  S.meta.episode_times.forEach((t, i) => { if (t.slice(0, 10) === day) idx.push(i); });
  return idx;
}
function frameOffset() {
  return (S.mode === "daily" ? S.index : episodeRange()[S.index]) * S.cells;
}

function field() {
  const lut = S.lut[S.pol], off = frameOffset();
  const src = (S.mode === "daily" ? S.daily : S.episodes)[S.pol];
  const out = new Float32Array(S.cells);
  for (let i = 0; i < S.cells; i++) out[i] = lut[src[off + i]];
  if (S.scenario > 0 && S.mode === "daily" && S.traffic[S.pol]) {
    const t = S.traffic[S.pol], f = S.scenario / 100;
    for (let i = 0; i < S.cells; i++) out[i] = Math.max(0, out[i] - f * lut[t[off + i]]);
  }
  return out;
}

function ramp(stops, t) {
  t = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t)), u = t - i, a = stops[i], b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

function colour(v) {
  const who = S.meta.who_24h[S.pol], top = DISPLAY_MAX[S.pol];
  if (v < who) return [...ramp(BLUES, v / who), 0.42];
  return [...ramp(REDS, (v - who) / (top - who)), 0.62 + 0.25 * Math.min(1, (v - who) / (top - who))];
}

const canvas = document.createElement("canvas");
const veil = document.createElement("canvas");

function paint(values) {
  const { nx, ny } = S.meta.grid;
  canvas.width = nx; canvas.height = ny;
  const g = canvas.getContext("2d"), img = g.createImageData(nx, ny), d = img.data;
  for (let i = 0, j = 0; i < S.cells; i++, j += 4) {
    const [r, gg, b, a] = colour(values[i]);
    d[j] = r; d[j + 1] = gg; d[j + 2] = b; d[j + 3] = 255 * a;
  }
  g.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

function paintVeil() {
  const { nx, ny } = S.meta.grid;
  veil.width = nx; veil.height = ny;
  const g = veil.getContext("2d"), img = g.createImageData(nx, ny);
  if (S.unc) for (let i = 0; i < S.cells; i++) img.data.set([200, 205, 212, 200 * (S.unc[i] / 255) ** 2], i * 4);
  g.putImageData(img, 0, 0);
  return veil.toDataURL();
}


function exposure(values) {
  const who = S.meta.who_24h[S.pol];
  let wsum = 0, over = 0;
  for (let i = 0; i < S.cells; i++) {
    const p = S.pop[i];
    if (!p) continue;
    wsum += p * values[i];
    if (values[i] > who) over += p;
  }
  return { mean: wsum / S.popTotal, overShare: over / S.popTotal, who };
}

function cellAt(lngLat) {
  const [tl, tr, br, bl] = S.meta.grid.corners, { nx, ny } = S.meta.grid;
  const u = (lngLat.lng - (tl[0] + bl[0]) / 2) / ((tr[0] + br[0]) / 2 - (tl[0] + bl[0]) / 2);
  const v = ((tl[1] + tr[1]) / 2 - lngLat.lat) / ((tl[1] + tr[1]) / 2 - (bl[1] + br[1]) / 2);
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return -1;
  return Math.floor(v * ny) * nx + Math.floor(u * nx);
}


let map;

function blur(values, nx, ny, r) {
  const tmp = new Float32Array(values.length), out = new Float32Array(values.length);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    let s = 0, n = 0;
    for (let k = Math.max(0, x - r); k <= Math.min(nx - 1, x + r); k++) { s += values[y * nx + k]; n++; }
    tmp[y * nx + x] = s / n;
  }
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    let s = 0, n = 0;
    for (let k = Math.max(0, y - r); k <= Math.min(ny - 1, y + r); k++) { s += tmp[k * nx + x]; n++; }
    out[y * nx + x] = s / n;
  }
  return out;
}

function pushAir(values) {
  const { nx, ny } = S.meta.grid, { cell, nx: ax, ny: ay } = S.meta.air;
  const smooth = blur(values, nx, ny, 2), node = new Float32Array(ax * ay);
  for (let r = 0; r < ay; r++) for (let c = 0; c < ax; c++) {
    let s = 0;
    for (let i = 0; i < cell; i++) for (let j = 0; j < cell; j++) s += smooth[(r * cell + i) * nx + c * cell + j];
    node[r * ax + c] = s / (cell * cell);
  }
  S.air.setValues(node, (v) => colour(v));
}

function setHaze(mean, who) {
  const k = Math.min(1, Math.max(0, (mean / who - 0.5) / 2.5));
  const mix = (a, b) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",")})`;
  map.setSky({
    "sky-color": "#cfe0ef", "sky-horizon-blend": 0.6,
    "horizon-color": mix([214, 226, 238], [205, 180, 138]), "horizon-fog-blend": 0.5 + 0.4 * k,
    "fog-color": mix([222, 230, 238], [210, 188, 150]), "fog-ground-blend": 0.92 - 0.2 * k,
    "atmosphere-blend": 0.5,
  });
}

async function initMap() {
  map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/positron",
    center: [7.686, 45.071], zoom: 13.3, pitch: 68, bearing: -75, maxPitch: 85,
    ...(TOUR ? { pixelRatio: 2.5, canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
                 interactive: false, fadeDuration: 0 } : {}),
    attributionControl: { compact: window.innerWidth < 760, customAttribution:
      `Twin: ${S.meta.author} · EEA · CAMS, ERA5 (Copernicus) via Open-Meteo.com · EDGAR, GHSL (JRC) · Copernicus DEM · ` +
      `<a href="sources.html" target="_blank" rel="noopener">Sources</a>` },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(viewControl(), "top-right");
  await new Promise((res) => map.on("load", res));
  if (window.innerWidth < 760) document.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");

  map.addSource("dem", {
    type: "raster-dem", encoding: "terrarium", tileSize: 256, maxzoom: 14,
    tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
    attribution: "Terrain: Mapzen / AWS Terrain Tiles",
  });
  map.setTerrain({ source: "dem", exaggeration: 1.0 });
  map.setLight({ anchor: "viewport", color: "#ffffff", intensity: 0.25, position: [1.15, 200, 30] });
  map.addLayer({ id: "hills", type: "hillshade", source: "dem", paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#5b6573", "hillshade-highlight-color": "#ffffff" } },
    firstSymbolLayer());

  const coords = S.meta.grid.corners;
  map.addSource("conc", { type: "image", url: paint(field()), coordinates: coords });
  map.addLayer({ id: "conc", type: "raster", source: "conc", layout: { visibility: "none" }, paint: {
    "raster-opacity": ["interpolate", ["linear"], ["zoom"], 10, 1, 15, 0.6],
    "raster-resampling": "linear", "raster-fade-duration": 0 } }, firstRoadLayer());
  map.addSource("veil", { type: "image", url: paintVeil(), coordinates: coords });
  map.addLayer({ id: "veil", type: "raster", source: "veil", layout: { visibility: "none" }, paint: { "raster-fade-duration": 0 } }, firstSymbolLayer());

  map.addSource("buildings", { type: "geojson", data: DATA + "buildings.json", attribution: "Buildings © OpenStreetMap contributors; heights GHSL" });
  map.addLayer({
    id: "buildings", type: "fill-extrusion", source: "buildings", minzoom: 11.5,
    paint: {
      "fill-extrusion-color": ["case", ["==", ["get", "e"], 1], "#e3e7eb", "#aab3bd"],
      "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": ["get", "b"], "fill-extrusion-opacity": 0.95,
    },
  });

  S.air = makeAirLayer({ mesh: S.mesh, nx: S.meta.air.nx, ny: S.meta.air.ny, ...(TOUR ? { opacity: 0.3 } : {}) });
  map.addLayer(S.air);
  S.airReady = true;

  map.addSource("sites", { type: "geojson", data: { type: "FeatureCollection", features: S.sites.map((s) => ({
    type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: s })) } });
  map.addLayer({ id: "sites", type: "circle", source: "sites", layout: { visibility: "none" },
    paint: { "circle-radius": 3.5, "circle-color": ["match", ["get", "kind"], ["hospital", "clinic"], "#f472b6", "#a3e635"],
      "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 } });

  map.addSource("stations", { type: "geojson", data: { type: "FeatureCollection", features: S.stations.map((s) => ({
    type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: { id: s.id, type: s.type } })) } });
  map.addLayer({ id: "stations", type: "circle", source: "stations",
    paint: { "circle-radius": 7, "circle-color": ["match", ["get", "type"], "traffic", "#ef6a4c", "#5aa9e6"],
      "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.6 } });

  map.on("click", "stations", (e) => {
    const st = S.stations.find((s) => s.id === e.features[0].properties.id);
    if (!st.series) {
      new maplibregl.Popup({ closeButton: false }).setLngLat(e.lngLat)
        .setHTML(`<b>${st.id}</b><br><span style="color:${INK.muted}">${L().st_type[st.type]} · ${L().st_km(st.km)}</span>`).addTo(map);
      return;
    }
    S.selected = st.id; drawChart();
  });
  map.on("mouseenter", "stations", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "stations", () => (map.getCanvas().style.cursor = ""));
  map.on("click", (e) => {
    if (map.queryRenderedFeatures(e.point, { layers: ["stations"] }).length) return;
    const i = cellAt(e.lngLat);
    if (i < 0) return;
    const v = field()[i], u = S.unc ? S.unc[i] / 255 : null, lv = u == null ? null : L().unc_levels[u < 0.4 ? 0 : u < 0.7 ? 1 : 2];
    new maplibregl.Popup({ closeButton: false }).setLngLat(e.lngLat).setHTML(
      `<b>${fmt(v)} µg/m³</b> ${LABEL[S.pol]}<br><span style="color:${INK.muted}">${whenText()} · ${L().popup_cell}${lv ? `<br>${L().popup_unc(lv)}` : ""}</span>`).addTo(map);
  });
}


const VIEW_KEY = "torino-aqt-view";
const ICONS = {
  legend: '<svg viewBox="0 0 20 20"><rect x="2" y="7" width="5.5" height="6" fill="#2c68b0"/><rect x="7.3" y="7" width="5.5" height="6" fill="#f9923f"/><rect x="12.6" y="7" width="5.4" height="6" fill="#8c1626"/></svg>',
  timeline: '<svg viewBox="0 0 20 20"><path d="M3 15h14" stroke="#1b2430" stroke-width="1.6"/><path d="M7 4.5v7l6-3.5z" fill="#2fbf71"/></svg>',
  panel: '<svg viewBox="0 0 20 20"><rect x="2.5" y="3.5" width="15" height="13" rx="2" fill="none" stroke="#1b2430" stroke-width="1.5"/><rect x="2.5" y="3.5" width="6" height="13" rx="2" fill="#1b2430"/></svg>',
  clean: '<svg viewBox="0 0 20 20"><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" fill="none" stroke="#1b2430" stroke-width="1.5"/><circle cx="10" cy="10" r="2.6" fill="#1b2430"/></svg>',
};

function loadView() {
  const v = { legend: true, timeline: true, panel: true, clean: false };
  try { Object.assign(v, JSON.parse(localStorage.getItem(VIEW_KEY) || "{}")); } catch (e) { /* storage blocked */ }
  return v;
}

function applyView() {
  const v = S.view;
  $("map-legend").classList.toggle("hidden", !v.legend);
  $("timeline").classList.toggle("hidden", !v.timeline);
  $("panel").classList.toggle("hidden", !v.panel);
  document.body.classList.toggle("clean", v.clean);
  document.querySelectorAll(".view-ctrl button").forEach((b) => {
    const k = b.dataset.view;
    b.classList.toggle("off", k !== "clean" && !v[k]);
    b.classList.toggle("on-clean", k === "clean" && v.clean);
    b.setAttribute("aria-pressed", String(k === "clean" ? v.clean : v[k]));
    b.title = L()[`view_${k}`];
    b.setAttribute("aria-label", L()[`view_${k}`]);
  });
  if (v.timeline) drawSpark();
  try { localStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch (e) { /* storage blocked */ }
}

function toggleView(k) {
  if (k === "clean") S.view.clean = !S.view.clean;
  else { S.view[k] = !S.view[k]; S.view.clean = false; }
  applyView();
}

function viewControl() {
  return {
    onAdd() {
      const el = document.createElement("div");
      el.className = "maplibregl-ctrl maplibregl-ctrl-group view-ctrl";
      el.innerHTML = ["legend", "timeline", "panel", "clean"]
        .map((k) => `<button type="button" data-view="${k}">${ICONS[k]}</button>`).join("");
      el.onclick = (e) => { const b = e.target.closest("button"); if (b) toggleView(b.dataset.view); };
      return el;
    },
    onRemove() {},
  };
}

function firstRoadLayer() {
  const l = map.getStyle().layers.find((x) => x["source-layer"] === "transportation");
  return l ? l.id : firstSymbolLayer();
}

function firstSymbolLayer() {
  const l = map.getStyle().layers.find((x) => x.type === "symbol");
  return l ? l.id : undefined;
}


function whenText() {
  if (S.mode === "daily") {
    const day = S.meta.days[S.index], d = new Date(day + "T12:00:00");
    const tag = S.meta.day_labels && S.meta.day_labels[day] ? ` · ${L()[`ep_${S.meta.day_labels[day]}`]}` : "";
    return d.toLocaleDateString(L().locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) + ` · ${L().daily_mean}${tag}`;
  }
  const t = S.meta.episode_times[episodeRange()[S.index]];
  const hh = t.slice(11, 13);
  return new Date(t).toLocaleDateString(L().locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Etc/GMT-1" }) +
    ` · ${hh}:00–${String((+hh + 1) % 24).padStart(2, "0")}:00 (UTC+1)`;
}

function metNow() {
  if (S.mode === "daily") {
    const m = S.met.daily, i = S.index;
    return { zi: m.zi[i], note: L().lid_note_d(fmt(m.zi_min[i]), fmt(m.zi_max[i])), wind: m.wind[i], from: m.from[i] };
  }
  const m = S.met.hourly, i = episodeRange()[S.index];
  return { zi: m.zi[i], note: L().lid_note_h(m.cls[i]), wind: m.wind[i], from: m.wind_from[i] };
}

function drawProfile(zi, note) {
  const W = 200, G = 150, top = PROFILE_TOP_M, k = (G - 8) / top;
  const Y = (z) => G - k * Math.min(z, top);
  const bc = S.meta.buildings_centre, x0 = 30;
  let s = "";
  for (const z of [50, 100, 150, 200]) s += `<line x1="${x0}" x2="${W}" y1="${Y(z)}" y2="${Y(z)}" stroke="${INK.grid}"/><text x="${x0 - 3}" y="${Y(z) + 3}" fill="${INK.muted}" font-size="8" text-anchor="end">${z}</text>`;
  s += `<text x="${x0 - 3}" y="${G + 3}" fill="${INK.muted}" font-size="8" text-anchor="end">0 m</text>`;
  const zz = Math.max(2, zi || 2);
  s += `<rect x="${x0}" y="${Y(zz)}" width="${W - x0}" height="${G - Y(zz)}" fill="${INK.lid}" fill-opacity="0.15"/>`;
  for (let i = 0; i < 8; i++) {
    const h = i % 3 === 1 ? bc.p90_m : bc.median_m, w = 10 * k;
    s += `<rect x="${x0 + 4 + i * (w + 1.5)}" y="${Y(h)}" width="${w}" height="${G - Y(h)}" fill="${INK.block}"/>`;
  }
  const mx = 150;
  for (const [w, t, b] of bc.mole || []) {
    s += `<rect x="${mx - (w * k) / 2}" y="${Y(t)}" width="${Math.max(0.6, w * k)}" height="${Y(b) - Y(t)}" fill="${INK.block}"/>`;
  }
  s += `<text x="${mx}" y="${Y(MOLE_M) - 3}" fill="${INK.muted}" font-size="7.5" text-anchor="middle">${L().mole} ${MOLE_M} m</text>`;
  s += `<line x1="${x0}" x2="${W}" y1="${G}" y2="${G}" stroke="${INK.muted}"/>`;
  s += `<line x1="${x0}" x2="${W}" y1="${Y(zz)}" y2="${Y(zz)}" stroke="${INK.lid}" stroke-width="2"/>`;
  const over = zi > top, ly = over ? 18 : Y(zz) - 4;
  s += `<text x="${x0 + 4}" y="${ly}" fill="${INK.lid}" font-size="9" font-weight="700">${over ? "↑ " : ""}${L().lid_label(fmt(zi))}</text>`;
  s += `<text x="${x0 + 4}" y="${G + 12}" fill="${INK.muted}" font-size="7.5">${L().centre_median}: ${bc.median_m} m</text>`;
  $("profile").innerHTML = s;
  $("lid-note").textContent = note;
}

function seriesFor() {
  const key = `${S.pol}|${S.mode}|${S.mode === "daily" ? "" : S.episode}`;
  if (S.seriesCache[key]) return S.seriesCache[key];
  const frames = S.mode === "daily" ? S.meta.days.map((_, i) => i) : episodeRange();
  const src = (S.mode === "daily" ? S.daily : S.episodes)[S.pol], lut = S.lut[S.pol];
  const out = frames.map((f) => {
    let sum = 0;
    const off = f * S.cells;
    for (let i = 0; i < S.cells; i++) if (S.pop[i]) sum += S.pop[i] * lut[src[off + i]];
    return sum / S.popTotal;
  });
  return (S.seriesCache[key] = out);
}

function drawSpark() {
  const c = $("spark"), box = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  c.width = Math.max(1, Math.round(box.width * dpr));
  c.height = Math.max(1, Math.round(box.height * dpr));
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vals = seriesFor(), n = vals.length, W = box.width, H = box.height - 12;
  const who = S.meta.who_24h[S.pol], top = Math.max(...vals, who) * 1.1, bw = W / n;
  vals.forEach((v, i) => {
    const [r, gg, b] = colour(v), h = (H * v) / top;
    g.fillStyle = `rgb(${r},${gg},${b})`;
    g.globalAlpha = i === S.index ? 1 : 0.75;
    g.fillRect(i * bw + 0.5, H - h, Math.max(1, bw - 1), h);
  });
  g.globalAlpha = 1;
  g.strokeStyle = "#d97706";
  g.setLineDash([4, 3]);
  g.beginPath(); g.moveTo(0, H - (H * who) / top); g.lineTo(W, H - (H * who) / top); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = INK.ink;
  g.lineWidth = 2;
  g.beginPath(); g.moveTo((S.index + 0.5) * bw, 0); g.lineTo((S.index + 0.5) * bw, H); g.stroke();
}

function drawCompass(wind, from) {
  const to = (from + 180) % 360, len = 14 + 9 * Math.min(3, wind || 0), r = (a) => (a * Math.PI) / 180;
  const dx = Math.sin(r(to)), dy = -Math.cos(r(to));
  const x1 = 50 - dx * len, y1 = 50 - dy * len, x2 = 50 + dx * len, y2 = 50 + dy * len;
  const hx = x2 - dx * 9, hy = y2 - dy * 9, px = -dy * 6, py = dx * 6;
  $("compass").innerHTML =
    `<circle cx="50" cy="50" r="44" fill="none" stroke="${INK.grid}" stroke-width="2"/>` +
    L().compass.filter((_, k) => k % 2 === 0).map((c, k) => {
      const a = r(k * 90), x = 50 + 37 * Math.sin(a), y = 50 - 37 * Math.cos(a) + 3.5;
      return `<text x="${x}" y="${y}" fill="${INK.muted}" font-size="10" text-anchor="middle">${c}</text>`;
    }).join("") +
    `<line x1="${x1}" y1="${y1}" x2="${hx}" y2="${hy}" stroke="${INK.ink}" stroke-width="3.5" stroke-linecap="round"/>` +
    `<path d="M${x2},${y2} L${hx + px},${hy + py} L${hx - px},${hy - py} Z" fill="${INK.ink}"/>`;
  $("wind-text").textContent = L().wind_text(fmt(wind, 1), L().compass[Math.round(from / 45) % 8]);
}

function drawLegend() {
  const c = $("legend"), g = c.getContext("2d"), top = DISPLAY_MAX[S.pol], who = S.meta.who_24h[S.pol];
  for (let x = 0; x < c.width; x++) {
    const [r, gg, b] = colour((x / c.width) * top);
    g.fillStyle = `rgb(${r},${gg},${b})`; g.fillRect(x, 0, 1, c.height);
  }
  const ticks = [0, top / 4, top / 2, (3 * top) / 4, top].map((v) => `<span style="left:${(100 * v) / top}%">${v}</span>`).join("");
  $("ticks").innerHTML = ticks + `<span class="who" style="left:${(100 * who) / top}%">▲ ${L().legend_who} ${who}</span>`;
  $("legend-title").textContent = L().legend_title(LABEL[S.pol], S.mode === "daily");
}


function update(first = false) {
  const values = field();
  if (!first) map.getSource("conc").updateImage({ url: paint(values), coordinates: S.meta.grid.corners });
  const ex = exposure(values), daily = S.mode === "daily";
  $("k-mean").textContent = `${fmt(ex.mean)} µg/m³`;
  $("k-over").textContent = `${fmt(100 * ex.overShare)} %`;
  $("k-over-lab").textContent = daily ? L().over_lab : L().over_lab_h;
  $("k-over-sub").textContent = daily ? L().over_sub(ex.who) : L().over_sub_h(ex.who);
  const m = metNow();
  drawProfile(m.zi, m.note);
  drawCompass(m.wind, m.from);
  $("when").textContent = whenText();
  $("tl-value").textContent = L().tl_avg(fmt(ex.mean));
  drawSpark();

  S.air.setMixingHeight(Math.max(10, m.zi || 10));
  pushAir(values);
  setHaze(ex.mean, ex.who);

  const scenarioOk = daily && !!S.traffic[S.pol];
  $("scenario").disabled = !scenarioOk;
  $("scen-note").textContent = scenarioOk ? L().scen_on : !daily ? L().scen_hourly : L().scen_off(LABEL[S.pol]);
  drawLegend();
  if (S.selected) drawChart();
}

function drawChart() {
  const st = S.stations.find((s) => s.id === S.selected);
  const svg = $("chart-svg");
  $("chart").classList.remove("hidden");
  $("chart-title").innerHTML = `${st.id} <span class="muted">· ${L().st_type[st.type]} · ${L().st_km(st.km)}</span>`;
  $("chart-tabs").classList.toggle("hidden", !S.fc);
  [...$("chart-tabs").children].forEach((b) => b.classList.toggle("on", b.dataset.tab === S.tab));
  $("fc-controls").classList.add("hidden");
  $("chart-legend").innerHTML = "";
  $("chart-tip").classList.add("hidden");
  svg.onmousemove = svg.onmouseleave = null;
  if (S.tab === "fc" && S.fc) drawForecast(st);
  else drawTwinChart(st);
}

function drawTwinChart(st) {
  const svg = $("chart-svg");
  svg.setAttribute("viewBox", "0 0 560 200");
  const ser = st.series[S.pol];
  if (!ser) {
    svg.innerHTML = "";
    $("chart-note").textContent = L().st_none(LABEL[S.pol]);
    return;
  }
  const W = 560, H = 200, Lm = 34, R = 8, T = 10, B = 22, n = S.meta.days.length;
  const all = [...ser.obs, ...ser.cams, ...ser.twin].filter((v) => v != null);
  const ymax = Math.max(...all) * 1.08;
  const X = (i) => Lm + ((W - Lm - R) * i) / (n - 1), Y = (v) => H - B - ((H - T - B) * v) / ymax;
  const path = (arr) => arr.map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`))
    .reduce((acc, p) => { if (p == null) acc.push([]); else acc[acc.length - 1].push(p); return acc; }, [[]])
    .filter((s) => s.length > 1).map((s) => `M${s.join("L")}`).join("");
  const who = S.meta.who_24h[S.pol], col = st.type === "traffic" ? "#ef6a4c" : "#5aa9e6";
  let grid = "";
  for (const v of [0, ymax / 2, ymax].map((x) => Math.round(x))) grid += `<line x1="${Lm}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${INK.grid}"/><text x="${Lm - 4}" y="${Y(v) + 4}" fill="${INK.muted}" font-size="10" text-anchor="end">${v}</text>`;
  for (const [d, i] of S.meta.days.map((d, i) => [d, i]).filter(([d]) => d.endsWith("-01")))
    grid += `<text x="${X(i)}" y="${H - 6}" fill="${INK.muted}" font-size="10">${new Date(d).toLocaleDateString(L().locale, { month: "short" })}</text>`;
  const cur = S.mode === "daily" ? S.index : S.meta.days.indexOf(S.meta.episodes[S.episode]);
  svg.innerHTML = grid +
    `<line x1="${Lm}" x2="${W - R}" y1="${Y(who)}" y2="${Y(who)}" stroke="#d97706" stroke-dasharray="4 3"/>` +
    `<line x1="${X(cur)}" x2="${X(cur)}" y1="${T}" y2="${H - B}" stroke="${INK.ink}" stroke-opacity="0.35"/>` +
    `<path d="${path(ser.cams)}" fill="none" stroke="${INK.muted}" stroke-dasharray="3 3" stroke-width="1.2"/>` +
    `<path d="${path(ser.twin)}" fill="none" stroke="${col}" stroke-width="1.8"/>` +
    `<path d="${path(ser.obs)}" fill="none" stroke="${INK.ink}" stroke-width="1.4"/>`;
  const sc = st.scores[S.pol];
  $("chart-note").innerHTML = L().st_note(col) + "<br>" +
    L().st_scores(fmt(sc["CAMS"].R, 2), fmt(sc["model + kriging"].R, 2), fmt(sc["CAMS"].FAC2, 2), fmt(sc["model + kriging"].FAC2, 2));
}


function fcWinterOf(iso) {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7);
  const w = m >= 9 ? y : y - 1;
  return `${w}–${String((w + 1) % 100).padStart(2, "0")}`;
}

function fcValue(oi, si, row, h) {
  const v = S.fcBin[((oi * S.fc.stations.length + si) * S.fc.rows.length + row) * 24 + h];
  return v === S.fc.missing ? null : v * S.fc.scale;
}

function fcDefaultIndex() {
  const cur = S.mode === "daily" ? S.meta.days[S.index] : S.meta.episodes[S.episode], w = S.meta.winter;
  let best = S.fc.origins.findIndex((o) => fcWinterOf(o) === w);
  S.fc.origins.forEach((o, i) => { if (o.slice(0, 10) <= cur && fcWinterOf(o) === w) best = i; });
  return Math.max(best, 0);
}

async function ensureForecast() {
  if (S.fcBin) return;
  const r = await fetch(DATA + "forecast_no2.bin", { cache: "no-cache" });
  if (!r.ok) throw new Error("forecast_no2.bin");
  S.fcBin = new Uint16Array(await r.arrayBuffer());
}

function drawForecast(st) {
  const svg = $("chart-svg"), note = $("chart-note"), Lx = L();
  if (S.pol !== "NO2") { svg.innerHTML = ""; note.textContent = Lx.fc_only_no2; return; }
  if (!S.fcBin) {
    svg.innerHTML = ""; note.textContent = Lx.fc_loading;
    ensureForecast().then(drawChart).catch(() => { note.textContent = Lx.load_error("forecast_no2.bin"); });
    return;
  }
  if (S.fcI == null) S.fcI = fcDefaultIndex();
  const oi = S.fcI, origin = S.fc.origins[oi], si = S.fc.stations.indexOf(st.id);
  $("fc-controls").classList.remove("hidden");
  const winters = S.fc.winters, wNow = fcWinterOf(origin);
  $("fc-winter").innerHTML = winters.map((w) => `<option value="${w}" ${w === wNow ? "selected" : ""}>${Lx.fc_winter(w)}</option>`).join("");
  const day = new Date(origin);
  $("fc-date").textContent = day.toLocaleDateString(Lx.locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome" });
  $("fc-prev").disabled = oi === 0;
  $("fc-next").disabled = oi === S.fc.origins.length - 1;
  const lg = Lx.fc_leg;
  $("chart-legend").innerHTML =
    `<span><i style="border-color:${INK.muted}"></i>${lg.past}</span><span><i style="border-color:${INK.ink}"></i>${lg.obs}</span>` +
    `<span><i style="border-color:${FC_BLUE}"></i>${lg.q50}</span>` +
    `<span><i class="band" style="background:${FC_BLUE};opacity:.38"></i>${lg.r40}</span><span><i class="band" style="background:${FC_BLUE};opacity:.16"></i>${lg.r80}</span>`;
  if (si < 0 || fcValue(oi, si, 3, 0) == null) { svg.innerHTML = ""; note.textContent = Lx.fc_missing; return; }

  const row = (r) => Array.from({ length: 24 }, (_, h) => fcValue(oi, si, r, h));
  const [past, q10, q30, q50, q70, q90, obs] = [0, 1, 2, 3, 4, 5, 6].map(row);
  const W = 560, H = 210, Lm = 34, R = 10, T = 10, B = 24;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const all = [...past, ...q90, ...obs].filter((v) => v != null);
  const ymax = Math.max(20, ...all) * 1.08;
  const X = (k) => Lm + ((W - Lm - R) * (k + 23)) / 47, Y = (v) => H - B - ((H - T - B) * v) / ymax;
  const line = (arr, k0) => arr.map((v, i) => (v == null ? null : `${X(k0 + i).toFixed(1)},${Y(v).toFixed(1)}`))
    .reduce((acc, p) => { if (p == null) acc.push([]); else acc[acc.length - 1].push(p); return acc; }, [[]])
    .filter((s) => s.length > 1).map((s) => `M${s.join("L")}`).join("");
  const band = (lo, hi) => `M${lo.map((v, i) => `${X(1 + i).toFixed(1)},${Y(v).toFixed(1)}`).join("L")}` +
    `L${hi.map((v, i) => [X(1 + i).toFixed(1), Y(v).toFixed(1)]).reverse().map((p) => p.join(",")).join("L")}Z`;
  let g = "";
  const step = ymax > 120 ? 40 : ymax > 60 ? 20 : 10;
  for (let v = 0; v <= ymax; v += step)
    g += `<line x1="${Lm}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${INK.grid}"/><text x="${Lm - 4}" y="${Y(v) + 4}" fill="${INK.muted}" font-size="10" text-anchor="end">${v}</text>`;
  Lx.fc_ticks.forEach((t, i) => {
    const k = -23 + i * 11.75, anchor = i === 0 ? "start" : i === 4 ? "end" : "middle";
    g += `<text x="${X(k)}" y="${H - 7}" fill="${i === 2 ? INK.ink : INK.muted}" font-size="10" text-anchor="${anchor}">${t}</text>`;
  });
  svg.innerHTML = g +
    `<line x1="${X(0.5)}" x2="${X(0.5)}" y1="${T}" y2="${H - B}" stroke="${INK.ink}" stroke-opacity="0.3"/>` +
    `<path d="${band(q10, q90)}" fill="${FC_BLUE}" fill-opacity="0.13"/>` +
    `<path d="${band(q30, q70)}" fill="${FC_BLUE}" fill-opacity="0.24"/>` +
    `<path d="${line(past, -23)}" fill="none" stroke="${INK.muted}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path d="${line(q50, 1)}" fill="none" stroke="${FC_BLUE}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="${line(obs, 1)}" fill="none" stroke="${INK.ink}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<line id="fc-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="${INK.ink}" stroke-opacity="0.45" visibility="hidden"/>` +
    `<circle id="fc-dot" r="4" fill="${FC_BLUE}" stroke="#fff" stroke-width="2" visibility="hidden"/>`;

  const tip = $("chart-tip");
  const clock = (k) => new Date(Date.parse(origin) + (k - 1) * 3600e3).toLocaleString(Lx.locale,
    { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  svg.onmousemove = (e) => {
    const r = svg.getBoundingClientRect();
    const xv = ((e.clientX - r.left) * W) / r.width;
    const k = Math.max(-23, Math.min(24, Math.round(((xv - Lm) * 47) / (W - Lm - R) - 23)));
    const cross = $("fc-cross"), dot = $("fc-dot");
    cross.setAttribute("x1", X(k)); cross.setAttribute("x2", X(k)); cross.setAttribute("visibility", "visible");
    const head = `${clock(k)} · ${Lx.fc_hour(k)}`;
    let html, yDot;
    if (k <= 0) { const v = past[k + 23]; html = Lx.fc_tip_past(head, fmt(v)); yDot = v; }
    else { const h = k - 1; html = Lx.fc_tip(head, fmt(obs[h]), fmt(q50[h]), fmt(q10[h]), fmt(q90[h])); yDot = q50[h]; }
    if (yDot != null) { dot.setAttribute("cx", X(k)); dot.setAttribute("cy", Y(yDot)); dot.setAttribute("visibility", "visible"); }
    else dot.setAttribute("visibility", "hidden");
    dot.setAttribute("fill", k <= 0 ? INK.muted : FC_BLUE);
    tip.innerHTML = html;
    tip.classList.remove("hidden");
    const px = (X(k) * r.width) / W;
    tip.style.left = `${px > r.width / 2 ? px - tip.offsetWidth - 10 : px + 10}px`;
  };
  svg.onmouseleave = () => {
    tip.classList.add("hidden");
    $("fc-cross")?.setAttribute("visibility", "hidden");
    $("fc-dot")?.setAttribute("visibility", "hidden");
  };

  let inside = 0, n = 0, e = 0, ep = 0, np = 0;
  for (let h = 0; h < 24; h++) {
    if (obs[h] == null) continue;
    n++; e += Math.abs(obs[h] - q50[h]);
    if (obs[h] >= q10[h] && obs[h] <= q90[h]) inside++;
    if (past[h] != null) { ep += Math.abs(obs[h] - past[h]); np++; }
  }
  const sm = S.fc.summary[st.id];
  const made = day.toLocaleDateString(Lx.locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
  note.innerHTML = Lx.fc_made(made) + "<br>" +
    (n ? Lx.fc_day(inside, n, fmt(e / n, 1), np ? fmt(ep / np, 1) : "–") + "<br>" : "") +
    (sm ? Lx.fc_station(fmt(sm.mae["TimesFM 2.5"], 1), fmt(sm.mae.persistence, 1), fmt(sm.mae["MOS (ERA5 reanalysis) †"], 1), fmt(sm.cov80), sm.n) : "");
}

function about() {
  const v = S.meta.validation;
  const table = (heads) => `<table><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr>` + S.meta.pollutants.map((p) =>
    `<tr><td>${LABEL[p]}</td><td>${fmt(v[p]["CAMS"].NMSE, 3)}</td><td>${fmt(v[p]["model + kriging"].NMSE, 3)}</td>` +
    `<td>${fmt(v[p]["CAMS"].R, 2)}</td><td>${fmt(v[p]["model + kriging"].R, 2)}</td><td>${fmt(100 * (1 - v[p]["model + kriging"].NMSE / v[p]["CAMS"].NMSE))} %</td></tr>`).join("") + "</table>";
  const off = S.meta.pollutants.filter((p) => !S.meta.local_layer[p]).map((p) => LABEL[p]).join(S.lang === "it" ? " e " : " and ");
  $("about-body").innerHTML = S.meta.edition === "public" ? L().about_public({ author: S.meta.author })
    : L().about({ author: S.meta.author, period: S.meta.period, off, table });
}


function applyLang() {
  document.documentElement.lang = S.lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = L()[el.dataset.i18n]; });
  $("kicker").textContent = L().kicker(S.meta.winter);
  document.querySelector('#chart-tabs [data-tab="twin"]').textContent = L().tab_twin(S.meta.winter);
  [...$("langs").children].forEach((b) => b.classList.toggle("on", b.dataset.lang === S.lang));
  if (S.view) applyView();
  [...$("episodes").children].forEach((b) => { b.textContent = L()[`ep_${b.dataset.e}`] || b.dataset.e; });
  if (!$("about").classList.contains("hidden")) about();
}

function buildEpisodes() {
  S.episode = Object.keys(S.meta.episodes)[0];
  $("episodes").innerHTML = Object.keys(S.meta.episodes).map((k) =>
    `<button data-e="${k}" class="${k === S.episode ? "on" : ""}" title="${S.meta.episodes[k]}"></button>`).join("");
}

function buildControls() {
  const pub = S.meta.edition === "public";
  $("modes").classList.toggle("hidden", !S.meta.episode_times.length);
  $("scenario-box").classList.toggle("hidden", pub);
  $("pollutants").innerHTML = S.meta.pollutants.map((p) => `<button data-p="${p}" class="${p === S.pol ? "on" : ""}">${LABEL[p]}</button>`).join("");
  $("pollutants").onclick = (e) => {
    const p = e.target.dataset.p; if (!p) return;
    S.pol = p; [...$("pollutants").children].forEach((b) => b.classList.toggle("on", b.dataset.p === p)); update();
  };
  buildEpisodes();
  $("winter-sec").classList.toggle("hidden", S.winters.length < 2);
  $("winters").innerHTML = S.winters.map((w) => `<button data-w="${w.id}" class="${w.id === S.wdir ? "on" : ""}">${w.label}</button>`).join("");
  $("winters").onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    [...$("winters").children].forEach((x) => x.classList.toggle("on", x === b));
    await switchWinter(b.dataset.w);
  };
  $("episodes").onclick = (e) => {
    const k = e.target.dataset.e; if (!k) return;
    S.episode = k; S.index = 0; [...$("episodes").children].forEach((b) => b.classList.toggle("on", b.dataset.e === k)); resetSlider(); update();
  };
  $("modes").onclick = (e) => {
    const m = e.target.dataset.mode; if (!m) return;
    S.mode = m; S.index = 0; [...$("modes").children].forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
    $("episodes").classList.toggle("hidden", m !== "episode"); resetSlider(); update();
  };
  $("langs").onclick = (e) => {
    const l = e.target.dataset.lang; if (!l) return;
    S.lang = l; applyLang(); update();
  };
  $("slider").oninput = (e) => { S.index = +e.target.value; update(); };
  $("scenario").oninput = (e) => { S.scenario = +e.target.value; $("scen-val").textContent = `−${S.scenario} %`; update(); };
  $("play").onclick = () => {
    if (S.playing) { clearInterval(S.playing); S.playing = null; $("play").textContent = "▶"; return; }
    $("play").textContent = "❚❚";
    S.playing = setInterval(() => { S.index = (S.index + 1) % frameCount(); $("slider").value = S.index; update(); }, S.mode === "daily" ? (S.meta.edition === "public" ? 1600 : 450) : 600);
  };
  $("collapse").onclick = () => {
    const c = $("panel").classList.toggle("collapsed");
    $("collapse").textContent = c ? "+" : "–";
    $("collapse").setAttribute("aria-label", c ? "Expand panel" : "Collapse panel");
  };
  const toggle = (id, layers) => ($(id).onchange = (e) => layers.forEach((l) => map.setLayoutProperty(l, "visibility", e.target.checked ? "visible" : "none")));
  toggle("l-buildings", ["buildings"]); toggle("l-air", ["air3d"]); toggle("l-ground", ["conc"]);
  toggle("l-stations", ["stations"]); toggle("l-sites", ["sites"]); toggle("l-unc", ["veil"]);
  $("l-sites").closest("label").classList.toggle("hidden", !S.sites.length);
  $("l-unc").closest("label").classList.toggle("hidden", !S.unc);
  $("chart-close").onclick = () => { S.selected = null; $("chart").classList.add("hidden"); };
  $("chart-tabs").onclick = (e) => {
    const t = e.target.dataset.tab; if (!t) return;
    S.tab = t; if (t === "fc") S.fcI = null;
    drawChart();
  };
  $("fc-prev").onclick = () => { S.fcI = Math.max(0, S.fcI - 1); drawChart(); };
  $("fc-next").onclick = () => { S.fcI = Math.min(S.fc.origins.length - 1, S.fcI + 1); drawChart(); };
  $("fc-winter").onchange = (e) => { S.fcI = S.fc.origins.findIndex((o) => fcWinterOf(o) === e.target.value); drawChart(); };
  document.querySelectorAll("[data-hide]").forEach((b) => (b.onclick = () => toggleView(b.dataset.hide)));
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = { l: "legend", t: "timeline", p: "panel", h: "clean" }[e.key.toLowerCase()];
    if (k) toggleView(k);
  });
  $("about-btn").onclick = () => { about(); $("about").classList.remove("hidden"); };
  $("about-close").onclick = () => $("about").classList.add("hidden");
  $("about").onclick = (e) => { if (e.target.id === "about") $("about").classList.add("hidden"); };
}

function resetSlider() {
  $("slider").max = frameCount() - 1;
  $("slider").value = S.index;
}

(async function main() {
  S.lang = (navigator.language || "en").toLowerCase().startsWith("it") ? "it" : "en";
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = L()[el.dataset.i18n]; });
  $("when").textContent = L().loading;
  try {
    await load();
  } catch (err) {
    document.body.insertAdjacentHTML("beforeend", `<div style="position:absolute;top:40%;width:100%;text-align:center">${L().load_error(err.message)}</div>`);
    return;
  }
  const worst = S.meta.days.indexOf(S.meta.episodes.worst_pm10);
  S.index = worst >= 0 ? worst : 0;
  await initMap();
  window.twin = { map, S };
  S.view = loadView();
  buildControls();
  applyLang();
  if (window.innerWidth < 760) $("collapse").click();
  resetSlider();
  update(true);
  window.addEventListener("resize", drawSpark);
  if (TOUR) {
    const wide = new URLSearchParams(location.search).get("tour") === "wide";
    document.body.classList.add("tour", ...(wide ? ["tour-wide"] : []));
    const s = document.createElement("script");
    s.src = wide ? "tour-wide.js?v=10" : "tour.js?v=5";
    document.head.appendChild(s);
  }
})();
