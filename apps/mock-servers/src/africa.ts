import express, { Request, Response, Router } from 'express';
import { randomUUID } from 'crypto';

/**
 * Mocks for the pan-African adapters (apps/api/src/integrations/fiscal/* and integrations/africa/*).
 * Shapes follow the public specs as summarised in docs/integrations/ASSUMPTIONS.md. In-memory; resets on restart.
 */
export function africaMocks(remember: (req: Request) => void): Router {
  const r = express.Router();
  const tokens = new Set<string>();
  const issue = () => { const t = `mock_${randomUUID()}`; tokens.add(t); return t; };
  const authed = (req: Request, res: Response) => {
    const t = (req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!tokens.has(t)) { res.status(401).json({ error: 'invalid_token' }); return false; }
    return true;
  };
  let seq = 5000;
  const stamp = () => new Date().toISOString().replace(/\D/g, '').slice(0, 14);

  // URA EFRIS (UG): single gateway endpoint, interfaceCode routes the call; content is base64 JSON.
  r.post('/efris/efrisws/ws/taapp/getInformation', (req, res) => {
    remember(req);
    const code = req.body?.globalInfo?.interfaceCode;
    let content: any;
    try { content = JSON.parse(Buffer.from(String(req.body?.data?.content ?? ''), 'base64').toString()); } catch { content = null; }
    if (code !== 'T109' || !content?.goodsDetails?.length) return res.json({ returnStateInfo: { returnCode: '99', returnMessage: 'Invalid T109 content' } });
    const invoiceNo = `3${String(++seq).padStart(12, '0')}`;
    const out = { ...content, basicInformation: { ...content.basicInformation, invoiceNo, antifakeCode: String(Math.floor(Math.random() * 1e19)).slice(0, 20), invoiceId: randomUUID() },
      summary: { ...content.summary, qrCode: `https://efrisws.ura.go.ug/qr?invoiceNo=${invoiceNo}` } };
    res.json({ data: { content: Buffer.from(JSON.stringify(out)).toString('base64'), signature: 'mock', dataDescription: { codeType: '0', encryptCode: '0', zipCode: '0' } },
      globalInfo: { ...req.body.globalInfo, responseCode: 'TP' }, returnStateInfo: { returnCode: '00', returnMessage: 'SUCCESS' } });
  });

  // TRA VFD (TZ): token + XML receipt with ACK XML.
  r.post('/vfd/vfdtoken', (req, res) => {
    if (req.body?.grant_type !== 'password') return res.status(400).json({ error: 'unsupported_grant_type' });
    res.json({ access_token: issue(), token_type: 'bearer', expires_in: 86399 });
  });
  r.post('/vfd/api/efdmsRctInfo', express.text({ type: ['application/xml', 'text/xml'] }), (req, res) => {
    if (!authed(req, res)) return;
    remember(req);
    const xml = String(req.body ?? '');
    const ok = /<RCT>[\s\S]*<ITEMS>[\s\S]*<\/RCT>/.test(xml) && req.header('routing-key') === 'vfdrct';
    const rct = /<RCTNUM>(\d+)<\/RCTNUM>/.exec(xml)?.[1] ?? '0';
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><EFDMS><RCTACK><RCTNUM>${rct}</RCTNUM><DATE>${new Date().toISOString().slice(0, 10)}</DATE><TIME>${new Date().toISOString().slice(11, 19)}</TIME><ACKCODE>${ok ? 0 : 3}</ACKCODE><ACKMSG>${ok ? 'Success' : 'Invalid receipt'}</ACKMSG></RCTACK><EFDMSSIGNATURE>mock</EFDMSSIGNATURE></EFDMS>`);
  });

  // RRA EBM (RW) + ZRA Smart Invoice (ZM): VSDC saveSales.
  for (const [prefix, sdc] of [['ebm', 'SDC010000001'], ['zra', 'ZRAVSDC0000001']] as const) {
    r.post(`/${prefix}/trnsSales/saveSales`, (req, res) => {
      remember(req);
      const b = req.body;
      if (!b?.invcNo || !Array.isArray(b.itemList) || !b.itemList.length) return res.json({ resultCd: '894', resultMsg: 'Invalid request', data: null });
      const rcptNo = ++seq;
      const rcptSign = Buffer.from(`${b.tin}${b.invcNo}${rcptNo}`).toString('base64').replace(/[^A-Z0-9]/gi, '').slice(0, 16).toUpperCase();
      res.json({ resultCd: '000', resultMsg: 'It is succeeded', resultDt: stamp(), data: { rcptNo, rcptSign, totRcptNo: rcptNo, intrlData: 'MOCK', sdcId: sdc, sdcDateTime: stamp(),
        qrUrl: `https://${prefix}.example/receipt?d=${b.tin}${b.bhfId}${rcptSign}` } });
    });
  }

  // GRA E-VAT (GH)
  r.post('/gra/api/v1/taxpayer/invoice', (req, res) => {
    remember(req);
    if (!req.header('security_key') && !req.header('security-key')) return res.status(401).json({ response: { status: 'FAILED', message: 'security_key missing' } });
    const b = req.body;
    if (!b?.invoiceNumber || !Array.isArray(b.items) || b.calculationType !== 'INCLUSIVE') return res.json({ response: { status: 'FAILED', message: 'Invalid invoice' } });
    const num = ++seq;
    res.json({ response: { status: 'SUCCESS', mesaage: { ysdcid: 'GRAVSDC0001', ysdcrecnum: `${num}/NS`, ysdcintdata: 'MOCKINT', ysdcregsig: 'MOCKSIG', ysdcmrc: 'MRC001',
      ysdcmrctim: new Date().toISOString(), ysdctime: stamp(), ysdcitems: String(b.items.length), qr_code: `https://evat.gra.gov.gh/verify?id=${num}`, num: b.invoiceNumber } } });
  });

  // FIRS e-Invoicing (NG)
  const firsAuth = (req: Request, res: Response) => { if (!req.header('x-api-key')) { res.status(401).json({ code: 401, message: 'missing x-api-key' }); return false; } return true; };
  r.post('/firs/api/v1/invoice/validate', (req, res) => {
    if (!firsAuth(req, res)) return;
    remember(req);
    const b = req.body;
    if (!b?.irn || !b?.invoice_line?.length) return res.status(422).json({ code: 422, message: 'irn and invoice_line required' });
    res.json({ code: 200, data: { ok: true } });
  });
  r.post('/firs/api/v1/invoice/sign', (req, res) => {
    if (!firsAuth(req, res)) return;
    remember(req);
    res.json({ code: 201, data: { irn: req.body?.irn, qr_code: Buffer.from(`FIRS|${req.body?.irn}|${stamp()}`).toString('base64') } });
  });

  // NHIF Tanzania
  r.post('/nhif-tz/claimsserver/Token', (req, res) => res.json({ access_token: issue(), token_type: 'bearer', expires_in: 3600 }));
  r.get('/nhif-tz/verification/AuthorizeCard', (req, res) => {
    if (!authed(req, res)) return;
    const card = String(req.query.CardNo ?? '');
    if (!card || card.endsWith('0')) return res.json({ CardNo: card, CardStatus: 'Inactive', Remarks: 'Card not active' });
    res.json({ CardNo: card, CardStatus: 'Active', FirstName: 'Asha', LastName: 'Mussa', Gender: 'Female', DateOfBirth: '1988-02-11', AuthorizationNo: `AUTH${++seq}`, Remarks: 'Authorized' });
  });
  r.post('/nhif-tz/claimsserver/api/v1/PreApproval/RequestApproval', (req, res) => {
    if (!authed(req, res)) return;
    const amt = Number(req.body?.Amount ?? 0);
    res.json({ Status: amt > 1_000_000 ? 'Rejected' : 'Approved', ApprovalRefNo: `PA${++seq}`, ApprovedAmount: amt > 1_000_000 ? 0 : amt, Remarks: 'mock' });
  });
  const nhifClaims = new Map<string, any>();
  r.post('/nhif-tz/claimsserver/api/v1/Claims/SubmitFolios', (req, res) => {
    if (!authed(req, res)) return;
    remember(req);
    const e = req.body?.entities?.[0];
    if (!e?.FolioItems?.length || !e?.CardNo) return res.json({ StatusCode: 400, Message: 'CardNo and FolioItems required' });
    const id = `SUB${++seq}`;
    nhifClaims.set(id, { ClaimStatus: 'Submitted', amount: e.FolioItems.reduce((t: number, i: any) => t + Number(i.AmountClaimed ?? 0), 0), at: Date.now() });
    res.json({ StatusCode: 200, Status: 'Success', SubmissionID: id, Message: 'Folio received' });
  });
  r.get('/nhif-tz/claimsserver/api/v1/Claims/GetSubmittedClaims', (req, res) => {
    if (!authed(req, res)) return;
    const c = nhifClaims.get(String(req.query.SubmissionID));
    if (!c) return res.status(404).json({ Message: 'not found' });
    if (Date.now() - c.at > 10_000) c.ClaimStatus = 'Approved';
    res.json({ ClaimStatus: c.ClaimStatus, AmountApproved: c.ClaimStatus === 'Approved' ? c.amount : null, Remarks: '' });
  });

  // NHIA Ghana
  const nhiaAuth = (req: Request, res: Response) => { if (!req.header('x-api-key')) { res.status(401).json({ message: 'x-api-key required' }); return false; } return true; };
  r.post('/nhia/api/v1/members/verify', (req, res) => {
    if (!nhiaAuth(req, res)) return;
    const m = String(req.body?.memberNo ?? '');
    res.json(m && !m.endsWith('0') ? { found: true, memberNo: m, surname: 'Mensah', otherNames: 'Ama', gender: 'F', dateOfBirth: '1992-04-01' } : { found: false });
  });
  r.post('/nhia/api/v1/ccc', (req, res) => {
    if (!nhiaAuth(req, res)) return;
    const m = String(req.body?.memberNo ?? '');
    res.json(m && !m.endsWith('0') ? { status: 'ACTIVE', memberNo: m, ccc: String(10000 + (++seq % 90000)), message: 'CCC generated' } : { status: 'INACTIVE', memberNo: m, message: 'Membership expired' });
  });
  const nhiaClaims = new Map<string, any>();
  r.post('/nhia/api/v1/claims', (req, res) => {
    if (!nhiaAuth(req, res)) return;
    remember(req);
    const c = req.body?.claim;
    if (!c?.memberNo || !c?.diagnosis?.length) return res.json({ status: 'REJECTED', message: 'memberNo and diagnosis required' });
    const ref = `NHIA-${++seq}`;
    nhiaClaims.set(ref, { status: 'RECEIVED', total: c.totalClaimed, at: Date.now() });
    res.json({ status: 'RECEIVED', claimRef: ref, message: 'Claim received for vetting' });
  });
  r.get('/nhia/api/v1/claims/:ref', (req, res) => {
    if (!nhiaAuth(req, res)) return;
    const c = nhiaClaims.get(req.params.ref);
    if (!c) return res.status(404).json({ message: 'not found' });
    if (Date.now() - c.at > 10_000) c.status = 'VETTED';
    res.json({ status: c.status, approvedAmount: c.status === 'VETTED' ? c.total : null });
  });

  // MTN MoMo Collection
  const momo = new Map<string, any>();
  r.post('/momo/collection/token/', (req, res) => {
    if (!/^Basic /.test(req.header('authorization') ?? '') || !req.header('ocp-apim-subscription-key')) return res.status(401).json({ error: 'unauthorized' });
    res.json({ access_token: issue(), token_type: 'access_token', expires_in: 3600 });
  });
  r.post('/momo/collection/v1_0/requesttopay', (req, res) => {
    if (!authed(req, res)) return;
    remember(req);
    const ref = req.header('x-reference-id');
    if (!ref || !req.body?.payer?.partyId || !req.body?.amount) return res.status(400).json({ code: 'INVALID_REQUEST' });
    momo.set(ref, { ...req.body, status: String(req.body.payer.partyId).endsWith('0') ? 'FAILED' : 'SUCCESSFUL', financialTransactionId: String(++seq) });
    res.status(202).send('');
  });
  r.get('/momo/collection/v1_0/requesttopay/:ref', (req, res) => {
    if (!authed(req, res)) return;
    const m = momo.get(req.params.ref);
    if (!m) return res.status(404).json({ code: 'RESOURCE_NOT_FOUND' });
    res.json(m);
  });

  // Airtel Money
  r.post('/airtel/auth/oauth2/token', (req, res) => {
    if (req.body?.grant_type !== 'client_credentials') return res.status(400).json({ error: 'invalid_request' });
    res.json({ access_token: issue(), token_type: 'bearer', expires_in: 180 });
  });
  r.post('/airtel/merchant/v1/payments/', (req, res) => {
    if (!authed(req, res)) return;
    remember(req);
    const b = req.body;
    if (!b?.subscriber?.msisdn || !b?.transaction?.id || !req.header('x-country')) return res.json({ status: { code: '400', success: false, message: 'Invalid request' } });
    res.json({ data: { transaction: { id: b.transaction.id, status: 'Success.' } }, status: { code: '200', message: 'Success.', result_code: 'ESB000010', success: true } });
  });

  return r;
}
