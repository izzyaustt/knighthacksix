const provider = process.argv[2];
if (!['ollama', 'gemini'].includes(provider)) throw new Error('Usage: node start-provider.mjs ollama|gemini');
// Explicit start commands override .env, including a leftover mock setting.
process.env.AI_PROVIDER = provider;
process.env.MOCK = '0';
await import('./server.mjs');
