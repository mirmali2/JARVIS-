# GODSEYE — Project Guide

## What is this?
GODSEYE is an AI desktop assistant with real-time eye-gaze awareness, voice activation, and contextual intelligence. It uses the webcam to track where the user is looking on screen, captures and OCRs that region, and when the user says "Hey Jarvis," a floating bar appears ready to answer questions about what they're looking at.

## Tech Stack
- **Desktop shell**: Electron (main + renderer process)
- **UI**: Vanilla JS components (no React/framework — lightweight for overlay performance)
- **Gaze tracking**: MediaPipe Face Mesh (WASM + WebGL, runs in renderer)
- **OCR**: Tesseract.js (WASM, runs in renderer web worker)
- **Wake word**: Web Speech API continuous recognition (upgrade path to Porcupine)
- **STT/TTS**: Web Speech API
- **LLM**: Anthropic Claude API via `@anthropic-ai/sdk`
- **Config**: `electron-store` for persistent settings
- **Screen capture**: Electron `desktopCapturer` API

## Architecture
- `src/main/` — Electron main process (window, tray, IPC, permissions, screen capture)
- `src/renderer/` — Renderer process (UI components + app orchestrator)
- `src/core/` — Processing modules (gaze, OCR, context, voice, LLM, privacy)
- `src/utils/` — Shared utilities (config, logger, ring buffers)
- See `docs/ARCHITECTURE.md` for the full system design.

## Key Design Decisions
- **Vanilla JS** instead of React: the overlay must be ultra-lightweight; no virtual DOM overhead
- **All ML on-device**: gaze tracking and OCR run in WASM, never sent to cloud
- **Streaming LLM**: responses stream token-by-token for perceived speed
- **Context pre-caching**: OCR runs on every fixation, so context is ready before the query
- **Privacy-first**: 4-dot indicator, auto-clear buffers, sensitive content redaction

## Running
```bash
npm install
npm run dev    # Development with hot reload
npm start      # Production mode
npm run build  # Package for distribution
```

## Config
User settings are persisted via `electron-store` at the OS-level user data directory. API key must be set in Settings before LLM queries work.
