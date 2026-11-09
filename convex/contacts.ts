import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireMutationPropertyCapability, requirePropertyCapability } from './staff';

function clean(value: string, max: number) {
  return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

export const submit = mutation({
  args: { propertySlug: v.string(), name: v.string(), phone: v.string(), email: v.string(), message: v.string() },
  handler: async (ctx, args) => {
    const property = await ctx.db.query('properties').withIndex('by_slug', (q) => q.eq('slug', args.propertySlug)).first();
    if (!property?.active) throw new ConvexError('PROPERTY_NOT_FOUND');
    const name = clean(args.name, 120);
    const phone = clean(args.phone, 40);
    const email = clean(args.email, 180).toLowerCase();
    const message = clean(args.message, 2_000);
    if (!name || !phone || !email.includes('@') || message.length < 5) {
      throw new ConvexError({ code: 'INVALID_CONTACT', message: 'Vui lòng nhập đầy đủ họ tên, số điện thoại, email và nội dung.' });
    }
    const now = Date.now();
    const submissionId = await ctx.db.insert('contactSubmissions', {
      propertyId: property._id, name, phone, email, message, status: 'new', createdAt: now, updatedAt: now,
    });
    return { submissionId };
  },
});

export const listForProperty = query({
  args: { propertyId: v.id('properties') },
  handler: async (ctx, args) => {
    if (process.env.DEMO_MODE !== 'true') await requirePropertyCapability(ctx, args.propertyId, 'booking.read');
    return await ctx.db.query('contactSubmissions').withIndex('by_property_createdAt', (q) => q.eq('propertyId', args.propertyId)).order('desc').collect();
  },
});

export const updateStatus = mutation({
  args: { submissionId: v.id('contactSubmissions'), status: v.union(v.literal('new'), v.literal('in_progress'), v.literal('resolved')) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.submissionId);
    if (!row) throw new ConvexError('CONTACT_NOT_FOUND');
    if (process.env.DEMO_MODE !== 'true') await requireMutationPropertyCapability(ctx, row.propertyId, 'booking.write', 'contact.update');
    await ctx.db.patch(row._id, { status: args.status, updatedAt: Date.now() });
    return { updated: true };
  },
});
