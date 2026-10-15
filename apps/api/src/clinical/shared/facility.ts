import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/auth-user';

/** Resolve the working facility: explicit (validated against tenant) → user's first facility → tenant's first facility. */
export async function resolveFacilityId(prisma: PrismaService, user: AuthUser, facilityId?: string): Promise<string> {
  const id = facilityId ?? user.facilityIds?.[0];
  if (id) {
    const f = await prisma.facility.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!f) throw new NotFoundException('Facility not found');
    return f.id;
  }
  const f = await prisma.facility.findFirst({ where: { tenantId: user.tenantId }, orderBy: { createdAt: 'asc' } });
  if (!f) throw new BadRequestException('No facility configured for this tenant');
  return f.id;
}

export async function mustFind<T>(p: Promise<T | null>, what: string): Promise<T> {
  const r = await p;
  if (!r) throw new NotFoundException(`${what} not found`);
  return r;
}
