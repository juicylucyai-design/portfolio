import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Db } from '../database/db';
import { runMigrations } from '../database/migrate';
import { AuthService } from '../modules/users';

// Creates a user or resets their password.
//   Usage: SET_USERNAME=jane SET_PASSWORD='...' [SET_ROLE=admin|member] npm run set-password -w server
// Values come from environment variables so the password doesn't end up in shell history.

async function main(): Promise<void> {
  const username = process.env.SET_USERNAME;
  const password = process.env.SET_PASSWORD;
  const role = process.env.SET_ROLE === 'admin' ? 'admin' : 'member';
  if (!username || !password) {
    throw new Error('Set SET_USERNAME and SET_PASSWORD (and optionally SET_ROLE=admin).');
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    await runMigrations(app.get(Db));
    const result = await app.get(AuthService).setPassword(username, password, role);
    console.log(result === 'created' ? `Created ${role} user "${username.toLowerCase()}".` : `Updated the password for "${username.toLowerCase()}". Their sessions were signed out.`);
  } finally {
    await app.close();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
