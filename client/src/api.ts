const AUTH_TOKEN = import.meta.env.VITE_AUTH_TOKEN as string;

const headers = () => ({
  'Content-Type': 'application/json',
  'X-Auth-Token': AUTH_TOKEN,
});

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: headers(),
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

export async function transcribeAudio(blob: Blob): Promise<{ transcript: string }> {
  const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
  const form = new FormData();
  form.append('audio', blob, `audio.${ext}`);
  const res = await fetch('/api/audio/transcribe', {
    method: 'POST',
    headers: { 'X-Auth-Token': AUTH_TOKEN },
    credentials: 'include',
    body: form,
  });
  if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
  return res.json() as Promise<{ transcript: string }>;
}

export async function sendMessage(message: string) {
  return post<{
    reply: string;
    actionCard?: Record<string, unknown>;
  }>('/api/chat', { message });
}

export async function confirmAction(
  action: 'approve' | 'cancel',
  editedPayload?: Record<string, unknown>
) {
  return post<{
    reply: string;
    actionCard?: Record<string, unknown>;
    pdfUrl?: string;
    documentNumber?: string;
    documentId?: string;
    newClientId?: string;
  }>('/api/chat/confirm', { action, editedPayload });
}

export async function refreshProductCache() {
  return post<{ count: number }>('/api/products/cache/refresh', {});
}
