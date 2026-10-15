import {
  BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, Post, Req, UnauthorizedException,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { IsEmail, IsOptional, IsString, Length, MinLength } from 'class-validator';
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
}
class RefreshDto { @IsString() refreshToken: string }
class LogoutDto { @IsOptional() @IsString() refreshToken?: string }
class MfaChallengeDto { @IsString() mfaToken: string; @IsString() @Length(6, 6) code: string }
class MfaTokenDto { @IsString() mfaToken: string }
class MfaCodeDto { @IsString() @Length(6, 6) code: string }
class MfaDisableDto { @IsString() @Length(6, 6) code: string; @IsString() password: string }
class ChangePasswordDto { @IsString() currentPassword: string; @IsString() newPassword: string }

const JWT_SECRET = () => process.env.JWT_SECRET || 'dev-secret';
export const ACCESS_TTL = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 30);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: JWT_SECRET() });
  }
  validate(payload: AuthUser) {
    if (payload.typ && payload.typ !== 'access') throw new UnauthorizedException('Wrong token type');
    return payload;
  }
}

export const DEFAULT_MODULES = [
  'patients', 'opd', 'triage', 'lab', 'radiology', 'pharmacy', 'ipd', 'maternity', 'theatre', 'dialysis',
  'billing', 'claims', 'inventory', 'procurement', 'finance', 'hr', 'assets', 'reports', 'telemedicine', 'homecare', 'quality',
];

type UserRow = { id: string; tenantId: string | null; email: string; roles: string[]; facilityIds: string[]; isSuperAdmin: boolean };

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private audit: AuditService) {}

  signAccess(u: UserRow, extra: Partial<AuthUser> = {}, expiresIn: string = ACCESS_TTL) {
    const payload: AuthUser = {
      sub: u.id, tenantId: u.tenantId ?? '', email: u.email, roles: u.roles, facilityIds: u.facilityIds, isSuperAdmin: u.isSuperAdmin, typ: 'access', ...extra,
    };
    return this.jwt.sign(payload, { expiresIn });
  }

  /** Issues a short-lived access token and a rotating opaque refresh token (stored as SHA-256). */
  async issueTokens(u: UserRow, meta: { ip?: string; userAgent?: string } = {}, familyId: string = randomUUID()) {
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: u.id, tenantId: u.tenantId, tokenHash: sha256(refreshToken), familyId,
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400000), ip: meta.ip, userAgent: meta.userAgent?.slice(0, 250),
      },
    });
    return { accessToken: this.signAccess(u), refreshToken, expiresIn: ACCESS_TTL };
  }

  private async mfaRequiredFor(user: { roles: string[]; tenantId: string | null; mfaEnabled: boolean; isSuperAdmin: boolean }) {
    if (user.mfaEnabled) return true;
    if (!user.tenantId || !user.roles.includes('ADMIN')) return false;
    const t = await this.prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { settings: true } });
    return !!(t?.settings as any)?.mfaRequired;
  }

  async login(dto: LoginDto, meta: { ip?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (user && isLocked(user.lockedUntil)) {
      throw new UnauthorizedException(`Account locked after repeated failed sign-ins. Try again in ${LOCKOUT_MINUTES} minutes or ask an administrator.`);
    }
    if (!user || !user.active || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      if (user) {
        const next = onFailedLogin(user.failedLoginCount);
        await this.prisma.user.update({ where: { id: user.id }, data: next });
        await this.audit.log({ tenantId: user.tenantId ?? undefined, userId: user.id, action: next.lockedUntil ? 'LOGIN_LOCKED' : 'LOGIN_FAILED', entity: 'User', entityId: user.id, ip: meta.ip });
      }
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.failedLoginCount || user.lockedUntil) await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });

    if (await this.mfaRequiredFor(user)) {
      const mfaToken = this.jwt.sign({ sub: user.id, typ: 'mfa' }, { expiresIn: '5m' });
      return { mfaRequired: true, mfaEnrollRequired: !user.mfaEnabled, mfaToken };
    }
    return this.completeLogin(user, meta);
  }

  private async completeLogin(user: any, meta: { ip?: string; userAgent?: string }) {
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

  /** Login step 2. For users who must enrol first, call mfaSetupForLogin, then this with the first code. */
  async mfaChallenge(dto: MfaChallengeDto, meta: { ip?: string; userAgent?: string }) {
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
    if (user.mfaEnabled) throw new BadRequestException('MFA is already enabled; disable it first to re-enrol');
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
    if (await this.mfaRequiredFor({ ...user, mfaEnabled: false })) throw new ForbiddenException('Your organisation requires MFA for administrators');
    await this.prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null } });
    await this.audit.log({ tenantId: u.tenantId || undefined, userId: u.sub, action: 'MFA_DISABLED', entity: 'User', entityId: u.sub });
    return { mfaEnabled: false };
  }

  /** Rotating refresh: each token is single-use; presenting a revoked token revokes its whole family (theft detection). */
  async refresh(token: string, meta: { ip?: string; userAgent?: string }) {
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
    const tokens = await this.issueTokens(user, meta, row.familyId);
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date(), replacedBy: sha256(tokens.refreshToken) } });
    return tokens;
  }

  async logout(token: string | undefined, u?: AuthUser) {
    if (token) {
      const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
      if (row) await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    if (u) await this.audit.log({ tenantId: u.tenantId || undefined, userId: u.sub, action: 'LOGOUT', entity: 'User', entityId: u.sub });
    return { ok: true };
  }

  async changePassword(u: AuthUser, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.sub } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) throw new BadRequestException('Current password is incorrect');
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException('New password must differ from the current one');
    const problems = passwordProblems(dto.newPassword, user.email);
    if (problems.length) throw new BadRequestException(`Password must have ${problems.join(', ')}`);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(dto.newPassword, 10), passwordChangedAt: new Date() } });
    await this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ tenantId: u.tenantId || undefined, userId: u.sub, action: 'PASSWORD_CHANGED', entity: 'User', entityId: u.sub });
    return { ok: true };
  }

  /** Self-service onboarding: creates tenant, main facility, core departments, stores, default price list and admin user. */
  async signup(dto: SignupDto, meta: { ip?: string; userAgent?: string }) {
    const email = dto.email.toLowerCase();
    const problems = passwordProblems(dto.password, email);
    if (problems.length) throw new BadRequestException(`Password must have ${problems.join(', ')}`);
    if (await this.prisma.user.findUnique({ where: { email } })) throw new BadRequestException('Email already registered');
    const slugBase = dto.organisationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.organisationName, slug, countryCode: dto.countryCode ?? 'KE',
          trialEndsAt: new Date(Date.now() + 30 * 86400000), enabledModules: DEFAULT_MODULES,
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
          roles: ['ADMIN'], facilityIds: [facility.id], passwordChangedAt: new Date(),
        },
      });
    });
    return { ...(await this.issueTokens(user, meta)), user: this.publicUser(user) };
  }

  async me(u: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.sub }, include: { tenant: { include: { facilities: true } } } });
    return { ...this.publicUser(user), tenant: user.tenant, impersonatedBy: u.impersonatedBy ?? null };
  }

  publicUser(u: any) {
    const { passwordHash, mfaSecret, failedLoginCount, lockedUntil, ...rest } = u;
    return rest;
  }
}

const meta = (req: any) => ({ ip: req.ip, userAgent: req.headers?.['user-agent'] });

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public() @Post('login') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60000 } })
  login(@Body() dto: LoginDto, @Req() req: any) { return this.auth.login(dto, meta(req)); }

  @Public() @Post('mfa/challenge') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60000 } })
  mfaChallenge(@Body() dto: MfaChallengeDto, @Req() req: any) { return this.auth.mfaChallenge(dto, meta(req)); }

  @Public() @Post('mfa/setup') @HttpCode(200)
  mfaSetup(@Body() dto: MfaTokenDto) { return this.auth.mfaSetupForLogin(dto.mfaToken); }

  @Public() @Post('signup') @Throttle({ default: { limit: 5, ttl: 60000 } })
  signup(@Body() dto: SignupDto, @Req() req: any) { return this.auth.signup(dto, meta(req)); }

  @Public() @Post('refresh') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60000 } })
  refresh(@Body() dto: RefreshDto, @Req() req: any) { return this.auth.refresh(dto.refreshToken, meta(req)); }

  @Public() @Post('logout') @HttpCode(200)
  logout(@Body() dto: LogoutDto, @Req() req: any) { return this.auth.logout(dto.refreshToken, req.user); }

  @Get('me') me(@CurrentUser() u: AuthUser) { return this.auth.me(u); }

  @Post('change-password') @HttpCode(200)
  changePassword(@CurrentUser() u: AuthUser, @Body() dto: ChangePasswordDto) { return this.auth.changePassword(u, dto); }

  @Post('mfa/enroll') @HttpCode(200) mfaEnrol(@CurrentUser() u: AuthUser) { return this.auth.mfaEnrol(u); }
  @Post('mfa/verify') @HttpCode(200) mfaVerify(@CurrentUser() u: AuthUser, @Body() dto: MfaCodeDto) { return this.auth.mfaVerify(u, dto.code); }
  @Post('mfa/disable') @HttpCode(200) mfaDisable(@CurrentUser() u: AuthUser, @Body() dto: MfaDisableDto) { return this.auth.mfaDisable(u, dto); }
}

@Module({
  imports: [PassportModule, JwtModule.register({ secret: JWT_SECRET(), signOptions: { expiresIn: ACCESS_TTL } })],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
