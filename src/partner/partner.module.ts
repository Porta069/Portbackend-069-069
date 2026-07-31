import { Module } from '@nestjs/common';
import { PartnerController } from './partner.controller';
import { PartnerService } from './partner.service';

@Module({
  controllers: [PartnerController],
  providers: [PartnerService],
  // Exported so the applicant registration flow can link referrals.
  exports: [PartnerService],
})
export class PartnerModule {}
