import { BadRequestException, Body, Controller, Get, Injectable, Module, Post, UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
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

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private audit: AuditService) {}

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
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
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
          roles: ['ADMIN'], facilityIds: [facility.id],
        },
      });
    });
    return { accessToken: this.sign(user), user: this.publicUser(user) };
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
