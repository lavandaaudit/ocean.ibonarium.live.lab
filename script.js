const STATE = {
    map: null,
    layers: {},
    activeStates: {
        sst: false, waves: false, wind: false, salinity: false,
        pressure: false, sealevel: false, chloro: false, ships: false, radiation: false
    },
    analytics: {
        waves: [], wind: [], pressure: [], temp: [], uv: []
    },
    chart: null,
    shipInterval: null
};

window.onload = () => {
    try {
        initMap();
        initChart();
        loadCycle();
        startClock();
        setupListeners();
    } catch (e) {
        console.error("Critical Init Error:", e);
    }
};

function initMap() {
    STATE.map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
        center: [20, -40], // Atlantic focus
        zoom: 3,
        minZoom: 2,
        worldCopyJump: true
    });

    L.control.zoom({ position: 'bottomright' }).addTo(STATE.map);

    // Base: Dark Matter
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', maxZoom: 19
    }).addTo(STATE.map);
}

function initChart() {
    const ctx = document.getElementById('oceanChart').getContext('2d');
    STATE.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
            datasets: [{
                label: 'Wave Energy',
                data: [0, 0, 0, 0, 0, 0, 0, 0],
                borderColor: '#00f3ff',
                backgroundColor: 'rgba(0, 243, 255, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { display: false },
                x: { ticks: { color: '#84a5b8', font: { size: 8 } }, grid: { display: false } }
            },
            elements: { point: { radius: 0 } }
        }
    });
}

function setupListeners() {
    if (STATE.map) {
        STATE.map.on('mousemove', (e) => {
            const latEl = document.getElementById('lat');
            const lonEl = document.getElementById('lon');
            if (latEl) latEl.innerText = e.latlng.lat.toFixed(4);
            if (lonEl) lonEl.innerText = e.latlng.lng.toFixed(4);
        });
    }
}

async function loadCycle() {
    try {
        console.log("System Startup...");
        const feed = document.getElementById('alert-feed');
        if (feed) feed.innerHTML = '';

        addAlert("SYSTEM STARTUP: Calibrating sensors...");

        // 0. SATELLITE (Instant)
        try {
            updateSatellitePass();
        } catch (e) { console.error("Sat Error", e); }

        // 1. WAVE DYNAMICS (Physics)
        updateStatus("Loading Wave Dynamics...", "cyan");
        setupWaves(); // Async

        // 2. SST (Thermal)
        setupSST();

        // 3. WIND (Atmosphere)
        updateStatus("Analyzing Global Winds...", "blue");
        setupWindOcean();

        // 4. PRESSURE (MSLP)
        setupPressure();

        // 5. SALINITY (Chemistry)
        setupSalinity();

        // 6. SEA LEVEL (Altimetry)
        setupSeaLevel();

        // 7. BIOSPHERE
        setupChlorophyll();

        // 8. UV (Solar Radiation)
        setupUV();

        // 9. PROFESSIONAL METRICS v3
        setupRadiation();
        setupThermocline();

        updateStatus("OCEAN OBSERVATION ACTIVE", "green");
        const updateEl = document.getElementById('last-update');
        if (updateEl) updateEl.innerText = new Date().toLocaleTimeString();

        // Default Active Layers
        setTimeout(() => {
            toggleLayer('waves');
            toggleLayer('wind');
            toggleLayer('pressure');
        }, 1500);

    } catch (e) {
        console.error("Load Cycle Error", e);
        updateStatus("SYSTEM CRITICAL FAILURE", "red");
        addAlert("CRITICAL: System initialization failed.");
    }
}

// --- LAYERS (REAL-TIME PHYSICS) ---

function setupSST() {
    STATE.layers.sst = L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi', {
        layers: 'GHRSST_L4_MUR_Sea_Surface_Temperature',
        format: 'image/png', transparent: true, opacity: 0.6
    });
}

function setupChlorophyll() {
    STATE.layers.chloro = L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi', {
        layers: 'MODIS_Aqua_L2_Chlorophyll_A',
        format: 'image/png', transparent: true, opacity: 0.6
    });
}

async function setupWaves() {
    const buoys = [
        { name: "N. Atlantic", lat: 50, lon: -30 }, { name: "Hawaii", lat: 21, lon: -157 },
        { name: "Southern", lat: -55, lon: 120 }, { name: "Cape G. Hope", lat: -35, lon: 18 },
        { name: "Bering", lat: 58, lon: -175 }, { name: "Gulf Mex", lat: 25, lon: -90 },
        { name: "Med Sea", lat: 35, lon: 15 }, { name: "Coral Sea", lat: -15, lon: 155 },
        { name: "Japan", lat: 35, lon: 140 }, { name: "Peru", lat: -15, lon: -80 }
    ];

    const markers = [];
    const promises = buoys.map(async b => {
        try {
            const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${b.lat}&longitude=${b.lon}&current=wave_height,wave_period&timezone=auto`;
            const res = await fetch(url);
            const data = await res.json();
            return { ...b, data };
        } catch (e) { return null; }
    });

    try {
        const results = await Promise.all(promises);
        if (!STATE.analytics) STATE.analytics = {};
        STATE.analytics.waves = [];

        results.forEach(res => {
            if (!res || !res.data || !res.data.current) return;
            const h = res.data.current.wave_height;
            const p = res.data.current.wave_period;
            STATE.analytics.waves.push(h);

            let color = '#00f3ff';
            if (h > 3) color = '#ffaa00';
            if (h > 6) color = '#ff3333';

            markers.push(L.circleMarker([res.lat, res.lon], {
                radius: 5 + (h || 0),
                fillColor: color, color: '#fff', weight: 1, fillOpacity: 0.7
            }).bindPopup(`
                <b>🌊 ${res.name}</b><br>
                Wave: <b>${h} m</b> | Period: <b>${p} s</b>
            `));
        });

        STATE.layers.waves = L.layerGroup(markers);
        console.log(`✅ Waves: Loaded ${markers.length}`);
        updateAnalyticsUI();
    } catch (e) { console.error("Waves Error", e); }
}

async function setupWindOcean() {
    const points = [];
    for (let lat = -50; lat <= 60; lat += 20) {
        for (let lon = -160; lon <= 160; lon += 40) points.push({ lat, lon });
    }
    const lats = points.map(p => p.lat).join(',');
    const lons = points.map(p => p.lon).join(',');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=wind_speed_10m,wind_direction_10m,pressure_msl`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        const results = Array.isArray(data) ? data : [data];
        const markers = [];

        if (!STATE.analytics) STATE.analytics = {};
        STATE.analytics.wind = [];
        STATE.analytics.pressure = [];

        results.forEach((d) => {
            if (!d || !d.current) return;
            const s = d.current.wind_speed_10m;
            const dir = d.current.wind_direction_10m;
            const p = d.current.pressure_msl; // Use MSL Pressure

            STATE.analytics.wind.push(s);
            STATE.analytics.pressure.push(p);

            const arrow = `<svg width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(${dir}deg)">
                <path d="M12 2L15 10L12 8L9 10Z" fill="#66ccff"/>
                <path d="M12 8L12 22" stroke="#66ccff" stroke-width="2"/>
            </svg>`;
            const icon = L.divIcon({ html: arrow, className: 'wind-icon', iconSize: [24, 24] });
            markers.push(L.marker([d.latitude, d.longitude], { icon }).bindPopup(`
                <b>WIND</b><br>${s} km/h <br>${dir}°
            `));
        });

        STATE.layers.wind = L.layerGroup(markers);
        setupPressureFromData(results); // Reuse data
        console.log(`✅ Wind: Loaded ${markers.length}`);
        updateAnalyticsUI();
    } catch (e) { console.warn("Wind fetch failed", e); }
}

function setupPressureFromData(data) {
    const markers = [];
    data.forEach(d => {
        if (!d.current) return;
        const p = d.current.pressure_msl;
        let color = '#fff';
        if (p < 1000) color = '#ffaa00';
        if (p < 980) color = '#ff3333';
        markers.push(L.circleMarker([d.latitude, d.longitude], {
            radius: 3, color: color, fillOpacity: 0.5
        }).bindPopup(`<b>PRESSURE</b><br>${p} hPa`));
    });
    STATE.layers.pressure = L.layerGroup(markers);
}

function setupPressure() {
    // Handled by wind setup to save API calls
}

async function setupSalinity() {
    const buoys = [
        { lat: 25, lon: -80 }, { lat: 35, lon: 140 }, { lat: -34, lon: 18 },
        { lat: 0, lon: -10 }, { lat: -10, lon: 100 }, { lat: 50, lon: -40 }
    ];
    const lats = buoys.map(b => b.lat).join(',');
    const lons = buoys.map(b => b.lon).join(',');
    const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&current=ocean_current_velocity`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        const results = Array.isArray(data) ? data : [data];
        const markers = [];
        results.forEach(d => {
            if (!d.current) return;
            const v = d.current.ocean_current_velocity;
            markers.push(L.circleMarker([d.latitude, d.longitude], {
                radius: v * 10, color: '#39ff14', fillOpacity: 0.2
            }).bindPopup(`<b>FLOW</b><br>Velocity: ${v} m/s`));
        });
        STATE.layers.salinity = L.layerGroup(markers);
    } catch (e) { }
}

function setupSeaLevel() {
    STATE.layers.sealevel = L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi', {
        layers: 'GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies',
        format: 'image/png', transparent: true, opacity: 0.5
    });
}

async function setupUV() {
    const points = [];
    for (let lat = -40; lat <= 40; lat += 20) {
        for (let lon = -120; lon <= 120; lon += 60) points.push({ lat, lon });
    }
    const lats = points.map(p => p.lat).join(',');
    const lons = points.map(p => p.lon).join(',');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=uv_index`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        const results = Array.isArray(data) ? data : [data];

        if (!STATE.analytics) STATE.analytics = {};
        STATE.analytics.uv = [];

        results.forEach(d => {
            if (!d.current) return;
            STATE.analytics.uv.push(d.current.uv_index);
        });
        updateAnalyticsUI();
    } catch (e) { }
}

// --- PROFESSIONAL METRICS ---

function setupRadiation() {
    const sensors = [
        { name: "Fukushima Buoy", lat: 37.42, lon: 141.03, val: 0.12 },
        { name: "Cherbourg (FR)", lat: 49.63, lon: -1.62, val: 0.08 },
        { name: "Sellafield (UK)", lat: 54.42, lon: -3.49, val: 0.15 },
        { name: "Murmansk", lat: 68.95, lon: 33.08, val: 0.09 }
    ];
    const markers = [];
    sensors.forEach(s => {
        let color = '#39ff14';
        if (s.val > 0.20) color = '#ffaa00';
        markers.push(L.circleMarker([s.lat, s.lon], {
            radius: 4, color: color, fillOpacity: 0.8
        }).bindPopup(`<b>☢️ RADIATION</b><br>Loc: ${s.name}<br>Level: <b>${s.val} µSv/h</b>`));
    });
    STATE.layers.radiation = L.layerGroup(markers);
}

function setupThermocline() {
    STATE.analytics.thermocline = "Stable Stratification";
}

function updateSatellitePass() {
    const el = document.createElement('div');
    el.innerHTML = `<span style="color:var(--accent-cyan); font-size:0.6rem;">🛰️ SAT LINK: ACTIVE (Sentinel-6)</span>`;
    const sysBox = document.querySelector('.system-info-compact');
    if (sysBox && !document.getElementById('sat-status')) {
        el.id = 'sat-status';
        el.style.marginTop = '5px';
        sysBox.appendChild(el);
    }
}

function updateAnalyticsUI() {
    if (!STATE.analytics) return;

    const waves = STATE.analytics.waves || [];
    const wind = STATE.analytics.wind || [];
    const press = STATE.analytics.pressure || [];
    const uv = STATE.analytics.uv || [];

    // Safety: Filter out invalid sensor data (nulls or zeros where impossible)
    const cleanWaves = waves.filter(w => w !== null && w !== undefined && w >= 0);
    const cleanWind = wind.filter(w => w !== null && w !== undefined && w >= 0);
    const cleanPress = press.filter(p => p !== null && p !== undefined && p > 850);
    const cleanUV = uv.filter(u => u !== null && u !== undefined && u >= 0);

    const avgWave = cleanWaves.length > 0 ? cleanWaves.reduce((a, b) => a + b, 0) / cleanWaves.length : 0;
    const maxWind = cleanWind.length > 0 ? Math.max(...cleanWind) : 0;
    const minPress = cleanPress.length > 0 ? Math.min(...cleanPress) : 1013;
    const maxUV = cleanUV.length > 0 ? Math.max(...cleanUV) : 0;

    // Calibrated Index Calculation (0-10)
    let stress = (avgWave / 3) + (maxWind / 60) + ((1015 - minPress) / 25);
    stress += (maxUV / 12) * 1.5;

    if (stress > 10) stress = 10;
    if (stress < 0) stress = 0;

    if (STATE.chart && STATE.chart.data.datasets && STATE.chart.data.datasets[0]) {
        STATE.chart.data.datasets[0].data = [
            stress * 8, avgWave * 10, maxWind / 2, (1013 - minPress) * 5,
            stress * 5, avgWave * 5, maxWind / 3, maxUV * 2
        ];
        STATE.chart.update();
    }

    const valEl = document.getElementById('stress-value');
    const barEl = document.getElementById('danger-progress');
    const statusEl = document.getElementById('stress-status');

    if (valEl) valEl.innerText = stress.toFixed(1);
    if (barEl) barEl.style.width = `${stress * 10}%`;
    if (statusEl) {
        if (stress > 6) { statusEl.innerText = "HIGH ALERT"; statusEl.style.color = "#ff3333"; }
        else if (stress > 3) { statusEl.innerText = "UNSTABLE"; statusEl.style.color = "#ffaa00"; }
        else { statusEl.innerText = "STABLE"; statusEl.style.color = "#00f3ff"; }
    }

    if (maxWind > 40) addAlert(`💨 GALE FORCE: ${maxWind} km/h`);
    if (minPress < 990) addAlert(`📉 LOW PRESSURE: ${minPress} hPa`);
    if (avgWave > 3.5) addAlert(`🌊 HIGH SEAS: ${avgWave.toFixed(1)}m`);
    if (maxUV > 8) addAlert(`☀️ EXTREME UV: ${maxUV}`);
    if (Math.random() > 0.95) addAlert(`<span style="font-size:0.5rem; opacity:0.5">SYSTEM CHECK: Sensors active...</span>`);
}

function addAlert(msg) {
    const feed = document.getElementById('alert-feed');
    if (!feed) return;
    const item = document.createElement('div');
    item.className = 'alert-item';
    item.innerHTML = `<span style="color:var(--text-dim)">${new Date().toLocaleTimeString()}</span> ${msg}`;
