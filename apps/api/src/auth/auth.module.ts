import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Throttle } from '@nestjs/throttler';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsIn, IsOptional, IsString, Length, MinLength } from 'class-validator';
import { MailService } from '../common/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser, Public } from '../common/auth-user';
import { decryptField, encryptField } from '../common/field-crypto';
import { generateSecret, otpauthUrl, verifyTotp } from './totp';
import { isLocked, LOCKOUT_MINUTES, onFailedLogin, passwordProblems } from './password-policy';

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
class RefreshDto { @IsString() refreshToken: string }
class LogoutDto { @IsOptional() @IsString() refreshToken?: string }
class MfaChallengeDto { @IsString() mfaToken: string; @IsString() @Length(6, 6) code: string }
class MfaTokenDto { @IsString() mfaToken: string }
class MfaCodeDto { @IsString() @Length(6, 6) code: string }
class MfaDisableDto { @IsString() @Length(6, 6) code: string; @IsString() password: string }

type Meta = { ip?: string; userAgent?: string };
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 30);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const policyCheck = (pw: string, email: string) => {
  const p = passwordProblems(pw, email);
  if (p.length) throw new BadRequestException(`Password must have ${p.join(', ')}`);
};
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
  /** Only staff access tokens authenticate: reset/MFA tokens share the secret but carry a purpose/typ and no roles. */
  validate(payload: AuthUser & { purpose?: string }) {
    if ((payload.typ && payload.typ !== 'access') || payload.purpose || !Array.isArray(payload.roles)) throw new UnauthorizedException('Wrong token type');
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

  /** Access token plus a rotating opaque refresh token (stored as SHA-256). */
  async issueTokens(u: { id: string; tenantId: string | null; email: string; roles: string[]; facilityIds: string[]; isSuperAdmin: boolean }, meta: Meta = {}, familyId: string = randomUUID()) {
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: u.id, tenantId: u.tenantId, tokenHash: sha256(refreshToken), familyId,
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400000), ip: meta.ip, userAgent: meta.userAgent?.slice(0, 250),
      },
    });
    return { accessToken: this.sign(u), refreshToken };
  }

  private async mfaRequiredFor(user: { roles: string[]; tenantId: string | null; mfaEnabled: boolean; email: string }) {
    if (isDemoEmail(user.email)) return false;
    if (user.mfaEnabled) return true;
    if (!user.tenantId || !user.roles.includes('ADMIN')) return false;
    const t = await this.prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { settings: true } });
    return !!(t?.settings as any)?.mfaRequired;
  }

  async login(dto: LoginDto, meta: Meta = {}) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (user && isLocked(user.lockedUntil)) {
      throw new UnauthorizedException(`Account locked after repeated failed sign-ins. Try again in ${LOCKOUT_MINUTES} minutes or ask an administrator.`);
    }
    if (!user || !user.active || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      // Shared public demo logins are never locked (anyone could lock them out).
      if (user && !isDemoEmail(user.email)) {
        const next = onFailedLogin(user.failedLoginCount);
        await this.prisma.user.update({ where: { id: user.id }, data: next });
        await this.audit.log({ tenantId: user.tenantId ?? undefined, userId: user.id, action: next.lockedUntil ? 'LOGIN_LOCKED' : 'LOGIN_FAILED', entity: 'User', entityId: user.id, ip: meta.ip });
      }
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.failedLoginCount || user.lockedUntil) await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    if (user.tenantId && !user.isSuperAdmin) {
      const t = await this.prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { suspendedAt: true } });
      if (t?.suspendedAt) throw new UnauthorizedException('This facility account is suspended. Contact JMSURF support.');
    }
    const flag = !user.isSuperAdmin && superAdminEmails().includes(user.email);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), ...(flag ? { isSuperAdmin: true } : {}) } });
    if (flag) user.isSuperAdmin = true;
    if (await this.mfaRequiredFor(user)) {
      const mfaToken = this.jwt.sign({ sub: user.id, typ: 'mfa' }, { expiresIn: '5m' });
      return { mfaRequired: true, mfaEnrollRequired: !user.mfaEnabled, mfaToken };
    }
    return this.completeLogin(user, meta);
  }

  private async completeLogin(user: any, meta: Meta) {
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ tenantId: user.tenantId ?? undefined, userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id, ip: meta.ip });
    return { ...(await this.issueTokens(user, meta)), user: this.publicUser(user) };
  }

  private async userFromMfaToken(mfaToken: string) {
    let p: any;
    try { p = this.jwt.verify(mfaToken); } catch { throw new UnauthorizedException('MFA session expired; sign in again'); }
    if (p.typ !== 'mfa') throw new UnauthorizedException('Invalid MFA token');
    return this.prisma.user.findUniqueOrThrow({ where: { id: p.sub } });
  }

  /** Login step 2 (TOTP). Users who must enrol first call mfaSetupForLogin, then this with the first code. */
  async mfaChallenge(dto: MfaChallengeDto, meta: Meta) {
    const user = await this.userFromMfaToken(dto.mfaToken);
    if (isLocked(user.lockedUntil)) throw new UnauthorizedException('Account locked after repeated failed attempts');
    const secret = decryptField(user.mfaSecret);
    if (!secret || !verifyTotp(secret, dto.code)) {
      const next = onFailedLogin(user.failedLoginCount);
      await this.prisma.user.update({ where: { id: user.id }, data: next });
      await this.audit.log({ tenantId: user.tenantId ?? undefined, userId: user.id, action: 'MFA_FAILED', entity: 'User', entityId: user.id, ip: meta.ip });
      throw new UnauthorizedException('Invalid verification code');
    }
    if (!user.mfaEnabled) {
      await this.prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
      await this.audit.log({ tenantId: user.tenantId ?? undefined, userId: user.id, action: 'MFA_ENROLLED', entity: 'User', entityId: user.id });
    }
    return this.completeLogin(user, meta);
  }

  async mfaSetupForLogin(mfaToken: string) {
    const user = await this.userFromMfaToken(mfaToken);
    if (user.mfaEnabled) throw new BadRequestException('MFA already enrolled');
    return this.startEnrol(user);
  }

  private async startEnrol(user: { id: string; email: string }) {
    const secret = generateSecret();
    await this.prisma.user.update({ where: { id: user.id }, data: { mfaSecret: encryptField(secret), mfaEnabled: false } });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  }

  async mfaEnrol(u: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.sub } });
    if (isDemoEmail(user.email)) throw new BadRequestException('Demo accounts cannot enable two-factor sign-in');
    if (user.mfaEnabled) throw new BadRequestException('Two-factor sign-in is already on; turn it off first to re-enrol');
    return this.startEnrol(user);
  }

  async mfaVerify(u: AuthUser, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.sub } });
    const secret = decryptField(user.mfaSecret);
    if (!secret || !verifyTotp(secret, code)) throw new BadRequestException('Invalid verification code');
    await this.prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    await this.audit.log({ tenantId: u.tenantId || undefined, userId: u.sub, action: 'MFA_ENROLLED', entity: 'User', entityId: u.sub });
    return { mfaEnabled: true };
  }

  async mfaDisable(u: AuthUser, dto: MfaDisableDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.sub } });
    if (!(await bcrypt.compare(dto.password, user.passwordHash))) throw new BadRequestException('Wrong password');
    const secret = decryptField(user.mfaSecret);
    if (!secret || !verifyTotp(secret, dto.code)) throw new BadRequestException('Invalid verification code');
    if (await this.mfaRequiredFor({ ...user, mfaEnabled: false })) throw new ForbiddenException('Your organisation requires two-factor sign-in for administrators');
    await this.prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null } });
    await this.audit.log({ tenantId: u.tenantId || undefined, userId: u.sub, action: 'MFA_DISABLED', entity: 'User', entityId: u.sub });
    return { mfaEnabled: false };
  }

  /** Rotating refresh: each token is single-use; presenting a revoked token revokes its whole family (theft detection). */
  async refresh(token: string, meta: Meta) {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row) throw new UnauthorizedException('Invalid refresh token');
    if (row.revokedAt) {
      await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log({ tenantId: row.tenantId ?? undefined, userId: row.userId, action: 'REFRESH_REUSE', entity: 'User', entityId: row.userId, ip: meta.ip });
      throw new UnauthorizedException('Refresh token reused; please sign in again');
    }
    if (row.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');
    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    if (!user || !user.active || isLocked(user.lockedUntil)) throw new UnauthorizedException('Account disabled');
    if (user.tenantId && !user.isSuperAdmin) {
      const t = await this.prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { suspendedAt: true } });
      if (t?.suspendedAt) throw new UnauthorizedException('This facility account is suspended. Contact JMSURF support.');
    }
    const tokens = await this.issueTokens(user, meta, row.familyId);
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date(), replacedBy: sha256(tokens.refreshToken) } });
    return tokens;
  }

  async logout(token: string | undefined) {
    if (token) {
      const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
      if (row) {
        await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
        await this.audit.log({ tenantId: row.tenantId ?? undefined, userId: row.userId, action: 'LOGOUT', entity: 'User', entityId: row.userId });
      }
    }
    return { ok: true };
  }

  /** Self-service onboarding: creates tenant, main facility, core departments, stores, default price list and admin user. */
  async signup(dto: SignupDto) {
    const email = dto.email.toLowerCase();
    policyCheck(dto.password, email);
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
          roles: ['ADMIN'], facilityIds: [facility.id], isSuperAdmin: superAdminEmails().includes(email), passwordChangedAt: new Date(),
        },
      });
    });
    await this.audit.log({ tenantId: user.tenantId ?? undefined, userId: user.id, action: 'SIGNUP', entity: 'Tenant', entityId: user.tenantId ?? undefined });
    void this.mail.send(user.email, 'Welcome to JMSURF HMIS', this.mail.layout(`Welcome, ${user.firstName}`,
      `<p>Your facility <b>${dto.organisationName}</b> is ready. Sign in to add departments, price lists, payers and your team.</p>`,
      { label: 'Open JMSURF HMIS', url: `${this.webUrl()}/dashboard` }));
    return { ...(await this.issueTokens(user)), user: this.publicUser(user) };
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
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException('The new password must differ from the current one');
    policyCheck(dto.newPassword, user.email);
    await this.prisma.user.update({ where: { id: u.sub }, data: { passwordHash: await bcrypt.hash(dto.newPassword, 10), passwordChangedAt: new Date() } });
    await this.prisma.refreshToken.updateMany({ where: { userId: u.sub, revokedAt: null }, data: { revokedAt: new Date() } });
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
    policyCheck(dto.password, user.email);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(dto.password, 10), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
    await this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ tenantId: user.tenantId ?? undefined, userId: user.id, action: 'PASSWORD_RESET', entity: 'User', entityId: user.id });
    return { ok: true };
  }

  async me(u: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.sub }, include: { tenant: { include: { facilities: true } } } });
    return { ...this.publicUser(user), tenant: user.tenant };
  }

  private publicUser(u: any) {
    const { passwordHash, mfaSecret, failedLoginCount, lockedUntil, ...rest } = u;
    return rest;
  }
}

const meta = (req: any): Meta => ({ ip: req.ip, userAgent: req.headers?.['user-agent'] });

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public() @Post('login') @Throttle({ default: { limit: 30, ttl: 60000 } })
  login(@Body() dto: LoginDto, @Req() req: any) {
    return this.auth.login(dto, meta(req));
  }

  @Public() @Post('mfa/challenge') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60000 } })
  mfaChallenge(@Body() dto: MfaChallengeDto, @Req() req: any) { return this.auth.mfaChallenge(dto, meta(req)); }

  @Public() @Post('mfa/setup') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60000 } })
  mfaSetup(@Body() dto: MfaTokenDto) { return this.auth.mfaSetupForLogin(dto.mfaToken); }

  @Public() @Post('refresh') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60000 } })
  refresh(@Body() dto: RefreshDto, @Req() req: any) { return this.auth.refresh(dto.refreshToken, meta(req)); }

  @Public() @Post('logout') @HttpCode(200)
  logout(@Body() dto: LogoutDto) { return this.auth.logout(dto.refreshToken); }

  @Post('mfa/enroll') @HttpCode(200) mfaEnrol(@CurrentUser() u: AuthUser) { return this.auth.mfaEnrol(u); }
  @Post('mfa/verify') @HttpCode(200) mfaVerify(@CurrentUser() u: AuthUser, @Body() dto: MfaCodeDto) { return this.auth.mfaVerify(u, dto.code); }
  @Post('mfa/disable') @HttpCode(200) mfaDisable(@CurrentUser() u: AuthUser, @Body() dto: MfaDisableDto) { return this.auth.mfaDisable(u, dto); }

  @Public() @Post('signup') @Throttle({ default: { limit: 5, ttl: 60000 } })
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

  @Public() @Post('forgot-password') @Throttle({ default: { limit: 5, ttl: 60000 } })
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
