import assert from "node:assert/strict";
import test from "node:test";
import { localeFromAcceptLanguage, localeFromLanguages, localeFromSearchParams, withLocale } from "./config";

test("browser language tags match supported families and Tagalog aliases", () => {
  for (const tag of ["fil", "fil-PH", "tl", "tl-PH", "FIL-ph"]) assert.equal(localeFromLanguages([tag]), "fil");
  for (const tag of ["pt", "pt-BR", "pt-PT"]) assert.equal(localeFromLanguages([tag]), "pt-BR");
  assert.equal(localeFromLanguages(["de-DE", "en-GB", "fil"]), "en");
  assert.equal(localeFromLanguages(["fr-FR", "tl-PH", "en"]), "fil");
  assert.equal(localeFromLanguages(["pt--BR", "ja-JP"]), "en");
  assert.equal(localeFromLanguages([]), "en");
});

test("Accept-Language respects quality, preference order, exclusions and unsupported tags", () => {
  assert.equal(localeFromAcceptLanguage("en;q=0.4,fil-PH;q=0.9,pt-BR;q=0.8"), "fil");
  assert.equal(localeFromAcceptLanguage("de;q=1,fil;q=0.7,en;q=0.8"), "en");
  assert.equal(localeFromAcceptLanguage("pt-PT,fil-PH"), "pt-BR");
  assert.equal(localeFromAcceptLanguage("fil;q=0,pt;q=0.5,en;q=0.2"), "pt-BR");
  assert.equal(localeFromAcceptLanguage("fil;q=NaN,pt;q=2,tl;q=-1,en;q=0.5"), "en");
  assert.equal(localeFromAcceptLanguage(" FIL-ph ; Q=0.8, en;q=0.4 "), "fil");
  assert.equal(localeFromAcceptLanguage("fr-FR,*;q=0.5"), "en");
  assert.equal(localeFromAcceptLanguage(null), "en");
});

test("one explicit canonical query overrides browser detection on any pathname", () => {
  assert.equal(localeFromSearchParams(new URLSearchParams(), "fil"), "fil");
  assert.equal(localeFromSearchParams(new URLSearchParams("lang=en"), "fil"), "en");
  assert.equal(localeFromSearchParams(new URLSearchParams("lang=fil"), "pt-BR"), "fil");
  for (const query of ["lang=", "lang=unknown", "lang=tl", "lang=fil-PH", "lang=fil&lang=en", "lang=fil&lang=fil"]) {
    assert.equal(localeFromSearchParams(new URLSearchParams(query), "fil"), "en");
  }
});

test("locale links preserve page, other query values and hash without crossing origins", () => {
  assert.equal(withLocale("/example?tag=a&tag=b&lang=en#note", "fil"), "/example?tag=a&tag=b&lang=fil#note");
  for (const href of ["https://other.example/page", "//other.example/page", "#note", "/\\other.example/page"]) {
    assert.equal(withLocale(href, "fil"), href);
  }
});
