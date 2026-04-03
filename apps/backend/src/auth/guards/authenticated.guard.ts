import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const isAuthenticated = Boolean(request.session?.adminId);

    if (!isAuthenticated) {
      throw new UnauthorizedException('Unauthorized');
    }

    return true;
  }
}