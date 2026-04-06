import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { diskStorage } from 'multer';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { UPLOADS_DIR } from '../common/upload-security.util';
import { CreateBroadcastMediaDto } from './dto/create-broadcast-media.dto';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { BroadcastsService } from './broadcasts.service';

mkdirSync(UPLOADS_DIR, { recursive: true });

const broadcastImageUploadInterceptor = FilesInterceptor('files', 10, {
  storage: diskStorage({
    destination: (
      _req: Request,
      _file: Express.Multer.File,
      callback: (error: Error | null, destination: string) => void,
    ) => {
      callback(null, UPLOADS_DIR);
    },
    filename: (
      _req: Request,
      file: Express.Multer.File,
      callback: (error: Error | null, filename: string) => void,
    ) => {
      const extension = extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '') || '.jpg';
      callback(null, `${randomUUID()}${extension}`);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
  },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    callback(null, file.mimetype.startsWith('image/'));
  },
});

@Controller('broadcasts')
@UseGuards(AuthenticatedGuard)
export class BroadcastsController {
  constructor(private readonly broadcastsService: BroadcastsService) {}

  @Get()
  async list() {
    return this.broadcastsService.listBroadcasts();
  }

  @Get(':id/deliveries')
  async deliveries(@Param('id', ParseIntPipe) id: number) {
    return this.broadcastsService.listDeliveries(id);
  }

  @Post()
  async create(@Body() dto: CreateBroadcastDto) {
    return this.broadcastsService.createBroadcast(dto);
  }

  @Post('media')
  @HttpCode(200)
  @UseInterceptors(broadcastImageUploadInterceptor)
  async createWithMedia(
    @Body() dto: CreateBroadcastMediaDto,
    @UploadedFiles()
    files: Array<{ path: string; mimetype: string; originalname: string }> | undefined,
  ) {
    return this.broadcastsService.createBroadcastWithMedia(dto, files ?? []);
  }
}
