import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { RoutingService } from './routing.service';
import { GeocodingService } from './geocoding.service';

@Module({
  providers: [MatchingService, RoutingService, GeocodingService],
  exports: [MatchingService, RoutingService, GeocodingService],
})
export class MatchingModule {}
