import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { LogsService } from './logs.service';

@Controller('logs')
@UseGuards(AuthenticatedGuard)
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  async list(@Query('limit') limit?: number) {
    return this.logsService.list(limit ?? 200);
  }
}