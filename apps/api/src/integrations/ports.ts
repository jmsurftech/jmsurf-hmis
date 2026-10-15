/**
 * Integration ports. Each external system is reached only through these interfaces.
 * Implementations live in integrations/<adapter>/ and are selected by country pack / env.
 */

export interface ClientRegistryResult {
  found: boolean;
  crId?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  sex?: string;
  dateOfBirth?: string;
  phone?: string;
  shaNumber?: string;
}

export interface EligibilityResult {
  eligible: boolean;
  fund?: 'PHC' | 'SHIF' | 'ECCIF' | string;
  memberNumber?: string;
  reference?: string;
  message?: string;
  raw?: unknown;
}

export interface PreAuthResult { status: 'SUBMITTED' | 'APPROVED' | 'REJECTED'; externalRef?: string; approvedMinor?: number; message?: string; raw?: unknown }
export interface ClaimSubmitResult { accepted: boolean; externalRef?: string; status: string; message?: string; raw?: unknown }
export interface ClaimStatusResult { status: string; approvedMinor?: number; paidMinor?: number; reason?: string; raw?: unknown }

export interface NationalInsurancePort {
  lookupClient(idType: string, idNumber: string): Promise<ClientRegistryResult>;
  checkEligibility(args: { crId?: string; idNumber?: string; facilityCode?: string; visitType?: string }): Promise<EligibilityResult>;
  requestPreAuth(args: { crId: string; facilityCode: string; interventionCode: string; amountMinor: number; diagnosis?: string[]; notes?: string }): Promise<PreAuthResult>;
  submitClaim(fhirBundle: unknown): Promise<ClaimSubmitResult>;
  claimStatus(externalRef: string): Promise<ClaimStatusResult>;
}

export interface MobileMoneyPort {
  stkPush(args: { phone: string; amountMinor: number; accountRef: string; description: string }): Promise<{ checkoutRequestId: string; raw?: unknown }>;
}

export interface FiscalInvoicePort {
  /** Sign a sales invoice / receipt with the tax authority (KRA eTIMS, URA EFRIS, TRA VFD ...). */
  signInvoice(args: { invoiceNumber: string; buyerPin?: string; lines: { code?: string; description: string; quantity: number; unitPriceMinor: number; vatRate: number }[]; totalMinor: number }): Promise<{ signed: boolean; receiptNo?: string; qr?: string; raw?: unknown }>;
}

export interface SmsPort {
  send(to: string, message: string): Promise<{ ok: boolean; id?: string }>;
}

export const NATIONAL_INSURANCE = Symbol('NATIONAL_INSURANCE');
export const MOBILE_MONEY = Symbol('MOBILE_MONEY');
export const FISCAL_INVOICE = Symbol('FISCAL_INVOICE');
export const SMS = Symbol('SMS');
