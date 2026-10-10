// Extension settings. Until the options page exists, set them from the extension's DevTools:
//   chrome.storage.local.set({ settings: { backendUrl: 'http://localhost:8000' } })

export type Settings = {
  backendUrl: string;   // '' = no backend yet: events and saves stay local
  dashboardUrl: string;
  userId: string;       // shared demo user so extension events and dashboard queries match
  langSrc: string;
  langTgt: string;
  level: string;
};

export const DEFAULT_SETTINGS: Settings = {
  backendUrl: '',
  dashboardUrl: 'http://localhost:5173',
  userId: 'demo',
  langSrc: 'en',
  langTgt: 'es',
  level: 'A2',
};

export async function getSettings(): Promise<Settings> {
  const got = (await chrome.storage.local.get('settings')) as { settings?: Partial<Settings> };
  return { ...DEFAULT_SETTINGS, ...got.settings };
}

export type DashboardContext = { videoId?: string | null; t?: number; range?: string };

/** e.g. http://localhost:5173/?user_id=demo&video_id=dQw4w9WgXcQ&t=83&range=24h */
export function dashboardLink(s: Settings, ctx: DashboardContext): string {
  const u = new URL(s.dashboardUrl);
  u.searchParams.set('user_id', s.userId);
  if (ctx.videoId) u.searchParams.set('video_id', ctx.videoId);
  if (ctx.t != null && Number.isFinite(ctx.t)) u.searchParams.set('t', String(Math.floor(ctx.t)));
  u.searchParams.set('range', ctx.range ?? '24h');
  return u.toString();
}
