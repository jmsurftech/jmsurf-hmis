# Integration assumptions and open questions

Confirm each item against the official specification before go-live. Each can be changed by configuration (env var) unless marked **code**.

## SHA / HIE (Kenya)
| # | Assumption | Where to change |
|---|---|---|
| 1 | OAuth2 client credentials, form-encoded, at `/oauth2/token`, returning `access_token` and `expires_in` | `SHA_TOKEN_PATH`, `SHA_SCOPE` |
| 2 | Client Registry search is `GET ?idType=&idNumber=`, returning `{found, client{crId,…}}` | `SHA_CR_PATH`; parser accepts `client`, `data` or a flat body |
| 3 | Eligibility is a JSON POST, returning `eligible`, `fund`, `reference` | `SHA_ELIGIBILITY_PATH` |
| 4 | Pre-auth amounts are sent in major units (KES), not cents | **code** (`sha-hie.adapter.ts`) |
| 5 | Claims go as a FHIR R4 Bundle of type `collection` (the HIE might require `message` with a MessageHeader) | **code** (`fhir/mappers.ts#buildClaimBundle`) |
| 6 | Identifier system URIs for CR ID, KMHFR, HWR, SHA intervention codes are placeholders | `FHIR_SYSTEM_*` |
| 7 | ICD-11 MMS URI `http://id.who.int/icd/release/11/mms` | **code** (`fhir/systems.ts`) |
| 8 | Claim status is `GET /v1/claims/{ref}` (no webhooks yet). Polled every 30 min | `SHA_CLAIM_STATUS_PATH`, `CLAIMS_POLL_*` |
| 9 | OTP/biometric verification step on eligibility not modelled | **code** (future: `verifyClient`) |
| 10 | Attachments (discharge summary, lab results) not yet included in the Bundle | **code** |
| 11 | The SHA package table in `revenue/payers/data/sha-packages.SAMPLE.json` is **SAMPLE data**; replace it with the official schedule | data |
| 12 | Facility `level` (Facility.level) drives package eligibility; KMHFR sync is out of scope here | data |

## M-Pesa Daraja
- Standard Daraja paths under `MPESA_BASE_URL` (`/oauth/v1/generate`, `/mpesa/stkpush/v1/processrequest`). Password = base64(shortcode + passkey + timestamp), timestamp in EAT.
- Amounts are rounded **up** to whole shillings (Daraja rejects decimals).
- Callbacks are not signed by Safaricom. Set `MPESA_CALLBACK_TOKEN` and append `?token=` to the callback URLs registered with Daraja.
- C2B routing to a tenant uses `Tenant.settings.mpesaShortcode`. `BillRefNumber` must equal the bill number; unmatched payments are stored with `providerData.unallocated=true`.

## KRA eTIMS (OSCU)
- Uses the OSCU `trnsSales/saveSales` shape (`tin`, `bhfId`, `cmcKey` headers; `itemList` with `taxTyCd` A/B/C/D/E). Medical services are exempt (A) unless the item's `vatRate` is set.
- The receipt number is returned as `sdcId/rcptNo`. QR = `ETIMS_QR_BASE + tin + bhfId + rcptSign` unless the response carries a URL.
- Device initialisation (`selectInitOsdcInfo`), item registration, stock movement and the credit-note flow are TODO.

## Other fiscal regimes
Skeleton adapters (`integrations/fiscal/fiscal-skeletons.ts`) for URA EFRIS (UG), TRA VFD (TZ), RRA EBM (RW), GRA E-VAT (GH), ZRA Smart Invoice (ZM) and FIRS (NG) throw `NotImplemented`, with doc links. The adapter is chosen from `country-packs.ts` using `tenant.countryCode`. If signing fails at bill finalisation, finalisation is not blocked; retry with `POST /api/billing/bills/:id/fiscal-sign`.

## SMS
`SMS_PROVIDER=mock` writes to `Notification` (status `SENT_MOCK`). `africastalking` posts to `/version1/messaging`. Ports carry no tenant, so the tenant comes from the async integration context (`withTenant`), falling back to `SYSTEM`.

## Pan-African adapters (fiscal, national insurance, mobile money)

All adapters build their payloads with pure, unit-tested functions (`apps/api/src/integrations/fiscal/*.ts`,
`apps/api/src/integrations/africa/*.ts`), read endpoints and credentials from env, and default to the mock servers
(`apps/mock-servers/src/africa.ts`). Selection is by `tenant.countryCode` (via `CountryResolver`: explicit
`withTenant(..., countryCode)` or the tenant row). Payloads were written against publicly available descriptions of each
spec; confirm field names against the authority's current certified documentation before go-live.

| Country | Fiscal | Assumptions |
|---|---|---|
| UG | URA EFRIS T109 | Envelope `{data:{content(base64), signature, dataDescription}, globalInfo, returnStateInfo}`; tax categories 01 standard / 02 zero / 03 exempt. **Signature is an HMAC placeholder**: production must fetch the AES key (T104) and RSA-sign the content with the taxpayer private key; content is sent unencrypted (`encryptCode` handling to be completed). Default UoM `101`, commodity `85121800` (`EFRIS_DEFAULT_*`). |
| TZ | TRA VFD | Token via `/vfdtoken` (password grant), XML `<EFDMS><RCT>…</RCT><EFDMSSIGNATURE>` posted with `Routing-Key: vfdrct`. Tax codes 1=A 18%, 2=B, 5=E exempt. **Signature is an HMAC placeholder** (production: SHA1withRSA with the TRA-issued .pfx). GC/DC/RCTNUM counters are in-memory per process; persist them before production. Verify URL `https://verify.tra.go.tz/{RCTVNUM}_{HHmmss}`. |
| RW | RRA EBM v2 (VSDC) | eTIMS-family `trnsSales/saveSales`; tax types A exempt, B 18%. |
| ZM | ZRA Smart Invoice (VSDC) | Same VSDC model; tax types A 16% standard, D exempt. |
| GH | GRA E-VAT | INCLUSIVE invoice with levies A=NHIL, B=GETFund, C=COVID. Defaults follow the 2026 reform (COVID levy 0, VAT not compounded on levies); set `GRA_COVID_RATE_BP=100 GRA_VAT_ON_LEVIES=true` for the older regime. Response key `mesaage` (sic) is accepted as in GRA samples. |
| NG | FIRS e-Invoicing (MBS) | UBL-aligned JSON, IRN `{invoiceNo}-{serviceId}-{YYYYMMDD}`, validate then sign, `x-api-key`/`x-api-secret`. Exempt medical lines use category `EXEMPTED`. |

National insurance (`NATIONAL_INSURANCE` router): KE → SHA/HIE, **TZ → NHIF** (`/claimsserver/Token`, card verification
`/verification/AuthorizeCard`, `Claims/SubmitFolios` folio builder from the FHIR claim bundle; ICD-10 codes expected),
**GH → NHIA** (Claim-IT style JSON with G-DRG codes; CCC replaces pre-authorisation; items whose code is ≥6 letters followed by
a digit are treated as medicines). Other countries fall back to the SHA adapter (sandbox) until built.

Mobile money (`MOBILE_MONEY` router): KE → M-Pesa; UG/RW/GH/ZM → **MTN MoMo Collection** (`/collection/token/`,
`requesttopay` with `X-Reference-Id`, `X-Target-Environment`); TZ → **Airtel Money** (`/merchant/v1/payments/`, MSISDN without
country code). Override per country with `MOBILE_MONEY_PROVIDER_<CC>=mpesa|mtn|airtel`. Amounts are sent as whole major
units (ceil of minor/100). MoMo/Airtel payment callbacks are not yet reconciled into `Payment` (M-Pesa callback flow only);
poll status or add a callback handler before go-live.

## AI assistance
- Model `AI_MODEL` (default `claude-opus-5-5`) via `@anthropic-ai/sdk`, structured JSON outputs, effort `AI_EFFORT` (default low).
  Server-side refusal fallback (`fallbacks: "default"`) is enabled for models that support it; `AI_REFUSAL_FALLBACK=off` disables.
- Without `ANTHROPIC_API_KEY` deterministic rule-based fallbacks run (marked `source: OFFLINE`). Tenants must opt in (`settings.aiEnabled`).
- Text is de-identified (`ai/deidentify.ts`) before leaving the platform; sensitive notes are excluded from discharge drafts unless `includeSensitive=true`.
- Every call is logged in `AiCallLog` with token usage. All outputs are drafts requiring human sign-off.

## Embedded finance partner API
- Partners are registered by a platform super-admin (`POST /api/financing/partners`, key shown once, stored hashed).
- Data access needs a tenant consent with scopes `receivables:read`, `financing:read`, `financing:decide`.
- Receivables = APPROVED / PARTIALLY_APPROVED / PAID claims with `approvedMinor - paidMinor > 0`, aged from `decidedAt`.
- Max advance = 80% of SHA receivables ≤ 90 days old. Status flow REQUESTED → UNDER_REVIEW → OFFERED → ACCEPTED → DISBURSED → REPAID (DECLINED/CANCELLED terminal).
