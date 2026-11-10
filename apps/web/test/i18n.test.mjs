import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  directionFor,
  intlLocale,
  interpolate,
  isRtl,
  normalizeLanguage,
} from "../src/lib/i18n-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const localesDir = resolve(here, "../src/lib/locales");

function load(language) {
  return JSON.parse(readFileSync(resolve(localesDir, `${language}.json`), "utf8"));
}

const dictionaries = Object.fromEntries(SUPPORTED_LANGUAGES.map((language) => [language, load(language)]));
const englishKeys = Object.keys(dictionaries.en).sort();

const placeholders = (value) =>
  [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort();

test("every supported language has the exact same key set", () => {
  for (const language of SUPPORTED_LANGUAGES) {
    assert.deepEqual(Object.keys(dictionaries[language]).sort(), englishKeys, `${language} key parity`);
  }
});

test("no dictionary value is empty", () => {
  for (const language of SUPPORTED_LANGUAGES) {
    for (const [key, value] of Object.entries(dictionaries[language])) {
      assert.equal(typeof value, "string", `${language} ${key} is a string`);
      assert.ok(value.trim().length > 0, `${language} ${key} is not empty`);
    }
  }
});

test("placeholders match the English source for every translation", () => {
  for (const key of englishKeys) {
    const expected = placeholders(dictionaries.en[key]);
    for (const language of SUPPORTED_LANGUAGES) {
      assert.deepEqual(placeholders(dictionaries[language][key]), expected, `${language} placeholders for ${JSON.stringify(key)}`);
    }
  }
});

test("Arabic, German, French and English cover the core navigation and auth vocabulary", () => {
  const required = [
    "Dashboard",
    "Inventory",
    "CRM",
    "Sales",
    "Sign in",
    "Sign out",
    "Roles & permissions",
    "Company settings",
    "Notifications",
    "Search",
    "Interface language",
    "Refresh",
    "Cancel",
    "Save",
  ];
  for (const key of required) {
    assert.ok(key in dictionaries.en, `en has ${key}`);
    for (const language of SUPPORTED_LANGUAGES) {
      assert.ok(key in dictionaries[language], `${language} has ${key}`);
    }
  }
  assert.notEqual(dictionaries.ar.Dashboard, dictionaries.en.Dashboard);
  assert.notEqual(dictionaries.fr.Dashboard, dictionaries.en.Dashboard);
  assert.notEqual(dictionaries.de["Sign in"], dictionaries.en["Sign in"]);
  assert.notEqual(dictionaries.ar["Sign in"], dictionaries.en["Sign in"]);
});

test("normalizeLanguage resolves locales and unknown values to English", () => {
  assert.equal(normalizeLanguage("ar"), "ar");
  assert.equal(normalizeLanguage("ar-MA"), "ar");
  assert.equal(normalizeLanguage("DE-de"), "de");
  assert.equal(normalizeLanguage("fr-FR"), "fr");
  assert.equal(normalizeLanguage("es"), DEFAULT_LANGUAGE);
  assert.equal(normalizeLanguage(null), DEFAULT_LANGUAGE);
  assert.equal(normalizeLanguage(""), DEFAULT_LANGUAGE);
});

test("isRtl/directionFor only mark Arabic as right-to-left", () => {
  assert.equal(isRtl("ar"), true);
  assert.equal(isRtl("ar-MA"), true);
  assert.equal(isRtl("en"), false);
  assert.equal(isRtl("fr"), false);
  assert.equal(isRtl("de"), false);
  assert.equal(directionFor("ar"), "rtl");
  assert.equal(directionFor("de"), "ltr");
  assert.equal(directionFor("fr"), "ltr");
});

test("intlLocale returns a usable BCP-47 tag per language", () => {
  assert.equal(intlLocale("en"), "en-GB");
  assert.equal(intlLocale("fr"), "fr-MA");
  assert.equal(intlLocale("ar"), "ar-MA");
  assert.equal(intlLocale("de"), "de-DE");
});

test("interpolate replaces named placeholders and leaves unknown ones intact", () => {
  assert.equal(interpolate("Hello {name}", { name: "Sara" }), "Hello Sara");
  assert.equal(interpolate("{count} items", { count: 3 }), "3 items");
  assert.equal(interpolate("Keep {missing}", {}), "Keep {missing}");
});
