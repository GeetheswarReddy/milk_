import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createRepository } from '../src/storage';
import { canonicalFarmerId, currentValues, parseHundredths, summarize, validateCan, type CanValues } from '../src/domain';
const values: CanValues = { volume: '10.25', fat: '4.20', decision: 'accepted', rejectionReason: '', photoId: null, photoUnavailableReason: '' };
const session = { date: '2026-09-16', period: 'morning' as const };
const fresh = () => createRepository(crypto.randomUUID());
const entry = (overrides = {}) => ({ id: crypto.randomUUID(), deliveryId: crypto.randomUUID(), farmerId: '1', session, values, ...overrides });
async function prepared() { const repo = await fresh(); await repo.configure('40.10'); await repo.registerFarmer('001', 'Fictional farmer'); return repo; }
describe('intake domain', () => {
  it('rejects ambiguous numbers and normalizes farmer IDs without precision loss', () => {
    expect(canonicalFarmerId('00012345678901234567890')).toBe('12345678901234567890');
    for (const invalid of ['1e2', '-1', '1.234', ' 1 ', '.5', '1.', 'NaN', '']) expect(() => parseHundredths(invalid)).toThrow();
    expect(parseHundredths('0.01')).toBe(1);
    expect(() => validateCan({ ...values, volume: '0' })).toThrow();
    expect(() => validateCan({ ...values, fat: null })).toThrow();
    expect(() => validateCan({ ...values, fat: '100.01' })).toThrow();
    expect(() => validateCan({ ...values, decision: 'rejected', fat: null, rejectionReason: 'Sour', photoUnavailableReason: 'Camera unavailable' })).not.toThrow();
  });
  it('preserves corrections, fixes delivery rates and excludes voids', async () => {
    const repo = await prepared(), first = entry(); await repo.saveCan(first);
    await repo.configure('50'); await repo.saveCan(entry({ deliveryId: first.deliveryId }));
    await repo.correctCan(first.id, { ...values, volume: '2' }, 'Corrected reading');
    const snapshot = repo.snapshot();
    expect(snapshot.deliveries[0].rate).toBe('40.10');
    expect(snapshot.cans[0].original.volume).toBe('10.25');
    expect(currentValues(snapshot.cans[0]).volume).toBe('2');
    expect(summarize(snapshot).estimatedPayout).toBe(491.23);
    await repo.voidCan(first.id, 'Accidental entry');
    expect(summarize(repo.snapshot()).acceptedVolume).toBe(10.25);
    expect(repo.snapshot().cans).toHaveLength(2);
  });
  it('persists 600 cans over three dates with 60 photos and restores after closing', async () => {
    const name = crypto.randomUUID(); let repo = await createRepository(name);
    await repo.configure('40'); await repo.registerFarmer('1', 'Test farmer');
    for (let day = 0; day < 3; day++) {
      for (let visit = 0; visit < 100; visit++) {
        const deliveryId = crypto.randomUUID();
        for (let can = 0; can < 2; can++) {
          const rejected = visit % 10 === 0, photoId = crypto.randomUUID();
          const blob = new Blob(['fixture'], { type: 'image/jpeg' });
          await repo.saveCan(entry({ deliveryId, session: { date: `2026-09-${16 + day}`, period: 'morning' }, values: rejected ? { ...values, decision: 'rejected', fat: null, rejectionReason: 'Sour', photoId } : values, ...(rejected ? { photo: { id: photoId, blob, size: blob.size, uploaded: false } } : {}) }));
        }
      }
      repo.close(); repo = await createRepository(name);
    }
    expect(repo.snapshot().cans).toHaveLength(600); expect(repo.snapshot().deliveries).toHaveLength(300); expect(repo.snapshot().photos).toHaveLength(60);
    expect(summarize(repo.snapshot()).acceptedVolume).toBe(5535); expect(summarize(repo.snapshot(), '2026-09-17').canCount).toBe(200);
  }, 30000);
  it('deduplicates repeated saves and protects newer corrections from stale sync acknowledgements', async () => {
    const repo = await prepared(), input = entry(); await Promise.all([repo.saveCan(input), repo.saveCan(input)]);
    expect(repo.snapshot().cans).toHaveLength(1);
    const pending = repo.pending().filter(item => item.kind === 'can');
    await repo.correctCan(input.id, { ...values, volume: '9' }, 'Reading fix');
    await repo.acknowledge(pending); expect(repo.pending().filter(item => item.kind === 'can')[0].revision).toBe(2);
    await repo.acknowledge(repo.pending()); expect(repo.pending()).toHaveLength(0);
  });
  it('reports a failed durable write and preserves prior in-memory state and queue', async () => {
    const repo = await prepared(), before = repo.snapshot(), pending = repo.pending();
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    await expect(repo.saveCan(entry())).rejects.toThrow('Full'); spy.mockRestore();
    expect(repo.snapshot()).toEqual(before); expect(repo.pending()).toEqual(pending);
    await repo.saveCan(entry()); expect(repo.snapshot().cans).toHaveLength(1);
  });
  it('persists drafts but excludes them from totals', async () => {
    const repo = await prepared(); await repo.saveDraft({ farmerId: '1', deliveryId: crypto.randomUUID(), session, ...values, fat: '4.2', unmeasuredFat: false });
    expect(repo.snapshot().draft?.volume).toBe('10.25'); expect(summarize(repo.snapshot()).canCount).toBe(0);
  });
  it('merges independent tab writes transactionally and rejects impossible dates', async () => {
    const name = crypto.randomUUID(), first = await createRepository(name), second = await createRepository(name);
    await Promise.all([first.registerFarmer('1', 'One'), second.registerFarmer('2', 'Two')]);
    const reopened = await createRepository(name); expect(reopened.snapshot().farmers).toHaveLength(2);
    await reopened.configure('40'); await expect(reopened.saveCan(entry({ session: { date: '2026-02-30', period: 'morning' } }))).rejects.toThrow('session');
  });
  it('refuses to delete unsynced evidence at the photo budget and evicts only uploaded copies', async () => {
    const name = crypto.randomUUID(), repo = await createRepository(name); repo.close();
    const blob = new Blob([new Uint8Array(100000)], { type: 'image/jpeg' });
    const photos = Array.from({ length: 300 }, (_, index) => ({ id: String(index), blob, size: blob.size, uploaded: false }));
    const seed = { ledger: { farmers: [], deliveries: [], cans: [], photos, settings: { rate: '', setupComplete: false }, draft: null }, queue: [], revisions: {} };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 1); request.onsuccess = () => {
        const db = request.result, tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(seed, 'ledger');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    });
    const full = await createRepository(name), extra = { id: 'extra', blob, size: blob.size, uploaded: false };
    await expect(full.storePhoto(extra)).rejects.toThrow('budget');
    expect(full.snapshot().photos.every(photo => photo.size === 100000)).toBe(true);
    await full.markPhotoUploaded('0'); await full.storePhoto(extra);
    const stored = full.snapshot().photos;
    expect(stored.find(photo => photo.id === '0')?.size).toBe(0);
    expect(stored.filter(photo => !photo.uploaded)).toHaveLength(300);
  });

  it('clears a correction draft in the same durable commit as its correction', async () => {
    const repo = await prepared(), saved = entry(); await repo.saveCan(saved);
    await repo.saveDraft({ ...values, fat: '4.20', farmerId: '1', deliveryId: saved.deliveryId, session, unmeasuredFat: false, correctionCanId: saved.id, correctionReason: 'Transposed volume' });
    expect(repo.snapshot().draft?.correctionReason).toBe('Transposed volume');
    await repo.correctCan(saved.id, { ...values, volume: '12' }, 'Transposed volume');
    expect(repo.snapshot().draft).toBeNull(); expect(repo.snapshot().cans[0].corrections).toHaveLength(1);
  });
  it('atomically replaces explicitly discarded draft photos and preserves all saved history', async () => {
    const repo = await prepared(), blob = new Blob(['photo'], { type: 'image/jpeg' });
    const photo = (id: string) => ({ id, blob, size: blob.size, uploaded: false });
    const draft = { ...values, decision: 'rejected' as const, rejectionReason: 'Sour', fat: '4.20', photoId: 'draft-one', farmerId: '1', deliveryId: crypto.randomUUID(), session, unmeasuredFat: false };
    await repo.saveDraft(draft, { photo: photo('draft-one') });
    await repo.saveDraft({ ...draft, photoId: 'draft-two' }, { photo: photo('draft-two'), discardPhotoIds: ['draft-one'] });
    expect(repo.snapshot().photos.map(p => p.id)).toEqual(['draft-two']);
    const saved = entry({ deliveryId: draft.deliveryId, values: { ...values, decision: 'rejected', rejectionReason: 'Sour', photoId: 'draft-two' } });
    await repo.saveCan(saved); await repo.correctCan(saved.id, { ...values, decision: 'rejected', rejectionReason: 'Sour', photoId: 'history' }, 'New evidence', photo('history'));
    await repo.voidCan(saved.id, 'Accidental entry');
    await repo.saveDraft(null, { discardPhotoIds: ['draft-two', 'history'] });
    expect(repo.snapshot().photos.map(p => p.id)).toEqual(['draft-two', 'history']);
    expect(repo.pending().filter(p => p.kind === 'photo')).toHaveLength(2);
  });
  it('rolls back draft-photo replacement together when persistence fails', async () => {
    const repo = await prepared(), blob = new Blob(['photo'], { type: 'image/jpeg' });
    const photo = (id: string) => ({ id, blob, size: blob.size, uploaded: false });
    const draft = { ...values, fat: '4.20', farmerId: '1', deliveryId: crypto.randomUUID(), session, unmeasuredFat: false, photoId: 'old' };
    await repo.saveDraft(draft, { photo: photo('old') });
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    await expect(repo.saveDraft({ ...draft, photoId: 'new' }, { photo: photo('new'), discardPhotoIds: ['old'] })).rejects.toThrow('Full'); spy.mockRestore();
    expect(repo.snapshot().draft?.photoId).toBe('old'); expect(repo.snapshot().photos.map(p => p.id)).toEqual(['old']);
  });
  it('refreshes a tab cache and keeps committed snapshots detached from caller input', async () => {
    const name = crypto.randomUUID(), first = await createRepository(name), second = await createRepository(name);
    await first.registerFarmer('1', 'Farmer'); await second.refresh(); expect(second.snapshot().farmers).toHaveLength(1);
    const draft = { ...values, fat: '4.20', farmerId: '1', deliveryId: crypto.randomUUID(), session, unmeasuredFat: false };
    await second.saveDraft(draft); draft.volume = '999'; expect(second.snapshot().draft?.volume).toBe('10.25');
  });

});
