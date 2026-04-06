import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { mkdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { diskStorage } from 'multer';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { ReplyDto } from './dto/reply.dto';
import { InboxService } from './inbox.service';

const UPLOADS_DIR = resolve(process.cwd(), 'storage', 'uploads');
mkdirSync(UPLOADS_DIR, { recursive: true });

const imageUploadInterceptor = FilesInterceptor('files', 10, {
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

@Controller('inbox')
@UseGuards(AuthenticatedGuard)
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get('conversations')
  async listConversations(@Query('search') search?: string) {
    return this.inboxService.listConversations(search);
  }

  @Get('conversations/:userId/messages')
  async getConversationMessages(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('limit') limit?: number,
  ) {
    return this.inboxService.getConversationMessages(userId, limit ?? 150);
  }

  @Post('conversations/:userId/reply')
  async sendReply(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ReplyDto,
  ) {
    return this.inboxService.sendReply(userId, dto.text);
  }

  @Post('conversations/:userId/reply-media')
  @HttpCode(200)
  @UseInterceptors(imageUploadInterceptor)
  async sendReplyMedia(
    @Param('userId', ParseIntPipe) userId: number,
    @Body('text') text: string | undefined,
    @UploadedFiles()
    files: Array<{ path: string; mimetype: string; originalname: string }> | undefined,
  ) {
    return this.inboxService.sendReplyMedia(userId, files ?? [], text);
  }
}
