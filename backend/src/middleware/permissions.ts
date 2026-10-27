import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';

/**
 * Things worth controlling per person (ported from PharmaCare). Each role has a
 * default; an admin can make one person an exception — allowed or refused — for a
 * set time or until switched off. Admins always have everything, so a mistake here
 * can never lock everyone out.
 */
export const CAPABILITIES = [
  'customer.view',
  'invoice.create',
  'customer.manage',
  'invoice.deliver',
  'payment.record',
  'sale.tierPrice',
  'sale.discount',
  'price.edit',
  'stock.quantity.edit',
  'stock.intake',
  'goods.receive',
  'product.create',
  'expense.manage',
  'product.gridEdit',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, { label: string; hint: string }> = {
  'customer.view':       { label: 'See customers',              hint: 'Customer list, balances, statements and invoices' },
  'invoice.create':      { label: 'Create invoices',            hint: 'Raise, edit and issue invoices for their branch' },
  'customer.manage':     { label: 'Add or edit customers',      hint: 'Create, change or archive a customer' },
  'invoice.deliver':     { label: 'Deliver invoices',           hint: 'Confirm delivery: books the goods out of stock' },
  'payment.record':      { label: 'Record customer payments',   hint: 'Receive payment against a customer account or invoice' },
  'sale.tierPrice':      { label: 'Wholesale & school prices',  hint: 'Sell at the till at wholesale or school prices' },
  'sale.discount':       { label: 'Discount past the cap',      hint: 'Give more than the cashier discount cap at the till' },
  'price.edit':          { label: 'Change branch prices',       hint: 'Set this branch’s prices (cashiers: retail, not below the catalogue)' },
  'stock.quantity.edit': { label: 'Change stock counts',        hint: 'Key in a quantity or upload a stock take (cashiers: 3 a day per product)' },
  'stock.intake':        { label: 'Record stock intake',        hint: 'Add stock received at the branch' },
  'goods.receive':       { label: 'Receive supplier deliveries', hint: 'Goods received notes, including posting their cost' },
  'product.create':      { label: 'Add or edit products',       hint: 'Change the shared catalogue (catalogue prices stay admin-only)' },
  'expense.manage':      { label: 'Manage expenses',            hint: 'Record and view branch expenses' },
  'product.gridEdit':    { label: 'Edit prices & stock in a grid', hint: 'Products page grid: retail, wholesale and school prices and quantities for their branch' },
};

/** What each role gets unless a person is given an exception. Cashier defaults keep
 *  what cashiers could already do, plus seeing customers and raising invoices. */
const ROLE_DEFAULTS: Record<string, Capability[]> = {
  ADMIN: [...CAPABILITIES],
  // The products grid rewrites prices and stock in bulk: admins only, unless granted.
  MANAGER: CAPABILITIES.filter((c) => c !== 'product.gridEdit'),
  CASHIER: ['customer.view', 'invoice.create', 'price.edit', 'stock.quantity.edit', 'stock.intake'],
};

export const defaultsFor = (role: string): Capability[] => ROLE_DEFAULTS[role] ?? [];

/** True while an exception is still in force. A lapsed one is treated as absent. */
export const overrideIsLive = (o: { expiresAt: Date | null }): boolean => !o.expiresAt || o.expiresAt > new Date();

/** Role default, unless this person has been granted or refused it explicitly. */
export async function can(prisma: PrismaClient, user: { id: number; role: string }, capability: Capability): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  const override = await prisma.userPermission.findUnique({
    where: { userId_capability: { userId: user.id, capability } },
    select: { allowed: true, expiresAt: true },
  });
  if (override && overrideIsLive(override)) return override.allowed;
  return defaultsFor(user.role).includes(capability);
}

/** Everything this person may do right now. */
export async function capabilitiesFor(prisma: PrismaClient, user: { id: number; role: string }): Promise<Capability[]> {
  if (user.role === 'ADMIN') return [...CAPABILITIES];
  const set = new Set<Capability>(defaultsFor(user.role));
  const overrides = await prisma.userPermission.findMany({ where: { userId: user.id } });
  for (const o of overrides.filter(overrideIsLive)) {
    const c = o.capability as Capability;
    if (!CAPABILITIES.includes(c)) continue;
    if (o.allowed) set.add(c);
    else set.delete(c);
  }
  return CAPABILITIES.filter((c) => set.has(c));
}

const prismaOf = (req: FastifyRequest) => (req.server as unknown as { prisma: PrismaClient }).prisma;

/** Route guard: the caller must hold the capability. Admins always pass. */
export function requireCapability(capability: Capability) {
  return requireAnyCapability(capability);
}

/** Route guard: the caller must hold at least one of these capabilities. */
export function requireAnyCapability(...capabilities: Capability[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ error: 'Unauthorized' });
    if (req.user.role === 'ADMIN') return;
    for (const c of capabilities) if (await can(prismaOf(req), req.user, c)) return;
    return reply.code(403).send({
      error: `You do not have permission to ${CAPABILITY_LABELS[capabilities[0]].label.toLowerCase()}. Ask an administrator.`,
    });
  };
}
