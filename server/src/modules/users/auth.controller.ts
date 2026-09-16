import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { SessionUser } from '@nksq/contracts';
import { CurrentUser, Public } from '../../common/public.decorator';
import { asObject, requireString } from '../../common/validation';
import { AuthService, SESSION_COOKIE } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SessionUser> {
    const input = asObject(body);
    const username = requireString(input, 'username', 'Username', { max: 64 });
    const password = requireString(input, 'password', 'Password', { trim: false, max: 256 });

    const { token, user, expiresAt } = await this.auth.login(username, password, req.ip ?? 'unknown');
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      expires: expiresAt,
      path: '/',
    });
    return user;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }
}
