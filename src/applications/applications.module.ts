import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { StorageModule } from '../storage/storage.module';
import { SecurityConfig } from '../config/configuration';

@Module({
  imports: [
    StorageModule,
    // Files are held in memory (bounded by the size + count limits below) so
    // their real content type can be validated before anything is persisted.
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const security = config.get<SecurityConfig>('security')!;
        return {
          storage: memoryStorage(),
          limits: {
            fileSize: security.maxUploadBytes,
            files: security.maxUploadFiles,
            fields: 20,
          },
        };
      },
    }),
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
