import { createHash } from "crypto";
import { v2 as cloudinary } from "cloudinary";
import type { UploadSignature } from "@quickmenu/shared";
import { env } from "../config";
import { logger } from "../logger";

/**
 * FR-09: the API never receives image bytes. It returns a short-lived signed
 * upload and later stores only the Cloudinary reference. The SDK sits behind
 * this interface so tests can use an in-memory fake.
 */
export interface MediaStorage {
  createSignature(restaurantId: string): UploadSignature;
  delete(publicId: string): Promise<void>;
}

export function folderFor(restaurantId: string): string {
  return `quickmenu/${restaurantId}`;
}

export function belongsToRestaurant(restaurantId: string, publicId: string): boolean {
  const prefix = `${folderFor(restaurantId)}/`;
  return publicId === folderFor(restaurantId) || publicId.startsWith(prefix);
}

class CloudinaryStorage implements MediaStorage {
  constructor() {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  createSignature(restaurantId: string): UploadSignature {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = folderFor(restaurantId);
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      env.CLOUDINARY_API_SECRET
    );
    return {
      timestamp,
      folder,
      signature,
      apiKey: env.CLOUDINARY_API_KEY,
      cloudName: env.CLOUDINARY_CLOUD_NAME,
    };
  }

  async delete(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
  }
}

/** Deterministic stand-in used by tests and when Cloudinary is not configured. */
class FakeMediaStorage implements MediaStorage {
  readonly deleted: string[] = [];

  createSignature(restaurantId: string): UploadSignature {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = folderFor(restaurantId);
    const signature = createHash("sha256")
      .update(`${folder}:${timestamp}:test`)
      .digest("hex");
    return {
      timestamp,
      folder,
      signature,
      apiKey: "fake-key",
      cloudName: "fake-cloud",
    };
  }

  async delete(publicId: string): Promise<void> {
    this.deleted.push(publicId);
  }
}

const fake = new FakeMediaStorage();
let current: MediaStorage | null = null;

export function getMediaStorage(): MediaStorage {
  if (current) return current;
  if (
    env.NODE_ENV !== "test" &&
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET
  ) {
    current = new CloudinaryStorage();
    return current;
  }
  return fake;
}

/** Test hook. Pass `null` to fall back to the environment default. */
export function setMediaStorage(storage: MediaStorage | null): void {
  current = storage;
}

export async function deleteImageQuietly(publicId: string): Promise<void> {
  try {
    await getMediaStorage().delete(publicId);
  } catch (error) {
    // The database row must still be removed; log without leaking secrets.
    logger.warn({ err: error, publicId }, "cloudinary delete failed");
  }
}

export const fakeMediaStorage = fake;
