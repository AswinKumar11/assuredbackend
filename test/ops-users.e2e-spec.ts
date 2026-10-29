import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { OpsRole } from '@prisma/client';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashPassword } from '../src/shared/auth/password';

interface LoginBody {
  accessToken: string;
  refreshToken: string;
  role: OpsRole;
}

describe('Ops login and admin management of ops users (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  // Unique per run so repeated runs neither collide nor share rate-limit buckets.
  const run = randomUUID().slice(0, 8);
  const adminEmail = `admin-${run}@e2e.test`;
  const opsEmail = `ops-${run}@e2e.test`;
  const newEmail = `new-${run}@e2e.test`;
  const password = 'e2e-password-long-enough';

  const server = () => app.getHttpServer();
  const login = (email: string, pw = password) =>
    request(server()).post('/v1/ops/auth/login').send({ email, password: pw });

  let adminToken: string;
  let adminRefresh: string;
  let adminId: string;
  let newUserId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);

    const passwordHash = await hashPassword(password);
    const admin = await prisma.opsUser.create({
      data: { email: adminEmail, passwordHash, role: OpsRole.ADMIN },
    });
    adminId = admin.id;
    await prisma.opsUser.create({ data: { email: opsEmail, passwordHash, role: OpsRole.OPS } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.opsUser.deleteMany({
        where: { email: { in: [adminEmail, opsEmail, newEmail] } },
      });
    }
    await app?.close();
  });

  describe('signing in', () => {
    it('gives the same answer for a wrong password and an unknown email', async () => {
      const wrong = await login(adminEmail, 'not-the-password').expect(401);
      const unknown = await login(`nobody-${run}@e2e.test`).expect(401);
      expect(wrong.body).toMatchObject({ code: 'UNAUTHENTICATED' });
      expect((unknown.body as { message: string }).message).toBe(
        (wrong.body as { message: string }).message,
      );
    });

    it('signs in an admin, case-insensitively on email', async () => {
      const response = await login(adminEmail.toUpperCase()).expect(201);
      const body = response.body as LoginBody;
      expect(body.role).toBe(OpsRole.ADMIN);
      adminToken = body.accessToken;
      adminRefresh = body.refreshToken;
    });

    it('rotates the refresh token', async () => {
      const response = await request(server())
        .post('/v1/ops/auth/refresh')
        .send({ refreshToken: adminRefresh })
        .expect(201);
      expect((response.body as LoginBody).refreshToken).not.toBe(adminRefresh);
    });
  });

  describe('who may manage ops users', () => {
    it('refuses an anonymous caller', async () => {
      await request(server()).post('/v1/ops/users').send({}).expect(401);
    });

    it('refuses an ops user who is not an admin', async () => {
      const opsToken = ((await login(opsEmail).expect(201)).body as LoginBody).accessToken;
      await request(server())
        .post('/v1/ops/users')
        .set('Authorization', `Bearer ${opsToken}`)
        .send({ email: newEmail, password })
        .expect(403);
    });
  });

  describe('as an admin', () => {
    const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

    it('rejects a short password', async () => {
      await request(server())
        .post('/v1/ops/users')
        .set(asAdmin())
        .send({ email: newEmail, password: 'short' })
        .expect(400);
    });

    it('creates an ops user and never returns the hash', async () => {
      const response = await request(server())
        .post('/v1/ops/users')
        .set(asAdmin())
        .send({ email: newEmail, password, role: OpsRole.READ_ONLY })
        .expect(201);

      expect(response.body).toMatchObject({
        email: newEmail,
        role: OpsRole.READ_ONLY,
        disabled: false,
      });
      expect(response.body).not.toHaveProperty('passwordHash');
      newUserId = (response.body as { id: string }).id;

      await login(newEmail).expect(201);
    });

    it('refuses a duplicate email', async () => {
      const response = await request(server())
        .post('/v1/ops/users')
        .set(asAdmin())
        .send({ email: newEmail, password })
        .expect(409);
      expect(response.body).toMatchObject({ code: 'CONFLICT' });
    });

    it('will not let an admin change their own account', async () => {
      await request(server())
        .patch(`/v1/ops/users/${adminId}`)
        .set(asAdmin())
        .send({ disabled: true })
        .expect(403);
    });

    it('changes a role', async () => {
      const response = await request(server())
        .patch(`/v1/ops/users/${newUserId}`)
        .set(asAdmin())
        .send({ role: OpsRole.OPS })
        .expect(200);
      expect(response.body).toMatchObject({ role: OpsRole.OPS });
    });

    it('disabling ends sessions and blocks sign-in; re-enabling restores it', async () => {
      const session = (await login(newEmail).expect(201)).body as LoginBody;

      await request(server())
        .patch(`/v1/ops/users/${newUserId}`)
        .set(asAdmin())
        .send({ disabled: true })
        .expect(200);

      await request(server())
        .post('/v1/ops/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
      await login(newEmail).expect(401);

      await request(server())
        .patch(`/v1/ops/users/${newUserId}`)
        .set(asAdmin())
        .send({ disabled: false })
        .expect(200);
    });

    it('resets a password: the old one stops working, the new one works', async () => {
      const newPassword = 'a-different-long-password';
      await request(server())
        .post(`/v1/ops/users/${newUserId}/password`)
        .set(asAdmin())
        .send({ password: newPassword })
        .expect(201);

      await login(newEmail).expect(401);
      await login(newEmail, newPassword).expect(201);
    });

    it('returns 404 for an unknown id and 400 for a malformed one', async () => {
      await request(server())
        .patch(`/v1/ops/users/${randomUUID()}`)
        .set(asAdmin())
        .send({ role: OpsRole.OPS })
        .expect(404);
      await request(server())
        .patch('/v1/ops/users/not-a-uuid')
        .set(asAdmin())
        .send({ role: OpsRole.OPS })
        .expect(400);
    });
  });
});
