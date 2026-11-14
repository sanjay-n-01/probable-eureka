const input = document.getElementById("imageInput");
const canvas = document.getElementById("myCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const audioPanel = document.getElementById("audioPanel");
const scanStatus = document.getElementById("scanStatus");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");

const NDVI_MIN = -0.1;
const NDVI_MAX = 0.9;
const HUE_MIN = 25;
const HUE_MAX = 150;
const MIN_SATURATION = 15;

function rgbToHsv(red, green, blue) {
    const r = red / 255;
    const g = green / 255;
    const b = blue / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    if (delta !== 0) {
        if (max === r) h = 60 * (((g - b) / delta) % 6);
        else if (max === g) h = 60 * (((b - r) / delta) + 2);
        else h = 60 * (((r - g) / delta) + 4);
    }
    if (h < 0) h += 360;
    const s = max === 0 ? 0 : (delta / max) * 100;
    const v = max * 100;
    return { h, s, v };
}

function hsvToNdvi(h, s) {
    if (s < MIN_SATURATION) return null;
    if (h >= 165 && h <= 260) return null;
    if (h < HUE_MIN || h > HUE_MAX) return null;
    const normalized = (h - HUE_MIN) / (HUE_MAX - HUE_MIN);
    const ndvi = NDVI_MIN + normalized * (NDVI_MAX - NDVI_MIN);
    return Math.round(ndvi * 100) / 100;
}

let currentImage = null;

input.addEventListener("change", function(event) {
    event.preventDefault();
    const file = event.target.files[0];
    if (!file) return;

    if (isPlaying) stopScan();
    window.scientificData = null;

    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = function() {
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        ctx.drawImage(image, 0, 0);
        currentImage = image;
        audioPanel.style.display = "block";
        scanStatus.textContent = "Ready to scan — click PLAY";

        const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = pixelData.data;
        const width = canvas.width;
        const height = canvas.height;

        const scientificData = Array.from(
            { length: height },
            () => Array(width).fill(null)
        );

        let validCount = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const red = pixels[i];
                const green = pixels[i + 1];
                const blue = pixels[i + 2];
                const alpha = pixels[i + 3];
                if (alpha < 128) continue;
                const hsv = rgbToHsv(red, green, blue);
                const ndvi = hsvToNdvi(hsv.h, hsv.s);
                if (ndvi === null) continue;
                scientificData[y][x] = ndvi;
                validCount++;
            }
        }

        window.scientificData = scientificData;

        console.log("Image width:", width);
        console.log("Image height:", height);
        console.log("Valid NDVI values:", validCount);
        console.log("Processing complete. Click PLAY to sonify.");

        URL.revokeObjectURL(imageUrl);
    };

    image.onerror = function() {
        URL.revokeObjectURL(imageUrl);
        console.error("Unable to load image.");
    };

    image.src = imageUrl;
});

// SCAN ENGINE

let audioContext = null;
let isPlaying = false;
let isPaused = false;
let currentRow = 0;
let scanTimeout = null;
let oscillator = null;
let gainNode = null;
let panNode = null;
let harmonyOscillator = null;
let harmonyGainNode = null;
let overtoneOscillator = null;
let overtoneGainNode = null;
let oceanOscillator = null;
let oceanGainNode = null;
let masterGainNode = null;
let filterNode = null;
let audioRows = [];
let lastAudioUpdate = 0;
const SCAN_INTERVAL_MS = 15;
const AUDIO_UPDATE_INTERVAL_MS = 240;
const PITCH_SMOOTHING_SECONDS = 0.12;
const NOTE_ATTACK_SECONDS = 0.025;

const MIDI_NOTES = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72];

function midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

function ndviToFrequency(ndvi) {
    const normalized = Math.max(0, Math.min(1,
        (ndvi - NDVI_MIN) / (NDVI_MAX - NDVI_MIN)
    ));
    const noteIndex = Math.round(normalized * (MIDI_NOTES.length - 1));
    return midiToFrequency(MIDI_NOTES[noteIndex]);
}

function ndviToRichness(ndvi) {
    return Math.max(0, Math.min(1,
        (ndvi - NDVI_MIN) / (NDVI_MAX - NDVI_MIN)
    ));
}

function getRowSoundFeatures(row) {
    const rowData = window.scientificData[row];
    let valueTotal = 0;
    let positionTotal = 0;
    let valueCount = 0;

    rowData.forEach((value, position) => {
        if (value === null) return;
        valueTotal += value;
        positionTotal += position;
        valueCount++;
    });

    if (valueCount === 0) return null;

    return {
        average: valueTotal / valueCount,
        pan: (positionTotal / valueCount / Math.max(1, rowData.length - 1)) * 2 - 1,
        density: valueCount / Math.max(1, rowData.length)
    };
}



function drawScanLine(row) {
    ctx.drawImage(currentImage, 0, 0);
    ctx.fillStyle = "rgba(215, 243, 107, 0.6)";
    ctx.fillRect(0, row, canvas.width, 2);
}

function fadeAudioToSilence(audioTime) {
    if (gainNode) {
        gainNode.gain.setTargetAtTime(0, audioTime, 0.08);
    }
    if (harmonyGainNode) {
        harmonyGainNode.gain.setTargetAtTime(0, audioTime, 0.08);
    }
    if (overtoneGainNode) {
        overtoneGainNode.gain.setTargetAtTime(0, audioTime, 0.08);
    }
    if (oceanGainNode) {
        oceanGainNode.gain.setTargetAtTime(0.006, audioTime, 0.25);
    }
}

function triggerSparkle(frequency, pan, intensity) {
    if (!audioContext || !masterGainNode) return;

    const sparkleOscillator = audioContext.createOscillator();
    const sparkleGain = audioContext.createGain();
    const sparklePan = audioContext.createStereoPanner();
    const now = audioContext.currentTime;
    const sparkleEnd = now + 0.42;

    sparkleOscillator.type = "sine";
    sparkleOscillator.frequency.setValueAtTime(frequency, now);
    sparklePan.pan.setValueAtTime(pan, now);
    sparkleGain.gain.setValueAtTime(0.0001, now);
    sparkleGain.gain.exponentialRampToValueAtTime(
        0.025 * intensity,
        now + 0.018
    );
    sparkleGain.gain.exponentialRampToValueAtTime(
        0.0001,
        sparkleEnd
    );

    sparkleOscillator.connect(sparkleGain);
    sparkleGain.connect(sparklePan);
    sparklePan.connect(masterGainNode);
    sparkleOscillator.start(now);
    sparkleOscillator.stop(sparkleEnd);
}

function startContinuousAudio() {
    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();
    panNode = audioContext.createStereoPanner();
    harmonyOscillator = audioContext.createOscillator();
    harmonyGainNode = audioContext.createGain();
    overtoneOscillator = audioContext.createOscillator();
    overtoneGainNode = audioContext.createGain();
    oceanOscillator = audioContext.createOscillator();
    oceanGainNode = audioContext.createGain();
    masterGainNode = audioContext.createGain();
    filterNode = audioContext.createBiquadFilter();

    oscillator.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(masterGainNode);

    harmonyOscillator.connect(harmonyGainNode);
    harmonyGainNode.connect(filterNode);
    filterNode.connect(masterGainNode);
    overtoneOscillator.connect(overtoneGainNode);
    overtoneGainNode.connect(panNode);
    oceanOscillator.connect(oceanGainNode);
    oceanGainNode.connect(filterNode);
    masterGainNode.connect(audioContext.destination);

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(
        midiToFrequency(MIDI_NOTES[0]),
        audioContext.currentTime
    );
    harmonyOscillator.type = "sine";
    harmonyOscillator.frequency.setValueAtTime(
        midiToFrequency(MIDI_NOTES[0] - 12),
        audioContext.currentTime
    );
    overtoneOscillator.type = "sine";
    overtoneOscillator.frequency.setValueAtTime(
        midiToFrequency(MIDI_NOTES[0]) * 2,
        audioContext.currentTime
    );
    oceanOscillator.type = "sine";
    oceanOscillator.frequency.setValueAtTime(55, audioContext.currentTime);
    filterNode.type = "lowpass";
    filterNode.frequency.setValueAtTime(1200, audioContext.currentTime);
    filterNode.Q.setValueAtTime(0.4, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.07, audioContext.currentTime);
    harmonyGainNode.gain.setValueAtTime(0.035, audioContext.currentTime);
    overtoneGainNode.gain.setValueAtTime(0.012, audioContext.currentTime);
    oceanGainNode.gain.setValueAtTime(0, audioContext.currentTime);
    masterGainNode.gain.setValueAtTime(0.7, audioContext.currentTime);
    panNode.pan.setValueAtTime(0, audioContext.currentTime);
    oscillator.start();
    harmonyOscillator.start();
    overtoneOscillator.start();
    oceanOscillator.start();
}

function scanNextRow() {
    if (!isPlaying || isPaused) return;

    const totalRows = window.scientificData.length;

    if (totalRows === 0) {
        stopScan();
        scanStatus.textContent = "No scan data found";
        return;
    }

    if (currentRow >= totalRows) {
        stopScan();
        scanStatus.textContent = "Scan complete";
        return;
    }

    drawScanLine(currentRow);

    const soundFeatures = getRowSoundFeatures(currentRow);
    if (soundFeatures !== null) {
        audioRows.push(soundFeatures);
    }

    const now = performance.now();
    if (
        oscillator &&
        panNode &&
        audioRows.length > 0 &&
        now - lastAudioUpdate >= AUDIO_UPDATE_INTERVAL_MS
    ) {
        const avgNdvi = audioRows.reduce(
            (sum, features) => sum + features.average,
            0
        ) / audioRows.length;
        const pan = audioRows.reduce(
            (sum, features) => sum + features.pan,
            0
        ) / audioRows.length;
        const density = audioRows.reduce(
            (sum, features) => sum + features.density,
            0
        ) / audioRows.length;
        const frequency = ndviToFrequency(avgNdvi);
        const richness = ndviToRichness(avgNdvi);
        const audibility = Math.min(1, density * 4);
        const audioTime = audioContext.currentTime;

        oceanGainNode.gain.setTargetAtTime(0, audioTime, 0.25);
        oscillator.frequency.setTargetAtTime(
            frequency,
            audioTime,
            PITCH_SMOOTHING_SECONDS
        );
        panNode.pan.setTargetAtTime(
            pan,
            audioTime,
            PITCH_SMOOTHING_SECONDS
        );
        harmonyOscillator.frequency.setTargetAtTime(
            frequency / 2,
            audioTime,
            PITCH_SMOOTHING_SECONDS * 1.5
        );
        overtoneOscillator.frequency.setTargetAtTime(
            frequency * 2,
            audioTime,
            PITCH_SMOOTHING_SECONDS * 0.75
        );
        harmonyGainNode.gain.setTargetAtTime(
            (0.008 + richness * 0.06 + density * 0.015) * audibility,
            audioTime,
            0.1
        );
        overtoneGainNode.gain.setTargetAtTime(
            (0.006 + richness * 0.025) * audibility,
            audioTime,
            0.08
        );
        filterNode.frequency.setTargetAtTime(
            500 + richness * 3000 + density * 500,
            audioTime,
            0.15
        );
        gainNode.gain.cancelScheduledValues(audioTime);
        gainNode.gain.setTargetAtTime(
            (0.05 + richness * 0.1) * audibility,
            audioTime,
            NOTE_ATTACK_SECONDS
        );
        if (richness > 0.65 && density > 0.15 && currentRow % 3 === 0) {
            triggerSparkle(
                frequency * (2 + Math.round(richness * 2)),
                pan,
                richness * audibility
            );
        }
        audioRows = [];
        lastAudioUpdate = now;
    } else if (
        oscillator &&
        now - lastAudioUpdate >= AUDIO_UPDATE_INTERVAL_MS
    ) {
        fadeAudioToSilence(audioContext.currentTime);
        lastAudioUpdate = now;
    }

    scanStatus.textContent = `Scanning row ${currentRow + 1} of ${totalRows}`;
    currentRow++;
    scanTimeout = setTimeout(scanNextRow, SCAN_INTERVAL_MS);
}

function startScan() {
    if (!window.scientificData) {
        alert("Please upload a NASA NDVI image first.");
        return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        console.error("Web Audio API is not supported by this browser.");
        scanStatus.textContent = "Audio is not supported in this browser";
        return;
    }

    try {
        audioContext = new AudioContextClass();
    } catch (error) {
        console.error("Unable to create the audio context.", error);
        scanStatus.textContent = "Unable to start audio";
        return;
    }

    audioContext.resume().then(() => {
        isPlaying = true;
        isPaused = false;
        currentRow = 0;
        audioRows = [];
        lastAudioUpdate = performance.now();
        playBtn.disabled = true;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        startContinuousAudio();
        scanNextRow();
    }).catch(error => {
        console.error("Unable to start audio playback.", error);
        stopScan();
        scanStatus.textContent = "Unable to start audio";
    });
}

function pauseScan() {
    if (isPaused) {
        isPaused = false;
        pauseBtn.textContent = "PAUSE";
        if (masterGainNode) {
            masterGainNode.gain.linearRampToValueAtTime(
                0.7,
                audioContext.currentTime + 0.08
            );
        }
        scanNextRow();
    } else {
        isPaused = true;
        pauseBtn.textContent = "RESUME";
        clearTimeout(scanTimeout);
        if (masterGainNode) {
            masterGainNode.gain.linearRampToValueAtTime(
                0,
                audioContext.currentTime + 0.08
            );
        }
    }
}

function stopScan() {
    isPlaying = false;
    isPaused = false;
    currentRow = 0;
    clearTimeout(scanTimeout);
    if (oscillator) {
        const stopAt = audioContext.currentTime + 0.08;
        if (masterGainNode) {
            masterGainNode.gain.cancelScheduledValues(audioContext.currentTime);
            masterGainNode.gain.setValueAtTime(
                masterGainNode.gain.value,
                audioContext.currentTime
            );
            masterGainNode.gain.linearRampToValueAtTime(0, stopAt);
        }
        oscillator.stop(stopAt);
    }
    if (harmonyOscillator) {
        harmonyOscillator.stop(audioContext.currentTime + 0.08);
    }
    if (overtoneOscillator) {
        overtoneOscillator.stop(audioContext.currentTime + 0.08);
    }
    if (oceanOscillator) {
        oceanOscillator.stop(audioContext.currentTime + 0.08);
    }
    oscillator = null;
    gainNode = null;
    panNode = null;
    harmonyOscillator = null;
    harmonyGainNode = null;
    overtoneOscillator = null;
    overtoneGainNode = null;
    oceanOscillator = null;
    oceanGainNode = null;
    masterGainNode = null;
    filterNode = null;
    audioRows = [];
    playBtn.disabled = false;
    pauseBtn.disabled = true;
    pauseBtn.textContent = "PAUSE";
    stopBtn.disabled = true;
    if (currentImage) ctx.drawImage(currentImage, 0, 0);
    scanStatus.textContent = "Ready to scan — click PLAY";
}

playBtn.addEventListener("click", startScan);
pauseBtn.addEventListener("click", pauseScan);
stopBtn.addEventListener("click", stopScan);