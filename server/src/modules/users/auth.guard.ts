import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, UnsupportedMediaTypeException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { SessionUser } from '@nksq/contracts';
import { IS_PUBLIC } from '../../common/public.decorator';
import { AuthService, SESSION_COOKIE } from './auth.service';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Applied to every API route. Routes marked @Public() skip the session check. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();

    // Browsers can't send cross-site JSON or PDF bodies without a CORS preflight, so requiring either on writes
    // blocks CSRF from plain HTML forms.
    if (!READ_METHODS.has(request.method) && !request.is(['application/json', 'application/pdf'])) {
      throw new UnsupportedMediaTypeException('Send requests as JSON (or a PDF file for uploads).');
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const user = await this.auth.userForToken(request.cookies?.[SESSION_COOKIE]);
    if (!user) throw new UnauthorizedException('Sign in to continue.');
    request.user = user;
    return true;
  }
}
