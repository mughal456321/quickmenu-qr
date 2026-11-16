import type { UploadSignature } from "@quickmenu/shared";

export interface UploadedImage {
  publicId: string;
  url: string;
}

/**
 * Direct browser-to-Cloudinary upload (FR-09). The API only signs the request,
 * so image bytes never pass through our server.
 *
 * In test mode the API returns a `fake-cloud` signature; we then register a
 * deterministic placeholder URL so Playwright can exercise the flow without a
 * Cloudinary account.
 */
export async function uploadImage(
  signature: UploadSignature,
  file: File
): Promise<UploadedImage> {
  if (signature.cloudName === "fake-cloud") {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${file.name}`;
    const publicId = `${signature.folder}/${id}`;
    return {
      publicId,
      url: `https://res.cloudinary.com/fake/image/upload/${publicId}.jpg`,
    };
  }

  const body = new FormData();
  body.append("file", file);
  body.append("api_key", signature.apiKey);
  body.append("timestamp", String(signature.timestamp));
  body.append("folder", signature.folder);
  body.append("signature", signature.signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`,
    { method: "POST", body }
  );
  if (!response.ok) {
    throw new Error("The photo upload was rejected by Cloudinary.");
  }
  const result = (await response.json()) as {
    public_id?: string;
    secure_url?: string;
  };
  if (!result.public_id || !result.secure_url) {
    throw new Error("Cloudinary returned an unexpected response.");
  }
  return { publicId: result.public_id, url: result.secure_url };
}
