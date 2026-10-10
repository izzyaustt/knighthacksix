const base = 'http://localhost:3000';
try {
  const healthResponse = await fetch(`${base}/health`);
  if (!healthResponse.ok) throw new Error('Backend health check failed.');
  const { ai } = await healthResponse.json();
  console.log(`Active AI: ${ai.provider} (${ai.model}); caption batch size: ${ai.batch_size}`);
  if (ai.provider === 'mock') throw new Error('Mock mode is active. Start with npm run start:ollama or npm run start:gemini.');
  const response = await fetch(`${base}/align`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(110000),
    // A unique ID deliberately tests the real provider rather than an existing cache.
    body: JSON.stringify({ videoId: `smoke-${crypto.randomUUID()}`, lang: 'es', lines: [{ start: 0, end: 3, text: 'Hello, my friend.' }] }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  if (!data.lines?.[0]?.target) throw new Error('No translated caption returned.');
  console.log(`English: ${data.lines[0].source}`);
  console.log(`Spanish: ${data.lines[0].target}`);
  console.log(`Aligned phrases: ${data.lines[0].pairs.length}`);
  console.log('Provider responded successfully. Check the Spanish and Chrome playback manually next.');
} catch (error) {
  console.error(error.message === 'fetch failed' ? 'Start the backend on localhost:3000 first.' : error.message);
  process.exitCode = 1;
}
