# Cardo Cloud ASR Demo

Browser-based Cardo voice assistant demo using OpenAI Realtime transcription plus Responses API command resolution.

## What Changed Recently

- Command parsing now uses a structured command catalog (`COMMAND_CATALOG`) in `src/prompt.js`.
- Command extraction now enforces strict structured output (`json_schema`) with an allowlist from `ALLOWED_COMMANDS`.
- Fast text model flow now uses:
  - primary: `gpt-5-nano`
  - fallback: `gpt-4.1-nano`
- Responses API calls include retry logic with progressively relaxed payloads for compatibility.
- Follow-up clarification questions are constrained to short text and converted to speech with `gpt-4o-mini-tts`.
- Runtime diagnostics include optional in-page logs with the `?log` URL parameter.

## Project Structure

```text
heycardo/
├── index.html
├── resources/
│   ├── cardo_logo.avif
│   ├── check.png
│   ├── mic.png
│   ├── mute.png
│   ├── ok.wav
│   ├── power_off.png
│   └── try-again.wav
└── src/
    ├── drafts.js
    ├── main.js
    ├── openai.js
    ├── prompt.js
    └── utils.js
```

## Runtime Flow

1. Browser captures mic audio and opens a Realtime transcription session.
2. Partial/final transcripts are streamed via WebRTC data channel events.
3. Inputs are only treated as commands when a wake greeting is detected (`hey|hi|hello + cardo/kardo/caldo`).
4. First-pass command parse runs against the allowed command schema.
5. If unresolved, the app generates a short follow-up question and plays TTS audio.
6. The follow-up answer is parsed again against the same command schema.
7. On success, the command is shown in the UI and confirmation audio is played.

## URL Parameters

- Required: `key`
  - Example: `http://localhost:8080/?key=42`
  - Used to deobfuscate the embedded API token at runtime.
- Optional: `log`
  - Example: `http://localhost:8080/?key=42&log=1`
  - Shows the in-page debug log panel.

## Local Run

Serve the directory over HTTP (do not use `file://` for mic/WebRTC):

```bash
cd /Users/erez/Source/heycardo
python3 -m http.server 8080
```

Then open:

- `http://localhost:8080/?key=42`
- or `http://localhost:8080/?key=42&log=1` for logs

## Key Files

- `index.html`: UI, app bootstrap, logging panel, audio unlock behavior, key validation.
- `src/main.js`: state machine for wake word detection, command/follow-up flow, session lifecycle.
- `src/openai.js`: OpenAI API integration (Realtime session setup, Responses API command parsing, TTS follow-ups).
- `src/prompt.js`: command catalog and prompt templates for first parse, follow-up generation, and second parse.
- `src/utils.js`: beeps/timers plus token obfuscation helpers.

## Notes

- Demo-only implementation with client-side API token reconstruction.
- Not production-safe for secrets.
- Requires a modern browser with microphone permission.
