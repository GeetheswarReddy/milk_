export type Session = { date: string; period: 'morning' | 'evening' };
export type Farmer = { id: string; name: string };
export type CanValues = { volume: string; fat: string | null; decision: 'accepted' | 'rejected'; rejectionReason: string; photoId: string | null; photoUnavailableReason: string };
export type CanEntry = { id: string; deliveryId: string; original: CanValues; corrections: { id: string; values: CanValues; reason: string; at: string }[]; void: { reason: string; at: string } | null; createdAt: string };
export type Delivery = { id: string; farmerId: string; session: Session; rate: string; createdAt: string };
export type Photo = { id: string; blob: Blob; size: number; uploaded: boolean };
export type Settings = { rate: string; setupComplete: boolean };
export type Draft = { correctionCanId?: string; correctionReason?: string; farmerId: string; deliveryId: string; session: Session; volume: string; fat: string; decision: 'accepted' | 'rejected'; rejectionReason: string; photoId: string | null; photoUnavailableReason: string; unmeasuredFat: boolean };
export type Ledger = { farmers: Farmer[]; deliveries: Delivery[]; cans: CanEntry[]; photos: Photo[]; settings: Settings; draft: Draft | null };
export function canonicalFarmerId(input: string): string {
  const value = input.trim();
  if (!/^\d+$/.test(value)) throw new Error('Farmer ID must contain only digits.');
  return value.replace(/^0+(?=\d)/, '');
}
export function parseHundredths(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Enter a number with up to two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > 1_000_000_000) throw new Error('Number is too large.');
  return result;
}
export function validateCan(values: CanValues): void {
  if (parseHundredths(values.volume) <= 0) throw new Error('Volume must be above zero.');
  if (values.fat !== null && parseHundredths(values.fat) > 10000) throw new Error('Fat must be between 0 and 100%.');
  if (values.decision === 'accepted') {
    if (values.fat === null) throw new Error('Accepted cans require a fat reading.');
    if (values.photoId) throw new Error('Photos are only attached to rejected cans.');
  } else if (values.decision === 'rejected') {
    if (!values.rejectionReason.trim()) throw new Error('Choose a rejection reason.');
    if (!values.photoId && !values.photoUnavailableReason.trim()) throw new Error('Attach a photo or explain why a photo is unavailable.');
  } else throw new Error('Choose accepted or rejected.');
}
export const currentValues = (can: CanEntry): CanValues => can.corrections.at(-1)?.values ?? can.original;
export function summarize(ledger: Ledger, date?: string) {
  let accepted = 0, rejected = 0, payoutHundredthPaise = 0n, canCount = 0;
  for (const delivery of ledger.deliveries) {
    if (date && delivery.session.date !== date) continue;
    for (const can of ledger.cans.filter(c => c.deliveryId === delivery.id && !c.void)) {
      const values = currentValues(can), volume = parseHundredths(values.volume);
      canCount++;
      if (values.decision === 'accepted') { accepted += volume; payoutHundredthPaise += BigInt(volume) * BigInt(parseHundredths(delivery.rate)); }
      else rejected += volume;
    }
  }
  return { acceptedVolume: accepted / 100, rejectedVolume: rejected / 100, estimatedPayout: Number((payoutHundredthPaise + 50n) / 100n) / 100, canCount };
}
export function kolkataDate(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
