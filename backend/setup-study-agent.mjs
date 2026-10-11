import './env.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { makeStudyAgentConfig, agentEnvKey } from './study-agent-config.mjs';
import { isLanguage, languageName } from '../shared/languages.ts';
const lang = process.argv[2] ?? 'es';
if (!isLanguage(lang)) throw Error('Choose es, fr, or fil.');
const key = agentEnvKey(lang);
if (process.env[key]) {
  console.log('Study agent is already configured.');
  process.exit(0);
}
if (!process.env.ELEVENLABS_API_KEY) throw Error('ELEVENLABS_API_KEY is not configured');
const response = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
  method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
  body: JSON.stringify(makeStudyAgentConfig(lang)), signal: AbortSignal.timeout(30000),
});
if (!response.ok) {
  console.error('Agent creation failed:', response.status, 'Check your ElevenLabs API key and agent configuration.');
  process.exit(1);
}
const { agent_id } = await response.json();
if (!agent_id) throw Error('ElevenLabs returned no agent ID');
const file = new URL('./.env', import.meta.url);
const existing = await readFile(file, 'utf8').catch(() => '');
await writeFile(file, existing.split('\n').filter(line => !line.startsWith(`${key}=`)).join('\n').trimEnd() + `\n${key}=${agent_id}\n`);
console.log(`Created private ${languageName(lang)} tutor and saved its ID in backend/.env.`);
