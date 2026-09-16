import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Role, SessionUser } from '@nksq/contracts';
import { hashPassword, verifyPassword } from './password';
import { UserRecord, UsersRepository } from './users.repository';

export const SESSION_COOKIE = 'nksq_session';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const toSessionUser = (user: UserRecord): SessionUser => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
});

@Injectable()
export class AuthService {
  /** Failed attempts per username + IP address, kept in memory. */
  private readonly failures = new Map<string, { count: number; lockedUntil: number }>();
  /** Checked when the username doesn't exist, so response time doesn't reveal which usernames are real. */
  private readonly decoyHash = hashPassword(randomBytes(16).toString('hex'));

  constructor(private readonly users: UsersRepository) {}

  async login(username: string, password: string, ipAddress: string): Promise<{ token: string; user: SessionUser; expiresAt: Date }> {
    const normalised = username.trim().toLowerCase();
    const attemptKey = `${normalised}|${ipAddress}`;
    const attempts = this.failures.get(attemptKey);
    if (attempts && attempts.lockedUntil > Date.now()) {
      throw new HttpException('Too many failed sign-in attempts. Try again in 15 minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.users.findByUsername(normalised);
    const passwordMatches = await verifyPassword(password, user ? user.passwordHash : await this.decoyHash);
    if (!user || !passwordMatches) {
      const count = (attempts?.count ?? 0) + 1;
      this.failures.set(attemptKey, count >= MAX_FAILED_ATTEMPTS ? { count: 0, lockedUntil: Date.now() + LOCKOUT_MS } : { count, lockedUntil: 0 });
      throw new UnauthorizedException('Username or password is incorrect.');
    }

    this.failures.delete(attemptKey);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.users.createSession(hashToken(token), user.id, expiresAt);
    return { token, user: toSessionUser(user), expiresAt };
  }

  async userForToken(token: string | undefined): Promise<SessionUser | null> {
    if (!token) return null;
    const user = await this.users.findUserBySession(hashToken(token));
    return user ? toSessionUser(user) : null;
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.users.deleteSession(hashToken(token));
  }

  /** Creates the user, or replaces the password of an existing one. Used by the set-password script. */
  async setPassword(username: string, password: string, role: Role = 'member', displayName?: string): Promise<'created' | 'updated'> {
    const normalised = username.trim().toLowerCase();
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    const passwordHash = await hashPassword(password);
    const existing = await this.users.findByUsername(normalised);
    if (existing) {
      await this.users.updatePassword(existing.id, passwordHash);
      return 'updated';
    }
    await this.users.create({ username: normalised, displayName: displayName ?? username.trim(), passwordHash, role });
    return 'created';
  }

  /**
   * Creates the first admin from ADMIN_USERNAME / ADMIN_PASSWORD on startup.
   * Never overwrites an existing user, so changing the password in the app sticks across restarts.
   */
  async ensureAdminFromEnv(log: (message: string) => void = console.log): Promise<void> {
    await this.users.deleteExpiredSessions();
    const username = process.env.ADMIN_USERNAME?.trim();
    const password = process.env.ADMIN_PASSWORD;
    if (!username || !password) {
      if ((await this.users.count()) === 0) log('No users exist yet. Set ADMIN_USERNAME and ADMIN_PASSWORD to create the first admin.');
      return;
    }
    if (await this.users.findByUsername(username.toLowerCase())) return;
    await this.setPassword(username, password, 'admin', process.env.ADMIN_DISPLAY_NAME?.trim() || username);
    log(`Created admin user "${username.toLowerCase()}".`);
  }
}
