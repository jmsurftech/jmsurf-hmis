import { Global, Injectable, Logger, Module } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * Outgoing email through an SMTP relay (SMTP_HOST / SMTP_PORT, optional SMTP_USER / SMTP_PASS, MAIL_FROM).
 * With no SMTP_HOST the message is only logged, so local and test stacks never send mail.
 */
@Injectable()
export class MailService {
  private log = new Logger('Mail');
  private transport = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        tls: { rejectUnauthorized: process.env.SMTP_TLS_STRICT === 'true' },
      })
    : null;

  get enabled() { return !!this.transport; }

  async send(to: string, subject: string, html: string, text?: string) {
    if (!this.transport) { this.log.log(`(mail disabled) to=${to} subject="${subject}"`); return false; }
    try {
      await this.transport.sendMail({ from: process.env.MAIL_FROM || 'JMSURF HMIS <no-reply@jmsurf.co.ke>', to, subject, html, text: text ?? html.replace(/<[^>]+>/g, ' ') });
      return true;
    } catch (e) { this.log.error(`send failed to=${to}: ${(e as Error).message}`); return false; }
  }

  /** Simple branded layout used by every system email. */
  layout(title: string, body: string, button?: { label: string; url: string }) {
    return `<div style="background:#f7f2f4;padding:32px 12px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#261e22">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:20px;padding:32px;border:1px solid #efe6ea">
<div style="font-weight:800;font-size:18px;color:#bd2332;margin-bottom:18px">JMSURF HMIS</div>
<h1 style="font-size:20px;margin:0 0 12px">${title}</h1><div style="font-size:14.5px;line-height:1.6;color:#42363d">${body}</div>
${button ? `<p style="margin:26px 0 8px"><a href="${button.url}" style="background:#bd2332;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px;display:inline-block">${button.label}</a></p>` : ''}
</div><p style="text-align:center;font-size:11.5px;color:#6f6168;margin-top:16px">Powered by JMSURF TECHNOLOGIES</p></div>`;
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
