# JARVIS — AI Desktop Assistant

An AI desktop assistant with real-time eye-gaze tracking, voice activation, continuous screen monitoring, and contextual intelligence. Say **"Jarvis"** and it answers questions about what you're looking at.

## Features

- **Eye Tracking** — 9-point calibration using MediaPipe Face Mesh + polynomial regression. A dot follows your gaze on screen.
- **"Jarvis" Wake Word** — Always-on background listener via OpenAI Whisper. Say "Jarvis" and the bar drops down.
- **Always-On Mic** — Auto-detects when you finish speaking (1s silence), transcribes via Whisper, and submits. Resumes listening after each answer.
- **Continuous Screen Monitoring** — Captures your screen every 5 seconds. When you ask a question, Jarvis already knows what you've been doing.
- **Claude Vision** — Sends actual screenshots to Claude so it can see your screen. No hallucinating — real visual awareness.
- **Gaze-Aware Context** — Tells the LLM exactly where on screen you're looking (pixel coordinates).
- **Streaming Responses** — Token-by-token streaming for instant feedback.
- **Privacy-First** — All ML (gaze, OCR) runs on-device. API keys stored in local user config only.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron (main + renderer) |
| UI | Vanilla JS (no framework — ultra-lightweight overlay) |
| Gaze tracking | MediaPipe Face Mesh (WASM + WebGL) |
| Wake word / STT | OpenAI Whisper API |
| LLM | Anthropic Claude API (with Vision) |
| Screen capture | Electron `desktopCapturer` → JPEG |
| Config | `electron-store` |

## Architecture

```
src/
  main/          Electron main process (window, tray, IPC, permissions, screen capture)
  renderer/      Renderer process (self-contained UI + app orchestrator)
  core/          Processing modules (gaze, OCR, context, voice, LLM, privacy)
  utils/         Shared utilities (config, logger, ring buffers)
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full system design.

## Getting Started

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Production mode
npm start

# Package for distribution
npm run build
```

## Configuration

On first launch, set your API keys in the app settings:

- **Anthropic API Key** — Required for Claude LLM queries
- **OpenAI API Key** — Required for Whisper speech-to-text and wake word

Settings are persisted via `electron-store` at your OS user data directory. Keys are never stored in the codebase.

## How It Works

1. **App starts** → Eye tracker loads MediaPipe, camera opens, calibration screen appears
2. **Calibration** — Look at 9 purple dots as they appear. This maps your iris position to screen coordinates.
3. **Tracking** — A purple dot follows your gaze. Screen monitor captures every 5 seconds in the background.
4. **"Jarvis"** or **Ctrl+Shift+G** → Floating bar drops from the top with mic auto-on
5. **Speak your question** → 1 second of silence auto-submits → Whisper transcribes → Claude answers with full screen context
6. **After the answer** → Mic resumes automatically for the next question
7. **Click mic button** → Only way to manually turn mic off
8. **Escape / click outside** → Bar hides, wake word listener resumes

## Key Design Decisions

- **Vanilla JS** over React — the overlay must be ultra-lightweight with zero virtual DOM overhead
- **All ML on-device** — gaze tracking runs in WASM, never sent to cloud
- **JPEG screenshots** — ~10x smaller than PNG for fast API upload
- **Continuous monitoring** — screen captures stored locally, sent to Claude only when you ask
- **Adaptive noise filtering** — high-pass audio filter + noise floor calibration for reliable voice detection
