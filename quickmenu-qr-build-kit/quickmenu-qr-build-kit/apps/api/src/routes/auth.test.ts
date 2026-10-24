import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Response as SupertestResponse } from "supertest";
import jwt from "jsonwebtoken";
import type { Application } from "express";
import { createApp } from "../server";
import { env } from "../config";
import { hashToken } from "../lib/tokens";
import {
  ConsoleMailer,
  setMailer,
  type PasswordResetEmail,
} from "../mail/mailer";
import {
  expireLockout,
  expireResetToken,
  truncateAll,
} from "../repositories/testing";
import * as usersRepo from "../repositories/users";

const API = "/api/v1";

const OWNER = {
  name: "Bilal Ahmed",
  email: "owner@cafearoma.pk",
  password: "CafeAroma2026",
  restaurantName: "Cafe Aroma",
};

let app: Application;
let sentEmails: PasswordResetEmail[];

beforeEach(async () => {
  await truncateAll();
  app = createApp();
  sentEmails = [];
  setMailer({
    sendPasswordReset: async (message) => {
      sentEmails.push(message);
    },
  });
});

afterAll(() => {
  setMailer(new ConsoleMailer());
});

function register(overrides: Record<string, unknown> = {}) {
  return request(app)
    .post(`${API}/auth/register`)
    .send({ ...OWNER, ...overrides });
}

function login(email = OWNER.email, password = OWNER.password) {
  return request(app).post(`${API}/auth/login`).send({ email, password });
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function setCookies(res: SupertestResponse): string[] {
  const raw = res.headers["set-cookie"] as string[] | string | undefined;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function refreshCookiePair(res: SupertestResponse): string | undefined {
  return setCookies(res).find((c) => c.startsWith("qm_refresh="))?.split(";")[0];
}

function tokenFromResetUrl(url: string): string {
  return new URL(url).searchParams.get("token") ?? "";
}

describe("Phase 03 authentication", () => {
  it("FR-01 registers the restaurant and owner in one transaction", async () => {
    const res = await register();

    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.expiresIn).toBe(3600);
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(res.body.data.user).toMatchObject({
      name: OWNER.name,
      email: OWNER.email,
      role: "owner",
    });

    const cookie = refreshCookiePair(res);
    expect(cookie).toBeTruthy();
    expect(cookie).toMatch(/^qm_refresh=/);

    const me = await request(app)
      .get(`${API}/me`)
      .set(bearer(res.body.data.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.restaurant).toMatchObject({
      name: "Cafe Aroma",
      slug: "cafe-aroma",
    });
  });

  it("FR-01 rejects a password that breaks the policy", async () => {
    const res = await register({ password: "short1" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "password" })])
    );
  });

  it("FR-01 returns 409 for a duplicate email", async () => {
    expect((await register()).status).toBe(201);
    const duplicate = await register({ restaurantName: "Another Cafe" });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("CONFLICT");
  });

  it("NFR-S2 stores only a bcrypt hash of the password", async () => {
    await register();
    const user = await usersRepo.getByEmail(OWNER.email);

    expect(user).not.toBeNull();
    expect(user!.passwordHash).not.toBe(OWNER.password);
    expect(user!.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("FR-02 logs in and issues a session", async () => {
    await register();
    const res = await login();

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe(OWNER.email);
    expect(refreshCookiePair(res)).toMatch(/^qm_refresh=/);
  });

  it("FR-02 rejects a wrong password and increments the counter", async () => {
    await register();
    const res = await login(OWNER.email, "WrongPass123");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");

    const user = await usersRepo.getByEmail(OWNER.email);
    expect(user!.failedAttempts).toBe(1);
  });

  it("FR-02 returns the same generic error for unknown emails (no enumeration)", async () => {
    await register();
    const unknown = await login("nobody@example.com", "Whatever123");
    const wrong = await login(OWNER.email, "WrongPass123");

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.code).toBe(wrong.body.error.code);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it("NFR-S4 locks the account after 5 failures", async () => {
    await register();

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect((await login(OWNER.email, "WrongPass123")).status).toBe(401);
    }
    const fifth = await login(OWNER.email, "WrongPass123");
    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe("ACCOUNT_LOCKED");

    // Correct password is still rejected while the lock is active.
    expect((await login()).status).toBe(423);

    const user = await usersRepo.getByEmail(OWNER.email);
    expect(user!.lockedUntil).not.toBeNull();
    const minutes = (new Date(user!.lockedUntil!).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);
  });

  it("NFR-S4 allows login again once the 15 minutes have passed", async () => {
    await register();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await login(OWNER.email, "WrongPass123");
    }
    expect((await login()).status).toBe(423);

    await expireLockout(OWNER.email);
    const res = await login();

    expect(res.status).toBe(200);
    const user = await usersRepo.getByEmail(OWNER.email);
    expect(user!.failedAttempts).toBe(0);
    expect(user!.lockedUntil).toBeNull();
  });

  it("FR-03 refreshes the access token from the cookie", async () => {
    const registered = await register();
    const cookie = refreshCookiePair(registered)!;

    const refreshed = await request(app)
      .post(`${API}/auth/refresh`)
      .set("Cookie", cookie);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toEqual(expect.any(String));

    const me = await request(app)
      .get(`${API}/me`)
      .set(bearer(refreshed.body.data.accessToken));
    expect(me.status).toBe(200);

    const noCookie = await request(app).post(`${API}/auth/refresh`);
    expect(noCookie.status).toBe(401);
    expect(noCookie.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("FR-03 logout clears the refresh cookie", async () => {
    const registered = await register();
    const res = await request(app)
      .post(`${API}/auth/logout`)
      .set(bearer(registered.body.data.accessToken));

    expect(res.status).toBe(204);
    expect(setCookies(res).join(";")).toMatch(/qm_refresh=;/);
  });

  it("NFR-S3 rejects an expired access token", async () => {
    const registered = await register();
    const expired = jwt.sign(
      { restaurantId: registered.body.data.user.restaurantId, role: "owner" },
      env.JWT_ACCESS_SECRET,
      { subject: registered.body.data.user.id, expiresIn: -1 }
    );

    const res = await request(app).get(`${API}/me`).set(bearer(expired));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("FR-04 forgot-password emails a hashed, 30-minute reset token", async () => {
    await register();
    const res = await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email: OWNER.email });

    expect(res.status).toBe(202);
    expect(sentEmails).toHaveLength(1);
    const token = tokenFromResetUrl(sentEmails[0]!.resetUrl);
    expect(token).toHaveLength(64);

    const record = await usersRepo.getResetTokenByHash(hashToken(token));
    expect(record).not.toBeNull();
    expect(record!.tokenHash).toBe(hashToken(token));
    expect(record!.tokenHash).not.toBe(token);
    expect(record!.usedAt).toBeNull();
    const minutes = (new Date(record!.expiresAt).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(29);
  });

  it("FR-04 forgot-password returns 202 for unknown emails without sending", async () => {
    const res = await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email: "nobody@example.com" });

    expect(res.status).toBe(202);
    expect(sentEmails).toHaveLength(0);
  });

  it("FR-04 resets the password, clears lockout, and burns the token", async () => {
    await register();
    await login(OWNER.email, "WrongPass123");
    await login(OWNER.email, "WrongPass123");

    await request(app).post(`${API}/auth/forgot-password`).send({ email: OWNER.email });
    const token = tokenFromResetUrl(sentEmails[0]!.resetUrl);

    const reset = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token, password: "NewSecret123" });
    expect(reset.status).toBe(204);

    expect((await login(OWNER.email, OWNER.password)).status).toBe(401);
    expect((await login(OWNER.email, "NewSecret123")).status).toBe(200);

    const user = await usersRepo.getByEmail(OWNER.email);
    expect(user!.failedAttempts).toBe(0);
    expect(user!.lockedUntil).toBeNull();

    const reuse = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token, password: "AnotherSecret123" });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("FR-04 rejects an expired reset token", async () => {
    await register();
    await request(app).post(`${API}/auth/forgot-password`).send({ email: OWNER.email });
    const token = tokenFromResetUrl(sentEmails[0]!.resetUrl);
    await expireResetToken(hashToken(token));

    const res = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token, password: "NewSecret123" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("FR-05 rejects unauthenticated access to /me", async () => {
    const res = await request(app).get(`${API}/me`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("Phase 03 staff and restaurant profile", () => {
  async function registerOwner(email = OWNER.email, restaurantName = "Cafe Aroma") {
    const res = await register({ email, restaurantName });
    return res.body.data as {
      accessToken: string;
      user: { id: string; restaurantId: string };
    };
  }

  const KITCHEN = {
    name: "Sana Khan",
    email: "kitchen@cafearoma.pk",
    password: "KitchenCafe2026",
  };

  it("FR-05 owner creates a kitchen account that can log in", async () => {
    const owner = await registerOwner();

    const created = await request(app)
      .post(`${API}/staff`)
      .set(bearer(owner.accessToken))
      .send(KITCHEN);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ email: KITCHEN.email, role: "kitchen" });

    const kitchenLogin = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: KITCHEN.email, password: KITCHEN.password });
    expect(kitchenLogin.status).toBe(200);
    expect(kitchenLogin.body.data.user.role).toBe("kitchen");
  });

  it("FR-05 kitchen users cannot use owner endpoints", async () => {
    const owner = await registerOwner();
    await request(app).post(`${API}/staff`).set(bearer(owner.accessToken)).send(KITCHEN);
    const kitchenLogin = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: KITCHEN.email, password: KITCHEN.password });
    const kitchenToken = kitchenLogin.body.data.accessToken as string;

    expect(
      (await request(app).get(`${API}/staff`).set(bearer(kitchenToken))).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`${API}/staff`)
          .set(bearer(kitchenToken))
          .send({ ...KITCHEN, email: "other@cafearoma.pk" })
      ).status
    ).toBe(403);
    // Kitchen members may still read the restaurant profile and their own /me.
    expect(
      (await request(app).get(`${API}/restaurant`).set(bearer(kitchenToken))).status
    ).toBe(200);
    expect(
      (await request(app).get(`${API}/me`).set(bearer(kitchenToken))).status
    ).toBe(200);
  });

  it("NFR-S6 isolates staff between restaurants", async () => {
    const ownerA = await registerOwner("a@example.com", "Restaurant A");
    const ownerB = await registerOwner("b@example.com", "Restaurant B");

    const staffA = await request(app)
      .post(`${API}/staff`)
      .set(bearer(ownerA.accessToken))
      .send(KITCHEN);
    expect(staffA.status).toBe(201);
    const staffId = staffA.body.data.id as string;

    const listB = await request(app).get(`${API}/staff`).set(bearer(ownerB.accessToken));
    expect(listB.status).toBe(200);
    expect(listB.body.data).toEqual([]);

    expect(
      (
        await request(app)
          .patch(`${API}/staff/${staffId}`)
          .set(bearer(ownerB.accessToken))
          .send({ name: "Hijacked" })
      ).status
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete(`${API}/staff/${staffId}`)
          .set(bearer(ownerB.accessToken))
      ).status
    ).toBe(404);
  });

  it("FR-05 an owner cannot delete their own account", async () => {
    const owner = await registerOwner();

    const res = await request(app)
      .delete(`${API}/staff/${owner.user.id}`)
      .set(bearer(owner.accessToken));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("FR-05 updates staff: deactivate, reactivate, and reset the password", async () => {
    const owner = await registerOwner();
    const staff = await request(app)
      .post(`${API}/staff`)
      .set(bearer(owner.accessToken))
      .send(KITCHEN);
    const staffId = staff.body.data.id as string;

    const deactivated = await request(app)
      .patch(`${API}/staff/${staffId}`)
      .set(bearer(owner.accessToken))
      .send({ isActive: false });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data.isActive).toBe(false);
    expect(
      (
        await request(app)
          .post(`${API}/auth/login`)
          .send({ email: KITCHEN.email, password: KITCHEN.password })
      ).status
    ).toBe(401);

    const reactivated = await request(app)
      .patch(`${API}/staff/${staffId}`)
      .set(bearer(owner.accessToken))
      .send({ isActive: true, password: "NewKitchen123" });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.data.isActive).toBe(true);

    expect(
      (
        await request(app)
          .post(`${API}/auth/login`)
          .send({ email: KITCHEN.email, password: KITCHEN.password })
      ).status
    ).toBe(401);
    expect(
      (
        await request(app)
          .post(`${API}/auth/login`)
          .send({ email: KITCHEN.email, password: "NewKitchen123" })
      ).status
    ).toBe(200);
  });

  it("FR-05 deletes a kitchen account", async () => {
    const owner = await registerOwner();
    const staff = await request(app)
      .post(`${API}/staff`)
      .set(bearer(owner.accessToken))
      .send(KITCHEN);
    const staffId = staff.body.data.id as string;

    const res = await request(app)
      .delete(`${API}/staff/${staffId}`)
      .set(bearer(owner.accessToken));
    expect(res.status).toBe(204);

    const list = await request(app).get(`${API}/staff`).set(bearer(owner.accessToken));
    expect(list.body.data).toEqual([]);
  });

  it("FR-01 owner edits the restaurant profile", async () => {
    const owner = await registerOwner();

    const updated = await request(app)
      .patch(`${API}/restaurant`)
      .set(bearer(owner.accessToken))
      .send({ name: "Cafe Aroma 2", currency: "usd", defaultLanguage: "ur" });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      name: "Cafe Aroma 2",
      currency: "USD",
      defaultLanguage: "ur",
    });

    const current = await request(app)
      .get(`${API}/restaurant`)
      .set(bearer(owner.accessToken));
    expect(current.body.data.name).toBe("Cafe Aroma 2");
  });
});
