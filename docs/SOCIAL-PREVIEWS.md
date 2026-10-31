# Social link previews

The root layout supplies the page title, description, Open Graph website metadata and a large-image Twitter card for the public site. They use the existing global language resolution: an explicit valid `lang` query wins, otherwise the browser language applies. Invalid or repeated overrides fall back to English. The three message catalogs own the description and image alt text.

Metadata URLs use `https://universe.velrino.co` rather than a deployment hostname or incoming Host header. Open Graph's `./` URL resolves to the current pathname without catalog, camera or other query state. The shared cover is language-neutral and does not advertise catalog counts that can become stale.

## Cover

`web/public/brand/social-preview.png` is a public 1200 × 630 PNG, served directly at `/brand/social-preview.png`. It uses the approved cyan logo, bundled Barlow fonts and an original illustrative planet. Rendering the scene, accepting cookies, signing in and playing audio are not required to retrieve it.

To rebuild it from the checked-in code, install the web dependencies and Playwright Chromium, then run from `web/`:

```sh
node scripts/generate-social-preview.mjs
```

The generator embeds local assets, uses seeded decoration and checks the dimensions, title bounds and a 500 KB size budget. Its small review preview is written to the system temporary directory. The generated PNG is committed, so production serves a static file without running Chromium or the generator.

## Validation and cache

After `npm run build`, run `npx playwright test tests/browser/social-preview.spec.ts --retries=0`. The focused checks inspect real server HTML and public image responses as a browser, Twitterbot, LinkedInBot and Discordbot. They cover both application pages, locale precedence, crawler metadata inside the initial head, image signatures, dimensions and size. Next.js's default crawler-aware metadata handling is retained.

Repeat those requests against the public production origin after deployment. These checks establish that the site provides a usable card; each social platform still controls how and where it displays previews.

Previously cached previews can outlive a deployment. For LinkedIn, use the [Post Inspector](https://www.linkedin.com/post-inspector/) after publishing the fix. LinkedIn documents that refreshing the URL affects new posts, while [existing posts retain their previous preview](https://www.linkedin.com/help/linkedin/answer/a6269011). The application cannot replace cards already attached to published posts.
