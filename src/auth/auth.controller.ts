import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
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
import { CheckEmailDto } from './dto/check-email.dto';
import {
  UpdateProfileDto,
  ChangePasswordDto,
  ChangeEmailDto,
  DeleteAccountDto,
  VerifyContactDto,
} from './dto/account.dto';

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

  /** Live email-deliverability check for the signup form (syntax + MX). */
  @Post('email/check')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  checkEmail(@Body() dto: CheckEmailDto) {
    return this.auth.checkEmail(dto.email);
  }

  // ── Login / session ─────────────────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(
    @Body() dto: LoginDto,
    @ClientIp() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.auth.login(dto.email, dto.password, ip, userAgent);
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

  // ── Account self-service ────────────────────────────────────────────────────

  /** Edit name, phone and onboarding answers. */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
    @ClientIp() ip: string,
  ) {
    return this.auth.updateProfile(user, dto, ip);
  }

  /** Confirm the logged-in user's email/phone with an OTP code → sets the flag. */
  @Post('me/verify-contact')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyContact(
    @CurrentUser() user: JwtPayload,
    @Body() dto: VerifyContactDto,
    @ClientIp() ip: string,
  ) {
    return this.auth.verifyContact(user, dto.channel, dto.code, ip);
  }

  /** GDPR data export. */
  @Get('me/export')
  @UseGuards(JwtAuthGuard)
  exportData(@CurrentUser() user: JwtPayload) {
    return this.auth.exportData(user);
  }

  /** Recent login activity for the security screen. */
  @Get('me/activity')
  @UseGuards(JwtAuthGuard)
  activity(@CurrentUser() user: JwtPayload) {
    return this.auth.loginActivity(user);
  }

  /** Change password (requires current one); returns a fresh session. */
  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
    @ClientIp() ip: string,
  ) {
    return this.auth.changePassword(user, dto.currentPassword, dto.newPassword, ip);
  }

  /** Change email (requires password). */
  @Post('email/change')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  changeEmail(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangeEmailDto,
    @ClientIp() ip: string,
  ) {
    return this.auth.changeEmail(user, dto.password, dto.newEmail, ip);
  }

  /** Permanently delete the account (requires password). */
  @Post('account/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  deleteAccount(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DeleteAccountDto,
    @ClientIp() ip: string,
  ) {
    return this.auth.deleteAccount(user, dto.password, ip);
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
