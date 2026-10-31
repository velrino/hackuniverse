# Application localization

The interface supports English (`en`), Brazilian Portuguese (`pt-BR`) and Filipino (`fil`). This applies to all application routes, menus, dialogs, startup, audio, identity preview, workspace tools, errors and metadata. Imported website text and astronomical catalog content keep their original language.

## Language selection

A single supported `lang` query value overrides browser preferences on any page: `/?lang=fil`, `/example?lang=pt-BR` and any future route use the same contract. Without `lang`, negotiate `Accept-Language` in descending quality order, preserving the listed order for ties and ignoring disabled or unsupported ranges. Filipino and legacy Tagalog tags (`fil`, `fil-PH`, `tl`, `tl-PH`) select Filipino; Portuguese and English regional tags select their supported language. Unsupported browser preferences fall back to English. An explicit empty, invalid or repeated `lang` also resolves to English, retaining deterministic handling of ambiguous URLs.

No locale path prefixes, cookies or stored language override are used. Both language selectors display one full-width option per row. Manual selection uses the native history API to replace only `lang`; pathname, other query parameters and hash survive without document reload, server navigation, application remount or loss of input. Internal `LocalizedLink` navigation carries the active language. Browser Back/Forward and direct query changes use the same public i18n API.

## Server and client

`src/proxy.ts` resolves the query and browser preferences before rendering, overwriting the internal locale request header. The root layout reads the result for document language and metadata, and supplies the separately detected browser fallback to `I18nProvider`. The provider observes the query in place and uses that fallback only when `lang` is absent. This keeps hydration consistent and allows removing an override to recover the original browser language.

The runtime error boundary can recover the language from the query and browser without depending on a working provider. `/design` negotiates the same language before redirecting to the external documentation site. External sites own their available translations; the application forwards its language without translating their content.

## Messages and checks

English defines the message shape. Every supported locale provides all namespaces and module-owned catalogs, with identical keys and interpolation tokens. Locale-keyed lookups use the public `Locale` type; adding a locale must include startup, identity, audio, workspace, errors, metadata and telemetry's URL allowlist.

Run `npm run test:i18n`, `npm run test:telemetry`, `npm run lint`, `npm run build` and `npm run test:browser`. The focused `tests/browser/i18n.spec.ts` checks request negotiation and SSR, all three language options, desktop/mobile rows, query priority, input/canvas preservation, history and documentation redirects.
