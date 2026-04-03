import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { BroadcastsService } from './broadcasts.service';

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
}