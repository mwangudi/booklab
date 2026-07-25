import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard, requireRole } from '../middleware/authGuard.js';
import { auditRequest, diff } from '../lib/audit.js';
import { computePay, DEFAULT_PAYE_BANDS, periodLabel, type PayeBand, type PayrollRates } from '../lib/payroll.js';

const employeeSchema = z.object({
  staffNo: z.string().min(1).max(40),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  nationalId: z.string().nullable().optional(),
  kraPin: z.string().nullable().optional(),
  nssfNo: z.string().nullable().optional(),
  shifNo: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal('')),
  jobTitle: z.string().nullable().optional(),
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'CASUAL', 'INTERN']).default('PERMANENT'),
  branchId: z.number().int().nullable().optional(),
  userId: z.number().int().nullable().optional(),
  basicSalary: z.number().nonnegative().default(0),
  houseAllowance: z.number().nonnegative().default(0),
  transportAllowance: z.number().nonnegative().default(0),
  otherAllowance: z.number().nonnegative().default(0),
  otherDeductions: z.number().nonnegative().default(0),
  bankName: z.string().nullable().optional(),
  bankAccount: z.string().nullable().optional(),
  hiredAt: z.string().nullable().optional(),
  active: z.boolean().default(true),
});
const employeeUpdateSchema = employeeSchema.partial();

const bandSchema = z.object({ upTo: z.number().positive().nullable(), rate: z.number().min(0).max(1) });
const settingsSchema = z.object({
  payeBands: z.array(bandSchema).min(1),
  personalRelief: z.number().nonnegative(),
  insuranceRelief: z.number().nonnegative(),
  nssfTier1Limit: z.number().nonnegative(),
  nssfTier2Limit: z.number().nonnegative(),
  nssfRate: z.number().min(0).max(1),
  shifRate: z.number().min(0).max(1),
  shifMinimum: z.number().nonnegative(),
  housingLevyRate: z.number().min(0).max(1),
});

const runSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  note: z.string().max(200).optional(),
});

const n = (v: unknown): number => Number(v ?? 0);

export async function payrollRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  // Salary information is the most sensitive data in the system.
  app.addHook('preHandler', requireRole('ADMIN'));

  /** Load the single settings row, creating it with statutory defaults if missing. */
  async function loadRates(): Promise<PayrollRates & { id: number }> {
    let row = await app.prisma.payrollSetting.findUnique({ where: { id: 1 } });
    if (!row) {
      row = await app.prisma.payrollSetting.create({
        data: { id: 1, payeBands: JSON.stringify(DEFAULT_PAYE_BANDS) },
      });
    }
    let bands: PayeBand[] = DEFAULT_PAYE_BANDS;
    try {
      const parsed = JSON.parse(row.payeBands) as PayeBand[];
      if (Array.isArray(parsed) && parsed.length) bands = parsed;
    } catch {
      /* fall back to the statutory defaults */
    }
    return {
      id: row.id,
      payeBands: bands,
      personalRelief: n(row.personalRelief),
      insuranceRelief: n(row.insuranceRelief),
      nssfTier1Limit: n(row.nssfTier1Limit),
      nssfTier2Limit: n(row.nssfTier2Limit),
      nssfRate: n(row.nssfRate),
      shifRate: n(row.shifRate),
      shifMinimum: n(row.shifMinimum),
      housingLevyRate: n(row.housingLevyRate),
    };
  }

  /* ----------------------------------------------------------- settings */

  app.get('/settings', async () => loadRates());

  app.put('/settings', async (req) => {
    const body = settingsSchema.parse(req.body);
    const before = await app.prisma.payrollSetting.findUnique({ where: { id: 1 } });
    const data = { ...body, payeBands: JSON.stringify(body.payeBands) };
    await app.prisma.payrollSetting.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    await auditRequest(app.prisma, req, {
      entity: 'payroll.settings',
      entityId: 1,
      action: 'UPDATE',
      details: { changes: diff(before as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>) },
    });
    return loadRates();
  });

  /* ---------------------------------------------------------- employees */

  app.get('/employees', async (req) => {
    const { archived, branchId } = req.query as { archived?: string; branchId?: string };
    const scope = archived === 'only' ? { NOT: { deletedAt: null } } : archived === 'all' ? {} : { deletedAt: null };
    return app.prisma.employee.findMany({
      where: { ...scope, branchId: branchId ? Number(branchId) : undefined },
      include: { branch: { select: { name: true } }, user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ active: 'desc' }, { firstName: 'asc' }],
      take: 1000,
    });
  });

  app.post('/employees', async (req, reply) => {
    const body = employeeSchema.parse(req.body);
    try {
      const created = await app.prisma.employee.create({
        data: { ...body, email: body.email || null, hiredAt: body.hiredAt ? new Date(body.hiredAt) : null },
      });
      await auditRequest(app.prisma, req, {
        entity: 'employee',
        entityId: created.id,
        branchId: created.branchId,
        action: 'CREATE',
        details: { staffNo: created.staffNo, name: `${created.firstName} ${created.lastName}`, basicSalary: n(created.basicSalary) },
      });
      return reply.code(201).send(created);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return reply.code(409).send({ error: 'That staff number or login is already used by another employee.' });
      throw e;
    }
  });

  app.patch('/employees/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid employee id' });
    const body = employeeUpdateSchema.parse(req.body);
    const before = await app.prisma.employee.findUnique({ where: { id } });
    if (!before) return reply.code(404).send({ error: 'Employee not found' });
    try {
      const updated = await app.prisma.employee.update({
        where: { id },
        data: {
          ...body,
          ...(body.email !== undefined ? { email: body.email || null } : {}),
          ...(body.hiredAt !== undefined ? { hiredAt: body.hiredAt ? new Date(body.hiredAt) : null } : {}),
        },
      });
      await auditRequest(app.prisma, req, {
        entity: 'employee',
        entityId: id,
        branchId: updated.branchId,
        action: 'UPDATE',
        details: { staffNo: before.staffNo, changes: diff(before as unknown as Record<string, unknown>, body as Record<string, unknown>) },
      });
      return updated;
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return reply.code(409).send({ error: 'That staff number or login is already used by another employee.' });
      throw e;
    }
  });

  // Archive (soft delete) — payslip history is preserved.
  app.delete('/employees/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid employee id' });
    const emp = await app.prisma.employee.findUnique({ where: { id } });
    if (!emp) return reply.code(404).send({ error: 'Employee not found' });
    if (emp.deletedAt) return reply.code(409).send({ error: 'This employee is already archived.' });
    const archived = await app.prisma.employee.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await auditRequest(app.prisma, req, {
      entity: 'employee',
      entityId: id,
      branchId: emp.branchId,
      action: 'ARCHIVE',
      details: { staffNo: emp.staffNo, name: `${emp.firstName} ${emp.lastName}` },
    });
    return archived;
  });

  app.post('/employees/:id/restore', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid employee id' });
    const emp = await app.prisma.employee.findUnique({ where: { id } });
    if (!emp) return reply.code(404).send({ error: 'Employee not found' });
    if (!emp.deletedAt) return reply.code(409).send({ error: 'This employee is not archived.' });
    const restored = await app.prisma.employee.update({ where: { id }, data: { deletedAt: null, active: true } });
    await auditRequest(app.prisma, req, {
      entity: 'employee',
      entityId: id,
      branchId: emp.branchId,
      action: 'RESTORE',
      details: { staffNo: emp.staffNo },
    });
    return restored;
  });

  /* -------------------------------------------------------- payroll runs */

  /** Recompute every payslip in a draft run from current salaries and rates. */
  async function buildPayslips(runId: number) {
    const rates = await loadRates();
    const employees = await app.prisma.employee.findMany({ where: { deletedAt: null, active: true } });

    const slips = employees.map((e) => {
      const pay = computePay(
        {
          basicSalary: n(e.basicSalary),
          houseAllowance: n(e.houseAllowance),
          transportAllowance: n(e.transportAllowance),
          otherAllowance: n(e.otherAllowance),
          otherDeductions: n(e.otherDeductions),
        },
        rates,
      );
      return { runId, employeeId: e.id, branchId: e.branchId, ...pay };
    });

    const totals = slips.reduce(
      (a, s) => ({
        grossTotal: a.grossTotal + s.grossPay,
        deductionsTotal: a.deductionsTotal + s.totalDeductions,
        netTotal: a.netTotal + s.netPay,
        employerTotal: a.employerTotal + s.grossPay + s.employerNssf + s.employerHousingLevy,
      }),
      { grossTotal: 0, deductionsTotal: 0, netTotal: 0, employerTotal: 0 },
    );

    await app.prisma.$transaction(async (tx) => {
      await tx.payslip.deleteMany({ where: { runId } });
      if (slips.length) await tx.payslip.createMany({ data: slips });
      await tx.payrollRun.update({ where: { id: runId }, data: totals });
    });

    return slips.length;
  }

  app.get('/runs', async () =>
    app.prisma.payrollRun.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { _count: { select: { payslips: true } } },
      take: 120,
    }),
  );

  app.get('/runs/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid run id' });
    const run = await app.prisma.payrollRun.findUnique({
      where: { id },
      include: {
        payslips: {
          include: { employee: { select: { staffNo: true, firstName: true, lastName: true, jobTitle: true, branch: { select: { name: true } } } } },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!run) return reply.code(404).send({ error: 'Payroll run not found' });
    return run;
  });

  app.post('/runs', async (req, reply) => {
    const body = runSchema.parse(req.body);
    const existing = await app.prisma.payrollRun.findUnique({ where: { year_month: { year: body.year, month: body.month } } });
    if (existing) return reply.code(409).send({ error: `Payroll for ${periodLabel(body.year, body.month)} already exists.` });

    const staff = await app.prisma.employee.count({ where: { deletedAt: null, active: true } });
    if (staff === 0) return reply.code(400).send({ error: 'Add at least one active employee before running payroll.' });

    const run = await app.prisma.payrollRun.create({
      data: { year: body.year, month: body.month, note: body.note, createdById: req.user.id },
    });
    const count = await buildPayslips(run.id);
    await auditRequest(app.prisma, req, {
      entity: 'payroll.run',
      entityId: run.id,
      action: 'CREATE',
      details: { period: periodLabel(body.year, body.month), employees: count },
    });
    return reply.code(201).send(await app.prisma.payrollRun.findUnique({ where: { id: run.id } }));
  });

  app.post('/runs/:id/recalculate', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const run = await app.prisma.payrollRun.findUnique({ where: { id } });
    if (!run) return reply.code(404).send({ error: 'Payroll run not found' });
    if (run.status === 'CLOSED') return reply.code(409).send({ error: 'This payroll is closed and can no longer be recalculated.' });
    const count = await buildPayslips(id);
    await auditRequest(app.prisma, req, {
      entity: 'payroll.run',
      entityId: id,
      action: 'RECALCULATE',
      details: { period: periodLabel(run.year, run.month), employees: count },
    });
    return app.prisma.payrollRun.findUnique({ where: { id } });
  });

  // Closing locks the figures and posts one SALARY expense per branch.
  app.post('/runs/:id/close', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const run = await app.prisma.payrollRun.findUnique({ where: { id }, include: { payslips: true } });
    if (!run) return reply.code(404).send({ error: 'Payroll run not found' });
    if (run.status === 'CLOSED') return reply.code(409).send({ error: 'This payroll has already been closed.' });
    if (run.payslips.length === 0) return reply.code(400).send({ error: 'This payroll has no payslips to post.' });

    // Employer cost per branch = gross pay + employer NSSF + employer housing levy.
    const byBranch = new Map<number | null, number>();
    for (const s of run.payslips) {
      const cost = n(s.grossPay) + n(s.employerNssf) + n(s.employerHousingLevy);
      byBranch.set(s.branchId, (byBranch.get(s.branchId) ?? 0) + cost);
    }
    // Post on the last day of the payroll month.
    const incurredAt = new Date(run.year, run.month, 0, 12, 0, 0);
    const label = periodLabel(run.year, run.month);

    const closed = await app.prisma.$transaction(async (tx) => {
      for (const [branchId, amount] of byBranch) {
        if (amount <= 0) continue;
        await tx.expense.create({
          data: {
            branchId,
            category: 'SALARY',
            description: `Payroll ${label}`,
            amount,
            incurredAt,
            payrollRunId: run.id,
            originBranchId: branchId ?? undefined,
          },
        });
      }
      return tx.payrollRun.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: new Date(), closedById: req.user.id },
      });
    });

    await auditRequest(app.prisma, req, {
      entity: 'payroll.run',
      entityId: id,
      action: 'CLOSE',
      details: {
        period: label,
        employees: run.payslips.length,
        netTotal: n(run.netTotal),
        postedExpenses: [...byBranch.entries()].map(([branchId, amount]) => ({ branchId, amount })),
      },
    });
    return closed;
  });

  // A draft can be discarded; a closed payroll is permanent.
  app.delete('/runs/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const run = await app.prisma.payrollRun.findUnique({ where: { id } });
    if (!run) return reply.code(404).send({ error: 'Payroll run not found' });
    if (run.status === 'CLOSED') return reply.code(409).send({ error: 'A closed payroll cannot be deleted.' });
    await app.prisma.payrollRun.delete({ where: { id } });
    await auditRequest(app.prisma, req, {
      entity: 'payroll.run',
      entityId: id,
      action: 'DELETE_DRAFT',
      details: { period: periodLabel(run.year, run.month) },
    });
    return { ok: true };
  });
}
