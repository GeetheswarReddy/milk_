import { canonicalFarmerId, parseHundredths, validateCan, type Ledger, type Draft, type Photo, type CanValues, type Session } from './domain';
import { PHOTO_BUDGET, PHOTO_MAX_BYTES } from './photos';
export type PendingItem = { id: string; kind: 'farmer' | 'delivery' | 'can' | 'settings' | 'photo'; entityId: string; revision: number; payload: Record<string, unknown> };
type Stored = { ledger: Ledger; queue: PendingItem[]; revisions: Record<string, number> };
const empty = (): Stored => ({ ledger: { farmers: [], deliveries: [], cans: [], photos: [], settings: { rate: '', setupComplete: false }, draft: null }, queue: [], revisions: {} });
export type SaveCanInput = { id: string; deliveryId: string; farmerId: string; session: Session; values: CanValues; photo?: Photo };
export type Repository = Awaited<ReturnType<typeof createRepository>>;
export async function createRepository(name = 'dairy-intake-v1') {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  let state = await new Promise<Stored>((resolve, reject) => {
    const request = db.transaction('state').objectStore('state').get('ledger');
    request.onsuccess = () => resolve(request.result ?? empty()); request.onerror = () => reject(request.error);
  });
  const listeners = new Set<(ledger: Ledger) => void>();
  let chain: Promise<void> = Promise.resolve();
  const channel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`dairy-ledger:${name}`) : null;
  function publish() {
    for (const listener of listeners) { try { listener(structuredClone(state.ledger)); } catch { /* UI errors cannot undo durable commits. */ } }
  }
  function refresh(): Promise<void> {
    const operation = chain.then(async () => {
      state = await new Promise<Stored>((resolve, reject) => {
        const request = db.transaction('state').objectStore('state').get('ledger');
        request.onsuccess = () => resolve(request.result ?? empty()); request.onerror = () => reject(request.error);
      });
      publish();
    });
    chain = operation.catch(() => {}); return operation;
  }
  if (channel) channel.onmessage = () => { void refresh().catch(() => {}); };
  const onVisible = () => { if (!document.hidden) void refresh().catch(() => {}); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  function enqueue(next: Stored, kind: PendingItem['kind'], entityId: string, payload: object) {
    const key = `${kind}:${entityId}`, revision = (next.revisions[key] ?? 0) + 1;
    next.revisions[key] = revision;
    next.queue = next.queue.filter(item => `${item.kind}:${item.entityId}` !== key);
    next.queue.push({ id: crypto.randomUUID(), kind, entityId, revision, payload: { ...payload } });
  }
  function mutate(change: (next: Stored) => void): Promise<void> {
    const operation = chain.then(async () => {
      let next: Stored;
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('state', 'readwrite');
        const store = transaction.objectStore('state');
        const request = store.get('ledger');
        request.onsuccess = () => {
          try { next = request.result ?? empty(); change(next); store.put(next, 'ledger'); }
          catch (error) { transaction.abort(); reject(error); }
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('Could not save on this phone.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Could not save on this phone.'));
      });
      state = structuredClone(next!); publish(); channel?.postMessage('changed');
    });
    chain = operation.catch(() => {}); return operation;
  }
  function addPhoto(next: Stored, photo: Photo) {
    if (next.ledger.photos.some(p => p.id === photo.id)) return;
    if (photo.blob.size > PHOTO_MAX_BYTES || photo.blob.size !== photo.size || photo.size <= 0) throw new Error('Photo must be compressed to 100 KB or less.');
    let used = next.ledger.photos.reduce((sum, p) => sum + p.size, 0);
    for (const existing of next.ledger.photos) {
      if (used + photo.size <= PHOTO_BUDGET) break;
      if (existing.uploaded) { used -= existing.size; existing.blob = new Blob([]); existing.size = 0; }
    }
    if (used + photo.size > PHOTO_BUDGET) throw new Error('The 30 MB photo budget is full. Sync existing photos or explain why a photo is unavailable.');
    next.ledger.photos.push({ ...photo, uploaded: false });
  }
  function attachPhoto(next: Stored, values: CanValues, photo?: Photo) {
    if (photo) addPhoto(next, photo);
    if (values.photoId) {
      const existing = next.ledger.photos.find(p => p.id === values.photoId);
      if (!existing) throw new Error('Photo is missing. Retake it or explain why it is unavailable.');
      if (!existing.uploaded && !next.queue.some(q => q.kind === 'photo' && q.entityId === existing.id)) enqueue(next, 'photo', existing.id, { id: existing.id, size: existing.size });
    }
  }
  return {
    snapshot: (): Ledger => structuredClone(state.ledger),
    pending: (): PendingItem[] => structuredClone(state.queue),
    subscribe(listener: (ledger: Ledger) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh,
    close() { channel?.close(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible); db.close(); },
    registerFarmer(id: string, name: string) { return mutate(next => {
      id = canonicalFarmerId(id); name = name.trim();
      if (!name) throw new Error('Enter a farmer name.');
      if (next.ledger.farmers.some(f => f.id === id)) throw new Error('This farmer ID is already registered.');
      const farmer = { id, name }; next.ledger.farmers.push(farmer); enqueue(next, 'farmer', id, farmer);
    }); },
    configure(rate: string) { return mutate(next => {
      if (parseHundredths(rate) <= 0) throw new Error('Rate must be above zero.');
      next.ledger.settings = { rate, setupComplete: true }; enqueue(next, 'settings', 'settings', { id: 'settings', ...next.ledger.settings });
    }); },
    storePhoto(photo: Photo) { return mutate(next => addPhoto(next, photo)); },
    saveDraft(draft: Draft | null, options: { photo?: Photo; discardPhotoIds?: string[] } = {}) { return mutate(next => {
      next.ledger.draft = draft;
      // Removal is explicitly requested by the operator. Every saved historical reference is protected.
      const protectedIds = new Set(next.ledger.cans.flatMap(can => [can.original.photoId, ...can.corrections.map(correction => correction.values.photoId)]));
      protectedIds.add(draft?.photoId ?? null);
      const discard = new Set((options.discardPhotoIds ?? []).filter(id => !protectedIds.has(id)));
      next.ledger.photos = next.ledger.photos.filter(photo => !discard.has(photo.id));
      next.queue = next.queue.filter(item => item.kind !== 'photo' || !discard.has(item.entityId));
      if (options.photo) {
        if (draft?.photoId !== options.photo.id) throw new Error('The photo must belong to the current draft.');
        addPhoto(next, options.photo);
      }
      if (draft?.photoId && !next.ledger.photos.some(photo => photo.id === draft.photoId)) throw new Error('Draft photo is missing.');
    }); },
    saveCan(input: SaveCanInput) { return mutate(next => {
      if (next.ledger.cans.some(c => c.id === input.id)) return;
      if (!next.ledger.settings.setupComplete) throw new Error('Set the delivery rate first.');
      validateCan(input.values);
      const farmerId = canonicalFarmerId(input.farmerId);
      if (!next.ledger.farmers.some(f => f.id === farmerId)) throw new Error('Register this farmer first.');
      const parsedDate = new Date(`${input.session.date}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.session.date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.session.date || !['morning', 'evening'].includes(input.session.period)) throw new Error('Select a valid collection session.');
      let delivery = next.ledger.deliveries.find(d => d.id === input.deliveryId);
      if (delivery && (delivery.farmerId !== farmerId || delivery.session.date !== input.session.date || delivery.session.period !== input.session.period)) throw new Error('The delivery belongs to another farmer or session.');
      if (!delivery) {
        delivery = { id: input.deliveryId, farmerId, session: input.session, rate: next.ledger.settings.rate, createdAt: new Date().toISOString() };
        next.ledger.deliveries.push(delivery); enqueue(next, 'delivery', delivery.id, delivery);
      }
      attachPhoto(next, input.values, input.photo);
      const can = { id: input.id, deliveryId: delivery.id, original: input.values, corrections: [], void: null, createdAt: new Date().toISOString() };
      next.ledger.cans.push(can); enqueue(next, 'can', can.id, can);
      if (next.ledger.draft?.deliveryId === delivery.id && !next.ledger.draft.correctionCanId) next.ledger.draft = { ...next.ledger.draft, volume: '', fat: '', decision: 'accepted', rejectionReason: '', photoId: null, photoUnavailableReason: '', unmeasuredFat: false };
    }); },
    correctCan(id: string, values: CanValues, reason: string, photo?: Photo) { return mutate(next => {
      validateCan(values); if (!reason.trim()) throw new Error('Enter a correction reason.');
      const can = next.ledger.cans.find(c => c.id === id); if (!can || can.void) throw new Error('This can cannot be corrected.');
      attachPhoto(next, values, photo);
      can.corrections.push({ id: crypto.randomUUID(), values, reason: reason.trim(), at: new Date().toISOString() }); enqueue(next, 'can', id, can);
      if (next.ledger.draft?.correctionCanId === id) next.ledger.draft = null;
    }); },
    voidCan(id: string, reason: string) { return mutate(next => {
      if (!reason.trim()) throw new Error('Enter a reason for voiding this can.');
      const can = next.ledger.cans.find(c => c.id === id); if (!can) throw new Error('Can entry not found.');
      if (can.void) return;
      can.void = { reason: reason.trim(), at: new Date().toISOString() }; enqueue(next, 'can', id, can);
    }); },
    acknowledge(items: Pick<PendingItem, 'id' | 'revision'>[]) { return mutate(next => {
      next.queue = next.queue.filter(item => !items.some(ack => ack.id === item.id && ack.revision === item.revision));
    }); },
    markPhotoUploaded(id: string) { return mutate(next => {
      const photo = next.ledger.photos.find(p => p.id === id); if (!photo) throw new Error('Photo not found.');
      photo.uploaded = true; next.queue = next.queue.filter(q => !(q.kind === 'photo' && q.entityId === id));
    }); }
  };
}
let singleton: Promise<Repository> | undefined;
export const getRepository = (): Promise<Repository> => singleton ??= createRepository();
