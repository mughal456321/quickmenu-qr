/**
 * Cloudinary delivery helper (NFR-P5).
 *
 * Uploads store the original `secure_url`; delivery should ask Cloudinary for
 * an automatically formatted, automatically compressed image at a sensible
 * width so menu photos stay well under 200 KB on a phone.
 */
const UPLOAD_SEGMENT = "/image/upload/";

export function optimizedImageUrl(url: string, width = 800): string {
  if (!url.startsWith("https://res.cloudinary.com") || !url.includes(UPLOAD_SEGMENT)) {
    return url;
  }

  const [base, rest] = url.split(UPLOAD_SEGMENT);
  if (!base || !rest) return url;

  // Do not stack transformations if the URL already has one.
  if (/^(f_|q_|w_|c_|dpr_)/.test(rest)) return url;

  return `${base}${UPLOAD_SEGMENT}f_auto,q_auto,w_${width}/${rest}`;
}
