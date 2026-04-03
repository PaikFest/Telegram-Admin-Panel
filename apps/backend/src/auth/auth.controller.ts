import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { LogsService } from '../logs/logs.service';
import { AuthService } from './auth.service';
import { ChangeCredentialsDto } from './dto/change-credentials.dto';
import { LoginDto } from './dto/login.dto';
import { AuthenticatedGuard } from './guards/authenticated.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly logsService: LogsService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<{ login: string }> {
    try {
      const admin = await this.authService.validateAdmin(dto.login, dto.password);
      req.session.adminId = admin.id;

      await new Promise<void>((resolve, reject) => {
        req.session.save((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

      await this.logsService.info('auth', `Login success: ${admin.login}`);
      return { login: admin.login };
    } catch (error) {
      await this.logsService.warn('auth', `Login failed for login=${dto.login}`);
      throw error;
    }
  }

  @Post('logout')
  @UseGuards(AuthenticatedGuard)
  @HttpCode(200)
  async logout(@Req() req: Request): Promise<{ success: boolean }> {
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    return { success: true };
  }

  @Get('me')
  @UseGuards(AuthenticatedGuard)
  async me(@Req() req: Request): Promise<{ id: number; login: string }> {
    const adminId = req.session.adminId;
    if (!adminId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const admin = await this.authService.getAdminById(adminId);
    if (!admin) {
      throw new UnauthorizedException('Unauthorized');
    }

    return admin;
  }

  @Post('change-credentials')
  @UseGuards(AuthenticatedGuard)
  @HttpCode(200)
  async changeCredentials(
    @Body() dto: ChangeCredentialsDto,
    @Req() req: Request,
  ): Promise<{ login: string }> {
    const adminId = req.session.adminId;
    if (!adminId) {
      throw new UnauthorizedException('Unauthorized');
    }

    return this.authService.changeCredentials(adminId, dto);
  }
}