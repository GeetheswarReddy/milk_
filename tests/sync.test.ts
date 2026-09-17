import 'fake-indexeddb/auto';
import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
let sync: typeof import('../src/sync');
let repo: Awaited<ReturnType<typeof import('../src/storage')['getRepository']>>;
let api: any;
const userId = '10000000-0000-4000-8000-000000000001';
const accepted = { volume: '12.25', fat: '4.10', decision: 'accepted' as const, rejectionReason: '', photoId: null, photoUnavailableReason: '' };
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key');
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: true });
  api = { auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: userId } } }, error: null })), signInAnonymously: vi.fn() }, rpc: vi.fn(async () => ({ error: null })), storage: { from: vi.fn() } };
  mocks.createClient.mockReturnValue(api);
  // Each test uses a distinct fake IndexedDB factory to avoid retained singleton state.
  const { IDBFactory } = await import('fake-indexeddb');
  vi.stubGlobal('indexedDB', new IDBFactory());
  repo = await (await import('../src/storage')).getRepository();
  await repo.configure('40');
  await repo.registerFarmer('7', 'Fictional farmer');
  await repo.saveCan({ id: crypto.randomUUID(), deliveryId: crypto.randomUUID(), farmerId: '7', session: { date: '2026-09-16', period: 'morning' }, values: accepted });
  sync = await import('../src/sync');
});
test('lost server response retains stable event identity and retries without duplicated server events', async () => {
  const remote = new Set<string>(); let interrupt = true;
  api.rpc.mockImplementation(async (_: string, input: { p_event_id: string }) => {
    remote.add(input.p_event_id);
    if (interrupt) { interrupt = false; return { error: { message: 'connection interrupted after commit' } }; }
    return { error: null };
  });
  const first = repo.pending()[0].id;
  await sync.syncNow();
  expect(repo.pending()[0].id).toBe(first);
  expect(sync.getSyncStatus().state).toBe('error');
  await sync.syncNow();
  expect(repo.pending()).toHaveLength(0);
  expect(remote.size).toBe(4);
  expect(sync.getSyncStatus().message).toContain('Records synced');
});
test('a correction saved during in-flight upload remains pending after the older revision is acknowledged', async () => {
  const can = repo.snapshot().cans[0];
  api.rpc.mockImplementation(async (_: string, input: { p_kind: string }) => {
    if (input.p_kind === 'can') await repo.correctCan(can.id, { ...accepted, volume: '10' }, 'Corrected reading');
    return { error: null };
  });
  await sync.syncNow();
  const remaining = repo.pending();
  expect(remaining).toHaveLength(1);
  expect(remaining[0].revision).toBe(2);
  expect(repo.snapshot().cans[0].original.volume).toBe('12.25');
});
test('server capacity errors retain pending data and explain the error', async () => {
  api.rpc.mockResolvedValue({ error: { message: 'Workspace limit: 2,000 can entries' } });
  await sync.syncNow();
  expect(repo.pending()).toHaveLength(4);
  expect(sync.getSyncStatus().message).toContain('2,000');
});
test('offline collection never attempts sign in or upload', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  await sync.syncNow();
  expect(api.rpc).not.toHaveBeenCalled();
  expect(repo.pending()).toHaveLength(4);
});
test('missing credentials on an existing ledger cannot create a replacement workspace', async () => {
  api.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  await sync.syncNow();
  expect(api.auth.signInAnonymously).not.toHaveBeenCalled();
  expect(sync.getSyncStatus().message).toContain('credentials are missing');
  expect(repo.pending()).toHaveLength(4);
});
test('failed photo upload retains evidence; retry confirms identical private remote bytes', async () => {
  const blob = new Blob(['evidence'], { type: 'image/jpeg' });
  const photo = { id: crypto.randomUUID(), blob, size: blob.size, uploaded: false };
  await repo.saveCan({ id: crypto.randomUUID(), deliveryId: repo.snapshot().deliveries[0].id, farmerId: '7', session: { date: '2026-09-16', period: 'morning' }, values: { ...accepted, decision: 'rejected', rejectionReason: 'Sour smell', photoId: photo.id }, photo });
  const download = vi.fn().mockResolvedValueOnce({ error: new Error('offline') }).mockResolvedValueOnce({ data: blob, error: null });
  api.storage.from.mockReturnValue({ upload: vi.fn(async () => ({ error: new Error('lost response') })), download });
  await sync.syncNow();
  expect(repo.snapshot().photos[0].uploaded).toBe(false);
  expect(repo.snapshot().photos[0].blob.size).toBe(blob.size);
  await sync.syncNow();
  expect(repo.snapshot().photos[0].uploaded).toBe(true);
  expect(repo.pending()).toHaveLength(0);
});
