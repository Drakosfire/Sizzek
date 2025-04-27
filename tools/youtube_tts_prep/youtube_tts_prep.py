# Here's a refactor of the Python CLI tool that directly imports the VAD logic from vad_split.py
# instead of calling it as a subprocess.

from typer import Typer, prompt
import subprocess
import os
import time
from pathlib import Path
import torch
import torchaudio

app = Typer()

def download_and_trim_audio(url: str, start: str, end: str, output_dir: Path) -> Path:
    original_audio = output_dir / "original.wav"
    trimmed_audio = output_dir / "mono.wav"

    # Download audio from YouTube
    subprocess.run([
        "yt-dlp", "-x", "--audio-format", "wav",
        "-o", str(original_audio), url
    ], check=True)

    # Trim audio to the given timestamps and convert to 16kHz mono
    subprocess.run([
        "ffmpeg", "-y", "-i", str(original_audio),
        "-ss", start, "-to", end, "-ar", "16000", "-ac", "1",
        str(trimmed_audio)
    ], check=True)

    return trimmed_audio

def run_vad_in_process(input_wav: Path, output_dir: Path):
    model, utils = torch.hub.load(repo_or_dir='snakers4/silero-vad', model='silero_vad', force_reload=False)
    (get_speech_timestamps, _, read_audio, _, _) = utils

    wav = read_audio(str(input_wav), sampling_rate=16000)
    speech_timestamps = get_speech_timestamps(wav, model, sampling_rate=16000)

    segments = []
    for ts in speech_timestamps:
        segment = wav[ts['start']:ts['end']]
        segments.append(segment)

    if not segments:
        raise ValueError("No speech detected in audio.")

    clean_audio = torch.cat(segments)
    output_path = output_dir / "vad_cleaned.wav"
    torchaudio.save(str(output_path), clean_audio.unsqueeze(0), 16000)

def normalize_audio(input_path: Path, output_path: Path):
    subprocess.run([
        "ffmpeg", "-y", "-i", str(input_path),
        "-filter:a", "loudnorm",
        str(output_path)
    ], check=True)

@app.command()
def main():
    url = prompt("Enter YouTube URL")
    start = prompt("Enter start time (e.g., 00:01:30)")
    end = prompt("Enter end time (e.g., 00:02:00)")

    timestamp = int(time.time())
    output_dir = Path(f"processed_clip_{timestamp}")
    output_dir.mkdir(parents=True, exist_ok=True)

    print("🎧 Downloading and trimming audio...")
    trimmed_audio = download_and_trim_audio(url, start, end, output_dir)

    print("🔍 Running Voice Activity Detection...")
    run_vad_in_process(trimmed_audio, output_dir)

    vad_output = output_dir / "vad_cleaned.wav"
    final_output = output_dir / "final_clean.wav"

    print("🔊 Normalizing audio...")
    normalize_audio(vad_output, final_output)

    print(f"✅ Done! Final clean audio saved to: {final_output}")

if __name__ == "__main__":
    app()
