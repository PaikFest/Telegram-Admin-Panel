import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { MediaService } from './media.service';

@Controller('media')
@UseGuards(AuthenticatedGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get('messages/:messageId/file')
  async getMessageFile(
    @Param('messageId', ParseIntPipe) messageId: number,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.mediaService.getMessagePhotoFile(messageId);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
    response.setHeader('Cache-Control', 'private, max-age=60');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.buffer);
  }
}
