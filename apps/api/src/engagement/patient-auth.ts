import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/** Patient portal identity. Patients authenticate separately from staff: tokens are signed with a different secret,
 *  so the staff JwtStrategy rejects them, and staff tokens (no typ=patient) are rejected here. */
export interface PatientPrincipal { typ: 'patient'; sub: string; tenantId: string; phone: string; roles: ['PATIENT'] }

export const patientJwtSecret = () => process.env.PATIENT_JWT_SECRET || `${process.env.JWT_SECRET || 'dev-secret'}::patient-portal`;

@Injectable()
export class PatientAuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const h: string = req.headers?.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) throw new UnauthorizedException('Patient login required');
    let payload: any;
    try { payload = this.jwt.verify(token, { secret: patientJwtSecret() }); } catch { throw new UnauthorizedException('Invalid or expired session'); }
    if (payload?.typ !== 'patient' || !payload.tenantId || !payload.sub) throw new UnauthorizedException('Not a patient session');
    req.patient = payload as PatientPrincipal;
    return true;
  }
}

export const CurrentPatient = createParamDecorator((_: unknown, ctx: ExecutionContext): PatientPrincipal => ctx.switchToHttp().getRequest().patient);
