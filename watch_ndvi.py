
import time
import sys
import subprocess
from pathlib import Path

# ==========================================
# FOLDER SETTINGS
# ==========================================

# Folder containing this Python script
PROJECT_FOLDER = Path(__file__).parent

# Windows Downloads folder
DOWNLOADS_FOLDER = Path.home() / "Downloads"

# Sonification converter
SONIFICATION_SCRIPT = PROJECT_FOLDER / "ndvi_to_audio_fixed.py"


# ==========================================
# CHECK REQUIRED FILES
# ==========================================

if not SONIFICATION_SCRIPT.exists():
    print("ERROR: Sonification script not found!")
    print(SONIFICATION_SCRIPT)
    sys.exit(1)

if not DOWNLOADS_FOLDER.exists():
    print("ERROR: Downloads folder not found!")
    print(DOWNLOADS_FOLDER)
    sys.exit(1)


# ==========================================
# TRACK EXISTING JSON FILES
# ==========================================

known_files = {}

for file in DOWNLOADS_FOLDER.glob("earth-ndvi-data*.json"):
    stat = file.stat()
    known_files[file] = (stat.st_size, stat.st_mtime)

candidates = {}


# ==========================================
# START WATCHER
# ==========================================

print("NDVI file watcher is running.")
print("Monitoring:", DOWNLOADS_FOLDER)
print("Audio will be saved in:", PROJECT_FOLDER)
print("Waiting for new JSON files...")
print("Press Ctrl+C to stop.\n")


try:

    while True:

        for file in DOWNLOADS_FOLDER.glob("earth-ndvi-data*.json"):

            if not file.is_file():
                continue

            stat = file.stat()

            signature = (stat.st_size, stat.st_mtime)

            # Ignore files that haven't changed
            if signature == known_files.get(file):
                candidates.pop(file, None)
                continue

            previous = candidates.get(file)

            # Check whether the file has stopped changing
            if previous and previous[0] == signature:
                stable_count = previous[1] + 1
            else:
                stable_count = 0

            candidates[file] = (signature, stable_count)

            # Wait until download is complete
            if stable_count < 2:
                continue

            # Create output filename
            output = PROJECT_FOLDER / f"{file.stem}_audio.wav"

            print(f"\nNew JSON detected: {file.name}")
            print("Generating audio...")

            result = subprocess.run([
                sys.executable,
                str(SONIFICATION_SCRIPT),
                str(file),
                "--output",
                str(output)
            ])

            if result.returncode == 0:
                print("\nAudio generated successfully!")
                print("Saved at:", output)
            else:
                print("\nAudio generation failed.")

            # Mark file as processed
            known_files[file] = signature
            candidates.pop(file, None)

        time.sleep(1)


except KeyboardInterrupt:

    print("\nFile watcher stopped.")
