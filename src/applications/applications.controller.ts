import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ListApplicationsDto } from './dto/list-applications.dto';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { ClientIp } from '../common/http/client-ip.decorator';

type MulterFile = { buffer: Buffer; originalname: string; size: number };

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(
    // Total across fields is additionally bounded by MAX_UPLOAD_FILES (multer
    // `files` limit) configured in ApplicationsModule.
    FileFieldsInterceptor([
      { name: 'cv', maxCount: 1 },
      { name: 'photo', maxCount: 1 },
      { name: 'qualifications', maxCount: 6 },
    ]),
  )
  create(
    @Body() dto: CreateApplicationDto,
    @UploadedFiles()
    files: {
      cv?: MulterFile[];
      photo?: MulterFile[];
      qualifications?: MulterFile[];
    },
    @ClientIp() ip: string,
  ) {
    return this.applications.create(dto, files ?? {}, ip);
  }

  // ── Admin ──────────────────────────────────────────────────────────────────

  // Admin routes require the `x-admin-api-key` header (server-to-server only).
  @Get()
  @UseGuards(AdminApiKeyGuard)
  list(@Query() query: ListApplicationsDto, @ClientIp() ip: string) {
    return this.applications.list(query.page, query.pageSize, query.email, ip);
  }

  @Get(':id')
  @UseGuards(AdminApiKeyGuard)
  getById(@Param('id', new ParseUUIDPipe()) id: string, @ClientIp() ip: string) {
    return this.applications.getById(id, ip);
  }

  @Delete(':id')
  @UseGuards(AdminApiKeyGuard)
  erase(@Param('id', new ParseUUIDPipe()) id: string, @ClientIp() ip: string) {
    return this.applications.erase(id, ip);
  }
}
