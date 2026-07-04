import { describe, expect, it } from "vitest";
import { postProcessDraftHtml } from "@/pipeline/htmlPostProcess";

describe("postProcessDraftHtml", () => {
  it("strips em-dashes with spaces to comma", () => {
    expect(postProcessDraftHtml("<p>a — b — c</p>")).toBe("<p>a, b, c</p>");
  });

  it("strips em-dashes without spaces to comma-space", () => {
    expect(postProcessDraftHtml("<p>a—b</p>")).toBe("<p>a, b</p>");
  });

  it("strips leading number-dot prefix from h3", () => {
    expect(postProcessDraftHtml("<h3>1. Verwerkersovereenkomst (DPA)</h3>")).toBe(
      "<h3>Verwerkersovereenkomst (DPA)</h3>"
    );
  });

  it("strips leading number-paren prefix from h4", () => {
    expect(postProcessDraftHtml("<h4>2) DPIA</h4>")).toBe("<h4>DPIA</h4>");
  });

  it("preserves h3 without number prefix", () => {
    expect(postProcessDraftHtml("<h3>AVG-checklist</h3>")).toBe("<h3>AVG-checklist</h3>");
  });

  it("preserves number-prefixes on h1 and h2 (auto-TOC werkt daar wel correct)", () => {
    expect(postProcessDraftHtml("<h2>3. De 4 verplichtingen</h2>")).toBe(
      "<h2>3. De 4 verplichtingen</h2>"
    );
  });

  it("flattens <em><strong>X</strong></em> to <strong>X</strong>", () => {
    expect(postProcessDraftHtml("<p>Een <em><strong>Privacy by Design</strong></em> aanpak.</p>")).toBe(
      "<p>Een <strong>Privacy by Design</strong> aanpak.</p>"
    );
  });

  it("flattens <strong><em>X</em></strong> to <strong>X</strong>", () => {
    expect(postProcessDraftHtml("<p><strong><em>DPIA</em></strong> verplicht.</p>")).toBe(
      "<p><strong>DPIA</strong> verplicht.</p>"
    );
  });

  it("converts stray markdown **X** to <strong>X</strong>", () => {
    expect(postProcessDraftHtml("Het principe van **Privacy by Design**.")).toBe(
      "Het principe van <strong>Privacy by Design</strong>."
    );
  });

  it("does not match single asterisks", () => {
    expect(postProcessDraftHtml("a * b * c")).toBe("a * b * c");
  });

  it("composite cleanup: em-dash + h3-prefix + bold-italic in one pass", () => {
    const input = "<h3>1. AVG — kort</h3><p><em><strong>Term</strong></em></p>";
    expect(postProcessDraftHtml(input)).toBe(
      "<h3>AVG, kort</h3><p><strong>Term</strong></p>"
    );
  });

  it("does not turn ** inside a <pre><code> block into <strong>", () => {
    const input = "<pre><code>result = base ** exp ** 2</code></pre>";
    expect(postProcessDraftHtml(input)).toBe(input);
  });

  it("does not turn ** inside inline <code> into <strong>", () => {
    const input = "<p>Gebruik <code>def f(**kwargs)</code> en <code>a ** b</code>.</p>";
    expect(postProcessDraftHtml(input)).toBe(input);
  });

  it("preserves em-dashes inside code blocks (literal source)", () => {
    const input = "<pre><code>const sep = &quot;—&quot;;</code></pre>";
    expect(postProcessDraftHtml(input)).toBe(input);
  });

  it("still transforms text outside a code block while leaving the code intact", () => {
    const input = "<p>Het principe **X** — zie <code>a ** b</code>.</p>";
    expect(postProcessDraftHtml(input)).toBe(
      "<p>Het principe <strong>X</strong>, zie <code>a ** b</code>.</p>"
    );
  });
});
