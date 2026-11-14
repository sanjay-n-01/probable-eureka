"""Convert a 2D NDVI JSON grid into a gentle stereo WAV file.

Usage:
    python ndvi_to_audio.py "earth-ndvi-data.json"

Optional:
    python ndvi_to_audio.py "earth-ndvi-data.json" --notes 800
    python ndvi_to_audio.py "earth-ndvi-data.json" --output "test.wav"

Requires:
    python -m pip install numpy
"""

import argparse
import json
import wave
from pathlib import Path

import numpy as np


SAMPLE_RATE = 32000
NOTE_SECONDS = 0.14
MAX_NOTES = 480

# C-major pentatonic scale over two octaves:
# C4, D4, E4, G4, A4, C5, D5, E5, G5, A5, C6
MIDI_NOTES = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84]

# This matches the provisional range used by the image processor.
# It is an approximation because the input is a rendered colour image,
# not the original numerical NASA NDVI product.
NDVI_MIN = -0.1
NDVI_MAX = 0.9


def load_grid(source: Path):
    """Read and validate the JSON 2D grid."""
    with source.open("r", encoding="utf-8") as file:
        grid = json.load(file)

    if (
        not isinstance(grid, list)
        or not grid
        or not all(isinstance(row, list) for row in grid)
    ):
        raise ValueError(
            "Expected a non-empty 2D JSON array containing numbers and nulls."
        )

    width = max((len(row) for row in grid), default=0)
    if width == 0:
        raise ValueError("NDVI grid has no columns.")

    return grid, width


def is_valid_ndvi(value):
    """Return True only for finite numeric values (not booleans)."""
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and np.isfinite(value)
    )


def select_points(grid, max_notes):
    """Select evenly spaced valid pixels without storing every valid pixel.

    Two passes are used to keep memory use lower for large images.
    Each selected point retains its original row and column.
    """
    valid_count = sum(
        1
        for row in grid
        for value in row
        if is_valid_ndvi(value)
    )

    if valid_count == 0:
        raise ValueError("No valid numeric NDVI values were found.")

    count = min(max_notes, valid_count)

    # Select evenly spaced positions in the sequence of valid values.
    target_positions = np.linspace(
        0, valid_count - 1, count, dtype=np.int64
    )
    target_set = set(target_positions.tolist())

    selected = []
    valid_index = 0

    for row_index, row in enumerate(grid):
        for col_index, value in enumerate(row):
            if not is_valid_ndvi(value):
                continue

            if valid_index in target_set:
                selected.append((row_index, col_index, float(value)))

            valid_index += 1

    return valid_count, selected


def ndvi_to_note_index(value):
    """Map NDVI to one of the available musical notes."""
    normalized = (value - NDVI_MIN) / (NDVI_MAX - NDVI_MIN)
    normalized = float(np.clip(normalized, 0.0, 1.0))

    # Map both endpoints exactly across the 11 available notes.
    return int(round(normalized * (len(MIDI_NOTES) - 1)))


def make_envelope(time_values):
    """Create a gentle attack/release envelope to reduce clicking."""
    attack = np.minimum(1.0, time_values / 0.018)
    release = np.minimum(1.0, (NOTE_SECONDS - time_values) / 0.045)
    return np.maximum(0.0, np.minimum(attack, release)) ** 1.3


def generate_audio(selected, width):
    """Synthesize the selected notes into a stereo floating-point array."""
    samples_per_note = round(NOTE_SECONDS * SAMPLE_RATE)
    tail_samples = round(0.25 * SAMPLE_RATE)

    audio = np.zeros(
        (len(selected) * samples_per_note + tail_samples, 2),
        dtype=np.float32,
    )

    time_values = (
        np.arange(samples_per_note, dtype=np.float64) / SAMPLE_RATE
    )
    envelope = make_envelope(time_values)

    for note_number, (row, col, ndvi_value) in enumerate(selected):
        note_index = ndvi_to_note_index(ndvi_value)
        midi_note = MIDI_NOTES[note_index]

        frequency = 440.0 * 2 ** ((midi_note - 69) / 12)
        phase = 2 * np.pi * frequency * time_values

        # Fundamental plus quiet harmonics for a warmer tone.
        tone = (
            np.sin(phase)
            + 0.20 * np.sin(2 * phase)
            + 0.07 * np.sin(3 * phase)
        ) / 1.27

        tone *= envelope * 0.22

        # Original horizontal pixel position controls stereo placement.
        pan = col / max(1, width - 1)
        left_gain = np.cos(pan * np.pi / 2)
        right_gain = np.sin(pan * np.pi / 2)

        start = note_number * samples_per_note
        end = start + samples_per_note

        audio[start:end, 0] += tone * left_gain
        audio[start:end, 1] += tone * right_gain

    # Two subtle echo taps.
    for delay_seconds, gain in ((0.11, 0.13), (0.19, 0.07)):
        delay = round(delay_seconds * SAMPLE_RATE)
        audio[delay:] += gain * audio[:-delay].copy()

    return audio


def save_wav(audio, destination: Path):
    """Write stereo, 16-bit PCM WAV audio."""
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0

    if peak > 0.95:
        audio *= 0.95 / peak

    pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2")

    with wave.open(str(destination), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm.tobytes())


def convert(source: Path, destination: Path, max_notes: int = MAX_NOTES):
    grid, width = load_grid(source)

    valid_count, selected = select_points(grid, max_notes)
    audio = generate_audio(selected, width)
    save_wav(audio, destination)

    duration = len(audio) / SAMPLE_RATE

    print(f"Input image grid: {len(grid):,} rows × {width:,} columns")
    print(f"Valid NDVI values: {valid_count:,}")
    print(f"Notes generated: {len(selected):,}")
    print(f"Audio length: {duration:.1f} seconds")
    print(f"Created: {destination.resolve()}")


def main():
    parser = argparse.ArgumentParser(
        description="Convert a 2D NDVI JSON grid into stereo WAV audio."
    )
    parser.add_argument(
        "json_file",
        nargs="?",
        default="earth-ndvi-data.json",
        help="Input JSON file containing a 2D NDVI grid.",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Output WAV filename. Defaults to <input-name>_audio.wav.",
    )
    parser.add_argument(
        "--notes",
        type=int,
        default=MAX_NOTES,
        help=f"Maximum number of notes (default: {MAX_NOTES}).",
    )

    args = parser.parse_args()

    if args.notes < 1:
        parser.error("--notes must be at least 1")

    source = Path(args.json_file)
    if not source.is_file():
        parser.error(f"Input JSON file not found: {source}")

    destination = (
        Path(args.output)
        if args.output
        else source.with_name(f"{source.stem}_audio.wav")
    )

    try:
        convert(source, destination, args.notes)
    except (ValueError, OSError, json.JSONDecodeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
