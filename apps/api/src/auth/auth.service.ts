import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { LoginInput, RegisterInput } from '@durbin/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { randomToken, sha256 } from '../common/crypto.js';

const REFRESH_TTL_DAYS = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterInput) {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw new ConflictException("Bu email allaqachon ro'yxatdan o'tgan");

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await bcrypt.hash(input.password, 10),
        memberships: { create: { role: 'OWNER', school: { create: { name: input.schoolName } } } },
      },
    });
    return this.issueTokens(user.id, user.email);
  }

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user?.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException("Email yoki parol noto'g'ri");
    }
    return this.issueTokens(user.id, user.email);
  }

  /** Refresh token rotatsiyasi: eskisi bekor qilinadi, yangisi beriladi */
  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) throw new UnauthorizedException();

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    return this.issueTokens(stored.user.id, stored.user.email);
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { memberships: { include: { school: { select: { id: true, name: true } } } } },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      schools: user.memberships.map((m) => ({ id: m.school.id, name: m.school.name, role: m.role })),
    };
  }

  private async issueTokens(userId: string, email: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' },
    );
    const refreshToken = randomToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000),
      },
    });
    return { accessToken, refreshToken };
  }
}
