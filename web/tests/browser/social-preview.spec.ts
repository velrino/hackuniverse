import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import type { Locale } from "../../src/i18n/config";
import { messages } from "../../src/i18n/messages";

const publicOrigin = "https://universe.velrino.co";
const imagePath = "/brand/social-preview.png";
const userAgents = {
  browser: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  twitter: "Twitterbot/1.0",
  linkedin: "LinkedInBot/1.0 (+http://www.linkedin.com)",
  discord: "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
};

function decodeHtml(value: string) {
  const entities: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (entity, key: string) => {
    if (key.startsWith("#")) {
      const hexadecimal = key.slice(0, 2).toLowerCase() === "#x";
      return String.fromCodePoint(Number.parseInt(key.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10));
    }
    return entities[key.toLowerCase()] ?? entity;
  });
}

function metaValues(html: string, key: string) {
  const values: string[] = [];
  for (const [tag] of html.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const attributes = Object.fromEntries(
      Array.from(tag.matchAll(/\b(name|property|content)\s*=\s*(["'])(.*?)\2/gi), ([, name, , value]) => [name.toLowerCase(), decodeHtml(value)]),
    );
    if ((attributes.name ?? attributes.property) === key) values.push(attributes.content);
  }
  return values;
}

function expectMetadata(html: string, locale: Locale, pathname: string) {
  const { pageTitle, pageDescription, socialImageAlt } = messages[locale].common;
  expect(decodeHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""), "document title").toBe(pageTitle);
  expect(metaValues(html, "og:url").map((url) => new URL(url).href), "og:url").toEqual([new URL(pathname, publicOrigin).href]);
  const expected: Record<string, string> = {
    description: pageDescription,
    "og:title": pageTitle,
    "og:description": pageDescription,
    "og:type": "website",
    "og:site_name": "HackUniverse",
    "og:locale": { en: "en_US", "pt-BR": "pt_BR", fil: "fil_PH" }[locale],
    "og:image": `${publicOrigin}${imagePath}`,
    "og:image:type": "image/png",
    "og:image:width": "1200",
    "og:image:height": "630",
    "og:image:alt": socialImageAlt,
    "twitter:card": "summary_large_image",
    "twitter:title": pageTitle,
    "twitter:description": pageDescription,
    "twitter:image": `${publicOrigin}${imagePath}`,
    "twitter:image:alt": socialImageAlt,
  };
  for (const [key, value] of Object.entries(expected)) {
    expect(metaValues(html, key), key).toEqual([value]);
  }
}

test("social metadata reaches browsers and preview crawlers with the global locale rules", async ({ request }) => {
  const cases: { agent: keyof typeof userAgents; query?: string; language?: string; locale: Locale }[] = [
    { agent: "browser", query: "lang=en", language: "fil-PH", locale: "en" },
    { agent: "twitter", query: "lang=pt-BR", language: "fil-PH", locale: "pt-BR" },
    { agent: "linkedin", query: "lang=fil", language: "pt-BR", locale: "fil" },
    { agent: "discord", locale: "en" },
    { agent: "browser", language: "tl-PH,fil;q=0.9,en;q=0.8", locale: "fil" },
    { agent: "browser", query: "lang=invalid", language: "fil-PH", locale: "en" },
    { agent: "browser", query: "lang=fil&lang=pt-BR", language: "fil-PH", locale: "en" },
    { agent: "browser", query: "lang=", language: "pt-BR", locale: "en" },
  ];

  for (const pathname of ["/", "/example"]) {
    for (const entry of cases) {
      await test.step(`${entry.agent} ${pathname} ${entry.query ?? entry.language ?? "default"}`, async () => {
        const headers: Record<string, string> = { "User-Agent": userAgents[entry.agent] };
        if (entry.language) headers["Accept-Language"] = entry.language;
        const response = await request.get(`${pathname}${entry.query === undefined ? "" : `?${entry.query}`}`, { headers, maxRedirects: 0 });
        expect(response.status()).toBe(200);
        expect(response.headers()["content-type"]).toContain("text/html");
        const html = await response.text();
        expect(html).toMatch(new RegExp(`<html\\b[^>]*\\blang="${entry.locale}"`));
        expectMetadata(html, entry.locale, pathname);
        if (entry.agent !== "browser") {
          const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
          expect(head, "crawler metadata must be delivered in the initial head").toBeDefined();
          expectMetadata(head!, entry.locale, pathname);
        }
      });
    }
  }
});

test("the advertised social cover is a public PNG with the declared dimensions", async ({ request }) => {
  for (const userAgent of Object.values(userAgents)) {
    const headers = { "User-Agent": userAgent };
    const page = await request.get("/?lang=en", { headers, maxRedirects: 0 });
    expect(page.status()).toBe(200);
    const urls = metaValues(await page.text(), "og:image");
    expect(urls).toEqual([`${publicOrigin}${imagePath}`]);
    const url = new URL(urls[0]);
    // Keep metadata production-canonical while fetching the image from the
    // configured server, so a local build cannot pass using an older live image.
    const response = await request.get(`${url.pathname}${url.search}`, { headers, maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]?.split(";")[0]).toBe("image/png");
    const bytes = await response.body();
    expect(bytes.length).toBeGreaterThan(33);
    expect(bytes.length).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
  }
});
