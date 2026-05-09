import { describe, expect, it } from "vitest";
import { computeDeterministicRubricSignals } from "@/pipeline/rubric";

describe("computeDeterministicRubricSignals", () => {
  it("counts ban-list hits", () => {
    const r = computeDeterministicRubricSignals({
      html: "<p>we leverage AI to delve into things</p>",
      banList: ["leverage", "delve"],
      targetKeyword: "AI",
      internalUrls: [],
    });
    expect(r.banlist_hits).toBe(2);
  });

  it("computes em-dash density", () => {
    const r = computeDeterministicRubricSignals({
      html: "x — y — z. " + "word ".repeat(100),
      banList: [],
      targetKeyword: "x",
      internalUrls: [],
    });
    expect(r.emdash_per_1000_words).toBeGreaterThan(0);
  });

  it("counts internal links", () => {
    const r = computeDeterministicRubricSignals({
      html: '<a href="https://artifation.nl/a">x</a><a href="https://artifation.nl/b">y</a>',
      banList: [],
      targetKeyword: "x",
      internalUrls: ["https://artifation.nl/a", "https://artifation.nl/b"],
    });
    expect(r.internal_link_count).toBe(2);
  });

  it("computes word count + keyword density", () => {
    const r = computeDeterministicRubricSignals({
      html: "<p>" + "AI ".repeat(10) + "word ".repeat(990) + "</p>",
      banList: [],
      targetKeyword: "AI",
      internalUrls: [],
    });
    expect(r.word_count).toBeGreaterThan(900);
    expect(r.keyword_density_pct).toBeGreaterThan(0.5);
    expect(r.keyword_density_pct).toBeLessThan(1.5);
  });

  it("detects Article schema in JSON-LD", () => {
    const html =
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","name":"test"}</script>';
    const r = computeDeterministicRubricSignals({ html, banList: [], targetKeyword: "x", internalUrls: [] });
    expect(r.has_article_schema).toBe(true);
    expect(r.has_breadcrumb_schema).toBe(false);
    expect(r.has_person_schema).toBe(false);
  });

  it("detects BlogPosting as article schema", () => {
    const html =
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","name":"test"}</script>';
    const r = computeDeterministicRubricSignals({ html, banList: [], targetKeyword: "x", internalUrls: [] });
    expect(r.has_article_schema).toBe(true);
  });

  it("detects BreadcrumbList schema in JSON-LD", () => {
    const html =
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>';
    const r = computeDeterministicRubricSignals({ html, banList: [], targetKeyword: "x", internalUrls: [] });
    expect(r.has_breadcrumb_schema).toBe(true);
    expect(r.has_article_schema).toBe(false);
  });

  it("detects Person schema in JSON-LD", () => {
    const html =
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Person","name":"Jan"}</script>';
    const r = computeDeterministicRubricSignals({ html, banList: [], targetKeyword: "x", internalUrls: [] });
    expect(r.has_person_schema).toBe(true);
    expect(r.has_article_schema).toBe(false);
  });

  it("returns false for all schema signals when no JSON-LD present", () => {
    const r = computeDeterministicRubricSignals({
      html: "<p>Gewone tekst zonder schema.</p>",
      banList: [],
      targetKeyword: "x",
      internalUrls: [],
    });
    expect(r.has_article_schema).toBe(false);
    expect(r.has_breadcrumb_schema).toBe(false);
    expect(r.has_person_schema).toBe(false);
  });
});
