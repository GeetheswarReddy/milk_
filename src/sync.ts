import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getRepository } from './storage';

type SyncStatus = { state: 'unconfigured' | 'idle' | 'syncing' | 'error'; message: string };
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
let client: SupabaseClient | undefined;
let status: SyncStatus = { state: url && key ? 'idle' : 'unconfigured', message: url && key ? 'Saved on phone. Ready to synchronize.' : 'Server setup is missing. Configure Supabase before first collection.' };
let running: Promise<void> | undefined;
let started = false;
const WORKSPACE_KEY = 'dairy-workspace-id';
export function getSyncStatus(): SyncStatus { return { ...status }; }
function setStatus(state: SyncStatus['state'], message: string) {
  status = { state, message };
  window.dispatchEvent(new Event('sync-status'));
}
function backend() {
  if (!url || !key) throw new Error('Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild the app.');
  return client ??= createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
}
export async function initializeWorkspace(): Promise<void> {
  const api = backend();
  const { data, error } = await api.auth.getSession();
  if (error) throw error;
  const pinned = localStorage.getItem(WORKSPACE_KEY);
  let session = data.session;
  if (!session) {
    const repository = await getRepository();
    if (pinned || repository.snapshot().settings.setupComplete) throw new Error('Workspace credentials are missing. Local intake is retained; export the ledger. A new identity cannot recover this workspace.');
    if (!navigator.onLine) throw new Error('First setup requires an internet connection.');
    const result = await api.auth.signInAnonymously();
    if (result.error) throw result.error;
    session = result.data.session;
  }
  if (!session) throw new Error('The server did not create a workspace. Try setup again.');
  if (pinned && pinned !== session.user.id) throw new Error('Workspace identity changed. Synchronization stopped to protect the local ledger.');
  localStorage.setItem(WORKSPACE_KEY, session.user.id);
}
async function synchronize() {
  if (!url || !key) { setStatus('unconfigured', 'Server setup is missing. Local records remain on this phone.'); return; }
  if (!navigator.onLine) { setStatus('idle', 'Offline — saved on phone. Synchronization resumes when connected.'); return; }
  setStatus('syncing', 'Synchronizing records and photos…');
  try {
    await initializeWorkspace();
    const api = backend();
    const repository = await getRepository();
    const { data: auth, error: authError } = await api.auth.getSession();
    if (authError || !auth.session) throw authError ?? new Error('Workspace session unavailable.');
    const userId = auth.session.user.id;
    // Each pending revision has a stable UUID. Retry never invents a new server event.
    await repository.refresh();
    const pending = repository.pending();
    for (const item of pending.filter(item => item.kind !== 'photo')) {
      const payload = item.kind === 'settings' ? { ...(item.payload as object), id: 'settings' } : item.payload;
      const { error } = await api.rpc('sync_event', { p_event_id: item.id, p_kind: item.kind, p_payload: payload, p_revision: item.revision });
      if (error) throw error;
      await repository.acknowledge([item]);
    }
    for (const photo of repository.snapshot().photos.filter(photo => !photo.uploaded)) {
      const can = repository.snapshot().cans.find(can => can.original.photoId === photo.id || can.corrections.some(correction => correction.values.photoId === photo.id));
      // An unfinished draft photo must remain local until its can has synchronized.
      if (!can || repository.pending().some(item => item.kind === 'can' && item.entityId === can.id)) continue;
      const reservation = await api.rpc('reserve_photo', { p_photo_id: photo.id, p_can_id: can.id });
      if (reservation.error) throw reservation.error;
      const path = `${userId}/${photo.id}.jpg`;
      const result = await api.storage.from('evidence').upload(path, photo.blob, { contentType: 'image/jpeg', upsert: false });
      if (result.error) {
        // The upload may have succeeded before a connection was interrupted. Confirm
        // exact bytes through the private read policy before marking it synchronized.
        const existing = await api.storage.from('evidence').download(path);
        if (existing.error || !existing.data) throw result.error;
        const [remote, local] = await Promise.all([existing.data.arrayBuffer(), photo.blob.arrayBuffer()]);
        const a = new Uint8Array(remote), b = new Uint8Array(local);
        if (a.length !== b.length || a.some((value, index) => value !== b[index])) throw new Error('The remote photo differs from the saved evidence. Local evidence retained.');
      }
      await repository.markPhotoUploaded(photo.id);
    }
    const left = repository.pending().filter(item => item.kind !== 'photo').length;
    const photos = repository.snapshot().photos.filter(photo => !photo.uploaded).length;
    setStatus('idle', left || photos ? `Saved on phone. ${left} record changes and ${photos} photos pending.` : 'Records synced • Photos synced');
  } catch (error) {
    setStatus('error', `Saved on phone. Sync interrupted: ${error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error)}. Pending data is retained. Use Sync now to retry.`);
  }
}
export function syncNow(): Promise<void> {
  if (!running) running = synchronize().finally(() => { running = undefined; });
  return running;
}
export async function getPhotoUrl(photoId: string): Promise<string> {
  const api = backend();
  const { data, error } = await api.auth.getSession();
  if (error || !data.session) throw error ?? new Error('Connect to view the server photo.');
  const result = await api.storage.from('evidence').createSignedUrl(`${data.session.user.id}/${photoId}.jpg`, 60);
  if (result.error) throw result.error;
  return result.data.signedUrl;
}
export function startSync(): void {
  if (started) return;
  started = true;
  window.addEventListener('online', () => { void syncNow(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void syncNow(); });
  window.setInterval(() => { if (!document.hidden) void syncNow(); }, 30000);
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register('/sw.js').catch(() => setStatus('error', 'Offline app preparation failed. Keep this page open and reconnect before relying on offline reopening.'));
  }
  void getRepository().then(repository => { if (repository.snapshot().settings.setupComplete) void syncNow(); });
}
