/**
 * Translation adapters (FR-21).
 *
 * A provider receives plain texts and returns the same number of translated
 * strings, in order. All network calls are bounded by a 3 second timeout so the
 * public menu can fall back to the source language instead of blocking.
 */
export interface TranslationProvider {
  readonly name: string;
  translate(texts: string[], source: string, target: string): Promise<string[]>;
}

const TIMEOUT_MS = 3_000;

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`translation provider returned ${response.status}`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/** Deterministic, offline provider used in development and tests. */
export class FakeTranslationProvider implements TranslationProvider {
  readonly name = "fake";

  async translate(texts: string[], _source: string, target: string): Promise<string[]> {
    return texts.map((text) => `${text} [${target}]`);
  }
}

/**
 * LibreTranslate-compatible endpoint. `TRANSLATION_PROVIDER=libretranslate`
 * uses TRANSLATION_API_KEY when the deployment requires one.
 */
export class LibreTranslateProvider implements TranslationProvider {
  readonly name = "libretranslate";

  constructor(
    private readonly endpoint = process.env.TRANSLATION_ENDPOINT ??
      "https://libretranslate.com/translate",
    private readonly apiKey = process.env.TRANSLATION_API_KEY ?? ""
  ) {}

  async translate(texts: string[], source: string, target: string): Promise<string[]> {
    const payload = await postJson(this.endpoint, {
      q: texts,
      source,
      target,
      format: "text",
      ...(this.apiKey ? { api_key: this.apiKey } : {}),
    });
    const body = payload as { translatedText?: string | string[] };
    const translated = body.translatedText;
    if (Array.isArray(translated)) return translated;
    if (typeof translated === "string") return [translated];
    throw new Error("unexpected LibreTranslate response");
  }
}

/** Google Cloud Translation v2 adapter. */
export class GoogleTranslateProvider implements TranslationProvider {
  readonly name = "google";

  constructor(private readonly apiKey = process.env.TRANSLATION_API_KEY ?? "") {}

  async translate(texts: string[], source: string, target: string): Promise<string[]> {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(
      this.apiKey
    )}`;
    const payload = await postJson(url, { q: texts, source, target, format: "text" });
    const body = payload as {
      data?: { translations?: Array<{ translatedText: string }> };
    };
    const translations = body.data?.translations;
    if (!Array.isArray(translations)) throw new Error("unexpected Google response");
    return translations.map((entry) => entry.translatedText);
  }
}

const fake = new FakeTranslationProvider();
let override: TranslationProvider | null = null;

export function getTranslationProvider(): TranslationProvider {
  if (override) return override;
  const configured = process.env.TRANSLATION_PROVIDER ?? "fake";
  if (configured === "libretranslate") return new LibreTranslateProvider();
  if (configured === "google") return new GoogleTranslateProvider();
  return fake;
}

/** Test hook. Pass `null` to restore the environment selection. */
export function setTranslationProvider(provider: TranslationProvider | null): void {
  override = provider;
}

export const fakeTranslationProvider = fake;
