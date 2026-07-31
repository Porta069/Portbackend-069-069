import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PartnerService } from './partner.service';
import { PartnerAuthGuard } from './partner-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt';
import { ClientIp } from '../common/http/client-ip.decorator';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { RegisterPartnerDto } from './dto/register-partner.dto';
import { LoginPartnerDto } from './dto/login-partner.dto';
import { UpdatePayoutDto } from './dto/payout.dto';
import { AdminReferralStatusDto } from './dto/admin-referral-status.dto';
import {
  PartnerChangePasswordDto,
  PartnerDeleteAccountDto,
  UpdatePartnerProfileDto,
} from './dto/partner-account.dto';

@Controller('partner')
export class PartnerController {
  constructor(private readonly partner: PartnerService) {}

  // ── Public ──────────────────────────────────────────────────────────────────

  /** Live availability check for a desired referral slug. */
  @Get('slug/check')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  checkSlug(@Query('slug') slug: string) {
    return this.partner.slugAvailable(slug ?? '');
  }

  /** Create a partner account (requires an SMS verification token). */
  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  register(@Body() dto: RegisterPartnerDto, @ClientIp() ip: string) {
    return this.partner.register(dto, ip);
  }

  /** Sign in with phone/slug + password. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginPartnerDto, @ClientIp() ip: string) {
    return this.partner.login(dto, ip);
  }

  /** Record a click on a referral link (best-effort). */
  @Post('click')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  click(@Body('slug') slug: string, @ClientIp() ip: string) {
    return this.partner.recordClick(slug ?? '', ip);
  }

  // ── Authenticated (partner) ─────────────────────────────────────────────────

  @Get('me')
  @UseGuards(PartnerAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.partner.getProfile(user);
  }

  @Get('dashboard')
  @UseGuards(PartnerAuthGuard)
  dashboard(@CurrentUser() user: JwtPayload) {
    return this.partner.dashboard(user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PartnerAuthGuard)
  async logout(@CurrentUser() user: JwtPayload) {
    await this.partner.logout(user);
  }

  @Patch('payout')
  @UseGuards(PartnerAuthGuard)
  payout(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePayoutDto) {
    return this.partner.updatePayout(user, dto);
  }

  /** Edit profile (name, email, phone — slug is immutable). */
  @Patch('me')
  @UseGuards(PartnerAuthGuard)
  updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePartnerProfileDto,
    @ClientIp() ip: string,
  ) {
    return this.partner.updateProfile(user, dto, ip);
  }

  /** Change password (requires the current one); returns a fresh session. */
  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PartnerAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: PartnerChangePasswordDto,
    @ClientIp() ip: string,
  ) {
    return this.partner.changePassword(
      user,
      dto.currentPassword,
      dto.newPassword,
      ip,
    );
  }

  /** Permanently delete the partner account (password-confirmed). */
  @Post('account/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PartnerAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async deleteAccount(
    @CurrentUser() user: JwtPayload,
    @Body() dto: PartnerDeleteAccountDto,
    @ClientIp() ip: string,
  ) {
    await this.partner.deleteAccount(user, dto.password, ip);
  }

  /** GDPR data export. */
  @Get('me/export')
  @UseGuards(PartnerAuthGuard)
  exportData(@CurrentUser() user: JwtPayload) {
    return this.partner.exportData(user);
  }

  // ── Admin (server-to-server, x-admin-api-key) ───────────────────────────────

  @Get('admin/referrals')
  @UseGuards(AdminApiKeyGuard)
  listReferrals() {
    return this.partner.listReferrals();
  }

  @Post('admin/referrals/:id/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminApiKeyGuard)
  setStatus(
    @Param('id') id: string,
    @Body() dto: AdminReferralStatusDto,
    @ClientIp() ip: string,
  ) {
    return this.partner.setReferralStatus(id, dto.status, ip);
  }
}
