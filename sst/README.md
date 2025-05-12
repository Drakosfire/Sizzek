# Sizzek: Passive Voice Recognition System (Secure Local Architecture)

## Overview

This feature enables Sizzek to passively listen for a wake word via a Bluetooth microphone, identify the speaker, transcribe their speech, and route it securely to a local LLM instance. The entire pipeline operates within a home network for maximum privacy and security.

---

## System Architecture

```plaintext
[ Bluetooth Mic ]
      ↓
[ Audio Buffer + Wake Word Detection ]
      ↓                ↘
[ STT (Whisper.cpp) ]   [Speaker ID]
      ↓                     ↓
      └────→ [ LLM w/ tools ] ←───┐
                                  ↓
                         [ Function Calls ]
                         [ Home Control | Query Engine | Notes | etc. ]
```

---

## Components & Responsibilities

### 1. Bluetooth Microphone Input
- Use PulseAudio or PipeWire to route audio from a trusted Bluetooth microphone.
- Restrict pairing to known MAC address.
- Enforce sandboxing with AppArmor/SELinux if available.
- Monitor device connection/disconnection logs.

### 2. Wake Word Detection
- Use `Porcupine` for lightweight, offline keyword detection.
- Audio is buffered (2-3 seconds) and discarded unless wake word is detected.
- Wake event triggers the downstream pipeline.

### 3. Speaker Identification
- Use `ECAPA-TDNN` (via SpeechBrain) to generate speaker embeddings.
- Match against encrypted, locally stored profile embeddings.
- Drop or warn on unknown speakers based on config.

### 4. Transcription
- Use `whisper.cpp` for local, efficient ASR transcription.
- Transcribe 10–30 seconds of speech after wake word detection.
- Optionally retain transcripts only temporarily or based on speaker permissions.

### 5. LLM Integration
- Input: `{speaker, transcript}`
- LLMs: Run `llama-cpp`, `ollama`, or `open-interpreter` locally.
- Tools available:
  - File operations
  - Smart home control
  - Notes/reminders
  - Query engines
- Function-calling enabled to route commands securely.

---

## Security Measures

- All components run in an isolated container or VM with no outbound internet.
- No raw audio or transcripts are stored unless explicitly permitted.
- Use TPM or file-based encryption for speaker profiles and LLM memory.
- Audit log records wake word hits, recognized speaker, and LLM actions.
- Rate-limit and timeout input windows to prevent abuse or eavesdropping.

---

## Dependencies

| Component            | Recommended Tools                             |
|----------------------|-----------------------------------------------|
| Audio Routing        | PulseAudio or PipeWire                        |
| Wake Word Detection  | Porcupine (https://github.com/Picovoice/porcupine) |
| STT                  | whisper.cpp (https://github.com/ggerganov/whisper.cpp) |
| Speaker ID           | SpeechBrain ECAPA-TDNN                        |
| LLM                  | llama.cpp, ollama, open-interpreter           |
| Isolation            | Docker / Podman / Firejail / VM               |
| Security Hardening   | AppArmor, SELinux, local firewall             |

---

## Next Steps

- [ ] Set up Bluetooth mic and confirm secure pairing.
- [ ] Build audio buffer + wake word detection.
- [ ] Integrate whisper.cpp with audio capture post-wake.
- [ ] Create speaker ID enrollment and match system.
- [ ] Launch LLM with tool calling and secure function routing.
- [ ] Test end-to-end flow locally.
- [ ] Harden system and deploy with full logging/auditing.
