// Safaricom Daraja (M-Pesa) STK push client — cloud-only.
//
// Configurable for Paybill (CustomerPayBillOnline) or Till/Buy Goods
// (CustomerBuyGoodsOnline) via env. Set MPESA_ENV=mock to simulate the whole
// flow without contacting Daraja (useful before credentials/callback URL exist).

type TxType = 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';

export interface MpesaConfig {
  env: 'sandbox' | 'production' | 'mock';
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  passkey: string;
  txType: TxType;
  partyB: string;
  callbackUrl: string;
  accountRef: string;
}

export function getMpesaConfig(): MpesaConfig {
  const raw = (process.env.MPESA_ENV ?? 'mock').toLowerCase();
  const env: MpesaConfig['env'] = raw === 'sandbox' || raw === 'production' ? raw : 'mock';
  const shortCode = process.env.MPESA_SHORTCODE ?? '174379';
  const txType: TxType =
    process.env.MPESA_TX_TYPE === 'CustomerBuyGoodsOnline' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline';
  return {
    env,
    consumerKey: process.env.MPESA_CONSUMER_KEY ?? '',
    consumerSecret: process.env.MPESA_CONSUMER_SECRET ?? '',
    shortCode,
    passkey: process.env.MPESA_PASSKEY ?? '',
    txType,
    partyB: process.env.MPESA_PARTYB || shortCode,
    callbackUrl: process.env.MPESA_CALLBACK_URL ?? '',
    accountRef: process.env.MPESA_ACCOUNT_REF ?? 'Booklab',
  };
}

/** True when we should simulate instead of calling Daraja (explicit mock, or missing credentials). */
export function isMockMode(cfg: MpesaConfig = getMpesaConfig()): boolean {
  return cfg.env === 'mock' || !cfg.consumerKey || !cfg.consumerSecret;
}

const baseUrl = (env: string) => (env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke');

/** Normalise a Kenyan number to 2547XXXXXXXX / 2541XXXXXXXX. */
export function normalizePhone(input: string): string {
  const digits = (input || '').replace(/\D/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return '254' + digits.slice(1);
  if (digits.startsWith('7') || digits.startsWith('1')) return '254' + digits;
  return digits;
}

function timestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(cfg: MpesaConfig): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;
  const auth = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString('base64');
  const res = await fetch(`${baseUrl(cfg.env)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`M-Pesa auth failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: string };
  const ttl = Number(data.expires_in ?? 3600) * 1000;
  tokenCache = { token: data.access_token, expiresAt: Date.now() + ttl };
  return data.access_token;
}

export interface StkResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
}

/** Initiate an STK push (Lipa Na M-Pesa Online). */
export async function initiateStk(params: {
  amount: number;
  phone: string;
  accountRef?: string;
  description?: string;
}): Promise<StkResult> {
  const cfg = getMpesaConfig();
  const phone = normalizePhone(params.phone);
  const amount = Math.max(1, Math.round(params.amount));

  if (isMockMode(cfg)) {
    return {
      merchantRequestId: `mock-${Date.now()}`,
      checkoutRequestId: `ws_MOCK_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      responseCode: '0',
      responseDescription: 'Success. Request accepted for processing (mock).',
      customerMessage: 'A payment prompt has been sent (simulated). It will confirm shortly.',
    };
  }

  const ts = timestamp();
  const password = Buffer.from(`${cfg.shortCode}${cfg.passkey}${ts}`).toString('base64');
  const token = await getAccessToken(cfg);
  const body = {
    BusinessShortCode: cfg.shortCode,
    Password: password,
    Timestamp: ts,
    TransactionType: cfg.txType,
    Amount: amount,
    PartyA: phone,
    PartyB: cfg.txType === 'CustomerBuyGoodsOnline' ? cfg.partyB : cfg.shortCode,
    PhoneNumber: phone,
    CallBackURL: cfg.callbackUrl,
    AccountReference: (params.accountRef ?? cfg.accountRef).slice(0, 12),
    TransactionDesc: (params.description ?? 'Booklab Bookshop sale').slice(0, 20),
  };
  const res = await fetch(`${baseUrl(cfg.env)}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as Record<string, string>;
  if (!res.ok || data.ResponseCode !== '0') {
    throw new Error(data.errorMessage || data.ResponseDescription || `STK push failed (${res.status})`);
  }
  return {
    merchantRequestId: data.MerchantRequestID,
    checkoutRequestId: data.CheckoutRequestID,
    responseCode: data.ResponseCode,
    responseDescription: data.ResponseDescription,
    customerMessage: data.CustomerMessage,
  };
}

export interface StkQueryResult {
  /** 0 = success, >0 = a terminal M-Pesa result code, -1 = still processing. */
  resultCode: number;
  resultDesc: string;
}

/** Query the status of an STK push directly (used when no callback has arrived). */
export async function queryStk(checkoutRequestId: string): Promise<StkQueryResult> {
  const cfg = getMpesaConfig();
  const ts = timestamp();
  const password = Buffer.from(`${cfg.shortCode}${cfg.passkey}${ts}`).toString('base64');
  const token = await getAccessToken(cfg);
  const res = await fetch(`${baseUrl(cfg.env)}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ BusinessShortCode: cfg.shortCode, Password: password, Timestamp: ts, CheckoutRequestID: checkoutRequestId }),
  });
  const data = (await res.json()) as Record<string, string>;
  if (!res.ok) {
    const msg = data.errorMessage || data.ResultDesc || '';
    // 500.001.1001 = "The transaction is being processed" — treat as still pending.
    if (data.errorCode === '500.001.1001' || /processing/i.test(msg)) return { resultCode: -1, resultDesc: 'Processing' };
    throw new Error(msg || `STK query failed (${res.status})`);
  }
  return { resultCode: Number(data.ResultCode), resultDesc: String(data.ResultDesc ?? '') };
}
