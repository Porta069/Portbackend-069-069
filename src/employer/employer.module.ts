import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { MatchingModule } from '../matching/matching.module';
import { PartnerModule } from '../partner/partner.module';
import { EmployerController } from './employer.controller';
import { EmployerService } from './employer.service';

@Module({
  imports: [AuthModule, AuditModule, MatchingModule, PartnerModule],
  controllers: [EmployerController],
  providers: [EmployerService],
})
export class EmployerModule {}
