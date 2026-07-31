import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { KeepAliveService } from './keep-alive.service';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [KeepAliveService],
})
export class HealthModule {}
