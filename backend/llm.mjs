// Compatibility entry point for Simone's integration. One shared provider implementation
// keeps cache identity, defaults and local-only behavior consistent across the backend.
import { generateJSON, getAIConfig } from './ai-provider.mjs';
export const provider = () => getAIConfig().provider;
function jsonSchema(value) {
  if (Array.isArray(value)) return value.map(jsonSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) =>
    [k, k === 'type' && typeof v === 'string' ? v.toLowerCase() : jsonSchema(v)]));
}
export const generateJson = ({ system, contents, schema }) => generateJSON({ system, contents, schema: jsonSchema(schema) });
