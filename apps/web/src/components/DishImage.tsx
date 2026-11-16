"use client";

import { useEffect, useRef, useState } from "react";
import { optimizedImageUrl } from "../lib/images";

const TONES = [
  ["#F3E7DA", "#E4CDB4", "#8A5A32"],
  ["#EFE6D8", "#DDCDB5", "#6F5B3E"],
  ["#F5E4DC", "#E6C6B6", "#8C4A34"],
  ["#EAE7DE", "#D6D1C2", "#585a4c"],
  ["#F6E9D6", "#E6D0AC", "#7C5A2C"],
] as const;

function toneFor(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 997;
  }
  return TONES[hash % TONES.length]!;
}

/**
 * Menu photo with a designed fallback.
 *
 * Seed data and draft items may not have a photo yet; an empty grey box looks
 * broken, so we render a warm monogram plate instead. Stored Cloudinary URLs
 * are rewritten to an optimised delivery size (NFR-P5).
 */
export function DishImage({
  src,
  name,
  width = 400,
  className = "",
  sizes,
}: {
  src?: string | null;
  name: string;
  width?: number;
  className?: string;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const [background, edge, ink] = toneFor(name);
  const monogram = name.trim().charAt(0).toUpperCase() || "·";

  /*
   * A server-rendered image often finishes loading before React hydrates, so
   * `onLoad` never fires and the photo would stay at opacity 0. Check the DOM
   * node on mount as well.
   */
  useEffect(() => {
    const image = imageRef.current;
    if (!image?.complete) return;
    if (image.naturalWidth > 0) setLoaded(true);
    else setFailed(true);
  }, [src]);

  if (!src || failed) {
    return (
      <span
        className={`relative flex items-center justify-center overflow-hidden ${className}`}
        style={{
          background: `linear-gradient(150deg, ${background} 0%, ${edge} 100%)`,
          color: ink,
        }}
        aria-hidden="true"
      >
        <span className="display text-[clamp(20px,38%,52px)] leading-none opacity-80">
          {monogram}
        </span>
        <span
          className="absolute inset-x-0 bottom-0 h-1/3 opacity-[0.14]"
          style={{ background: `radial-gradient(circle at 50% 120%, ${ink}, transparent 70%)` }}
        />
      </span>
    );
  }

  return (
    <span className={`relative block overflow-hidden ${className}`}>
      <img
        ref={imageRef}
        src={optimizedImageUrl(src, width)}
        alt=""
        sizes={sizes}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover transition-opacity duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
      {!loaded && (
        <span
          className="absolute inset-0"
          style={{ background: `linear-gradient(150deg, ${background} 0%, ${edge} 100%)` }}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
