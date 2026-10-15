import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { env, joinUrl } from '../config';
import { IntegrationHttpService } from '../http-client';
import { currentTenantId } from '../integration-context';
import { SmsPort } from '../ports';

/** Africa's Talking bulk SMS (POST /version1/messaging, form-encoded, apiKey header). */
@Injectable()
export class AfricasTalkingSmsAdapter implements SmsPort {
  constructor(private http: IntegrationHttpService, private prisma: PrismaService) {}
  async send(to: string, message: string) {
    const body = new URLSearchParams({ username: env('AFRICASTALKING_USERNAME', 'sandbox'), to, message });
    const from = env('AFRICASTALKING_SENDER_ID');
    if (from) body.set('from', from);
    const base = env('AFRICASTALKING_BASE_URL', env('AFRICASTALKING_USERNAME') === 'sandbox' ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com');
    try {
      const r: any = await this.http.request({
        adapter: 'sms', operation: 'send', url: joinUrl(base, 'version1/messaging'), body,
        headers: { apiKey: env('AFRICASTALKING_API_KEY') }, retries: 2,
      });
      const rec = r?.SMSMessageData?.Recipients?.[0];
      const ok = !!rec && ['Success', 'Sent', 'Queued'].includes(rec.status ?? 'Success');
      await this.record(to, message, ok ? 'SENT' : 'FAILED');
      return { ok, id: rec?.messageId };
    } catch {
      await this.record(to, message, 'FAILED');
      return { ok: false };
    }
  }
  private record(to: string, body: string, status: string) {
    return this.prisma.notification.create({ data: { tenantId: currentTenantId() ?? 'SYSTEM', channel: 'SMS', to, body, status } });
  }
}

/** Development SMS adapter: records the message in Notification and the log; sends nothing. */
@Injectable()
export class MockSmsAdapter implements SmsPort {
  private log = new Logger('MockSMS');
  constructor(private prisma: PrismaService) {}
  async send(to: string, message: string) {
    this.log.log(`SMS to ${to}: ${message}`);
    const n = await this.prisma.notification.create({ data: { tenantId: currentTenantId() ?? 'SYSTEM', channel: 'SMS', to, body: message, status: 'SENT_MOCK' } });
    return { ok: true, id: n.id };
  }
}
