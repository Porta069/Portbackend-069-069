import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { JwtPayload } from './jwt';
import { ClientIp } from '../common/http/client-ip.decorator';
import { RegistrationStepDto } from './dto/registration-step.dto';
import { CompleteRegistrationDto } from './dto/complete-registration.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ── Registration wizard ────────────────────────────────────────────────────

  /** Begin registration: creates a draft and returns a token + step overview. */
  @Post('registration/start')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  startRegistration(@ClientIp() ip: string) {
    return this.auth.startRegistration(ip);
  }

  /** Save one of the placeholder steps (1–5). Payload schema is TBD. */
  @Post('registration/step')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  saveStep(@Body() dto: RegistrationStepDto) {
    return this.auth.saveStep(dto.draftToken, dto.step, dto.data);
  }

  /** Final contact step: creates the account and returns an access token. */
  @Post('registration/complete')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  completeRegistration(
    @Body() dto: CompleteRegistrationDto,
    @ClientIp() ip: string,
  ) {
    return this.auth.completeRegistration(dto, ip);
  }

  // ── Login / session ─────────────────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto, @ClientIp() ip: string) {
    return this.auth.login(dto.email, dto.password, ip);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.getProfile(user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: JwtPayload, @ClientIp() ip: string) {
    return this.auth.logout(user, ip);
  }

  // ── Password reset ──────────────────────────────────────────────────────────

  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @ClientIp() ip: string) {
    await this.auth.forgotPassword(dto.email, ip);
    // Generic response — never reveals whether the email is registered.
    return { status: 'ok' };
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto, @ClientIp() ip: string) {
    await this.auth.resetPassword(dto.token, dto.newPassword, ip);
    return { status: 'ok' };
  }
}
