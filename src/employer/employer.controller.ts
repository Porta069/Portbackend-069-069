import {
  Body,
  Controller,
  Delete,
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt';
import { ClientIp } from '../common/http/client-ip.decorator';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { EmployerService } from './employer.service';
import {
  AdminCreateCompanyDto,
  ApplicationStatusDto,
  CandidateQueryDto,
  RequestContactDto,
  SaveJobDto,
  SendOfferDto,
  UpdateEmployerProfileDto,
} from './dto/employer.dto';

/**
 * Employer-facing endpoints. All routes require an EMPLOYER account except the
 * `admin/*` block, which is server-to-server (x-admin-api-key) and exists so
 * our staff — and later the AI intake — can list companies WITHOUT the company
 * ever creating an account itself.
 */
@Controller('employer')
export class EmployerController {
  constructor(private readonly employer: EmployerService) {}

  // ── Profile ─────────────────────────────────────────────────────────────

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  profile(@CurrentUser() user: JwtPayload) {
    return this.employer.getProfile(user);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateEmployerProfileDto,
  ) {
    return this.employer.updateProfile(user, dto);
  }

  // ── Job postings ────────────────────────────────────────────────────────

  @Get('jobs')
  @UseGuards(JwtAuthGuard)
  listJobs(@CurrentUser() user: JwtPayload) {
    return this.employer.listJobs(user);
  }

  @Post('jobs')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createJob(@CurrentUser() user: JwtPayload, @Body() dto: SaveJobDto) {
    return this.employer.createJob(user, dto);
  }

  @Patch('jobs/:id')
  @UseGuards(JwtAuthGuard)
  updateJob(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SaveJobDto,
  ) {
    return this.employer.updateJob(user, id, dto);
  }

  @Delete('jobs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async archiveJob(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.employer.archiveJob(user, id);
  }

  // ── Candidate search + contact ──────────────────────────────────────────

  @Get('candidates')
  @UseGuards(JwtAuthGuard)
  candidates(@CurrentUser() user: JwtPayload, @Query() query: CandidateQueryDto) {
    return this.employer.searchCandidates(user, query);
  }

  @Post('candidates/:id/request')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  requestContact(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RequestContactDto,
  ) {
    return this.employer.requestContact(user, id, dto);
  }

  @Post('candidates/:id/offer')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  sendOffer(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SendOfferDto,
  ) {
    return this.employer.sendOffer(user, id, dto);
  }

  @Get('requests')
  @UseGuards(JwtAuthGuard)
  requests(@CurrentUser() user: JwtPayload) {
    return this.employer.listRequests(user);
  }

  // ── Bewerbungen auf eigene Inserate ─────────────────────────────────────

  @Get('applications')
  @UseGuards(JwtAuthGuard)
  applications(@CurrentUser() user: JwtPayload) {
    return this.employer.listApplications(user);
  }

  @Post('applications/:id/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  setApplicationStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ApplicationStatusDto,
  ) {
    return this.employer.setApplicationStatus(user, id, dto.status);
  }

  // ── Admin (server-to-server, x-admin-api-key) ───────────────────────────

  @Get('admin/companies')
  @UseGuards(AdminApiKeyGuard)
  adminList() {
    return this.employer.adminListCompanies();
  }

  @Post('admin/companies')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AdminApiKeyGuard)
  adminCreate(@Body() dto: AdminCreateCompanyDto, @ClientIp() ip: string) {
    return this.employer.adminCreateCompany(dto, ip);
  }
}
