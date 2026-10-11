// Share pending requests and retain a small session cache. Failures remain retryable.
export function createSpeechCache(load: (text: string, speed: number, lang: string) => Promise<string>, limit = 32) {
  const entries = new Map<string, Promise<string>>();
  return { get(text: string, speed: number, lang = 'es') {
    const key = JSON.stringify([text, speed, lang]);
    const existing = entries.get(key);
    if (existing) return existing;
    const request = load(text, speed, lang).catch(error => { if (entries.get(key) === request) entries.delete(key); throw error; });
    entries.set(key, request);
    if (entries.size > limit) entries.delete(entries.keys().next().value!);
    return request;
  } };
}
