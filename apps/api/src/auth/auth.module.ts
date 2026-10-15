import { BadRequestException, Body, Controller, Get, Injectable, Module, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { MailService } from '../common/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser, Public } from '../common/auth-user';

class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

class SignupDto {
  @IsString() organisationName: string;
  @IsOptional() @IsString() kmhflCode?: string;
  @IsOptional() @IsString() countryCode?: string;
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() @MinLength(8) password: string;
  @IsOptional() @IsIn(['CLINIC', 'HOSPITAL', 'ENTERPRISE', 'PER_VISIT']) plan?: string;
}

class ProfileDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
}
class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() @MinLength(8) newPassword: string;
}
class ForgotDto { @IsEmail() email: string; }
class ResetDto {
  @IsString() token: string;
  @IsString() @MinLength(8) password: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || 'dev-secret',
    });
  }
  validate(payload: AuthUser) {
    return payload;
  }
}

const DEFAULT_MODULES = [
  'patients', 'opd', 'triage', 'lab', 'radiology', 'pharmacy', 'ipd', 'maternity', 'theatre', 'dialysis',
  'billing', 'claims', 'inventory', 'procurement', 'finance', 'hr', 'assets', 'reports', 'telemedicine', 'homecare',
];

/** Public demo logins share one password, so they cannot change it. */
export const isDemoEmail = (e: string) => e.toLowerCase().endsWith('@demo.jmsurf.health');
const superAdminEmails = () => (process.env.SUPER_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private audit: AuditService, private mail: MailService) {}

  private sign(u: { id: string; tenantId: string | null; email: string; roles: string[]; facilityIds: string[]; isSuperAdmin: boolean }) {
    const payload: AuthUser = {
      sub: u.id, tenantId: u.tenantId ?? '', email: u.email, roles: u.roles, facilityIds: u.facilityIds, isSuperAdmin: u.isSuperAdmin,
    };
    return this.jwt.sign(payload);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !user.active || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.tenantId && !user.isSuperAdmin) {
      const t = await this.prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { suspendedAt: true } });
      if (t?.suspendedAt) throw new UnauthorizedException('This facility account is suspended. Contact JMSURF support.');
    }
    const flag = !user.isSuperAdmin && superAdminEmails().includes(user.email);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), ...(flag ? { isSuperAdmin: true } : {}) } });
    if (flag) user.isSuperAdmin = true;
    await this.audit.log({ tenantId: user.tenantId ?? undefined, userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id });
    return { accessToken: this.sign(user), user: this.publicUser(user) };
  }

  /** Self-service onboarding: creates tenant, main facility, core departments, stores, default price list and admin user. */
  async signup(dto: SignupDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new BadRequestException('Email already registered');
    const slugBase = dto.organisationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.organisationName, slug, countryCode: dto.countryCode ?? 'KE',
          trialEndsAt: new Date(Date.now() + 30 * 86400000), enabledModules: DEFAULT_MODULES,
          plan: dto.plan === 'CLINIC' || dto.plan === 'ENTERPRISE' ? dto.plan : 'HOSPITAL',
          settings: dto.plan === 'PER_VISIT' ? { billingModel: 'PER_VISIT' } : {},
        },
      });
      const facility = await tx.facility.create({
        data: { tenantId: tenant.id, name: dto.organisationName, code: 'MAIN', kmhflCode: dto.kmhflCode },
      });
      const deptTypes = ['OPD', 'EMERGENCY', 'IPD', 'LAB', 'RADIOLOGY', 'PHARMACY', 'THEATRE', 'MATERNITY', 'DIALYSIS', 'ADMIN'];
      await tx.department.createMany({
        data: deptTypes.map((t) => ({ tenantId: tenant.id, facilityId: facility.id, name: t, type: t })),
      });
      await tx.store.createMany({
        data: [
          { tenantId: tenant.id, facilityId: facility.id, name: 'Main Store', type: 'MAIN' },
          { tenantId: tenant.id, facilityId: facility.id, name: 'Pharmacy', type: 'PHARMACY' },
        ],
      });
      await tx.priceList.create({ data: { tenantId: tenant.id, name: 'Cash', payerType: 'CASH', isDefault: true } });
      return tx.user.create({
        data: {
          tenantId: tenant.id, email, phone: dto.phone, passwordHash, firstName: dto.firstName, lastName: dto.lastName,
          roles: ['ADMIN'], facilityIds: [facility.id], isSuperAdmin: superAdminEmails().includes(email),
        },
      });
    });
    await this.audit.log({ tenantId: user.tenantId ?? undefined, userId: user.id, action: 'SIGNUP', entity: 'Tenant', entityId: user.tenantId ?? undefined });
    void this.mail.send(user.email, 'Welcome to JMSURF HMIS', this.mail.layout(`Welcome, ${user.firstName}`,
      `<p>Your facility <b>${dto.organisationName}</b> is ready. Sign in to add departments, price lists, payers and your team.</p>`,
      { label: 'Open JMSURF HMIS', url: `${this.webUrl()}/dashboard` }));
    return { accessToken: this.sign(user), user: this.publicUser(user) };
  }

  private webUrl() { return (process.env.WEB_URL || process.env.WEB_ORIGIN?.split(',')[0] || 'http://localhost:3000').replace(/\/$/, ''); }

  async updateProfile(u: AuthUser, dto: ProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: u.sub },
      data: { firstName: dto.firstName?.trim() || undefined, lastName: dto.lastName?.trim() || undefined, phone: dto.phone?.trim() || undefined },
    });
    await this.audit.log({ tenantId: u.tenantId || undefined, userId: u.sub, action: 'UPDATE_PROFILE', entity: 'User', entityId: u.sub });
    return this.publicUser(user);
  }

  async changePassword(u: AuthUser, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.sub } });
    if (isDemoEmail(user.email)) throw new BadRequestException('Demo accounts cannot change their password');
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) throw new BadRequestException('Your current password is not correct');
    await this.prisma.user.update({ where: { id: u.sub }, data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) } });
    await this.audit.log({ tenantId: u.tenantId || undefined, userId: u.sub, action: 'CHANGE_PASSWORD', entity: 'User', entityId: u.sub });
    return { ok: true };
  }

  /** Reset tokens are short-lived JWTs bound to the current password hash, so each link works once. */
  private resetKey(hash: string) { return createHash('sha256').update(hash).digest('hex').slice(0, 16); }

  async forgot(dto: ForgotDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (user?.active && !isDemoEmail(user.email)) {
      const token = this.jwt.sign({ sub: user.id, purpose: 'reset', k: this.resetKey(user.passwordHash) }, { expiresIn: '1h' });
      const url = `${this.webUrl()}/reset-password?token=${encodeURIComponent(token)}`;
      await this.mail.send(user.email, 'Reset your JMSURF HMIS password', this.mail.layout('Reset your password',
        '<p>Someone asked to reset the password for this account. The link works once and expires in one hour. If it was not you, you can ignore this email.</p>',
        { label: 'Choose a new password', url }));
      await this.audit.log({ tenantId: user.tenantId ?? undefined, userId: user.id, action: 'PASSWORD_RESET_REQUESTED', entity: 'User', entityId: user.id });
    }
    // Same answer whether or not the address exists.
    return { ok: true };
  }

  async reset(dto: ResetDto) {
    let p: any;
    try { p = this.jwt.verify(dto.token); } catch { throw new BadRequestException('This reset link has expired. Ask for a new one.'); }
    if (p?.purpose !== 'reset') throw new BadRequestException('This reset link is not valid.');
    const user = await this.prisma.user.findUnique({ where: { id: p.sub } });
    if (!user || !user.active || this.resetKey(user.passwordHash) !== p.k) throw new BadRequestException('This reset link has already been used. Ask for a new one.');
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(dto.password, 10) } });
    await this.audit.log({ tenantId: user.tenantId ?? undefined, userId: user.id, action: 'PASSWORD_RESET', entity: 'User', entityId: user.id });
    return { ok: true };
  }

  async me(u: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.sub }, include: { tenant: { include: { facilities: true } } } });
    return { ...this.publicUser(user), tenant: user.tenant };
  }

  private publicUser(u: any) {
    const { passwordHash, mfaSecret, ...rest } = u;
    return rest;
  }
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public() @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public() @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.auth.me(u);
  }

  @Patch('me')
  updateMe(@CurrentUser() u: AuthUser, @Body() dto: ProfileDto) {
    return this.auth.updateProfile(u, dto);
  }

  @Post('change-password')
  changePassword(@CurrentUser() u: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(u, dto);
  }

  @Public() @Post('forgot-password')
  forgot(@Body() dto: ForgotDto) {
    return this.auth.forgot(dto);
  }

  @Public() @Post('reset-password')
  reset(@Body() dto: ResetDto) {
    return this.auth.reset(dto);
  }
}

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '12h' },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
