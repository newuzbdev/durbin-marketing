import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { SchoolGuard } from '../schools/school.guard.js';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, SchoolGuard, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  exports: [SchoolGuard],
})
export class AuthModule {}
