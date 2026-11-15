// ====== CONFIGURATION (16x24 FINE GRID = 384 CELLS) ======
const ROWS = 16; // 11.25° latitude per cell
const COLS = 24; // 15° longitude per cell
const TOTAL_FRAMES = 900;
const COLORBAR_FILE = "NDVI_colorbar.png";

// Matches the exact video file in your V2 folder!
const DEFAULT_VIDEOS = [
    "nrt_ndvi_equi_w_dates_2048p30.mp4",
    "nrt_ndvi_equi_w_dates_2048p30.webm",
    "nrt_ndvi_equi_w_dates_1024p30.mp4",
    "nrt_ndvi_equi_2048p30.mp4",
    "ndvi.mp4"
];

const FALLBACK_POSTER = "SNPP_VIIRS.20260606.ndvi_w_snow.oceanblue.png";
const PENTATONIC = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];

const LAT_LABELS = [
    "High Arctic (79°N–90°N)", "Arctic Circle (67°N–79°N)",
    "Northern Boreal (56°N–67°N)", "Southern Boreal (45°N–56°N)",
    "Cool Temperate North (34°N–45°N)", "Warm Temperate North (22°N–34°N)",
    "Northern Sub-Tropics (11°N–22°N)", "Northern Equatorial (0°–11°N)",
    "Southern Equatorial (0°–11°S)", "Southern Sub-Tropics (11°S–22°S)",
    "Warm Temperate South (22°S–34°S)", "Cool Temperate South (34°S–45°S)",
    "Sub-Antarctic (45°S–56°S)", "Southern Ocean (56°S–67°S)",
    "Antarctic Coast (67°S–79°S)", "Antarctic Ice Sheet (79°S–90°S)"
];

const LON_LABELS = [
    "180°W Dateline", "165°W Aleutians", "150°W Alaska", "135°W Yukon/Pacific",
    "120°W West NA", "105°W Rockies/Mexico", "90°W Central NA", "75°W East NA/Andes",
    "60°W Amazon", "45°W Brazil/Greenland", "30°W Mid-Atlantic", "15°W West Africa",
    "0° UK/Spain/Ghana", "15°E Central Europe/Congo", "30°E Nile/E. Europe", "45°E Arabia/Madagascar",
    "60°E Ural/Arabian Sea", "75°E India/Himalayas", "90°E Bengal/Siberia", "105°E SE Asia/China",
    "120°E East China/W. Aus", "135°E Japan/Central Aus", "150°E East Australia", "165°E New Zealand"
];

const video = document.getElementById("eicVideo");
const scrubber = document.getElementById("videoScrubber");
const playPauseBtn = document.getElementById("playPauseBtn");

// Offscreen 384x192 canvas samples the live <video> at 30 FPS
const sampleCanvas = document.createElement("canvas");
sampleCanvas.width = 384;
sampleCanvas.height = 192;
const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });

let palette = [];
let currentX = 17; // Starts on 75°E Peninsular India
let currentY = 6;  // 11°N–22°N
let speechEnabled = true;
let rafId = null;
let patrolInterval = null;
let fallbackImage = null;

// Continuous Web Audio Synthesizer Nodes
let audioCtx = null;
let rootOsc = null;
let harmOsc = null;
let shimmerOsc = null;
let filterNode = null;
let rootGain = null;
let harmGain = null;
let shimmerGain = null;
let masterGain = null;
let pannerNode = null;
let isSynthRunning = false;

// ====== INITIALIZATION ======
window.addEventListener("DOMContentLoaded", async () => {
    buildHTMLGrid();
    highlightCell(currentX, currentY);

    try {
        palette = await loadPalette(COLORBAR_FILE);
    } catch (e) {
        console.warn("Palette load warning:", e.message);
    }

    try {
        fallbackImage = await loadImage(FALLBACK_POSTER);
    } catch (_) {}

    await tryAutoLoadVideo();
    setupEventListeners();
    sampleCurrentFrameAndSonify(false);
});

async function tryAutoLoadVideo() {
    for (const filename of DEFAULT_VIDEOS) {
        const ok = await testVideoSource(filename);
        if (ok) {
            updateUI(
                `Loaded NASA EIC video "${filename}" (900 frames). Press SPACEBAR to play real-time 30 FPS sonification, Press 1–4 for Jukebox Tours, or use Arrow Keys!`
            );
            return;
        }
    }
    video.poster = FALLBACK_POSTER;
    updateUI(
        "Click [📂 LOAD SVS 5544 .MP4] at the top-right to select your video file!"
    );
}

function testVideoSource(src) {
    return new Promise((resolve) => {
        video.onloadeddata = () => resolve(true);
        video.onerror = () => resolve(false);
        video.src = src;
        video.load();
    });
}

function frameToDateString(frameNum) {
    const startMs = Date.UTC(2023, 11, 27); // Dec 27, 2023
    const endMs = Date.UTC(2026, 5, 6);     // Jun 06, 2026
    const ratio = Math.max(0, Math.min(1, (frameNum - 1) / (TOTAL_FRAMES - 1)));
    const d = new Date(startMs + ratio * (endMs - startMs));
    return d.toISOString().slice(0, 10);
}

// ====== CONTINUOUS REAL-TIME SYNTHESIZER ======
function startContinuousSynth() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === "suspended") audioCtx.resume();
    if (isSynthRunning) return;

    const t = audioCtx.currentTime;
    pannerNode = audioCtx.createStereoPanner();
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.28, t);

    filterNode = audioCtx.createBiquadFilter();
    filterNode.type = "lowpass";
    filterNode.frequency.setValueAtTime(900, t);

    rootOsc = audioCtx.createOscillator();
    rootOsc.type = "triangle";
    rootGain = audioCtx.createGain();
    rootGain.gain.setValueAtTime(0.0001, t);

    harmOsc = audioCtx.createOscillator();
    harmOsc.type = "sine";
    harmGain = audioCtx.createGain();
    harmGain.gain.setValueAtTime(0.0001, t);

    shimmerOsc = audioCtx.createOscillator();
    shimmerOsc.type = "sine";
    shimmerOsc.frequency.setValueAtTime(midiToFreq(84), t);
    shimmerGain = audioCtx.createGain();
    shimmerGain.gain.setValueAtTime(0.0001, t);

    rootOsc.connect(rootGain);
    harmOsc.connect(harmGain);
    rootGain.connect(filterNode);
    harmGain.connect(filterNode);
    filterNode.connect(masterGain);

    shimmerOsc.connect(shimmerGain);
    shimmerGain.connect(masterGain);

    masterGain.connect(pannerNode);
    pannerNode.connect(audioCtx.destination);

    rootOsc.start(t);
    harmOsc.start(t);
    shimmerOsc.start(t);
    isSynthRunning = true;
}

function silenceContinuousSynth() {
    if (!isSynthRunning || !audioCtx) return;
    const t = audioCtx.currentTime;
    rootGain.gain.setTargetAtTime(0.0001, t, 0.04);
    harmGain.gain.setTargetAtTime(0.0001, t, 0.04);
    shimmerGain.gain.setTargetAtTime(0.0001, t, 0.04);
}

function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

function modulateSynthFromCell(cellStats) {
    if (!isSynthRunning) return 0;
    const t = audioCtx.currentTime;
    const panVal = (currentX / (COLS - 1)) * 2 - 1;
    pannerNode.pan.setTargetAtTime(panVal, t, 0.03);

    if (cellStats.biome === "vegetation") {
        const noteIdx = Math.min(PENTATONIC.length - 1, Math.max(0, Math.round(cellStats.level * (PENTATONIC.length - 1))));
        const freq = midiToFreq(PENTATONIC[noteIdx]);

        rootOsc.frequency.setTargetAtTime(freq, t, 0.04);
        harmOsc.frequency.setTargetAtTime(freq * 1.5, t, 0.04);
        filterNode.frequency.setTargetAtTime(450 + cellStats.coverage * 2400, t, 0.05);

        rootGain.gain.setTargetAtTime(0.22 + cellStats.level * 0.25, t, 0.04);
        harmGain.gain.setTargetAtTime(0.05 + cellStats.coverage * 0.22, t, 0.04);
        shimmerGain.gain.setTargetAtTime(cellStats.snowPct * 0.08, t, 0.04);
        return Math.round(freq);
    } else if (cellStats.biome === "snow") {
        rootOsc.frequency.setTargetAtTime(midiToFreq(79), t, 0.04);
        shimmerOsc.frequency.setTargetAtTime(midiToFreq(86), t, 0.04);
        filterNode.frequency.setTargetAtTime(2800, t, 0.04);

        rootGain.gain.setTargetAtTime(0.08, t, 0.04);
        harmGain.gain.setTargetAtTime(0.01, t, 0.04);
        shimmerGain.gain.setTargetAtTime(0.14 + cellStats.snowPct * 0.15, t, 0.04);
        return Math.round(midiToFreq(86));
    } else {
        const oceanFreq = midiToFreq(36);
        rootOsc.frequency.setTargetAtTime(oceanFreq, t, 0.05);
        filterNode.frequency.setTargetAtTime(180, t, 0.05);

        rootGain.gain.setTargetAtTime(0.14, t, 0.05);
        harmGain.gain.setTargetAtTime(0.001, t, 0.05);
        shimmerGain.gain.setTargetAtTime(0.001, t, 0.05);
        return Math.round(oceanFreq);
    }
}

let pingTimeout = null;
function playPausedPing(cellStats) {
    startContinuousSynth();
    const freq = modulateSynthFromCell(cellStats);
    document.getElementById("t-freq").innerText = `${freq} Hz`;
    if (pingTimeout) clearTimeout(pingTimeout);
    pingTimeout = setTimeout(() => {
        if (video.paused) silenceContinuousSynth();
    }, 360);
}

// ====== REAL-TIME 30 FPS VIDEO PIXEL EXTRACTOR ======
function sampleActiveCellFromVideo() {
    if (video.readyState >= 2) {
        sampleCtx.drawImage(video, 0, 0, sampleCanvas.width, sampleCanvas.height);
    } else if (fallbackImage) {
        sampleCtx.drawImage(fallbackImage, 0, 0, sampleCanvas.width, sampleCanvas.height);
    } else {
        return { biome: "ocean", level: 0, coverage: 0, snowPct: 0 };
    }

    const cellW = sampleCanvas.width / COLS;
    const cellH = sampleCanvas.height / ROWS;
    const x0 = Math.floor(currentX * cellW);
    const y0 = Math.floor(currentY * cellH);
    const imgData = sampleCtx.getImageData(x0, y0, Math.floor(cellW), Math.floor(cellH)).data;

    let vegLevels = [];
    let greenCount = 0;
    let snowCount = 0;
    const totalPixels = (imgData.length / 4) || 1;

    for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2];

        // Ocean blue in SVS 5544
        if (b > 135 && r < 55 && g > 75 && g < 155) continue;

        // Snow & Ice (avoids classifying Southern Ocean row 13 as snow unless white)
        if (r > 230 && g > 220 && b > 212 && Math.abs(r - g) < 24) {
            snowCount++;
            continue;
        }

        const lvl = nearestPaletteLevel(r, g, b);
        if (lvl >= 0 && currentY < ROWS - 1) {
            vegLevels.push(lvl);
            if (lvl >= 0.55) greenCount++;
        }
    }

    const snowPct = snowCount / totalPixels;
    const vegPct = vegLevels.length / totalPixels;

    if (currentY < ROWS - 1 && vegPct >= 0.06) {
        vegLevels.sort((a, b) => a - b);
        const mean = vegLevels.reduce((a, b) => a + b, 0) / vegLevels.length;
        const p75 = vegLevels[Math.floor(vegLevels.length * 0.75)];
        return {
            biome: "vegetation",
            level: 0.45 * mean + 0.55 * p75,
            coverage: greenCount / vegLevels.length,
            snowPct
        };
    } else if (snowPct >= 0.18) {
        return { biome: "snow", level: 0, coverage: 0, snowPct: Math.max(0.25, snowPct) };
    }
    return { biome: "ocean", level: 0, coverage: 0, snowPct: 0 };
}

function sampleCurrentFrameAndSonify(triggerPingIfPaused = false) {
    const stats = sampleActiveCellFromVideo();
    const duration = video.duration || 30;
    const frameNum = Math.min(TOTAL_FRAMES, Math.max(1, Math.round((video.currentTime / duration) * (TOTAL_FRAMES - 1)) + 1));
    const frameStr = String(frameNum).padStart(3, "0");
    const dateStr = frameToDateString(frameNum);

    scrubber.value = frameNum - 1;
    document.getElementById("frameBadge").innerText = `FRAME ${frameStr} / ${TOTAL_FRAMES} · ${dateStr}`;
    document.getElementById("t-frame").innerText = `FRAME ${frameStr} (${dateStr})`;
    document.getElementById("t-region").innerText = `${LON_LABELS[currentX]} · ${LAT_LABELS[currentY]}`;

    if (stats.biome === "vegetation") {
        document.getElementById("t-biome").innerText = "VEGETATION CANOPY";
        document.getElementById("t-ndvi").innerText = `NDVI ${Math.round(stats.level * 100)}% (Canopy: ${Math.round(stats.coverage * 100)}%)`;
    } else if (stats.biome === "snow") {
        document.getElementById("t-biome").innerText = "CRYOSPHERE (SNOW/ICE)";
        document.getElementById("t-ndvi").innerText = `Ice Cover: ${Math.round(stats.snowPct * 100)}%`;
    } else {
        document.getElementById("t-biome").innerText = "OCEAN BASIN";
        document.getElementById("t-ndvi").innerText = "Open Water (65 Hz Sub-Bass)";
    }

    if (!video.paused) {
        const freq = modulateSynthFromCell(stats);
        document.getElementById("t-freq").innerText = `${freq} Hz`;
    } else if (triggerPingIfPaused) {
        playPausedPing(stats);
    }

    return stats;
}

function animationLoop() {
    if (!video.paused && !video.ended) {
        sampleCurrentFrameAndSonify(false);
        rafId = requestAnimationFrame(animationLoop);
    }
}

// ====== VIDEO & JUKEBOX CONTROLS ======
async function togglePlayPause() {
    startContinuousSynth();
    if (video.paused) {
        try {
            await video.play();
            playPauseBtn.innerText = "⏸ PAUSE LIVE VIDEO";
            playPauseBtn.classList.add("active");
            rafId = requestAnimationFrame(animationLoop);
        } catch (err) {
            updateUI("Click [📂 LOAD SVS 5544 .MP4] at the top-right to select your video file!");
        }
    } else {
        video.pause();
        silenceContinuousSynth();
        playPauseBtn.innerText = "▶ PLAY LIVE VIDEO + SYNTH";
        playPauseBtn.classList.remove("active");
        if (rafId) cancelAnimationFrame(rafId);
    }
}

function stepFrames(deltaFrames) {
    const duration = video.duration || 30;
    const secPerFrame = duration / TOTAL_FRAMES;
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + deltaFrames * secPerFrame));
    sampleCurrentFrameAndSonify(true);
}

function selectCell(x, y, announce = true) {
    currentX = (x + COLS) % COLS;
    currentY = Math.max(0, Math.min(ROWS - 1, y));
    highlightCell(currentX, currentY);
    const stats = sampleCurrentFrameAndSonify(true);

    if (announce) {
        let biomeDesc = stats.biome === "vegetation"
            ? `NDVI ${Math.round(stats.level * 100)} percent`
            : stats.biome === "snow" ? `Snow cover ${Math.round(stats.snowPct * 100)} percent` : "Ocean basin";
        const text = `${LON_LABELS[currentX]}, ${LAT_LABELS[currentY]}. ${biomeDesc}.`;
        updateUI(text);
        speak(text);
    }
}

async function startJukeboxTrack(trackNum) {
    if (patrolInterval) { clearInterval(patrolInterval); patrolInterval = null; }
    document.querySelectorAll(".track-btn").forEach((b) => b.classList.remove("active"));
    const btn = document.getElementById(`btn-track-${trackNum}`);
    if (btn) btn.classList.add("active");

    if (trackNum === 1) {
        selectCell(18, 2, false); // 90°E Northern Boreal Siberia
        const msg = "Track 1: Boreal Snowline and Forest Pulse. Locked onto 60 degrees North Siberia as the 900-frame movie plays.";
        updateUI(msg); speak(msg);
    } else if (trackNum === 2) {
        selectCell(17, 6, false); // 75°E Peninsular India
        const msg = "Track 2: Indian Monsoon and Crop Cycle. Locked onto 75 degrees East India across the 900-frame timeline.";
        updateUI(msg); speak(msg);
    } else if (trackNum === 3) {
        selectCell(13, 6, false); // 15°E Sahel Africa
        const msg = "Track 3: Sahel Greening Wave. Locked onto the Southern Sahara transition zone in Africa.";
        updateUI(msg); speak(msg);
    } else if (trackNum === 4) {
        selectCell(8, 8, false); // Start in Amazon
        const msg = "Track 4: Global Latitude Patrol. Automatically walking the Sonic Lens across continents while the NASA movie rolls.";
        updateUI(msg); speak(msg);
        const waypoints = [[8, 8], [13, 8], [13, 5], [14, 3], [17, 6], [19, 6], [18, 2], [4, 4]];
        let step = 0;
        patrolInterval = setInterval(() => {
            step = (step + 1) % waypoints.length;
            selectCell(waypoints[step][0], waypoints[step][1], true);
        }, 3200);
    }

    video.currentTime = 0;
    if (video.paused) await togglePlayPause();
}

function stopAll() {
    if (patrolInterval) { clearInterval(patrolInterval); patrolInterval = null; }
    video.pause();
    silenceContinuousSynth();
    if (rafId) cancelAnimationFrame(rafId);
    window.speechSynthesis.cancel();
    playPauseBtn.innerText = "▶ PLAY LIVE VIDEO + SYNTH";
    document.querySelectorAll(".track-btn").forEach((b) => b.classList.remove("active"));
    updateUI("Playback stopped. Use Arrow Keys to inspect any of the 384 cells or press Spacebar to resume video.");
}

// ====== EVENT LISTENERS & HELPERS ======
function setupEventListeners() {
    document.getElementById("videoFileInput").addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        video.src = url;
        video.load();
        video.onloadeddata = () => {
            sampleCurrentFrameAndSonify(true);
            updateUI(`Loaded video: ${file.name}. Press SPACEBAR or click PLAY LIVE VIDEO!`);
        };
    });

    video.addEventListener("seeked", () => {
        if (video.paused) sampleCurrentFrameAndSonify(false);
    });

    scrubber.addEventListener("input", (e) => {
        const frame = parseInt(e.target.value, 10);
        const duration = video.duration || 30;
        video.currentTime = (frame / (TOTAL_FRAMES - 1)) * duration;
        sampleCurrentFrameAndSonify(true);
    });

    window.addEventListener("keydown", (e) => {
        if (e.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;

        if (["1", "2", "3", "4"].includes(e.key)) { startJukeboxTrack(parseInt(e.key, 10)); return; }
        if (e.key === "Escape") { stopAll(); return; }
        if (e.key === " ") { e.preventDefault(); togglePlayPause(); return; }
        if (e.key === "[") { e.preventDefault(); stepFrames(-15); return; }
        if (e.key === "]") { e.preventDefault(); stepFrames(15); return; }

        if (e.key === "ArrowUp") { e.preventDefault(); selectCell(currentX, currentY - 1, true); }
        else if (e.key === "ArrowDown") { e.preventDefault(); selectCell(currentX, currentY + 1, true); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); selectCell(currentX - 1, currentY, true); }
        else if (e.key === "ArrowRight") { e.preventDefault(); selectCell(currentX + 1, currentY, true); }
    });
}

function buildHTMLGrid() {
    const grid = document.getElementById("map-grid");
    grid.innerHTML = "";
    for (let i = 0; i < ROWS * COLS; i++) {
        const div = document.createElement("div");
        div.className = "grid-cell";
        div.id = `cell-${i}`;
        div.setAttribute("role", "gridcell");
        div.setAttribute("aria-selected", "false");
        const r = Math.floor(i / COLS);
        const c = i % COLS;
        div.addEventListener("click", () => selectCell(c, r, true));
        grid.appendChild(div);
    }
}

function highlightCell(x, y) {
    document.querySelectorAll(".grid-cell.active").forEach((c) => {
        c.classList.remove("active");
        c.setAttribute("aria-selected", "false");
    });
    const idx = y * COLS + x;
    const target = document.getElementById(`cell-${idx}`);
    if (target) {
        target.classList.add("active");
        target.setAttribute("aria-selected", "true");
        document.getElementById("map-grid").setAttribute("aria-activedescendant", `cell-${idx}`);
    }
}

function toggleSpeech() {
    speechEnabled = !speechEnabled;
    if (!speechEnabled) window.speechSynthesis.cancel();
    document.getElementById("btn-mute-speech").innerText = speechEnabled ? "🔊 VOICE: ON" : "🔇 VOICE: OFF";
}

function speak(text) {
    if (!speechEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.25;
    window.speechSynthesis.speak(u);
}

function updateUI(msg) {
    const el = document.getElementById("status-readout");
    if (el) el.innerText = msg;
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Missing " + src));
        img.src = src;
    });
}

function loadPalette(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.width; c.height = img.height;
            const ctx = c.getContext("2d");
            ctx.drawImage(img, 0, 0);
            const y = Math.floor(img.height * 0.53);
            const data = ctx.getImageData(0, y, img.width, 1).data;
            const colors = [];
            for (let x = 108; x < Math.min(796, img.width); x += 4) {
                const i = x * 4;
                if (data[i + 3] > 200) colors.push([data[i], data[i + 1], data[i + 2]]);
            }
            resolve(colors);
        };
        img.onerror = () => reject(new Error("Cannot load " + src));
        img.src = src;
    });
}

function nearestPaletteLevel(r, g, b) {
    if (!palette.length) return Math.max(0, Math.min(1, (g - r * 0.5) / 180));
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
        const p = palette[i];
        const d = Math.hypot(r - p[0], g - p[1], b - p[2]);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return bestDist <= 54 ? bestIdx / (palette.length - 1) : -1;
}
