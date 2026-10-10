export async function api(path: string, body: unknown): Promise<any> {
  const reply = await chrome.runtime.sendMessage({ type: 'api', path, body });
  if (!reply?.ok) throw new Error(reply?.error ?? 'Extension connection lost. Reload this YouTube tab.');
  return reply.data;
}

export async function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read the recording.'));
    reader.readAsDataURL(blob);
  });
}
