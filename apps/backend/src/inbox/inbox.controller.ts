import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { ReplyDto } from './dto/reply.dto';
import { InboxService } from './inbox.service';

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
}