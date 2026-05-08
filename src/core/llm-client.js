/**
 * GODSEYE — LLM Client (Renderer-side)
 *
 * Orchestrates queries to the LLM via the main process IPC bridge.
 * Handles:
 *  - Context-aware prompt assembly
 *  - Streaming responses
 *  - Query intent classification (explain, summarize, solve, define, etc.)
 *  - Conversation history within a session
 *  - Error handling and retry logic
 */

/**
 * Classify the user's query intent to optimize the prompt.
 * Supports short contextual queries like "what does this mean?"
 */
const INTENT_PATTERNS = [
  { intent: 'explain', patterns: [/explain/i, /what does this mean/i, /what is this/i, /tell me about/i, /what('s| is) this/i] },
  { intent: 'explain_line', patterns: [/explain this line/i, /what does this line/i, /this line of code/i] },
  { intent: 'summarize', patterns: [/summarize/i, /summary/i, /tldr/i, /tl;?dr/i, /give me the gist/i] },
  { intent: 'solve', patterns: [/solve/i, /calculate/i, /compute/i, /work out/i, /what('s| is) the answer/i] },
  { intent: 'define', patterns: [/define/i, /definition/i, /what('s| is) the meaning/i, /meaning of/i] },
  { intent: 'translate', patterns: [/translate/i, /in english/i, /in spanish/i, /in french/i] },
  { intent: 'fix', patterns: [/fix/i, /what('s| is) wrong/i, /error/i, /bug/i, /debug/i, /why (isn't|doesn't|won't)/i] },
  { intent: 'continue', patterns: [/continue/i, /go on/i, /keep going/i, /more/i, /and then/i] },
  { intent: 'compare', patterns: [/compare/i, /difference between/i, /vs\.?/i, /versus/i] },
  { intent: 'simplify', patterns: [/simplify/i, /simpler/i, /dumb it down/i, /eli5/i, /explain like/i] },
];

function classifyIntent(query) {
  const q = query.trim();
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(q))) {
      return intent;
    }
  }
  return 'general';
}

/**
 * Build an optimized system prompt based on the intent and context.
 */
function buildPrompt(query, context, intent) {
  const parts = [];

  // Intent-specific instruction
  switch (intent) {
    case 'explain':
      parts.push('The user is asking you to explain something they see on screen. Give a clear, concise explanation.');
      break;
    case 'explain_line':
      parts.push('The user is asking about a specific line of code or text. Focus your explanation on that exact line.');
      break;
    case 'summarize':
      parts.push('The user wants a summary. Be concise — aim for 2-3 sentences unless the content is very long.');
      break;
    case 'solve':
      parts.push('The user wants you to solve or calculate something. Show your work step by step, then give the answer.');
      break;
    case 'define':
      parts.push('The user wants a definition. Give a clear, precise definition, then a brief example if helpful.');
      break;
    case 'fix':
      parts.push('The user sees an error or bug. Identify the problem and provide the fix. Be specific about what to change.');
      break;
    case 'simplify':
      parts.push('Explain this in the simplest possible terms. Avoid jargon. Use analogies if helpful.');
      break;
    default:
      parts.push('Answer the user\'s question based on what they\'re looking at on screen.');
  }

  // Add the screen context
  if (context?.hasContext && context.contextText) {
    parts.push('\n--- SCREEN CONTEXT ---');

    if (context.focusedContent?.line) {
      parts.push(`[Focused line]: ${context.focusedContent.line}`);
    }
    if (context.focusedContent?.paragraph) {
      parts.push(`[Focused paragraph]: ${context.focusedContent.paragraph}`);
    }

    parts.push(context.contextText);
    parts.push('--- END SCREEN CONTEXT ---');
  }

  // If the query is very short (like "what's this?"), the context IS the question
  if (query.length < 25 && context?.hasContext) {
    parts.push('\nThe user\'s query is short — they\'re referring to the screen content above. Use it to answer.');
  }

  return parts.join('\n');
}

export class LlmClient {
  constructor() {
    this._conversationHistory = []; // For follow-up questions
    this._maxHistoryLength = 10;
    this._streaming = false;
    this._abortController = null;
  }

  /**
   * Send a query to the LLM with screen context.
   * @param {string} query - User's spoken or typed query
   * @param {object} context - From ContextEngine.assembleContext()
   * @param {object} options
   * @returns {Promise<{ text: string, intent: string }>}
   */
  async query(query, context, options = {}) {
    const intent = classifyIntent(query);
    const systemContext = buildPrompt(query, context, intent);

    // Add to conversation history
    this._conversationHistory.push({ role: 'user', content: query });
    if (this._conversationHistory.length > this._maxHistoryLength) {
      this._conversationHistory = this._conversationHistory.slice(-this._maxHistoryLength);
    }

    try {
      const result = await window.godseye.queryLlm(query, systemContext);

      if (result.error) {
        throw new Error(result.error);
      }

      // Add response to history
      this._conversationHistory.push({ role: 'assistant', content: result.text });

      return { text: result.text, intent, usage: result.usage };
    } catch (err) {
      return { text: '', intent, error: err.message };
    }
  }

  /**
   * Stream a response from the LLM.
   * @param {string} query
   * @param {object} context
   * @param {object} callbacks - { onChunk, onDone, onError }
   */
  stream(query, context, callbacks = {}) {
    const intent = classifyIntent(query);
    const systemContext = buildPrompt(query, context, intent);

    this._streaming = true;
    let fullText = '';

    // Set up listeners
    const chunkHandler = ({ text }) => {
      fullText += text;
      callbacks.onChunk?.({ text: fullText, delta: text, intent });
    };

    const doneHandler = () => {
      this._streaming = false;
      this._conversationHistory.push({ role: 'user', content: query });
      this._conversationHistory.push({ role: 'assistant', content: fullText });
      callbacks.onDone?.({ text: fullText, intent });
      cleanup();
    };

    const errorHandler = ({ error }) => {
      this._streaming = false;
      callbacks.onError?.({ error, intent });
      cleanup();
    };

    const cleanup = () => {
      window.godseye.removeAllListeners('llm-chunk');
      window.godseye.removeAllListeners('llm-done');
      window.godseye.removeAllListeners('llm-error');
    };

    window.godseye.onLlmChunk(chunkHandler);
    window.godseye.onLlmDone(doneHandler);
    window.godseye.onLlmError(errorHandler);

    // Start the stream
    window.godseye.streamLlm(query, systemContext);

    return {
      abort: () => {
        this._streaming = false;
        cleanup();
      },
    };
  }

  /** Clear conversation history (new session). */
  clearHistory() {
    this._conversationHistory = [];
  }

  get isStreaming() {
    return this._streaming;
  }
}
