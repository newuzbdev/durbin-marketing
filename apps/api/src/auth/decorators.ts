import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@durbin/shared';

export interface AuthUser {
  id: string;
  email: string;
}

export interface SchoolContext {
  id: string;
  role: Role;
}

export const IS_PUBLIC = 'isPublic';
/** JWT talab qilinmaydigan endpoint (login, webhook va h.k.) */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
/** Faqat ko'rsatilgan rollarga ruxsat. SchoolGuard bilan birga ishlaydi. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

export const CurrentSchool = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SchoolContext => ctx.switchToHttp().getRequest().school,
);
