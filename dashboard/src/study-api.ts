import { BACKEND_URL, getSession, signOut } from './auth.ts';
export type Scenario = { id: string; title: string; description: string };
export type StudyConfig = { available: boolean; max_duration_seconds: number; scenarios: Scenario[] };
export type StudySession = { signed_url: string; max_duration_seconds: number; dynamic_variables: Record<string, string> };
async function request<T>(path: string, signal: AbortSignal, body?: object): Promise<T> {
  const session = getSession();
  const response = await fetch(new URL(path, BACKEND_URL), {
    signal, method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 401) { signOut(); throw Error('Please sign in again.'); }
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? 'Could not connect to conversation practice.');
  return result as T;
}
export const studyConfig = (signal: AbortSignal) => request<StudyConfig>('/study/config', signal);
export const studySession = (scenario: string, level: string, signal: AbortSignal) => request<StudySession>('/study/session', signal, { scenario, level });
