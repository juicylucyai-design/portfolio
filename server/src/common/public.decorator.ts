import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { SessionUser } from '@nksq/contracts';

export const IS_PUBLIC = 'nksq:isPublic';

/** Marks a route as reachable without signing in. Everything else requires a session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** The signed-in user, attached to the request by the auth guard. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionUser => {
  return ctx.switchToHttp().getRequest<{ user: SessionUser }>().user;
});
