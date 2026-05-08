# GODSEYE — System Architecture

> AI desktop assistant with real-time gaze awareness, voice activation, and contextual intelligence.

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         GODSEYE Desktop App                              │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                     ELECTRON MAIN PROCESS                          │  │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────────┐ ┌──────────────────┐  │  │
│  │  │ Overlay   │ │  Tray    │ │ Permissions │ │  Screen Capture  │  │  │
│  │  │ Window    │ │  Menu    │ │ Manager     │ │  (desktopCapture)│  │  │
│  │  └────┬─────┘ └──────────┘ └─────────────┘ └──────────────────┘  │  │
│  │       │                                                            │  │
│  │  ┌────┴─────────────────────────────────────────────────────────┐  │  │
│  │  │                    IPC Bridge (preload.js)                    │  │  │
│  │  └──────────────────────────┬───────────────────────────────────┘  │  │
│  └─────────────────────────────┼──────────────────────────────────────┘  │
│                                │                                         │
│  ┌─────────────────────────────┼──────────────────────────────────────┐  │
│  │                     RENDERER PROCESS                               │  │
│  │                                                                    │  │
│  │  ┌──────────────────── CORE PIPELINE ──────────────────────────┐  │  │
│  │  │                                                              │  │  │
│  │  │  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐   │  │  │
│  │  │  │ GazeTracker  │───▶│  GazeMapper   │───▶│ ContextEngine │   │  │  │
│  │  │  │ (MediaPipe   │    │ (Calibration  │    │ (Capture+OCR  │   │  │  │
│  │  │  │  Face Mesh)  │    │  + Projection) │    │  + Assembly)  │   │  │  │
│  │  │  └─────────────┘    └──────────────┘    └───────┬───────┘   │  │  │
│  │  │                                                  │           │  │  │
│  │  │  ┌─────────────┐                                 │           │  │  │
│  │  │  │VoicePipeline│──── wake ──────┐                │           │  │  │
│  │  │  │ (Wake Word  │──── query ──┐  │                │           │  │  │
│  │  │  │  + STT)     │             │  │                │           │  │  │
│  │  │  └─────────────┘             │  │                │           │  │  │
│  │  │                              ▼  ▼                ▼           │  │  │
│  │  │  ┌──────────────────────────────────────────────────────┐   │  │  │
│  │  │  │                    LLM Client                         │   │  │  │
│  │  │  │  (Intent Classification + Prompt Assembly + Stream)   │   │  │  │
│  │  │  └──────────────────────────────────────────────────────┘   │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  │                                                                    │  │
│  │  ┌────────────────────── UI LAYER ─────────────────────────────┐  │  │
│  │  │  FloatingBar │ ResponsePanel │ PrivacyIndicator │ Settings  │  │  │
│  │  │  GazeIndicator │ CalibrationOverlay │ ConsentDialog         │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  │                                                                    │  │
│  │  ┌──────────────────── PRIVACY LAYER ──────────────────────────┐  │  │
│  │  │  PrivacyManager (Consent, Indicators, Auto-clear, Filters)  │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Module Breakdown

### 2.1 Electron Main Process (`src/main/`)

| File | Responsibility |
|---|---|
| `index.js` | App lifecycle, single-instance lock, global hotkey, permission handler |
| `overlay.js` | Frameless transparent always-on-top window that hosts the floating bar |
| `preload.js` | Context-isolated bridge exposing `window.godseye` API to renderer |
| `tray.js` | System tray with toggle controls for each privacy-sensitive subsystem |
| `permissions.js` | OS-level camera/mic permission requests (macOS TCC, Windows Chromium) |
| `screen-capture.js` | `desktopCapturer` wrapper: captures screen regions around gaze point |
| `ipc-handlers.js` | IPC channel router: capture, OCR, LLM (one-shot + streaming), config |

### 2.2 Core Pipeline (`src/core/`)

| Module | Input | Output | On-Device? |
|---|---|---|---|
| `gaze-tracker.js` | Webcam frames | Raw iris position (0–1) | Yes (MediaPipe WASM/WebGL) |
| `gaze-mapper.js` | Raw iris position | Screen coordinates (px) | Yes (polynomial regression) |
| `ocr-engine.js` | Screen region image | Text + bounding boxes | Yes (Tesseract.js WASM) |
| `context-engine.js` | Gaze + Capture + OCR | Assembled context string | Yes |
| `wake-word.js` | Mic audio stream | Wake event + transcribed query | Yes (Web Speech API) |
| `llm-client.js` | Query + context | Streamed LLM response | **No** (API call to Anthropic) |
| `privacy-manager.js` | All subsystems | Consent state + indicators | Yes |

### 2.3 UI Components (`src/renderer/components/`)

| Component | Purpose |
|---|---|
| `FloatingBar.js` | The main interaction surface — input field, mic, submit, privacy dots |
| `ResponsePanel.js` | Expandable response area with streaming text, copy, TTS |
| `PrivacyIndicator.js` | 4-dot indicator showing active subsystems |
| `WaveformVisualizer.js` | Real-time mic audio level bars |
| `GazeIndicator.js` | Debug overlay showing estimated gaze point on screen |
| `CalibrationOverlay.js` | 9-point gaze calibration procedure |
| `SettingsPanel.js` | Full settings modal (API key, gaze, voice, privacy, UI) |
| `ConsentDialog.js` | First-run permission consent flow |

---

## 3. Data Flow: "Hey Jarvis, explain this"

```
Time ──────────────────────────────────────────────────────────▶

[Always Running]
  GazeTracker ─── 15fps ───▶ GazeMapper ─── fixation ───▶ ContextEngine
                                                              │
                              [captures screen region at gaze point]
                              [runs OCR on captured image]
                              [stores context snapshot in ring buffer]

[User says "Hey Jarvis"]
  VoicePipeline ─── wake detected ───▶ App Shell
                                          │
                                    ┌─────┴──────┐
                                    │ Show bar    │
                                    │ Force capture│
                                    │ Start STT   │
                                    └─────┬──────┘
                                          │
[User says "explain this"]
  VoicePipeline ─── transcript ───▶ App Shell
                                          │
                                    ┌─────┴──────────────────┐
                                    │ ContextEngine           │
                                    │   .assembleContext()    │
                                    │   → focused line        │
                                    │   → surrounding text    │
                                    │   → recent gaze history │
                                    └─────┬──────────────────┘
                                          │
                                    ┌─────┴──────────────────┐
                                    │ LlmClient               │
                                    │   classify intent       │
                                    │   build prompt          │
                                    │   stream to Claude API  │
                                    └─────┬──────────────────┘
                                          │
                                    ┌─────┴──────┐
                                    │ FloatingBar │
                                    │  stream text│
                                    │  + TTS      │
                                    └────────────┘
```

---

## 4. Gaze Tracking Pipeline — Deep Dive

### 4.1 Landmark Detection (MediaPipe Face Mesh)

- **478 landmarks**: 468 face mesh + 10 iris landmarks (5 per eye)
- Runs via `@mediapipe/tasks-vision` WASM + WebGL backend
- Processes webcam at 15fps (configurable) to balance accuracy vs CPU

### 4.2 Iris Position Extraction

For each eye:
```
iris_x = distance(iris_center, eye_inner_corner) / distance(eye_outer_corner, eye_inner_corner)
iris_y = distance(iris_center, eye_top_lid) / distance(eye_bottom_lid, eye_top_lid)
```

This yields a 0–1 normalized position of the iris within the eye opening.

### 4.3 Gaze-to-Screen Mapping

**Without calibration** (fallback):
- Simple linear interpolation: iris_x ∈ [0.3, 0.7] → screen_x ∈ [0, width]
- ~150px accuracy — enough to identify general screen regions

**With calibration** (9-point):
- 2nd-order polynomial regression per axis:
  ```
  screen_x = a₀ + a₁·gx + a₂·gy + a₃·gx·gy + a₄·gx² + a₅·gy²
  ```
- Solved via normal equations with Gaussian elimination
- ~50-80px accuracy — enough to identify paragraphs and UI regions

### 4.4 Fixation Detection

- **Fixation**: gaze stays within `snapRadius` (60px) for > `fixationThresholdMs` (300ms)
- Distinguishes **fixations** (reading) from **saccades** (scanning)
- Only fixations trigger screen capture + OCR (saves CPU)

### 4.5 Temporal Smoothing

- Exponential Moving Average: `smooth = α·raw + (1-α)·prev_smooth`
- Ring buffer of last 5 samples for additional averaging
- Eliminates micro-jitter while preserving intentional gaze shifts

---

## 5. Context Assembly Strategy

When the user asks a question, the ContextEngine assembles context in priority order:

1. **Focused line** — the exact line at the gaze point (highest priority)
2. **Focused paragraph** — the paragraph containing the gaze point
3. **Surrounding lines** — ±2 lines above/below for context
4. **Full visible region** — all OCR text from the captured area
5. **Recent history** — deduplicated content from previous gaze fixations (last 10s)

The LlmClient wraps this in structured tags:
```
[Currently looking at this line]
const result = arr.filter(x => x > threshold);

[Surrounding content]
function processData(arr, threshold) {
  const result = arr.filter(x => x > threshold);
  return result.map(x => x * 2);
}

[Full visible region]
...
```

### 5.1 Intent Classification

Short queries are classified to optimize the system prompt:

| Query Example | Intent | Behavior |
|---|---|---|
| "what does this mean?" | `explain` | Explain the focused content |
| "explain this line" | `explain_line` | Focus on the exact line |
| "summarize this" | `summarize` | 2-3 sentence summary |
| "solve this" | `solve` | Step-by-step solution |
| "what's wrong?" | `fix` | Identify and fix the error |
| "simplify" | `simplify` | ELI5 explanation |

---

## 6. Privacy Architecture

### 6.1 Design Principles

| Principle | Implementation |
|---|---|
| **On-device by default** | Gaze tracking, OCR, wake word all run locally in WASM |
| **Explicit consent** | First-run dialog; each capability individually toggleable |
| **Visible indicators** | 4-dot privacy indicator always visible when bar is shown |
| **Easy kill switch** | Tray menu toggles; emergency stop clears everything |
| **Auto-clear** | Context buffer purges after 60s of inactivity |
| **Sensitive filtering** | Credit cards, SSNs, passwords, API keys auto-redacted |
| **Minimal cloud data** | Only extracted text (not images/audio) sent to LLM API |

### 6.2 What Is Sent to the Cloud

**Only** when the user explicitly asks a question:
- The user's query (text)
- Extracted OCR text from the screen region (not the raw image)
- Intent classification metadata

**Never sent:**
- Raw webcam video or frames
- Raw microphone audio
- Full screen captures
- Gaze tracking coordinates

### 6.3 Sensitive Content Detection

The OCR engine scans for patterns before sending context to the LLM:
- Credit card numbers (4-group digits)
- Social Security Numbers
- Password/secret fields
- Bearer tokens
- Private keys

Matched patterns are replaced with `[REDACTED]` before context assembly.

---

## 7. Latency Budget

Target: **< 800ms** from wake word to streaming response start.

| Stage | Target | Strategy |
|---|---|---|
| Wake word detection | ~100ms | Continuous Web Speech API |
| Context capture | ~150ms | Pre-cached from recent fixations |
| OCR (if needed) | ~200ms | Tesseract.js WASM SIMD + caching |
| LLM first token | ~300ms | Streaming API, Haiku for speed |
| **Total** | **~750ms** | |

### 7.1 Latency Optimizations

- **Pre-capture**: OCR runs on every fixation, not just on query — context is usually pre-cached
- **Streaming**: LLM response streams token-by-token, so first word appears fast
- **WASM SIMD**: Tesseract.js and MediaPipe both use SIMD acceleration
- **GPU delegation**: MediaPipe uses WebGL for face mesh inference
- **Rate limiting**: Capture + OCR throttled to 2/sec to avoid CPU saturation

---

## 8. Error Recovery & Fallbacks

| Failure | Fallback |
|---|---|
| Camera denied/unavailable | Disable gaze tracking; use hotkey-only wake + full-screen capture |
| Mic denied/unavailable | Keyboard input only; hotkey to activate |
| Wake word not detected | Global hotkey (Ctrl+Shift+J) always works |
| Face not visible | Full-screen capture instead of gaze-targeted region |
| OCR returns empty | Send raw query without context; LLM handles gracefully |
| OCR confidence low | Expand capture region; try full-screen fallback |
| LLM API key missing | Show Settings panel with API key field highlighted |
| LLM API error | Display error in response panel with retry suggestion |
| LLM rate limit | Exponential backoff; show "rate limited" message |
| MediaPipe load fails | Degrade to keyboard-only mode with full-screen OCR |

---

## 9. File Structure

```
GODSEYE/
├── package.json              # Dependencies and build scripts
├── CLAUDE.md                 # Project guide for AI assistants
├── src/
│   ├── main/                 # Electron main process
│   │   ├── index.js          # App entry point, lifecycle, hotkey
│   │   ├── overlay.js        # Transparent overlay window
│   │   ├── preload.js        # Context-isolated API bridge
│   │   ├── tray.js           # System tray with privacy toggles
│   │   ├── permissions.js    # OS permission management
│   │   ├── screen-capture.js # desktopCapturer region capture
│   │   └── ipc-handlers.js   # IPC routing (capture, OCR, LLM, config)
│   ├── renderer/             # Electron renderer process
│   │   ├── index.html        # HTML shell with styles
│   │   ├── app.js            # Master orchestrator
│   │   └── components/       # UI components (vanilla JS)
│   │       ├── FloatingBar.js
│   │       ├── ResponsePanel.js
│   │       ├── PrivacyIndicator.js
│   │       ├── WaveformVisualizer.js
│   │       ├── GazeIndicator.js
│   │       ├── CalibrationOverlay.js
│   │       ├── SettingsPanel.js
│   │       └── ConsentDialog.js
│   ├── core/                 # Processing modules
│   │   ├── gaze-tracker.js   # MediaPipe face mesh + iris extraction
│   │   ├── gaze-mapper.js    # Calibration + polynomial projection
│   │   ├── ocr-engine.js     # Tesseract.js OCR + sensitive filter
│   │   ├── context-engine.js # Capture + OCR + context assembly
│   │   ├── wake-word.js      # Wake word + STT + TTS
│   │   ├── llm-client.js     # Intent classification + LLM streaming
│   │   └── privacy-manager.js# Consent, indicators, auto-clear
│   └── utils/
│       ├── config.js         # electron-store config management
│       ├── logger.js         # Structured logging
│       └── buffer.js         # RingBuffer + TimeWindowBuffer
├── assets/
│   ├── icon.png
│   ├── sounds/
│   └── models/
└── docs/
    └── ARCHITECTURE.md       # This file
```

---

## 10. Production Roadmap

### Phase 1: Foundation (Weeks 1-3)
- [x] Electron shell with transparent overlay
- [x] Floating bar UI with input, mic, privacy indicators
- [x] System tray with toggle controls
- [x] Settings panel with all configuration options
- [x] First-run consent dialog
- [x] IPC bridge and config persistence
- [ ] End-to-end smoke test: hotkey → bar → typed query → LLM response

### Phase 2: Gaze Intelligence (Weeks 4-6)
- [x] MediaPipe Face Mesh integration
- [x] Iris position extraction and smoothing
- [x] 9-point calibration procedure
- [x] Polynomial gaze-to-screen mapping
- [x] Fixation detection and region clustering
- [ ] Calibration accuracy testing and tuning
- [ ] Head pose compensation for improved accuracy

### Phase 3: Context Pipeline (Weeks 7-9)
- [x] Screen region capture around gaze point
- [x] Tesseract.js OCR with caching
- [x] Text-at-point extraction (word/line/paragraph)
- [x] Sensitive content detection and redaction
- [x] Context assembly with priority ordering
- [ ] OCR accuracy testing across different apps/fonts
- [ ] Accessibility tree integration (for native apps)

### Phase 4: Voice Pipeline (Weeks 10-11)
- [x] Wake word detection via Web Speech API
- [x] Speech-to-text for user queries
- [x] Text-to-speech for responses
- [x] Waveform visualization
- [ ] Replace Web Speech API wake word with Porcupine for lower latency
- [ ] Whisper.cpp integration for offline STT

### Phase 5: Polish & Edge Cases (Weeks 12-14)
- [ ] Multi-monitor support
- [ ] DPI scaling / HiDPI handling
- [ ] Dark/light/system theme support
- [ ] Auto-updater (electron-updater)
- [ ] Crash reporting and telemetry (opt-in)
- [ ] Performance profiling and optimization
- [ ] Windows code signing
- [ ] macOS notarization

### Phase 6: Advanced Features (Post-launch)
- [ ] Conversation history panel
- [ ] Pin responses for reference
- [ ] Custom wake words
- [ ] Plugin system for app-specific context
- [ ] Clipboard integration (auto-detect copied text)
- [ ] Multi-language OCR and STT
- [ ] Accessibility API integration for richer context
- [ ] On-device LLM option (llama.cpp) for fully offline mode
