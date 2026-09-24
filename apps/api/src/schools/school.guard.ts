import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@durbin/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { ROLES_KEY } from '../auth/decorators.js';

/**
 * Tenant izolyatsiyasi: har bir so'rov `X-School-Id` header'ini yuboradi.
 * Foydalanuvchi shu maktab a'zosi ekanini tekshiradi va `req.school` ni o'rnatadi.
 * Servislar har doim `school.id` bo'yicha filter qiladi.
 */
@Injectable()
export class SchoolGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const schoolId = req.headers['x-school-id'];
    if (typeof schoolId !== 'string' || !schoolId) throw new BadRequestException('X-School-Id header kerak');

    const membership = await this.prisma.membership.findUnique({
      where: { userId_schoolId: { userId: req.user.id, schoolId } },
    });
    if (!membership) throw new ForbiddenException();

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles && !roles.includes(membership.role)) throw new ForbiddenException('Ruxsat yetarli emas');

    req.school = { id: schoolId, role: membership.role };
    return true;
  }
}
