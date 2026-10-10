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
  toWorker({ type: 'll:event', event: e });
}

export async function getVocab(): Promise<VocabItem[]> {
  const got = (await chrome.storage.local.get(VOCAB_KEY)) as Record<string, VocabItem[] | undefined>;
  return got[VOCAB_KEY] ?? [];
}

export const sameVocab = (a: Pick<VocabItem, 'word' | 'video_id'>, b: Pick<VocabItem, 'word' | 'video_id'>) =>
  a.word.toLowerCase() === b.word.toLowerCase() && a.video_id === b.video_id;

/** Saves the item, or removes it if already saved. Returns whether it is saved afterwards. */
export async function toggleVocab(item: Omit<VocabItem, 'saved_at'>): Promise<boolean> {
  const list = await getVocab();
  if (list.some((v) => sameVocab(v, item))) {
    // The API has no DELETE /vocab yet, so un-saving is local only.
    await chrome.storage.local.set({ [VOCAB_KEY]: list.filter((v) => !sameVocab(v, item)) });
    return false;
  }
  await chrome.storage.local.set({ [VOCAB_KEY]: [{ ...item, saved_at: Date.now() }, ...list].slice(0, 1000) });
  toWorker({ type: 'll:vocab', item });
  logEvent({ event_type: 'save', video_id: item.video_id, word: item.word, lang: 'es', meta: { translation: item.translation, video_ts: item.video_ts } });
  return true;
}
