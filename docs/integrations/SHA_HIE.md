# SHA via the Kenya national HIE — adapter contract (ASSUMED)

> The official SHA/HIE interface specification is issued only to DHA-certified HMIS vendors. Everything below is
> our **assumed** contract, implemented by `apps/api/src/integrations/ke/sha-hie/sha-hie.adapter.ts` and the sandbox in
> `apps/mock-servers` (`/sha/*`). Every path is an env var, and response parsing is tolerant, so the adapter can be
> corrected to the real spec without touching business logic. Track open questions in [ASSUMPTIONS.md](./ASSUMPTIONS.md).

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `SHA_BASE_URL` | `http://mock-servers:4100/sha` | HIE gateway base URL |
| `SHA_CLIENT_ID` / `SHA_CLIENT_SECRET` | – | Facility credentials (OAuth2 client credentials) |
| `SHA_SCOPE` | empty | Optional OAuth scope |
| `SHA_FACILITY_ID` | empty | Sent as `X-Facility-Id`, and as default `facilityCode` |
| `SHA_TOKEN_PATH` | `/oauth2/token` | Token endpoint |
| `SHA_CR_PATH` | `/v1/client-registry/search` | Client Registry search |
| `SHA_ELIGIBILITY_PATH` | `/v1/eligibility` | Eligibility |
| `SHA_PREAUTH_PATH` | `/v1/preauthorizations` | Pre-authorisation |
| `SHA_CLAIM_PATH` | `/v1/claims` | Claim submission (FHIR Bundle) |
| `SHA_CLAIM_STATUS_PATH` | `/v1/claims/{ref}` | Claim status (`{ref}` replaced) |
| `FHIR_SYSTEM_*` | see `.env.example` | Identifier / code-system URIs |

## Cross-cutting behaviour
- **Auth:** `POST {token}` form-encoded `grant_type=client_credentials&client_id&client_secret[&scope]` → `{access_token, expires_in}`. Cached in memory, refreshed 60 s before expiry. Calls send `Authorization: Bearer`.
- **Logging:** every call is written to `IntegrationMessage` (adapter `sha`, operation, request with secrets redacted, response, attempts, status `SUCCESS|SENT|FAILED|DEAD`).
- **Retries:** network errors, 429 and 5xx retried with exponential backoff + jitter (`INTEGRATION_MAX_RETRIES`, `INTEGRATION_RETRY_BASE_MS`). 4xx are not retried.
- **Idempotency:** pre-auth and claim submissions send an `Idempotency-Key` header. A previously successful message with the same key is returned from the log without re-sending.

## Operations

### Client Registry lookup
`GET {SHA_CR_PATH}?idType=NATIONAL_ID&idNumber=12345678`
```json
{ "found": true, "client": { "crId": "CR0000000001", "shaNumber": "SHA123", "firstName": "…", "middleName": "…", "lastName": "…", "gender": "female", "dateOfBirth": "1990-01-01", "phone": "+2547…" } }
```
`{ "found": false }` when not registered. API: `POST /api/payers/sha/client-registry` (also stores `crId` on the patient).

### Eligibility
`POST {SHA_ELIGIBILITY_PATH}` `{ crId?, idNumber?, facilityCode, visitType }` →
`{ eligible, fund: "PHC"|"SHIF"|"ECCIF", memberNumber, reference, message }`. API: `POST /api/payers/sha/eligibility` (stores `EligibilityCheck`; for an eligible visit it sets the visit to payer SHA with the fund's scheme and `eligibilityRef`).

### Pre-authorisation
`POST {SHA_PREAUTH_PATH}` `{ crId, facilityCode, interventionCode, amount (major units), diagnosis: [ICD-11], notes }` →
`{ preauthRef, status: SUBMITTED|APPROVED|REJECTED, approvedAmount?, message }`. API: `POST /api/preauths/:id/submit`.

### Claim submission
`POST {SHA_CLAIM_PATH}` with a FHIR R4 `Bundle` (`type: collection`) holding:
- `Claim`: `use=claim`, `type=institutional`, `subType` = fund, `identifier` = our claim number, `diagnosis[]` coded in ICD-11 MMS (`http://id.who.int/icd/release/11/mms`), `item[].productOrService` coded with the SHA intervention code (`FHIR_SYSTEM_SHA_INTERVENTION`), `unitPrice`/`net`/`total` in major units, `insurance[0].preAuthRef[]`, `careTeam` → Practitioner.
- `Patient` with CR ID, national ID, SHA number and MRN identifiers.
- `Encounter` (class AMB/IMP/EMER/SS) → patient, organisation, practitioner.
- `Organization` with the KMHFR code (and SHA facility ID).
- `Practitioner` with HWR registration and licence number.

Mappers: `apps/api/src/integrations/fhir/mappers.ts` (unit tested).
Response (FHIR `ClaimResponse`-like or JSON): `{ id|claimRef, outcome: queued|complete|error, disposition }`. `error` → claim REJECTED with the disposition as the reason.

### Claim status
`GET {SHA_CLAIM_STATUS_PATH}` → `{ status, approvedAmount?, paidAmount?, reason? }`. Statuses mapped: `SUBMITTED/QUEUED`→SUBMITTED, `RECEIVED/PENDING/IN_REVIEW`→IN_REVIEW, `QUERIED`, `APPROVED`, `PARTIALLY_APPROVED`, `REJECTED/DECLINED`, `PAID`. Polled every 30 min by `ClaimsService.pollStatuses` (`CLAIMS_POLL_ENABLED`), or on demand: `POST /api/claims/:id/refresh-status`.

## Mock behaviour (apps/mock-servers)
- CR: deterministic fake person per ID; IDs starting with `999` are not found.
- Eligibility: IDs ending in `0` are not eligible.
- Pre-auth: amount > 500,000 → REJECTED; > 100,000 → SUBMITTED; otherwise APPROVED.
- Claims: missing diagnosis or CR ID is rejected at submission. Otherwise the outcome is decided by a hash of the claim number (10% rejected, 10% queried, 10% partially approved at 80%, 70% approved) once `MOCK_CLAIM_DECISION_MS` (default 10 s) has passed.
