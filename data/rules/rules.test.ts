import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PLATFORM_CATEGORIES, RuleFile } from "../../src/lib/contracts/schemas";

const here = dirname(fileURLToPath(import.meta.url));

const PLATFORM_FILES = ["youtube.json", "tiktok.json", "facebook.json"] as const;
const ALL_FILES = [...PLATFORM_FILES, "copyright.json", "legal_id.json"] as const;

const COPYRIGHT_IDS = [
  "musik_komersial",
  "klip_pihak_ketiga",
  "watermark_platform_lain",
  "logo_merek_dominan",
  "stok_berlisensi",
  "reupload_tanpa_transformasi",
  "teks_lirik_berhak_cipta",
] as const;

const LEGAL_IDS = [
  "hoaks",
  "ujaran_kebencian_sara",
  "pencemaran_nama_baik",
  "kesusilaan_pornografi",
  "judi_online",
  "provokasi_kekerasan_terorisme",
  "klaim_menyesatkan_produk_investasi",
  "privasi_data_pribadi",
  "endorsement_tanpa_pengungkapan",
] as const;

const BANNED = ["pasti bebas", "pasti melanggar", "aman secara hukum", "guaranteed copyright-free", "definitely violates", "legally safe"] as const;

function loadRaw(file: string): string {
  return readFileSync(join(here, file), "utf-8");
}

function loadParsed(file: string) {
  return RuleFile.parse(JSON.parse(loadRaw(file)));
}

describe("rule files parse against RuleFile", () => {
  it.each(ALL_FILES)("%s parses with locked version and official source", (file) => {
    const parsed = loadParsed(file);
    expect(parsed.version).toBe("2026-10-30.1");
    expect(parsed.updated_at).toBe("2026-10-30");
    expect(parsed.source.length).toBeGreaterThan(0);
    expect(parsed.source).toContain("http");
    expect(parsed.rules.length).toBeGreaterThan(0);
    const ids = parsed.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of parsed.rules) {
      expect(rule.guidance.length).toBeGreaterThan(0);
    }
  });
});

describe("platform coverage", () => {
  it.each(PLATFORM_FILES)("%s covers all 12 platform categories", (file) => {
    const parsed = loadParsed(file);
    const categories = new Set(parsed.rules.map((r) => r.category));
    for (const slug of PLATFORM_CATEGORIES) {
      expect(categories.has(slug), `${file} missing category ${slug}`).toBe(true);
    }
    for (const rule of parsed.rules) {
      expect(rule.consequence, `${file}:${rule.id} missing consequence`).toBeTruthy();
    }
  });

  it("youtube consequences use strike/monetization wording", () => {
    const parsed = loadParsed("youtube.json");
    const text = parsed.rules.map((r) => r.consequence ?? "").join(" ").toLowerCase();
    expect(/strike|demonetization|limited ads/i.test(text)).toBe(true);
  });

  it("tiktok consequences use For You / removal wording", () => {
    const parsed = loadParsed("tiktok.json");
    const text = parsed.rules.map((r) => r.consequence ?? "").join(" ");
    expect(/For You|removal/i.test(text)).toBe(true);
  });

  it("facebook consequences use distribution / Page monetization wording (English)", () => {
    const parsed = loadParsed("facebook.json");
    const text = parsed.rules.map((r) => r.consequence ?? "").join(" ").toLowerCase();
    expect(/distribution|demonetization/i.test(text)).toBe(true);
  });
});

describe("copyright and legal coverage", () => {
  it("copyright.json covers its 7 parameter ids", () => {
    const parsed = loadParsed("copyright.json");
    const ids = new Set(parsed.rules.map((r) => r.id));
    const categories = new Set(parsed.rules.map((r) => r.category));
    for (const id of COPYRIGHT_IDS) {
      expect(ids.has(id), `copyright missing id ${id}`).toBe(true);
      expect(categories.has(id), `copyright missing category ${id}`).toBe(true);
    }
  });

  it("legal_id.json covers its 9 theme ids", () => {
    const parsed = loadParsed("legal_id.json");
    const ids = new Set(parsed.rules.map((r) => r.id));
    const categories = new Set(parsed.rules.map((r) => r.category));
    for (const id of LEGAL_IDS) {
      expect(ids.has(id), `legal missing id ${id}`).toBe(true);
      expect(categories.has(id), `legal missing category ${id}`).toBe(true);
    }
  });
});

describe("honesty guards", () => {
  it.each(ALL_FILES)("%s has no banned certainty wording and no article numbers", (file) => {
    const raw = loadRaw(file);
    const lower = raw.toLowerCase();
    for (const banned of BANNED) {
      expect(lower.includes(banned), `${file} contains banned wording`).toBe(false);
    }
    expect(/Pasal\s+\d+/i.test(raw), `${file} contains an article number`).toBe(false);
  });
});
