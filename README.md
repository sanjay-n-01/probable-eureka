# Earth Jukebox — Blind-Accessible Real-Time Video Sonification of NASA EIC Data

**2026 NASA Space Apps Challenge Submission | Team SSS**  
 **Live Web Application:** [https://sanjay-n-01.github.io/probable-eureka/](https://sanjay-n-01.github.io/probable-eureka/)  
 **Primary Dataset:** [NASA Scientific Visualization Studio (SVS) #5544 — Near Real-Time Global NDVI (Suomi-NPP / NOAA-20 VIIRS)](https://svs.gsfc.nasa.gov/5544/)

---

## Overview & Problem Statement
NASA’s Earth Information Center (EIC) captures extraordinary planetary changes—such as **SVS 5544**, a 900-frame rolling daily time-series (`nrt_ndvi_equi_w_dates_2048p30.mp4`) tracking global vegetation (NDVI) and snow cover from December 27, 2023 to June 6, 2026. However, presenting complex Earth science exclusively as silent video locks out **blind and low-vision (BLV)** users and makes subtle seasonal and multi-year shifts difficult to track.

Legacy sonification scripts convert static 1D/2D data tables into disconnected pitch sweeps that fail on rendered EIC hyperwall animations, conflate clouds/ice/oceans with land, and cause listener fatigue.

**Earth Jukebox** transforms NASA’s 900-frame satellite movie into an **eyes-free, real-time tactile spatial instrument and narrative jukebox**.

---

## Key Features:

### 1. Curated Live Video Jukebox Stories (Keys `1`–`4`)
Pressing `1` through `4` locks a high-resolution **Sonic Lens** onto key ecological regions while the 900-frame NASA movie rolls at 30 FPS:
* **`1` — Boreal Snowline & Forest Pulse (`90°E, 56°N–67°N` Siberia):** Hear icy winter bell shimmers in December thaw into rich pentatonic forest chords in June.
* **`2` — Indian Monsoon & Crop Cycle (`75°E, 11°N–22°N` Peninsular India):** Track 2.5 years of pre-monsoon dry phases and monsoon agricultural greening surges.
* **`3` — Sahel Greening Wave (`15°E, 11°N–22°N` Africa):** Listen to the seasonal migration of the African rain belt along the southern edge of the Sahara.
* **`4` — Global Latitude Patrol:** Automatically walks the Sonic Lens across 8 global biomes (Amazon, Congo, Sahara, Europe, India, SE Asia, Siberia, North America) with spoken telemetry announcements.

### 2. Real-Time 30 FPS Computer Vision & 16×24 Fine Grid (384 Cells)
* **Offscreen Canvas Downsampling:** An offscreen HTML5 `<canvas>` (`384×192`) samples the live `<video>` stream at 30 FPS, dividing the globe into **384 geographic cells** (`16 latitude bands × 24 longitude zones`, `11.25° × 15°` per cell).
* **Tri-Biome Pixel Classifier:** Separates each cell's pixels into **Vegetation Canopy** (matched via 3D Euclidean RGB distance against NASA’s official `NDVI_colorbar.png` using a 45% mean + 55% 75th-percentile blend), **Cryosphere (Snow/Ice)**, and **Ocean Basins**.

### 3. Continuous Tri-Biome Web Audio Synthesizer
Instead of choppy per-frame clicks, persistent Web Audio API oscillators smoothly glide via `40ms` exponential time constants (`setTargetAtTime`):
* ** Vegetation Canopy:** Quantized to a 3-octave **C-Major Pentatonic Scale (`C3`–`C6`, MIDI `48`–`84`)**. Dense canopy coverage (`NDVI >= 0.55`) opens a Biquad low-pass filter (`450 Hz` $\to$ `2850 Hz`) and blends in a Perfect Fifth harmonic (`1.5×` root frequency).
* ** Cryosphere (Snow & Ice):** Triggers high-register crystalline bell intervals (`G5 + D6` sine shimmer at `2800 Hz`).
* ** Ocean Basins:** Produces a subtle `65.4 Hz (C2)` sub-bass tide pulse low-pass filtered at `180 Hz`.
* ** 3D Longitudinal Stereo Panning:** Maps longitude (`180°W` to `180°E`) across a `StereoPannerNode` (`-1.0` Left Ear to `+1.0` Right Ear).

### 4. Blind-First WAI-ARIA Accessibility
* Full `role="grid"`, `role="gridcell"`, `aria-selected`, `aria-activedescendant`, and `aria-live="polite"` support for **NVDA** and **JAWS** screen readers.
* Built-in **Web Speech API** (`window.speechSynthesis`) voice readouts for zero-mouse operation.

---

## ⌨️ Keyboard Controls (100% Eyes-Free Operation)

| Key | Action |
| :--- | :--- |
| **`1`, `2`, `3`, `4`** | Launch Curated Live Video Jukebox Stories (Tracks 1–4) |
| **`Arrow Keys` (`↑` `↓` `←` `→`)** | Move the Sonic Lens across the 16×24 grid (384 geographic regions) |
| **`Spacebar`** | Play / Pause the live 900-frame NASA video & real-time synthesizer |
| **`[` / `]`** | Scrub backward / forward by 15 daily frames (~2 weeks) |
| **`Escape`** | Stop all audio playback, patrol tours, and speech immediately |

---

## Contributors:

* **Sanjay N** and **Mathesh M**  — Color and pixel analysis and conversion of the analysis into the NDVI pipeline.
* **Sanjay Eshwaran P** and **Sunanda V K** — Designed and implemented the sonification system, translating vegetation, snow/ice, and ocean signals into continuous Web Audio textures with musical pitch, timbre, dynamics, and spatial stereo movement.

This project is released under the [MIT License](LICENSE).

---

## Repository Structure

```text
├── index.html                          # High-contrast UI, WAI-ARIA grid, and video stage
├── jukebox.js                          # Pixel sampler, palette matcher, and Web Audio synthesizer
├── NDVI_colorbar.png                   # NASA SVS 5544 NDVI reference color bar
├── nrt_ndvi_equi_w_dates_2048p30.mp4   # NASA SVS 5544 VIIRS NDVI time-series video
├── CONTRIBUTORS.md                     # Contributor names and roles
├── LICENSE                             # MIT License
└── README.md                           # Project documentation
```
