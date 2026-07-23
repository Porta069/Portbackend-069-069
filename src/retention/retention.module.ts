import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service';
import { ApplicationsModule } from '../applications/applications.module';

@Module({
  imports: [ApplicationsModule],
  providers: [RetentionService],
})
export class RetentionModule {}
