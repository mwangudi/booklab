import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';

import { authRoutes } from './routes/auth.js';
import { branchRoutes } from './routes/branches.js';
import { bookRoutes } from './routes/books.js';
import { stockRoutes } from './routes/stock.js';
import { saleRoutes } from './routes/sales.js';
import { expenseRoutes } from './routes/expenses.js';
import { reportRoutes } from './routes/reports.js';
import { auditRoutes } from './routes/audit.js';
import { invoiceRoutes } from './routes/invoices.js';
import { goodsReceiptRoutes } from './routes/goodsReceipts.js';
import { payrollRoutes } from './routes/payroll.js';
import { syncRoutes } from './routes/sync.js';
import { mpesaRoutes } from './routes/mpesa.js';
import { promoRoutes } from './routes/promo.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: number; role: string; branchId: number | null };
    user: { id: number; role: string; branchId: number | null };
  }
}

// Behind nginx, so honour X-Forwarded-For — otherwise every audited action and
// rate-limit bucket would be attributed to 127.0.0.1.
const app = Fastify({ logger: true, trustProxy: true });
const prisma = new PrismaClient();

await app.register(cors, {
  origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
  credentials: true,
});
await app.register(helmet, { contentSecurityPolicy: false });
// Baseline abuse protection on every route; stricter per-route limits are set
// where they matter (login, M-Pesa STK, catalogue import).
await app.register(rateLimit, {
  global: true,
  max: Number(process.env.RATE_LIMIT_MAX ?? 300),
  timeWindow: '1 minute',
  allowList: (req) => req.url === '/health',
});
await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'dev-secret-change-me' });

app.decorate('prisma', prisma);

// Some clients send `Content-Type: application/json` with no body on actions
// that take no arguments (e.g. restore). Treat that as an empty object rather
// than failing the request.
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  const raw = typeof body === 'string' ? body.trim() : '';
  if (raw === '') return done(null, {});
  try {
    done(null, JSON.parse(raw));
  } catch {
    const err = Object.assign(new Error('Invalid JSON body'), { statusCode: 400 });
    done(err, undefined);
  }
});

// Central error mapping: validation problems are the client's fault (400), and
// unexpected failures never leak internals to the caller.
app.setErrorHandler((err, req, reply) => {
  if (reply.sent) return;
  if (err instanceof ZodError) {
    const detail = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    return reply.code(400).send({ error: detail || 'Invalid request' });
  }
  const status = (err as { statusCode?: number }).statusCode;
  if (status && status >= 400 && status < 500) {
    return reply.code(status).send({ error: err.message });
  }
  req.log.error(err);
  return reply.code(500).send({ error: 'Something went wrong. Please try again.' });
});

app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(branchRoutes, { prefix: '/api/branches' });
await app.register(bookRoutes, { prefix: '/api/books' });
await app.register(stockRoutes, { prefix: '/api/stock' });
await app.register(saleRoutes, { prefix: '/api/sales' });
await app.register(expenseRoutes, { prefix: '/api/expenses' });
await app.register(reportRoutes, { prefix: '/api/reports' });
await app.register(auditRoutes, { prefix: '/api/audit' });
await app.register(invoiceRoutes, { prefix: '/api/invoices' });
await app.register(goodsReceiptRoutes, { prefix: '/api/goods-receipts' });
await app.register(payrollRoutes, { prefix: '/api/payroll' });
await app.register(syncRoutes, { prefix: '/api/sync' });
await app.register(mpesaRoutes, { prefix: '/api/mpesa' });
await app.register(promoRoutes, { prefix: '/api/promo' });

// A branch runs without nginx in front of it, so the API serves the web app
// itself. Set SERVE_WEB to the built frontend; in the cloud nginx does this.
const webRoot = process.env.SERVE_WEB;
if (webRoot) {
  const root = resolve(webRoot);
  if (!existsSync(join(root, 'index.html'))) {
    app.log.error(`SERVE_WEB=${root} has no index.html — build the frontend first.`);
    process.exit(1);
  }
  await app.register(fastifyStatic, { root, wildcard: false });
  // Anything that is not an API call is a client-side route.
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
    return reply.sendFile('index.html');
  });
  app.log.info(`Serving the web app from ${root}`);
}

const port = Number(process.env.PORT ?? 4000);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
