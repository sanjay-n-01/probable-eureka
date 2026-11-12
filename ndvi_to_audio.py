"""Convert a 2D NDVI JSON grid to a gentle stereo WAV file.
Run: python ndvi_to_audio.py earth-ndvi-data.json
Requires: numpy (install with: python -m pip install numpy)
"""
import argparse
import json
import wave
from pathlib import Path
import numpy as np

SAMPLE_RATE = 32000
NOTE_SECONDS = 0.14
MAX_NOTES = 480
# C major pentatonic over two octaves: C4 D4 E4 G4 A4 C5 D5 E5 G5 A5 C6
MIDI_NOTES = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84]

def convert(source: Path, destination: Path, max_notes: int = MAX_NOTES):
    with source.open('r', encoding='utf-8') as f:
        grid = json.load(f)
    if not isinstance(grid, list) or not grid or not all(isinstance(row, list) for row in grid):
        raise ValueError('Expected a non-empty 2D JSON array of NDVI numbers and nulls.')
    width = max(map(len, grid))
    if width == 0:
        raise ValueError('NDVI grid has no columns.')

    # Keep spatial coordinates; avoid creating a large list of individual Python tuples.
    points = []
    for r, row in enumerate(grid):
        for c, value in enumerate(row):
            if isinstance(value, (int, float)) and not isinstance(value, bool) and np.isfinite(value):
                points.append((r, c, float(value)))
    if not points:
        raise ValueError('No valid numeric NDVI values were found.')

    # Evenly sample valid values in row-major order; do not play 120k notes.
    count = min(max_notes, len(points))
    indices = np.linspace(0, len(points) - 1, count, dtype=int)
    selected = [points[i] for i in indices]
    samples_per_note = round(NOTE_SECONDS * SAMPLE_RATE)
    audio = np.zeros((count * samples_per_note + round(.25 * SAMPLE_RATE), 2), dtype=np.float32)
    t = np.arange(samples_per_note, dtype=np.float64) / SAMPLE_RATE
    # Rounded attack/release for click-free, gentle notes.
    attack = np.minimum(1, t / .018)
    release = np.minimum(1, (NOTE_SECONDS - t) / .045)
    envelope = np.maximum(0, np.minimum(attack, release)) ** 1.3

    for i, (row, col, value) in enumerate(selected):
        # Standard NDVI physical bounds [-1, 1]; this dataset was observed ~[-0.1,0.9].
        # Use dataset-focused range to preserve its audible contrast.
        normalized = float(np.clip((value + .1) / 1.0, 0, 1))
        note_index = min(len(MIDI_NOTES) - 1, int(normalized * len(MIDI_NOTES)))
        frequency = 440 * 2 ** ((MIDI_NOTES[note_index] - 69) / 12)
        phase = 2 * np.pi * frequency * t
        # Warm, soft tone with quiet harmonics (not harsh square waves).
        tone = (np.sin(phase) + .20 * np.sin(2 * phase) + .07 * np.sin(3 * phase)) / 1.27
        tone *= envelope * .22
        # Position within the original row controls stereo left/right.
        pan = col / max(1, width - 1)
        left = np.cos(pan * np.pi / 2)
        right = np.sin(pan * np.pi / 2)
        start = i * samples_per_note
        audio[start:start + samples_per_note, 0] += tone * left
        audio[start:start + samples_per_note, 1] += tone * right

    # Subtle, short stereo echo; small enough to preserve note clarity.
    for delay_seconds, gain in [(0.11, .13), (0.19, .07)]:
        delay = round(delay_seconds * SAMPLE_RATE)
        audio[delay:] += gain * audio[:-delay].copy()

    peak = float(np.max(np.abs(audio)))
    if peak > .95:
        audio *= .95 / peak
    pcm = (np.clip(audio, -1, 1) * 32767).astype('<i2')
    with wave.open(str(destination), 'wb') as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm.tobytes())
    print(f'Valid NDVI values: {len(points):,}')
    print(f'Notes generated: {count}')
    print(f'Audio length: {len(audio) / SAMPLE_RATE:.1f} seconds')
    print(f'Created: {destination.resolve()}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Convert NDVI 2D JSON into pleasant stereo WAV audio.')
    parser.add_argument('json_file', nargs='?', default='earth-ndvi-data.json')
    parser.add_argument('--output', default='vegetation_audio.wav')
    parser.add_argument('--notes', type=int, default=MAX_NOTES)
    args = parser.parse_args()
    if args.notes < 1:
        parser.error('--notes must be at least 1')
    convert(Path(args.json_file), Path(args.output), args.notes)
