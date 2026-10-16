import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Public, Roles } from '../common/auth-user';
import { MessagingService } from './messaging.service';
import { UssdService } from './ussd.service';
import { TemplateDto } from './engagement.dto';

/** SMS / WhatsApp reminder templates (EN/SW) and the reminder log. The patient portal itself lives in src/portal. */
@Controller('messaging')
export class MessagingController {
  constructor(private svc: MessagingService) {}
  @Get('templates') @Roles('MANAGER', 'RECEPTION') templates(@CurrentUser() u: AuthUser) { return this.svc.templates(u.tenantId); }
  @Put('templates') @Roles('MANAGER') upsert(@CurrentUser() u: AuthUser, @Body() dto: TemplateDto) { return this.svc.upsertTemplate(u.tenantId, dto.code, dto.lang, dto.body); }
  @Delete('templates/:code/:lang') @Roles('MANAGER') reset(@CurrentUser() u: AuthUser, @Param('code') code: string, @Param('lang') lang: string) { return this.svc.resetTemplate(u.tenantId, code, lang); }
  @Get('reminders') @Roles('MANAGER', 'RECEPTION') log(@CurrentUser() u: AuthUser, @Query() q: { page?: number; pageSize?: number; kind?: string; q?: string }) { return this.svc.reminderLog(u.tenantId, q); }
  @Post('reminders/run') @HttpCode(200) @Roles('MANAGER') run(@CurrentUser() u: AuthUser) { return this.svc.runForTenant(u.tenantId); }
}

/** Africa's Talking USSD callback (form-encoded: sessionId, serviceCode, phoneNumber, text). Replies text/plain CON/END. */
@Public()
@Controller('ussd')
export class UssdController {
  constructor(private svc: UssdService) {}
  @Post() @HttpCode(200) @Header('Content-Type', 'text/plain') root(@Body() body: any) { return this.svc.handle(undefined, body ?? {}); }
  @Post(':slug') @HttpCode(200) @Header('Content-Type', 'text/plain') bySlug(@Param('slug') slug: string, @Body() body: any) { return this.svc.handle(slug, body ?? {}); }
}
