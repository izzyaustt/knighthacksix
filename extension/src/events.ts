// Learning events and vocabulary saves. Local stats update immediately (so the panel reacts),
// and the service worker forwards to the backend when a backend URL is configured.
import { updateDay } from './stats';

export type EventType = 'lookup' | 'save' | 'shadow_attempt' | 'review' | 'caption_view';

export type LearningEvent = {
  event_type: EventType;
  video_id?: string | null;
  word?: string;
  lang?: string;
  score?: number;
  meta?: Record<string, unknown>;
};

export type VocabItem = {
  word: string;          // target-language phrase (what the learner is learning)
  translation: string;   // source-language meaning
  video_id: string | null;
  video_ts: number;
  saved_at: number;
};

export const VOCAB_KEY = 'll:vocab';

function toWorker(message: unknown) {
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch {
    // Extension was reloaded; this content script is orphaned until the page refreshes.
  }
}

export function logEvent(e: LearningEvent): void {
  if (e.event_type === 'lookup') void updateDay((d) => { d.lookups++; });
  if (e.event_type === 'save') void updateDay((d) => { d.saves++; });
  if (e.event_type === 'shadow_attempt' && typeof e.score === 'number') {
    const score = e.score;
    void updateDay((d) => { d.shadow.push(score); });
  }
  if (e.event_type !== 'save' && e.event_type !== 'shadow_attempt') toWorker({ type: 'll:event', event: { ...e, event_id: crypto.randomUUID() } });
}

export async function getVocab(): Promise<VocabItem[]> {
  const got = (await chrome.storage.local.get(VOCAB_KEY)) as Record<string, VocabItem[] | undefined>;
  return got[VOCAB_KEY] ?? [];
}

export const sameVocab = (a: Pick<VocabItem, 'word' | 'video_id'>, b: Pick<VocabItem, 'word' | 'video_id'>) =>
  a.word.toLowerCase() === b.word.toLowerCase() && a.video_id === b.video_id;

// The database keys saved words by (user, lang, word), so a word is saved once regardless of video.
const sameWord = (a: Pick<VocabItem, 'word'>, b: Pick<VocabItem, 'word'>) => a.word.toLowerCase() === b.word.toLowerCase();

/** Saves the item, or removes it if already saved. Returns whether it is saved afterwards. */
export async function toggleVocab(item: Omit<VocabItem, 'saved_at'>): Promise<boolean> {
  const list = await getVocab();
  if (list.some((v) => sameWord(v, item))) {
    const result = await chrome.runtime.sendMessage({ type: 'll:vocab-delete', word: item.word });
    if (!result?.ok) throw new Error('Could not remove from the database. Check the backend connection and try again.');
    await chrome.storage.local.set({ [VOCAB_KEY]: list.filter((v) => !sameWord(v, item)) });
    return false;
  }
  const result = await chrome.runtime.sendMessage({ type: 'll:vocab', item });
  if (!result?.ok) throw new Error('Could not save to the database. Check the backend connection and try again.');
  await chrome.storage.local.set({ [VOCAB_KEY]: [{ ...item, saved_at: Date.now() }, ...list].slice(0, 1000) });
  logEvent({ event_type: 'save', video_id: item.video_id, word: item.word, lang: 'es', meta: { translation: item.translation, video_ts: item.video_ts } });
  return true;
}

/** Replaces the local saved-word list with the database copy. Call on panel open and after sign-in. */
export async function syncVocab(): Promise<void> {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'll:vocab-list' });
    if (!result?.ok || !Array.isArray(result.words)) return; // offline or signed out: keep the local copy
    const items: VocabItem[] = result.words.map((r: any) => ({
      word: String(r.word),
      translation: String(r.translation ?? ''),
      video_id: r.video_id ?? null,
      video_ts: Number(r.video_ts) || 0,
      saved_at: Date.parse(r.saved_at) || Date.now(),
    }));
    await chrome.storage.local.set({ [VOCAB_KEY]: items });
  } catch {
    // Extension reloaded or worker asleep; the next sync will catch up.
  }
}