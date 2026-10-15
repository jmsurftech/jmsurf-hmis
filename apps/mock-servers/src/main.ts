import express, { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { hash, personFor } from './people';
import { africaMocks } from './africa';

/**
 * JMSURF HMIS mock servers. Paths mirror what the API adapters call (see apps/api/src/integrations and
 * docs/integrations/SHA_HIE.md). State is in-memory and resets on restart.
 */
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => { console.log(`[mock] ${req.method} ${req.originalUrl}`); next(); });

const log: { at: string; path: string; body: unknown }[] = [];
const remember = (req: Request) => { log.push({ at: new Date().toISOString(), path: req.originalUrl, body: req.body }); if (log.length > 500) log.shift(); };
const tokens = new Set<string>();
const issueToken = () => { const t = `mock_${randomUUID()}`; tokens.add(t); return t; };
const bearer = (req: Request, res: Response) => {
  const t = (req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!tokens.has(t)) { res.status(401).json({ error: 'invalid_token' }); return false; }
  return true;
};

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'jmsurf-hmis-mock-servers' }));
app.get('/_log', (_req, res) => res.json(log.slice(-100)));

// ───────────── SHA / HIE ─────────────
const sha = express.Router();
sha.post('/oauth2/token', (req, res) => {
  if (req.body.grant_type !== 'client_credentials' || !req.body.client_id) return res.status(400).json({ error: 'invalid_request' });
  res.json({ access_token: issueToken(), token_type: 'Bearer', expires_in: 3600 });
});
sha.get('/v1/client-registry/search', (req, res) => {
  if (!bearer(req, res)) return;
  const idNumber = String(req.query.idNumber ?? '');
  if (!idNumber || idNumber.startsWith('999')) return res.json({ found: false }); // 999… = not in registry
  res.json({ found: true, client: personFor(String(req.query.idType ?? 'NATIONAL_ID'), idNumber) });
});
sha.post('/v1/eligibility', (req, res) => {
  if (!bearer(req, res)) return;
  remember(req);
  const id = String(req.body.idNumber ?? req.body.crId ?? '');
  const eligible = !!id && !id.endsWith('0'); // IDs ending in 0 = not eligible (contributions not up to date)
  const funds = ['PHC', 'SHIF', 'ECCIF'];
  res.json(eligible
    ? { eligible: true, fund: funds[hash(id) % 2 === 0 ? 1 : 0], memberNumber: `SHA${String(hash(id)).slice(0, 9)}`, reference: `ELG-${Date.now()}`, message: 'Member active' }
    : { eligible: false, reference: `ELG-${Date.now()}`, message: 'Contributions not up to date' });
});
const preauths = new Map<string, any>();
sha.post('/v1/preauthorizations', (req, res) => {
  if (!bearer(req, res)) return;
  remember(req);
  const ref = `PA-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const amount = Number(req.body.amount ?? 0);
  // > 500,000 KES is rejected; > 100,000 stays pending; otherwise approved immediately.
  const status = amount > 500_000 ? 'REJECTED' : amount > 100_000 ? 'SUBMITTED' : 'APPROVED';
  const r = { preauthRef: ref, status, approvedAmount: status === 'APPROVED' ? amount : undefined, message: status === 'REJECTED' ? 'Amount exceeds package cap' : 'OK' };
  preauths.set(ref, r);
  res.status(201).json(r);
});
sha.get('/v1/preauthorizations/:ref', (req, res) => { if (!bearer(req, res)) return; res.json(preauths.get(req.params.ref) ?? { status: 'NOT_FOUND' }); });

const claims = new Map<string, { status: string; approvedAmount?: number; paidAmount?: number; reason?: string; createdAt: number; total: number; final: string }>();
sha.post('/v1/claims', (req, res) => {
  if (!bearer(req, res)) return;
  remember(req);
  const bundle = req.body;
  if (bundle?.resourceType !== 'Bundle') return res.status(400).json({ outcome: 'error', disposition: 'Expected a FHIR Bundle' });
  const claim = bundle.entry?.find((e: any) => e.resource?.resourceType === 'Claim')?.resource;
  const patient = bundle.entry?.find((e: any) => e.resource?.resourceType === 'Patient')?.resource;
  if (!claim) return res.status(400).json({ outcome: 'error', disposition: 'Bundle has no Claim' });
  const hasCr = (patient?.identifier ?? []).some((i: any) => /cr-id/.test(i.system ?? ''));
  if (!claim.diagnosis?.length) return res.json({ outcome: 'error', disposition: 'Missing diagnosis' });
  if (!hasCr) return res.json({ outcome: 'error', disposition: 'Patient CR ID missing' });
  const ref = `SHA-CLM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const total = Number(claim.total?.value ?? 0);
  const h = hash(claim.identifier?.[0]?.value ?? ref) % 10;
  // Deterministic outcomes per claim number: 0 → rejected, 1 → queried, 2 → partially approved, else approved.
  const final = h === 0 ? 'REJECTED' : h === 1 ? 'QUERIED' : h === 2 ? 'PARTIALLY_APPROVED' : 'APPROVED';
  claims.set(ref, { status: 'IN_REVIEW', createdAt: Date.now(), total, final });
  res.status(201).json({ resourceType: 'ClaimResponse', id: ref, claimRef: ref, outcome: 'queued', status: 'SUBMITTED', disposition: 'Claim received' });
});
sha.get('/v1/claims/:ref', (req, res) => {
  if (!bearer(req, res)) return;
  const c = claims.get(req.params.ref);
  if (!c) return res.status(404).json({ error: 'not_found' });
  if (c.status === 'IN_REVIEW' && Date.now() - c.createdAt > Number(process.env.MOCK_CLAIM_DECISION_MS ?? 10_000)) {
    c.status = c.final;
    if (c.final === 'APPROVED') c.approvedAmount = c.total;
    if (c.final === 'PARTIALLY_APPROVED') c.approvedAmount = Math.round(c.total * 0.8 * 100) / 100;
    if (c.final === 'REJECTED') c.reason = 'Service not covered under member benefit package';
    if (c.final === 'QUERIED') c.reason = 'Attach discharge summary';
  }
  res.json({ claimRef: req.params.ref, ...c });
});
app.use('/sha', sha);

// ───────────── M-Pesa Daraja ─────────────
const mpesa = express.Router();
mpesa.get('/oauth/v1/generate', (req, res) => {
  if (!/^Basic /.test(req.header('authorization') ?? '')) return res.status(400).json({ errorMessage: 'Invalid Authentication passed' });
  res.json({ access_token: issueToken(), expires_in: '3599' });
});
mpesa.post('/mpesa/stkpush/v1/processrequest', (req, res) => {
  if (!bearer(req, res)) return;
  remember(req);
  const b = req.body;
  const decoded = b.Password ? Buffer.from(String(b.Password), 'base64').toString() : '';
  if (!decoded.startsWith(String(b.BusinessShortCode)) || !decoded.endsWith(String(b.Timestamp)))
    return res.status(400).json({ errorCode: '400.002.02', errorMessage: 'Bad Request - Invalid Password' });
  const merchantRequestId = `${Math.floor(Math.random() * 1e5)}-${Date.now()}`;
  const checkoutRequestId = `ws_CO_${Date.now()}${Math.floor(Math.random() * 1000)}`;
  res.json({ MerchantRequestID: merchantRequestId, CheckoutRequestID: checkoutRequestId, ResponseCode: '0', ResponseDescription: 'Success. Request accepted for processing', CustomerMessage: 'Success. Request accepted for processing' });
  const cancelled = String(b.PhoneNumber).endsWith('0'); // phone ending in 0 = user cancels
  setTimeout(async () => {
    const callback = {
      Body: { stkCallback: cancelled
        ? { MerchantRequestID: merchantRequestId, CheckoutRequestID: checkoutRequestId, ResultCode: 1032, ResultDesc: 'Request cancelled by user' }
        : {
            MerchantRequestID: merchantRequestId, CheckoutRequestID: checkoutRequestId, ResultCode: 0, ResultDesc: 'The service request is processed successfully.',
            CallbackMetadata: { Item: [
              { Name: 'Amount', Value: Number(b.Amount) },
              { Name: 'MpesaReceiptNumber', Value: `MCK${Math.random().toString(36).slice(2, 9).toUpperCase()}` },
              { Name: 'TransactionDate', Value: Number(new Date().toISOString().replace(/\D/g, '').slice(0, 14)) },
              { Name: 'PhoneNumber', Value: Number(b.PhoneNumber) },
            ] },
          } },
    };
    try {
      const r = await fetch(b.CallBackURL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(callback) });
      console.log(`[mock] STK callback → ${b.CallBackURL} ${r.status}`);
    } catch (e: any) { console.warn(`[mock] STK callback to ${b.CallBackURL} failed: ${e?.message}`); }
  }, Number(process.env.MOCK_STK_DELAY_MS ?? 3000));
});
app.use('/mpesa', mpesa);

// ───────────── KRA eTIMS (OSCU) ─────────────
const etims = express.Router();
let rcptCounter = 1000;
etims.post('/trnsSales/saveSales', (req, res) => {
  remember(req);
  const b = req.body;
  if (!b?.invcNo || !Array.isArray(b.itemList)) return res.json({ resultCd: '894', resultMsg: 'Invalid request', data: null });
  const rcptNo = ++rcptCounter;
  const rcptSign = Buffer.from(`${b.tin}${b.invcNo}${rcptNo}`).toString('base64').replace(/[^A-Z0-9]/gi, '').slice(0, 16).toUpperCase();
  res.json({
    resultCd: '000', resultMsg: 'It is succeeded', resultDt: new Date().toISOString().replace(/\D/g, '').slice(0, 14),
    data: {
      rcptNo, intrlData: Buffer.from(String(b.invcNo)).toString('base64').slice(0, 26), rcptSign, totRcptNo: rcptNo,
      vsdcRcptPbctDate: new Date().toISOString().replace(/\D/g, '').slice(0, 14), sdcId: 'KRACU0100000001', mrcNo: 'WIS00000001',
      qrUrl: `https://etims-sbx.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=${b.tin}${b.bhfId}${rcptSign}`,
    },
  });
});
app.use('/etims', etims);

// ───────────── DHIS2 ─────────────
app.post('/dhis2/api/dataValueSets', (req, res) => {
  remember(req);
  const n = Array.isArray(req.body?.dataValues) ? req.body.dataValues.length : 0;
  res.json({ httpStatus: 'OK', httpStatusCode: 200, status: 'OK', message: 'Import was successful.',
    response: { responseType: 'ImportSummary', status: 'SUCCESS', importCount: { imported: n, updated: 0, ignored: 0, deleted: 0 }, dataSetComplete: 'false' } });
});

// ───────────── SMS (Africa's Talking shape) ─────────────
const sms = (req: Request, res: Response) => {
  remember(req);
  const to = String(req.body.to ?? '').split(',').filter(Boolean);
  res.status(201).json({ SMSMessageData: { Message: `Sent to ${to.length}/${to.length} Total Cost: KES 0.0000`,
    Recipients: to.map((n) => ({ number: n.trim(), status: 'Success', statusCode: 101, cost: 'KES 0.8000', messageId: `ATXid_${randomUUID().slice(0, 12)}` })) } });
};
app.post('/sms', sms);
app.post('/sms/version1/messaging', sms);

// ───────────── Pan-African adapters (UG/TZ/RW/GH/ZM/NG fiscal, TZ NHIF, GH NHIA, MTN MoMo, Airtel) ─────────────
app.use(africaMocks(remember));

const port = Number(process.env.PORT ?? 4100);
app.listen(port, () => console.log(`[mock] JMSURF mock servers listening on :${port}`));
