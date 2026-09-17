# Dairy Intake

A dairy hub receives milk from local farmers and records quality decisions and estimated payouts.

## Language

**Dairy hub**:
The collection location where farmers bring milk and an operator records intake.
_Avoid_: Store, farm

**Farmer**:
The milk supplier identified by a farmer ID on a delivery.
_Avoid_: Customer, account

**Operator**:
The person who records intake and decides whether each can is accepted or rejected.

**Delivery**:
One farmer's visit to the dairy hub, containing one or more can entries.
_Avoid_: Batch, drop-off

**Can entry**:
The record of one can presented during a delivery, with its own volume, fat reading (or explicit unmeasured fat for a rejected can), and whole-can acceptance or rejection decision.
_Avoid_: Batch, delivery

**Fat reading**:
The recorded milk fat percentage for a can entry; it does not automatically determine acceptance or the estimated payout.

**Rejection reason**:
A required operator-selected explanation for rejecting a can, such as sour smell or low density.

**Partial delivery rejection**:
A delivery in which some cans are accepted and others rejected; a single can is not split into accepted and rejected portions.
_Avoid_: Partial can rejection

**Accepted volume**:
The sum of the liters in accepted can entries.

**Estimated payout**:
The amount calculated from accepted volume and a configured rate per liter; it is an estimate rather than a record of money paid.
_Avoid_: Payment, settlement

**Collection session**:
A morning or evening collection period on a local calendar date, explicitly selected by the operator.
_Avoid_: Shift, batch

**Delivery rate**:
The hub's rate per accepted liter, in INR, preserved for a delivery so later rate changes do not alter its estimated payout.

**Correction**:
A recorded amendment to an intake entry that preserves its original values and includes a reason and time; summaries use the corrected values.
_Avoid_: Overwrite

**Void**:
The recorded cancellation of an accidental entry, preserving the entry and the reason for cancellation.
_Avoid_: Delete

**Rejection evidence**:
A photo attached to a rejected can entry, or an explicit explanation that a photo was unavailable. A photo records appearance, not proof of smell or fat content.

**Farmer roster**:
The list of farmers identified by unique numeric IDs and names, including farmers registered during offline collection.
_Avoid_: Customer list

**Delivery draft**:
Unfinished intake information awaiting completion; it is excluded from accepted-volume and estimated-payout totals.

**Unmeasured fat**:
An explicit absence of a fat measurement on a rejected can; it is not a zero-percent fat reading.

**Collection date**:
The local calendar date in Asia/Kolkata to which a morning or evening collection session belongs.
