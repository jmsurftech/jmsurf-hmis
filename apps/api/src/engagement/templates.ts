/** Built-in message templates (English + Kiswahili). Tenants override them in MessageTemplate. */
export const TEMPLATE_CODES = ['APPT_24H', 'APPT_2H', 'IMMUNIZATION_DUE', 'RESULTS_READY', 'BILL_BALANCE', 'OTP', 'TELEMED_LINK'] as const;
export type TemplateCode = (typeof TEMPLATE_CODES)[number];

export const DEFAULT_TEMPLATES: Record<TemplateCode, { en: string; sw: string }> = {
  APPT_24H: {
    en: 'Hello {{name}}, reminder: your appointment at {{facility}} is tomorrow {{time}}. Reply or call {{phone}} to reschedule.',
    sw: 'Habari {{name}}, kumbusho: miadi yako katika {{facility}} ni kesho saa {{time}}. Piga {{phone}} kubadilisha.',
  },
  APPT_2H: {
    en: 'Hello {{name}}, your appointment at {{facility}} is at {{time}} today (in about 2 hours). {{link}}',
    sw: 'Habari {{name}}, miadi yako katika {{facility}} ni leo saa {{time}} (baada ya saa 2). {{link}}',
  },
  IMMUNIZATION_DUE: {
    en: 'Hello, {{name}} is due for {{vaccine}} (dose {{dose}}) on {{date}} at {{facility}}. Please bring the child health booklet.',
    sw: 'Habari, {{name}} anatakiwa kupata chanjo ya {{vaccine}} (dozi {{dose}}) tarehe {{date}} katika {{facility}}. Tafadhali leta kadi ya kliniki.',
  },
  RESULTS_READY: {
    en: 'Hello {{name}}, your {{test}} results are ready at {{facility}}. View them in the patient portal.',
    sw: 'Habari {{name}}, majibu yako ya {{test}} yako tayari katika {{facility}}. Yaone kwenye tovuti ya wagonjwa.',
  },
  BILL_BALANCE: {
    en: 'Hello {{name}}, you have a balance of {{amount}} on bill {{bill}} at {{facility}}. Pay via M-Pesa in the patient portal.',
    sw: 'Habari {{name}}, una deni la {{amount}} kwenye bili {{bill}} katika {{facility}}. Lipa kwa M-Pesa kupitia tovuti ya wagonjwa.',
  },
  OTP: {
    en: '{{code}} is your {{facility}} patient portal code. It expires in 5 minutes. Do not share it.',
    sw: '{{code}} ni nambari yako ya kuingia {{facility}}. Itaisha baada ya dakika 5. Usimpe mtu yeyote.',
  },
  TELEMED_LINK: {
    en: 'Hello {{name}}, your video consultation at {{facility}} is at {{time}}. Join: {{link}}',
    sw: 'Habari {{name}}, mashauriano yako ya video katika {{facility}} ni saa {{time}}. Jiunge: {{link}}',
  },
};

export function renderTemplate(body: string, vars: Record<string, string | number | undefined | null>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k]))).replace(/\s+$/g, '').trim();
}
