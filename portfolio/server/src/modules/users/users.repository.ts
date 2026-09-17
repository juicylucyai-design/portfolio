import { Injectable } from '@nestjs/common';
import type { Role } from '@nksq/contracts';
import { Db } from '../../database/db';

export interface UserRecord {
  id: number;
  username: string;
  displayName: string;
  passwordHash: string;
  role: Role;
}

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  role: Role;
}

const toUser = (row: UserRow): UserRecord => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  passwordHash: row.password_hash,
  role: row.role,
});

/** The only code that reads or writes the users and sessions tables. */
@Injectable()
export class UsersRepository {
  constructor(private readonly db: Db) {}

  async count(): Promise<number> {
    const [row] = await this.db.query<{ count: number }>('SELECT count(*)::int AS count FROM users');
    return row.count;
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const rows = await this.db.query<UserRow>(
      'SELECT id, username, display_name, password_hash, role FROM users WHERE username = $1',
      [username],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async create(user: Omit<UserRecord, 'id'>): Promise<UserRecord> {
    const [row] = await this.db.query<UserRow>(
      `INSERT INTO users (username, display_name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, display_name, password_hash, role`,
      [user.username, user.displayName, user.passwordHash, user.role],
    );
    return toUser(row);
  }

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    await this.db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
    await this.db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  }

  async createSession(tokenHash: string, userId: number, expiresAt: Date): Promise<void> {
    await this.db.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [tokenHash, userId, expiresAt]);
  }

  async findUserBySession(tokenHash: string): Promise<UserRecord | null> {
    const rows = await this.db.query<UserRow>(
      `SELECT u.id, u.username, u.display_name, u.password_hash, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  }

  async deleteExpiredSessions(): Promise<void> {
    await this.db.query('DELETE FROM sessions WHERE expires_at <= now()');
  }
}
