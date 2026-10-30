"use strict";

const I18N = {
  en: {
    locale: "en-GB",
    loading: "Loading the twin (about 7 MB)…",
    subtitle: "Inverno · Winter: the city's air, hour by hour",
    tl_avg: (v) => `city average ${v} µg/m³`,
    kicker: (w) => `Digital twin · winter ${w}`,
    mode_daily: "Winter, day by day",
    mode_hourly: "Hour by hour",
    ep_worst_pm10: "Worst PM10 day", ep_deepest_inversion: "Deepest inversion", ep_cleanest: "Cleanest day", ep_typical: "Typical day",
    daily_mean: "daily mean",
    city_avg: "City average",
    pop_weighted: "population-weighted",
    over_lab: "Residents above WHO", over_lab_h: "Residents above WHO*",
    over_sub: (who) => `24-h guideline ${who} µg/m³`,
    over_sub_h: (who) => `24-h guideline ${who} µg/m³ (*one hour, indicative)`,
    lid_title: "The lid over the city",
    lid_label: (z) => `mixing height ${z} m`,
    lid_air: "air the city breathes",
    lid_note_d: (a, b) => `ERA5, daily mean; range ${a}–${b} m`,
    lid_note_h: (c) => `ERA5, this hour; stability class ${c}`,
    centre_median: "median building, centre", centre_p90: "tall building (90th pct.)", mole: "Mole Antonelliana",
    wind_title: "Wind",
    wind_note: "ERA5, 10 m; one value for the city",
    wind_text: (v, from) => `${v} m/s from ${from}`,
    compass: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
    scenario: "Scenario: road traffic",
    scen_on: "Lowers the local road-traffic contribution (within 5 km); the regional background is kept. A scenario, not a forecast.",
    scen_hourly: "Available in day-by-day mode.",
    scen_off: (p) => `Off for ${p}: its local layer is not used in this version (decision 28).`,
    legend_who: "WHO 24 h",
    view_legend: "Legend (L)", view_timeline: "Timeline (T)", view_panel: "Panel (P)", view_clean: "Clean view: map only (H)",
    legend_title: (p, daily) => `${p} · ${daily ? "daily mean" : "hourly"} · µg/m³`,
    legend_note: "Blue: below the WHO 24-h guideline · yellow to dark red: above it",
    l_buildings: "3D buildings (lighter = estimated height)",
    l_air: "Air under the lid (3D)",
    l_ground: "Ground map, 100 m",
    l_stations: "Reference stations",
    l_sites: "Schools & hospitals",
    l_unc: "Uncertainty veil",
    about_btn: "How this twin works →",
    sources_btn: "Data sources and licences →",
    popup_cell: "100 m cell",
    popup_unc: (u) => `kriging uncertainty ${u}`,
    unc_levels: ["low", "medium", "high"],
    st_type: { traffic: "traffic station", background: "background station" },
    st_km: (km) => `${km} km from the centre`,
    st_none: (p) => `This station does not measure ${p}.`,
    st_note: (col) => `<b style="color:#1b2430">black</b> observed · <b style="color:${col}">colour</b> twin with this station left out · grey CAMS alone · dashed amber WHO 24 h.`,
    st_scores: (r0, r1, f0, f1) => `This station: R ${r0} → ${r1}, FAC2 ${f0} → ${f1} (CAMS → twin).`,
    tab_twin: (w) => `Winter ${w} twin`, tab_fc: "Next 24 h forecast",
    fc_winter: (w) => `Winter ${w}`,
    fc_only_no2: "Forecasts are shown for NO₂ only: for PM10 and PM2.5 a simple weather regression did better than TimesFM (see the forecast report).",
    fc_missing: "No forecast for this day at this station: too few observations in the 60 days before.",
    fc_loading: "Loading forecasts…",
    fc_leg: { past: "observed, previous 24 h", obs: "observed", q50: "TimesFM 2.5 median", r40: "40 % range", r80: "80 % range" },
    fc_ticks: ["−24 h", "−12 h", "forecast made", "+12 h", "+24 h"],
    fc_tip: (h, o, m, lo, hi) => `<b>${h}</b><br>observed ${o}<br>median ${m}<br>80 % range ${lo}–${hi} µg/m³`,
    fc_tip_past: (h, o) => `<b>${h}</b><br>observed ${o} µg/m³`,
    fc_hour: (k) => (k < 0 ? `${k} h` : `+${k} h`),
    fc_made: (d) => `Past forecast, checked against what happened: TimesFM 2.5 made it at 01:00 Turin time on ${d}, from the previous 60 days of this station only (no weather input, never trained on Turin).`,
    fc_day: (inside, n, e, p) => `This day: ${inside} of ${n} hours inside the 80 % range; mean error ${e} µg/m³ (repeating yesterday: ${p}).`,
    fc_station: (e, p, m, c, n) => `This station over five winters (${n} forecasts): mean error ${e} µg/m³ vs ${p} repeating yesterday and ${m} for a weather regression given the actual weather; the 80 % range held ${c} % of the time.`,
    load_error: (m) => `Could not load the twin's data (${m}). Run <code>python -m model.export</code>, then serve the <code>web/</code> folder, e.g. <code>python -m http.server -d web</code>.`,
    about_public: (d) => `
      <div class="kicker">About this viewer</div><h2>Torino Air Quality Twin</h2>
      <p><b>Built by ${d.author}</b>, with agentic AI. A 3D digital twin of Turin's winter air: nitrogen dioxide (NO₂) and
      fine particles (PM10, PM2.5) on a 100 m grid, from public data, for winters 2024–25 and 2025–26.</p>
      <h3>What you see</h3>
      <p>In winter a lid of warm air often sits low over the Po Valley, sometimes lower than the 167 m Mole Antonelliana.
      The coloured volume is the air under that lid, coloured by the concentration at ground level. Blue: below the WHO
      24-hour guideline for the pollutant shown; yellow to dark red: above it. The side panel shows the lid against the
      Mole and the wind of that day.</p>
      <h3>This public edition</h3>
      <p>A taste of the twin: four days per winter, chosen by the twin from the data (the worst PM10 day, the deepest
      inversion, the cleanest day and a typical day), as daily means. Press ▶ to play them; drag to turn the city.</p>
      <h3>Good to know</h3>
      <ul>
        <li>Checked against the official reference stations, but not for regulatory use.</li>
        <li>January–February 2026 measurements are preliminary.</li>
        <li>Building heights come from OpenStreetMap where tagged, otherwise from a 100 m estimate (shown lighter).</li>
      </ul>
      <h3>Data</h3>
      <p>EEA air-quality stations · Copernicus CAMS, ERA5 and DEM via Open-Meteo.com · EDGAR and GHSL (European Commission,
      JRC) · © OpenStreetMap contributors · basemap OpenFreeMap © OpenMapTiles · terrain Mapzen / AWS Terrain Tiles.
      Licences and required attributions: <a href="sources.html" target="_blank" rel="noopener">data sources</a>.</p>`,
  },
  it: {
    locale: "it-IT",
    loading: "Caricamento del gemello (circa 7 MB)…",
    subtitle: "Inverno · Winter: l'aria della città, ora per ora",
    tl_avg: (v) => `media cittadina ${v} µg/m³`,
    kicker: (w) => `Gemello digitale · inverno ${w}`,
    mode_daily: "Inverno, giorno per giorno",
    mode_hourly: "Ora per ora",
    ep_worst_pm10: "Giorno peggiore PM10", ep_deepest_inversion: "Inversione più forte", ep_cleanest: "Giorno più pulito", ep_typical: "Giorno tipico",
    daily_mean: "media giornaliera",
    city_avg: "Media cittadina",
    pop_weighted: "pesata sulla popolazione",
    over_lab: "Residenti oltre OMS", over_lab_h: "Residenti oltre OMS*",
    over_sub: (who) => `linea guida 24 h ${who} µg/m³`,
    over_sub_h: (who) => `linea guida 24 h ${who} µg/m³ (*un'ora, indicativo)`,
    lid_title: "Il coperchio sulla città",
    lid_label: (z) => `altezza di rimescolamento ${z} m`,
    lid_air: "l'aria che la città respira",
    lid_note_d: (a, b) => `ERA5, media giornaliera; da ${a} a ${b} m`,
    lid_note_h: (c) => `ERA5, quest'ora; classe di stabilità ${c}`,
    centre_median: "edificio mediano, centro", centre_p90: "edificio alto (90° perc.)", mole: "Mole Antonelliana",
    wind_title: "Vento",
    wind_note: "ERA5, 10 m; un valore per la città",
    wind_text: (v, from) => `${v} m/s da ${from}`,
    compass: ["N", "NE", "E", "SE", "S", "SO", "O", "NO"],
    scenario: "Scenario: traffico stradale",
    scen_on: "Riduce il contributo locale del traffico stradale (entro 5 km); il fondo regionale resta invariato. Uno scenario, non una previsione.",
    scen_hourly: "Disponibile nella modalità giorno per giorno.",
    scen_off: (p) => `Non attivo per ${p}: in questa versione lo strato locale non è usato (decisione 28).`,
    legend_who: "OMS 24 h",
    view_legend: "Legenda (L)", view_timeline: "Linea del tempo (T)", view_panel: "Pannello (P)", view_clean: "Vista pulita: solo mappa (H)",
    legend_title: (p, daily) => `${p} · ${daily ? "media giornaliera" : "oraria"} · µg/m³`,
    legend_note: "Blu: sotto la linea guida OMS 24 h · dal giallo al rosso scuro: sopra",
    l_buildings: "Edifici 3D (più chiari = altezza stimata)",
    l_air: "Aria sotto il coperchio (3D)",
    l_ground: "Mappa al suolo, 100 m",
    l_stations: "Stazioni di riferimento",
    l_sites: "Scuole e ospedali",
    l_unc: "Velo d'incertezza",
    about_btn: "Come funziona il gemello →",
    sources_btn: "Fonti dei dati e licenze →",
    popup_cell: "cella di 100 m",
    popup_unc: (u) => `incertezza del kriging ${u}`,
    unc_levels: ["bassa", "media", "alta"],
    st_type: { traffic: "stazione di traffico", background: "stazione di fondo" },
    st_km: (km) => `a ${km} km dal centro`,
    st_none: (p) => `Questa stazione non misura ${p}.`,
    st_note: (col) => `<b style="color:#1b2430">nero</b> misurato · <b style="color:${col}">colore</b> gemello senza questa stazione · grigio solo CAMS · ambra tratteggiato OMS 24 h.`,
    st_scores: (r0, r1, f0, f1) => `Questa stazione: R ${r0} → ${r1}, FAC2 ${f0} → ${f1} (CAMS → gemello).`,
    tab_twin: (w) => `Gemello inverno ${w}`, tab_fc: "Previsione prossime 24 h",
    fc_winter: (w) => `Inverno ${w}`,
    fc_only_no2: "Le previsioni sono mostrate solo per l'NO₂: per PM10 e PM2.5 una semplice regressione meteo ha fatto meglio di TimesFM (vedi il rapporto sulle previsioni).",
    fc_missing: "Nessuna previsione per questo giorno in questa stazione: troppe poche misure nei 60 giorni precedenti.",
    fc_loading: "Caricamento delle previsioni…",
    fc_leg: { past: "misurato, 24 h precedenti", obs: "misurato", q50: "mediana TimesFM 2.5", r40: "intervallo 40 %", r80: "intervallo 80 %" },
    fc_ticks: ["−24 h", "−12 h", "previsione emessa", "+12 h", "+24 h"],
    fc_tip: (h, o, m, lo, hi) => `<b>${h}</b><br>misurato ${o}<br>mediana ${m}<br>intervallo 80 % ${lo}–${hi} µg/m³`,
    fc_tip_past: (h, o) => `<b>${h}</b><br>misurato ${o} µg/m³`,
    fc_hour: (k) => (k < 0 ? `${k} h` : `+${k} h`),
    fc_made: (d) => `Previsione passata, verificata con i dati reali: TimesFM 2.5 l'ha emessa alle 01:00 ora di Torino del ${d}, usando solo i 60 giorni precedenti di questa stazione (senza dati meteo, mai addestrato su Torino).`,
    fc_day: (inside, n, e, p) => `Questo giorno: ${inside} ore su ${n} dentro l'intervallo 80 %; errore medio ${e} µg/m³ (ripetendo ieri: ${p}).`,
    fc_station: (e, p, m, c, n) => `Questa stazione in cinque inverni (${n} previsioni): errore medio ${e} µg/m³ contro ${p} ripetendo ieri e ${m} per una regressione con il meteo reale; l'intervallo 80 % ha tenuto il ${c} % delle volte.`,
    load_error: (m) => `Impossibile caricare i dati del gemello (${m}). Eseguire <code>python -m model.export</code> e servire la cartella <code>web/</code>, ad es. <code>python -m http.server -d web</code>.`,
    about_public: (d) => `
      <div class="kicker">Informazioni</div><h2>Torino Air Quality Twin</h2>
      <p><b>Realizzato da ${d.author}</b>, con l'IA agentica. Un gemello digitale 3D dell'aria invernale di Torino:
      biossido di azoto (NO₂) e polveri sottili (PM10, PM2.5) su una griglia di 100 m, da dati pubblici, per gli inverni
      2024–25 e 2025–26.</p>
      <h3>Cosa vedi</h3>
      <p>D'inverno uno strato di aria calda si posa spesso basso sulla Pianura Padana, a volte più basso dei 167 m della
      Mole Antonelliana. Il volume colorato è l'aria sotto quel coperchio, colorata secondo la concentrazione al suolo.
      Blu: sotto la linea guida OMS sulle 24 ore per l'inquinante mostrato; dal giallo al rosso scuro: sopra. Il pannello
      mostra il coperchio rispetto alla Mole e il vento di quel giorno.</p>
      <h3>Questa edizione pubblica</h3>
      <p>Un assaggio del gemello: quattro giorni per inverno, scelti dal gemello in base ai dati (il giorno peggiore per il
      PM10, l'inversione più forte, il giorno più pulito e un giorno tipico), come medie giornaliere. Premi ▶ per vederli;
      trascina per ruotare la città.</p>
      <h3>Da sapere</h3>
      <ul>
        <li>Verificato con le stazioni ufficiali di riferimento, ma non per uso normativo.</li>
        <li>Le misure di gennaio–febbraio 2026 sono provvisorie.</li>
        <li>Altezze degli edifici da OpenStreetMap dove presenti, altrimenti da una stima a 100 m (più chiare).</li>
      </ul>
      <h3>Dati</h3>
      <p>Stazioni EEA · Copernicus CAMS, ERA5 e DEM tramite Open-Meteo.com · EDGAR e GHSL (Commissione europea, JRC) ·
      © OpenStreetMap contributors · mappa di base OpenFreeMap © OpenMapTiles · rilievo Mapzen / AWS Terrain Tiles.
      Licenze e attribuzioni richieste: <a href="sources.html" target="_blank" rel="noopener">fonti dei dati</a>.</p>`,
  },
};
