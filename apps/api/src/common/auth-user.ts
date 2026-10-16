import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export interface AuthUser {
  sub: string;
  tenantId: string;
  email: string;
  roles: string[];
  facilityIds: string[];
  isSuperAdmin: boolean;
  /** Token purpose; only 'access' (or legacy untyped) tokens authenticate API calls. */
  typ?: string;
}

/** Injects the authenticated user (JWT payload). tenantId is always taken from here, never from the request body. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const ROLES_KEY = 'roles';
/** Restrict an endpoint to given roles. ADMIN and super-admins always pass. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
