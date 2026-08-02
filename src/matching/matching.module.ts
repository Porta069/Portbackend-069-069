import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { RoutingService } from './routing.service';

@Module({
  providers: [MatchingService, RoutingService],
  exports: [MatchingService, RoutingService],
})
export class MatchingModule {}
