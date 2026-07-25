import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard } from '../middleware/authGuard.js';
import { getMpesaConfig, initiateStk, isMockMode, normalizePhone, queryStk } from '../lib/mpesa.js';

const stkSchema = z.object({
  amount: z.number().positive(),
  phone: z.string().min(9),
  accountRef: z.string().optional(),
  branchId: z.number().int().optional(),
});

// User-cancelled / timeout result codes that shouldn't be treated as hard failures.
const CANCELLED = new Set([1032]);

export async function mpesaRoutes(app: FastifyInstance) {
  // Lightweight, non-secret config so the POS can decide what UI to show.
  app.get('/config', { preHandler: authGuard }, async () => {
    const cfg = getMpesaConfig();
    return { enabled: true, mock: isMockMode(cfg), env: cfg.env, txType: cfg.txType, shortCode: cfg.shortCode };
  });

  // Initiate an STK push against a customer's phone.
  app.post('/stk', { preHandler: authGuard, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = stkSchema.parse(req.body);
    const phone = normalizePhone(body.phone);
    if (!/^254(7|1)\d{8}$/.test(phone)) return reply.code(400).send({ error: 'Enter a valid Safaricom number, e.g. 07XXXXXXXX.' });

    const branchId = req.user.role === 'ADMIN' ? body.branchId ?? null : req.user.branchId ?? null;

    try {
      const result = await initiateStk({ amount: body.amount, phone, accountRef: body.accountRef });
      await app.prisma.mpesaPayment.create({
        data: {
          checkoutRequestId: result.checkoutRequestId,
          merchantRequestId: result.merchantRequestId,
          amount: body.amount,
          phone,
          accountRef: body.accountRef,
          branchId,
          status: 'PENDING',
        },
      });

      // In mock mode there is no real prompt/callback — auto-confirm shortly so the POS can poll to success.
      if (isMockMode()) {
        const id = result.checkoutRequestId;
        setTimeout(() => {
          app.prisma.mpesaPayment
            .update({
              where: { checkoutRequestId: id },
              data: { status: 'SUCCESS', resultCode: 0, resultDesc: 'The service request is processed successfully.', mpesaReceipt: 'MOCK' + Math.random().toString(36).slice(2, 9).toUpperCase() },
            })
            .catch(() => undefined);
        }, 6000);
      }

      return {
        checkoutRequestId: result.checkoutRequestId,
        merchantRequestId: result.merchantRequestId,
        customerMessage: result.customerMessage,
        mock: isMockMode(),
      };
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: (e as Error).message || 'M-Pesa request failed.' });
    }
  });

  // Poll a payment's status. Falls back to the STK query API when no callback has arrived yet.
  app.get('/status', { preHandler: authGuard }, async (req, reply) => {
    const { checkoutRequestId } = req.query as { checkoutRequestId?: string };
    if (!checkoutRequestId) return reply.code(400).send({ error: 'checkoutRequestId is required' });
    let rec = await app.prisma.mpesaPayment.findUnique({ where: { checkoutRequestId } });
    if (!rec) return reply.code(404).send({ error: 'Unknown checkoutRequestId' });

    if (rec.status === 'PENDING' && !isMockMode()) {
      try {
        const q = await queryStk(checkoutRequestId);
        if (q.resultCode === 0) {
          rec = await app.prisma.mpesaPayment.update({ where: { checkoutRequestId }, data: { status: 'SUCCESS', resultCode: 0, resultDesc: q.resultDesc } });
        } else if (q.resultCode > 0) {
          const status = CANCELLED.has(q.resultCode) ? 'CANCELLED' : 'FAILED';
          rec = await app.prisma.mpesaPayment.update({ where: { checkoutRequestId }, data: { status, resultCode: q.resultCode, resultDesc: q.resultDesc } });
        }
      } catch (e) {
        req.log.warn(e); // leave as PENDING and let the client keep polling
      }
    }

    return {
      status: rec.status,
      resultCode: rec.resultCode,
      resultDesc: rec.resultDesc,
      mpesaReceipt: rec.mpesaReceipt,
      amount: Number(rec.amount),
      phone: rec.phone,
    };
  });

  // Daraja result callback — PUBLIC (no JWT); Safaricom posts here.
  // The endpoint is unauthenticated and therefore untrusted: a forged callback
  // must never be able to mark a payment as paid. A claimed success is only
  // accepted after independently confirming it with Daraja's STK query API.
  // Failures need no confirmation (they cannot be used to steal goods).
  app.post('/callback', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const cb = (req.body as { Body?: { stkCallback?: any } })?.Body?.stkCallback;
    if (!cb?.CheckoutRequestID) return reply.send({ ResultCode: 0, ResultDesc: 'Ignored' });

    const checkoutRequestId = String(cb.CheckoutRequestID);
    const resultCode = Number(cb.ResultCode);
    const resultDesc = String(cb.ResultDesc ?? '');
    const items = cb.CallbackMetadata?.Item as Array<{ Name: string; Value?: string | number }> | undefined;
    let receipt = items?.find((i) => i.Name === 'MpesaReceiptNumber')?.Value;
    let status = resultCode === 0 ? 'SUCCESS' : CANCELLED.has(resultCode) ? 'CANCELLED' : 'FAILED';

    if (status === 'SUCCESS' && !isMockMode()) {
      try {
        const q = await queryStk(checkoutRequestId);
        if (q.resultCode !== 0) {
          req.log.warn(`Rejected forged M-Pesa success callback for ${checkoutRequestId} (Daraja says ${q.resultCode})`);
          return reply.send({ ResultCode: 0, ResultDesc: 'Accepted' });
        }
      } catch (e) {
        // Cannot confirm right now — leave the record PENDING; /status will retry the query.
        req.log.warn({ err: e }, `Unverified M-Pesa success callback for ${checkoutRequestId}; leaving PENDING`);
        return reply.send({ ResultCode: 0, ResultDesc: 'Accepted' });
      }
    }

    try {
      await app.prisma.mpesaPayment.update({
        where: { checkoutRequestId },
        data: { status: status as 'SUCCESS' | 'FAILED' | 'CANCELLED', resultCode, resultDesc, mpesaReceipt: receipt != null ? String(receipt) : undefined },
      });
    } catch {
      req.log.warn(`M-Pesa callback for unknown CheckoutRequestID ${checkoutRequestId}`);
    }
    // Always acknowledge so Safaricom stops retrying.
    return reply.send({ ResultCode: 0, ResultDesc: 'Accepted' });
  });
}
