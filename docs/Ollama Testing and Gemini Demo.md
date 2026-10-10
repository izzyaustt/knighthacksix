# Ollama testing → Gemini demo

Translation and phrase explanations now share a provider adapter. Gemini remains the default. Ollama requests stay on a local HTTP server, do not require a Gemini key, and never automatically fall back to Gemini. Audio still uses ElevenLabs and database saves still use Tiger Data.

## 1. Install the local test model

Install [Ollama](https://ollama.com/download) for your operating system and open the app. Choose a local model rather than a cloud model. In a terminal:

```sh
ollama pull qwen2.5:3b
```

This model supports Spanish and its download is approximately 1.9 GB ([model details](https://ollama.com/library/qwen2.5:3b)). It is a starting point for testing; translation/alignment quality and speed still need checking on your hardware. If the Ollama server is not running, keep this command running in a separate terminal:

```sh
ollama serve
```

If that reports the port is already in use, the app may already be serving it. Check:

```sh
curl http://localhost:11434/api/tags
```

Expect your downloaded model in the list. Do not choose a `:cloud` model.

## 2. Start the backend for free local translation

Use Node **22.18+**, preferably Node 24. From `knighthacksix/backend`:

```sh
npm run start:ollama
```

This command selects Ollama and disables mock mode, overriding any old `AI_PROVIDER` or `MOCK` value in `.env`. Existing database credentials and the trusted CA certificate are still needed because this is the same application backend.

On Kamilla's machine, Ollama was installed through Homebrew (command-line version). Start `OLLAMA_NO_CLOUD=1 ollama serve` if its server is not already running. The default Node is currently too old, so use the bundled runtime:

```sh
export LL_NODE=/Users/kamillamamatova/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
"$LL_NODE" start-provider.mjs ollama
```

Optional settings in your local `.env` (defaults work without these):

```env
AI_PROVIDER=ollama
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

`npm start` respects `AI_PROVIDER` and `MOCK` from your environment; the explicit provider start commands force real AI mode. Shell variables take priority over `.env`. The Ollama URL must be a local HTTP origin. The adapter uses Ollama's [structured-output API](https://docs.ollama.com/capabilities/structured-outputs) to preserve the same response shape as Gemini.

## 3. Confirm the provider and translation

With the backend running, in a second terminal from `backend`:

```sh
curl http://localhost:3000/health
npm run check:ai
```

Or on Kamilla's machine:

```sh
"$LL_NODE" check-ai.mjs
```

Expect `ai.provider` to be `ollama`, `batch_size` to be 3, and a real Spanish translation of “Hello, my friend.” The checker deliberately bypasses existing translation cache. It makes one `/align` request; the backend can retry the provider once on failure. With Gemini selected this uses Gemini quota. `/health` reports configuration only; `check:ai` verifies an actual response.

Rebuild the extension from `extension`:

```sh
npm run build
```

Or use the bundled runtime:

```sh
"$LL_NODE" node_modules/typescript/bin/tsc --noEmit
"$LL_NODE" node_modules/vite/bin/vite.js build
```

Reload the extension card in `chrome://extensions`, refresh YouTube, and use a short English-captioned video with CC enabled. Expect English and Spanish rather than `[ES]`. Click a phrase to check its explanation. Seek forward/backward to check timing.

Ollama uses three-caption batches to keep local responses smaller; Gemini uses 30. The extension processes the remaining batches in the background. Initial model loading can be slow. Requests time out after 45 seconds per provider attempt. If your computer cannot keep up, use mock mode for UI checks and Gemini for a few complete checks.

## 4. Switch to Gemini for the demo

Stop the Ollama backend with Ctrl+C. Keep `GEMINI_API_KEY` and your tested `GEMINI_MODEL` in the ignored project or backend `.env`, then:

```sh
npm run start:gemini
```

Or on Kamilla's machine:

```sh
"$LL_NODE" start-provider.mjs gemini
```

This forces Gemini and disables mock mode, even if `.env` still says Ollama or mock. Do not run both backends on port 3000 simultaneously.

Check again:

```sh
curl http://localhost:3000/health
npm run check:ai
```

Expect `ai.provider` to be `gemini` and `batch_size` to be 30. Refresh YouTube to discard captions already held by the extension. You do not need a different extension build to change providers.

Translation and explanation caches include provider and model, so Gemini does not reuse Ollama-generated text. Ollama does not need to remain running for the Gemini demo.

## 5. Before the demo

- Verify Gemini on the actual demo laptop/network well before presenting; a local model test cannot prove Gemini credentials/model/quota work.
- Test your chosen short video, one phrase explanation, Listen/Slow, and a microphone attempt. Audio is still ElevenLabs, and microphone permissions must be allowed.
- Confirm `/health/database` returns connected, sign in to the extension and dashboard with the demo Google account, and check that your attempt appears on the dashboard.
- Keep the backend terminal open and make sure `/health` reports Gemini.
- Rehearse on the same video; successful translations are cached for repeat viewing.

For the complete feature-by-feature checks, see [Testing the Extension](Testing%20the%20Extension.md).

## Automated checks

```sh
npm run test:ai
npm run test:extension
npm run typecheck
```

These test the provider contract, cache separation, default Gemini selection, actionable Ollama errors, no paid fallback, and mock routes. AI responses are stubbed; passing them does not claim a real local model or Gemini was run.

Optional live local-provider regression test (requires Ollama running with the model installed):

```sh
RUN_OLLAMA_TESTS=1 node --test test/ollama-live.test.mjs
```

This temporarily starts the backend on port 3098, checks real local translation/explanation and cache reuse, then stops that test backend. It makes no Gemini/ElevenLabs calls and writes no database records. It stores a translation entry in the ignored local caption cache. Without the flag the test is skipped.

## After merging Simone's UI

The extension now includes Simone's learning sidebar. Click the extension icon or press **Alt+L** on YouTube to open it. Colored captions still open phrase practice; the sidebar's **Practice / Listen** button opens the existing explanation, TTS, and recording controls. Its bilingual-caption switch replaces the previous overlay toolbar toggle; failed batches have **Retry translation** in the sidebar.

Both `AI_PROVIDER` and Simone's `LLM_PROVIDER` setting work; `AI_PROVIDER` takes priority. `OLLAMA_BASE_URL` likewise takes priority over `OLLAMA_URL`. The explicit start commands still select the requested provider and turn mock mode off. Defaults use the already-installed `qwen2.5:3b` model.

The sidebar shows local watch/lookup statistics. Full watched minutes are also logged to Tiger Data. Vocabulary saves await backend success; removing a saved item remains local because the backend has no DELETE route. The dashboard button targets the configured dashboard URL; a dashboard server must be running there.
