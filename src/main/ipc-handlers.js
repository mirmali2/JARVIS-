/**
 * GODSEYE — IPC Handlers
 *
 * Bridges renderer requests to main-process services:
 * screen capture, OCR, LLM queries, config, permissions.
 */

const { ipcMain } = require('electron');
const config = require('../utils/config');
const { checkPermission } = require('./permissions');
const { createModuleLogger } = require('../utils/logger');
const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const { Readable } = require('stream');

const log = createModuleLogger('ipc');

let anthropicClient = null;

function getAnthropicClient() {
  if (!anthropicClient) {
    const apiKey = config.get('llm.apiKey');
    if (!apiKey) {
      throw new Error('Anthropic API key not configured. Set it in Settings.');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

function registerIpcHandlers(overlayWindow, screenCapture) {
  // --- Screen Capture ---
  ipcMain.handle('capture-region', async (_, { x, y, w, h }) => {
    if (!config.get('capture.enabled')) return null;
    return screenCapture.captureRegion(x, y, w, h);
  });

  ipcMain.handle('capture-fullscreen', async () => {
    if (!config.get('capture.enabled')) return null;
    return screenCapture.captureFullScreen();
  });

  // --- OCR (delegated to renderer via Tesseract.js, but can also run here) ---
  ipcMain.handle('run-ocr', async (_, imageDataUrl) => {
    // OCR runs in the renderer for now (Tesseract.js in web worker)
    // This handler exists for potential future server-side OCR
    return { text: '', confidence: 0 };
  });

  // --- LLM: One-shot query ---
  ipcMain.handle('query-llm', async (_, { prompt, context }) => {
    try {
      const client = getAnthropicClient();
      const systemPrompt = config.get('llm.systemPrompt');

      let fullContext = systemPrompt;
      if (context) {
        fullContext += `\n\n<screen_context>\nThe user is currently looking at the following content on their screen:\n${context}\n</screen_context>`;
      }

      const response = await client.messages.create({
        model: config.get('llm.model'),
        max_tokens: config.get('llm.maxTokens'),
        temperature: config.get('llm.temperature'),
        system: fullContext,
        messages: [{ role: 'user', content: prompt }],
      });

      return {
        text: response.content[0]?.text || '',
        usage: response.usage,
      };
    } catch (e) {
      log.error('LLM query failed', { error: e.message });
      return { text: '', error: e.message };
    }
  });

  // --- LLM: Streaming query (with screen monitoring images for Claude Vision) ---
  ipcMain.on('stream-llm', async (event, { prompt, context, images }) => {
    try {
      const client = getAnthropicClient();
      const systemPrompt = config.get('llm.systemPrompt');

      let fullContext = systemPrompt;
      if (context) {
        fullContext += `\n\n<screen_context>\n${context}\n</screen_context>`;
      }

      // Build user message: monitoring screenshots (oldest→newest) + text
      const userContent = [];
      if (images && images.length > 0) {
        for (const img of images) {
          const match = img.match(/^data:(image\/[^;]+);base64,(.+)$/s);
          if (match) {
            userContent.push({
              type: 'image',
              source: { type: 'base64', media_type: match[1], data: match[2] }
            });
          }
        }
      }
      userContent.push({ type: 'text', text: prompt });

      const stream = client.messages.stream({
        model: config.get('llm.model'),
        max_tokens: config.get('llm.maxTokens'),
        temperature: config.get('llm.temperature'),
        system: fullContext,
        messages: [{ role: 'user', content: userContent }],
      });

      stream.on('text', (text) => {
        overlayWindow.webContents.send('llm-chunk', { text });
      });

      stream.on('end', () => {
        overlayWindow.webContents.send('llm-done', {});
      });

      stream.on('error', (error) => {
        overlayWindow.webContents.send('llm-error', { error: error.message });
      });
    } catch (e) {
      log.error('LLM stream failed', { error: e.message });
      overlayWindow.webContents.send('llm-error', { error: e.message });
    }
  });

  // --- Speech-to-Text via OpenAI Whisper ---
  ipcMain.handle('whisper-transcribe', async (_, { audioBase64, mimeType }) => {
    const openaiKey = config.get('openai.apiKey');
    if (!openaiKey) {
      return { text: '', error: 'OpenAI API key not configured.' };
    }

    try {
      // Convert base64 audio to buffer
      const audioBuffer = Buffer.from(audioBase64, 'base64');

      // Build multipart form data manually
      const boundary = '----GodseyeBoundary' + Date.now();
      const ext = mimeType === 'audio/webm' ? 'webm' : 'wav';

      const formParts = [];
      // file field
      formParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mimeType}\r\n\r\n`);
      const filePartEnd = `\r\n`;
      // model field
      const modelPart = `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`;
      // language field
      const langPart = `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nen\r\n`;
      // close
      const closePart = `--${boundary}--\r\n`;

      const bodyStart = Buffer.from(formParts[0], 'utf-8');
      const bodyFileEnd = Buffer.from(filePartEnd, 'utf-8');
      const bodyModel = Buffer.from(modelPart, 'utf-8');
      const bodyLang = Buffer.from(langPart, 'utf-8');
      const bodyClose = Buffer.from(closePart, 'utf-8');

      const fullBody = Buffer.concat([bodyStart, audioBuffer, bodyFileEnd, bodyModel, bodyLang, bodyClose]);

      return await new Promise((resolve) => {
        const req = https.request({
          hostname: 'api.openai.com',
          path: '/v1/audio/transcriptions',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': fullBody.length,
          },
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.error) {
                log.error('Whisper error', json.error);
                resolve({ text: '', error: json.error.message });
              } else {
                log.info('Whisper transcription', { text: json.text?.slice(0, 50) });
                resolve({ text: json.text || '' });
              }
            } catch (e) {
              resolve({ text: '', error: 'Failed to parse Whisper response' });
            }
          });
        });

        req.on('error', (e) => {
          log.error('Whisper request failed', { error: e.message });
          resolve({ text: '', error: e.message });
        });

        req.write(fullBody);
        req.end();
      });
    } catch (e) {
      log.error('Whisper transcription failed', { error: e.message });
      return { text: '', error: e.message };
    }
  });

  // --- Config ---
  ipcMain.handle('config-get', (_, path) => config.get(path));
  ipcMain.handle('config-set', (_, { path, value }) => {
    config.set(path, value);
    // Reset Anthropic client if API key changes
    if (path === 'llm.apiKey') {
      anthropicClient = null;
    }
    return true;
  });
  ipcMain.handle('config-get-all', () => config.getAll());

  // --- Permissions ---
  ipcMain.handle('permission-status', async () => ({
    camera: config.get('privacy.cameraPermissionGranted'),
    microphone: config.get('privacy.microphonePermissionGranted'),
    screenCapture: config.get('privacy.screenCapturePermissionGranted'),
  }));

  ipcMain.handle('request-permission', async (_, type) => {
    const status = await checkPermission(type);
    return status === 'granted';
  });

  // --- Window Control ---
  ipcMain.on('overlay-show', () => {
    overlayWindow.show();
  });

  ipcMain.on('overlay-hide', () => {
    overlayWindow.hide();
  });

  ipcMain.on('set-click-through', (_, ignore) => {
    overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
  });

  log.info('IPC handlers registered');
}

module.exports = { registerIpcHandlers };
