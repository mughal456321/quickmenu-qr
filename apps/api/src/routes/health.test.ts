import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../server";

describe("Phase 01 scaffold", () => {
  it("unknown routes return the documented NOT_FOUND error shape", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/nope/here");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Route not found.",
        requestId: expect.any(String),
      },
    });
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("health endpoint returns the documented envelope", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: "ok",
      db: expect.stringMatching(/^(up|down)$/),
    });
  });
});