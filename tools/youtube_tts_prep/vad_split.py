import torch
import torchaudio
from vad import VoiceActivityDetector  # from silero-vad repo
import os, sys

model, utils = torch.hub.load(repo_or_dir='snakers4/silero-vad', model='silero_vad', force_reload=False)
(get_speech_timestamps, _, read_audio, _, _) = utils

input_wav = sys.argv[1]
output_dir = sys.argv[2]
wav = read_audio(input_wav, sampling_rate=16000)
speech_timestamps = get_speech_timestamps(wav, model, sampling_rate=16000)

# Combine segments into one clean file
segments = []
for i, ts in enumerate(speech_timestamps):
    segment = wav[ts['start']:ts['end']]
    segments.append(segment)

clean_audio = torch.cat(segments)
torchaudio.save(os.path.join(output_dir, "vad_cleaned.wav"), clean_audio.unsqueeze(0), 16000)
