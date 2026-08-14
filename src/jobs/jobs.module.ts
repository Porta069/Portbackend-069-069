import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MatchingModule } from '../matching/matching.module';
import { PartnerModule } from '../partner/partner.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [AuthModule, MatchingModule, PartnerModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
