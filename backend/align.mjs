import 'dotenv/config';
import fs from 'fs';
import { Type } from '@google/genai';
import { generateJson, provider } from './llm.mjs';

const SYSTEM = fs.readFileSync(new URL('./prompt.txt', import.meta.url), 'utf8');

const schema = {
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
          properties: { src: { type: Type.STRING }, tgt: { type: Type.STRING }, color: { type: Type.INTEGER } },
          required: ['src', 'tgt', 'color'],
        },
      },
    },
    required: ['id', 'target', 'pairs'],
  },
};

// Keep only pairs whose text really appears in the line. Adds character offsets
// so the overlay can find the spans, and re-assigns colors so neighbors differ.
export function validate(text, target, pairs) {
  const usedTgt = [];
  let cursor = 0;
  const out = [];
  for (const p of Array.isArray(pairs) ? pairs : []) {
    if (typeof p?.src !== 'string' || typeof p?.tgt !== 'string' || !p.src.trim() || !p.tgt.trim()) continue;
    const s = text.indexOf(p.src, cursor);
    if (s < 0) continue;
    let t = target.indexOf(p.tgt);
    while (t >= 0 && usedTgt.some(([a, b]) => t < b && t + p.tgt.length > a)) {
      t = target.indexOf(p.tgt, t + 1);
    }
    if (t < 0) continue;
    usedTgt.push([t, t + p.tgt.length]);
    cursor = s + p.src.length;
    out.push({ src: p.src, tgt: p.tgt, srcStart: s, tgtStart: t, color: out.length % 3 });
  }
  return out;
}

// A small local model is slow and has a short context window: give it fewer lines per request,
// and skip `color`, which validate() reassigns anyway (about a quarter fewer output tokens).
const LOCAL_CHUNK = 10;
const localSchema = structuredClone(schema);
delete localSchema.items.properties.pairs.items.properties.color;
localSchema.items.properties.pairs.items.required = ['src', 'tgt'];

// lines: [{start, end, text}] (about 30). Returns AlignedLine[] in the same order.
export async function alignBatch(lines, options = {}) {
  if (provider() !== 'ollama') return alignChunk(lines, schema, options);
  const chunks = [];
  for (let i = 0; i < lines.length; i += LOCAL_CHUNK) chunks.push(lines.slice(i, i + LOCAL_CHUNK));
  return (await Promise.all(chunks.map((chunk) => alignChunk(chunk, localSchema, options)))).flat();
}

async function alignChunk(lines, schema, { level = 'medium' } = {}) {
  const contents = JSON.stringify(lines.map((l, id) => ({ id, text: l.text })));
  let parsed = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    try {
      const value = await generateJson({ system: `${SYSTEM}\n\nLearner level: ${level}.`, contents, schema });
      if (!Array.isArray(value)) throw new Error('Expected an array of translated lines');
      parsed = value;
    } catch (e) {
      console.error(`[align] attempt ${attempt + 1} failed:`, e.message);
    }
  }
  const byId = new Map((parsed ?? []).map((o) => [o.id, o]));
  return lines.map((l, id) => {
    const o = byId.get(id);
    const target = typeof o?.target === 'string' ? o.target : '';
    return { start: l.start, end: l.end, source: l.text, target, pairs: o ? validate(l.text, target, o.pairs) : [] };
  });
}