import { ConvexError } from 'convex/values';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { enumerateNights, stayPerkFreeUnits } from '../shared/pricing';

/**
 * Server-authoritative add-on lines for a stay: prices come from the DB, never
 * the client, and the stay-length perk (e.g. a free airport pickup leg from 3
 * nights) is derived from the DB flag and the dates. Shared by the website
 * hold (`bookings.createHold`) and the staff manual booking
 * (`songHomestay.createManualBooking`) so both price services identically.
 */
export async function priceAddOnLines(
  ctx: MutationCtx,
  unit: Doc<'units'>,
  requested: Array<{ addOnId: Id<'addOns'>; quantity: number }>,
  checkIn: string,
  checkOut: string,
) {
  const lines: Array<{ addOn: Doc<'addOns'>; quantity: number }> = [];
  for (const line of requested) {
    const addOn = await ctx.db.get(line.addOnId);
    if (!addOn || !addOn.active || addOn.propertyId !== unit.propertyId) {
      throw new ConvexError({ code: 'ADDON_INVALID', message: 'An add-on is unavailable.' });
    }
    if (addOn.appliesTo.length > 0 && !addOn.appliesTo.includes(unit.unitTypeId)) {
      throw new ConvexError({ code: 'ADDON_INVALID', message: `${addOn.name} is not available for this unit.` });
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      throw new ConvexError({ code: 'ADDON_INVALID', message: 'Invalid add-on quantity.' });
    }
    lines.push({ addOn, quantity: line.quantity });
  }
  const perkFree = stayPerkFreeUnits(
    lines.map((l) => ({
      unitPriceCents: l.addOn.priceCents,
      quantity: l.quantity,
      freeFirstUnitMinNights: l.addOn.freeFirstUnitMinNights,
    })),
    enumerateNights(checkIn, checkOut).length,
  );
  const priceLines = lines.map((l, index) => ({
    name: l.addOn.name,
    unitPriceCents: l.addOn.priceCents,
    quantity: l.quantity,
    taxable: l.addOn.taxable,
    ...(perkFree[index] ? { freeQuantity: perkFree[index] } : {}),
  }));
  return { lines, perkFree, priceLines };
}

/** Snapshot the priced lines onto the booking (bookingAddOns rows). */
export async function insertBookingAddOns(
  ctx: MutationCtx,
  bookingId: Id<'bookings'>,
  priced: Awaited<ReturnType<typeof priceAddOnLines>>,
  now: number,
) {
  for (const [index, line] of priced.lines.entries()) {
    await ctx.db.insert('bookingAddOns', {
      bookingId,
      addOnId: line.addOn._id,
      nameSnapshot: line.addOn.name,
      unitPriceCents: line.addOn.priceCents,
      quantity: line.quantity,
      ...(priced.perkFree[index] ? { freeQuantity: priced.perkFree[index] } : {}),
      taxable: line.addOn.taxable,
      soldAt: now,
    });
  }
}
