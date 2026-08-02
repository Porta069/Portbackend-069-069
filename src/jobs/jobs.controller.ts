import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt';
import { JobsService } from './jobs.service';
import {
  ListJobsQueryDto,
  RespondOfferDto,
  RespondContactRequestDto,
  SaveWorkLocationsDto,
  TravelQueryDto,
} from './dto/jobs.dto';

/**
 * Worker-facing endpoints: the Jobbörse (`/jobs`) and everything personal
 * (`/me/...`). The match-question catalog is public read-only — it powers the
 * transparency view that explains how scores are computed.
 */
@Controller()
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  /** Public question catalog (labels, scales, default weights). */
  @Get('match-questions')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  questions() {
    return this.jobs.listQuestions();
  }

  // ── Jobbörse ──────────────────────────────────────────────────────────────

  @Get('jobs')
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: JwtPayload, @Query() query: ListJobsQueryDto) {
    return this.jobs.listJobs(user, query);
  }

  @Get('jobs/:id')
  @UseGuards(JwtAuthGuard)
  get(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.jobs.getJob(user, id);
  }

  /** Exakte Fahrzeit (OSRM) ab einem gewählten Ausgangspunkt. */
  @Get('jobs/:id/travel')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  travel(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query() query: TravelQueryDto,
  ) {
    return this.jobs.travelTime(user, id, query.lat, query.lng);
  }

  @Post('jobs/:id/apply')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  apply(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.jobs.apply(user, id);
  }

  // ── Merkliste ─────────────────────────────────────────────────────────────

  @Get('me/favorites')
  @UseGuards(JwtAuthGuard)
  favorites(@CurrentUser() user: JwtPayload) {
    return this.jobs.listFavorites(user);
  }

  @Post('jobs/:id/favorite')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  addFavorite(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.jobs.addFavorite(user, id);
  }

  @Delete('jobs/:id/favorite')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  removeFavorite(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.jobs.removeFavorite(user, id);
  }

  // ── Me ────────────────────────────────────────────────────────────────────

  @Get('me/applications')
  @UseGuards(JwtAuthGuard)
  applications(@CurrentUser() user: JwtPayload) {
    return this.jobs.listApplications(user);
  }

  @Get('me/offers')
  @UseGuards(JwtAuthGuard)
  offers(@CurrentUser() user: JwtPayload) {
    return this.jobs.listOffers(user);
  }

  @Post('me/offers/:id/respond')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  respondOffer(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RespondOfferDto,
  ) {
    return this.jobs.respondOffer(user, id, dto);
  }

  @Get('me/contact-requests')
  @UseGuards(JwtAuthGuard)
  contactRequests(@CurrentUser() user: JwtPayload) {
    return this.jobs.listContactRequests(user);
  }

  @Post('me/contact-requests/:id/respond')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  respondContactRequest(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RespondContactRequestDto,
  ) {
    return this.jobs.respondContactRequest(user, id, dto);
  }

  @Get('me/work-locations')
  @UseGuards(JwtAuthGuard)
  workLocations(@CurrentUser() user: JwtPayload) {
    return this.jobs.getWorkLocations(user);
  }

  @Put('me/work-locations')
  @UseGuards(JwtAuthGuard)
  saveWorkLocations(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SaveWorkLocationsDto,
  ) {
    return this.jobs.saveWorkLocations(user, dto);
  }

  @Get('me/profile-score')
  @UseGuards(JwtAuthGuard)
  profileScore(@CurrentUser() user: JwtPayload) {
    return this.jobs.profileScore(user);
  }

  @Get('me/matching-profile')
  @UseGuards(JwtAuthGuard)
  matchingProfile(@CurrentUser() user: JwtPayload) {
    return this.jobs.myMatchingProfile(user);
  }
}
