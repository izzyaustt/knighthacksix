import 'dotenv/config';
import fs from 'fs';
import { GoogleGenAI, Type } from '@google/genai';

const MODEL = 'gemini-3.8-flash';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const system = fs.readFileSync('prompt.txt', 'utf8');
const lines = JSON.parse(fs.readFileSync('lines.json', 'utf8'));

const res = await ai.models.generateContent({
  model: MODEL,
  contents: JSON.stringify(lines.map((text, id) => ({ id, text }))),
  config: {
    systemInstruction: system,
    temperature: 0.2,
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.INTEGER },
          target: { type: Type.STRING },
          pairs: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                src: { type: Type.STRING },
                tgt: { type: Type.STRING },
                color: { type: Type.INTEGER },
              },
              required: ['src', 'tgt', 'color'],
            },
          },
        },
        required: ['id', 'target', 'pairs'],
      },
    },
  },
});

for (const o of JSON.parse(res.text)) {
  const english = lines[o.id];
  console.log(`\n${english}\n  -> ${o.target}`);
  for (const p of o.pairs) {
    const ok = english.includes(p.src) && o.target.includes(p.tgt);
    console.log(`  ${ok ? 'ok ' : 'BAD'} [${p.color}] "${p.src}" = "${p.tgt}"`);
  }
}