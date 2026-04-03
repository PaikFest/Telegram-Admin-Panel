import {
  ConflictException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { sanitizePlainText } from '../common/sanitize.util';
import { LogsService } from '../logs/logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeCredentialsDto } from './dto/change-credentials.dto';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logsService: LogsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureAdminFromEnv();
  }

  private async ensureAdminFromEnv(): Promise<void> {
    const adminLogin = this.configService.get<string>('ADMIN_LOGIN');
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD');

    if (!adminLogin || !adminPassword) {
      return;
    }

    const adminCount = await this.prisma.admin.count();
    if (adminCount > 0) {
      return;
    }

    const hash = await bcrypt.hash(adminPassword, 12);

    await this.prisma.admin.create({
      data: {
        login: sanitizePlainText(adminLogin),
        passwordHash: hash,
      },
    });

    await this.logsService.info('auth', 'Initial admin account created from environment');
  }

  async validateAdmin(login: string, password: string): Promise<{ id: number; login: string }> {
    const sanitizedLogin = sanitizePlainText(login);

    const admin = await this.prisma.admin.findUnique({
      where: { login: sanitizedLogin },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { id: admin.id, login: admin.login };
  }

  async getAdminById(adminId: number): Promise<{ id: number; login: string } | null> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: { id: true, login: true },
    });

    return admin;
  }

  async changeCredentials(adminId: number, dto: ChangeCredentialsDto): Promise<{ login: string }> {
    const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) {
      throw new UnauthorizedException('Admin session is invalid');
    }

    const currentPasswordValid = await bcrypt.compare(dto.currentPassword, admin.passwordHash);
    if (!currentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newLogin = sanitizePlainText(dto.newLogin);
    const existing = await this.prisma.admin.findFirst({
      where: { login: newLogin, id: { not: adminId } },
    });

    if (existing) {
      throw new ConflictException('Login is already in use');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    const updated = await this.prisma.admin.update({
      where: { id: adminId },
      data: {
        login: newLogin,
        passwordHash,
      },
      select: { login: true },
    });

    await this.logsService.info('auth', `Admin credentials changed for adminId=${adminId}`);
    return updated;
  }
}