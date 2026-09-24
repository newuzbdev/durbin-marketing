import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from '@durbin/shared';
import { ZodPipe } from '../common/zod.pipe.js';
import { AuthService } from './auth.service.js';
import { CurrentUser, Public, type AuthUser } from './decorators.js';

const refreshSchema = z.object({ refreshToken: z.string().min(1) });
type RefreshBody = z.infer<typeof refreshSchema>;

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body(new ZodPipe(registerSchema)) body: RegisterInput) {
    return this.auth.register(body);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodPipe(loginSchema)) body: LoginInput) {
    return this.auth.login(body);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodPipe(refreshSchema)) body: RefreshBody) {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodPipe(refreshSchema)) body: RefreshBody) {
    await this.auth.logout(body.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
