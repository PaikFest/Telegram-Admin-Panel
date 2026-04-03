import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthenticatedGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list(@Query('search') search?: string) {
    return this.usersService.listUsers(search);
  }

  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.getUserById(id);
  }
}