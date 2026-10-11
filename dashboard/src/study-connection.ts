// Canceling while the browser's permission prompt is open must never start a session.
// Release this permission-check stream; the voice SDK owns its own audio stream.
export async function prepareStudyConnection<T>(
  signal: AbortSignal,
  loadSession: () => Promise<T>,
  getMicrophone: () => Promise<Pick<MediaStream, 'getTracks'>>,
): Promise<T | null> {
  const session = await loadSession();
  if (signal.aborted) return null;
  const stream = await getMicrophone();
  stream.getTracks().forEach(track => track.stop());
  return signal.aborted ? null : session;
}
