import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationHttpService } from '../integrations/http-client';
import { env } from '../integrations/config';
import { currentTenantId } from '../integrations/integration-context';

export interface WhatsAppPort {
  /** Free-form text (only allowed inside the 24h customer-service window). */
  sendText(to: string, body: string): Promise<{ ok: boolean; id?: string }>;
  /** Pre-approved template message (required to start a conversation). */
  sendTemplate(to: string, template: string, lang: string, params: string[]): Promise<{ ok: boolean; id?: string }>;
}
export const WHATSAPP = Symbol('WHATSAPP');

/** Meta WhatsApp Cloud API adapter (skeleton). Needs WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID; templates must be approved in Meta Business Manager. */
@Injectable()
export class MetaCloudWhatsAppAdapter implements WhatsAppPort {
  constructor(private http: IntegrationHttpService, private prisma: PrismaService) {}
  private url() { return `${env('WHATSAPP_BASE_URL', 'https://graph.facebook.com/v20.0')}/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`; }
  private async post(to: string, payload: Record<string, unknown>, body: string) {
    try {
      const r: any = await this.http.request({
        adapter: 'whatsapp', operation: 'messages', method: 'POST', url: this.url(),
        headers: { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}` }, body: { messaging_product: 'whatsapp', to: to.replace(/^\+/, ''), ...payload }, retries: 1,
      });
      await this.record(to, body, 'SENT');
      return { ok: true, id: r?.messages?.[0]?.id };
    } catch {
      await this.record(to, body, 'FAILED');
      return { ok: false };
    }
  }
  sendText(to: string, body: string) { return this.post(to, { type: 'text', text: { body } }, body); }
  sendTemplate(to: string, template: string, lang: string, params: string[]) {
    return this.post(to, { type: 'template', template: { name: template, language: { code: lang }, components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] } }, `[template ${template}] ${params.join(' | ')}`);
  }
  private record(to: string, body: string, status: string) {
    return this.prisma.notification.create({ data: { tenantId: currentTenantId() ?? 'SYSTEM', channel: 'WHATSAPP', to, body, status } });
  }
}

@Injectable()
export class MockWhatsAppAdapter implements WhatsAppPort {
  private log = new Logger('MockWhatsApp');
  constructor(private prisma: PrismaService) {}
  async sendText(to: string, body: string) {
    this.log.log(`→ ${to}: ${body}`);
    await this.prisma.notification.create({ data: { tenantId: currentTenantId() ?? 'SYSTEM', channel: 'WHATSAPP', to, body, status: 'SENT' } });
    return { ok: true, id: `mock-wa-${Date.now()}` };
  }
  sendTemplate(to: string, template: string, _lang: string, params: string[]) { return this.sendText(to, `[template ${template}] ${params.join(' | ')}`); }
}
