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
