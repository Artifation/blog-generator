/**
 * Smoke tests for the markdown publish adapter. Verifies frontmatter shape +
 * HTML→Markdown conversion + file write side-effect.
 *
 * Runs against a per-test tmpdir so we don't litter the repo's data/exports.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import "../../__tests__/helpers/db"; // sets APP_ENCRYPTION_KEY (not strictly
// needed for markdown but keeps env consistent across the suite)

import { exportDraftAsMarkdown } from "../markdown";
import type { Draft, Site } from "../../db/schema";

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "blog-md-test-"));
const PREV_CWD = process.cwd();

before(() => {
  // The exporter resolves `../../data/exports/<site.slug>` relative to cwd.
  // We chdir into a nested tmp so the final write lands in TMP_DIR.
  const nested = path.join(TMP_DIR, "apps", "web");
  fs.mkdirSync(nested, { recursive: true });
  process.chdir(nested);
});

after(() => {
  process.chdir(PREV_CWD);
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function fakeDraft(over: Partial<Draft> = {}): Draft {
  return {
    id: "draft_test",
    siteId: "site_test",
    topicId: null,
    runId: null,
    status: "pending_review",
    title: "Hello World",
    slug: "hello-world",
    contentHtml:
      '<h1>Hello</h1><p>This is a <strong>test</strong> of the markdown export with a <a href="https://example.com">link</a>.</p><ul><li>one</li><li>two</li></ul>',
    metaTitle: "Hello World – Meta",
    metaDescription: "A short description.",
    tldr: "A short TLDR.",
    imagePath: "/img/hero.jpg",
    imageAlt: null,
    rubricScores: null,
    weightedTotal: null,
    hardFails: [],
    costUsd: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    reviewedAt: null,
    ...over,
  } as Draft;
}

function fakeSite(over: Partial<Site> = {}): Site {
  return {
    id: "site_test",
    slug: "test-site",
    name: "Test Site",
    domain: "example.com",
    language: "en-US",
    brandVoice: "",
    banList: [],
    signaturePhrases: [],
    readingLevelMin: 50,
    readingLevelMax: 70,
    qualityThreshold: 8,
    maxPostsPerWeek: 2,
    scheduleCron: "0 6 * * 1,3,5",
    autoPublish: false,
    publishDestination: "markdown",
    wordpressConfig: null,
    emailConfig: { enabled: false },
    author: { name: "Alice Test" },
    organization: {},
    apiKeys: {},
    features: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  } as Site;
}

test("exportDraftAsMarkdown writes a file with frontmatter + non-empty body", async () => {
  const draft = fakeDraft();
  const site = fakeSite();
  const relPath = await exportDraftAsMarkdown(draft, site);
  assert.ok(relPath.endsWith("hello-world.md"), `unexpected path: ${relPath}`);

  // The exporter returns a path relative to <cwd>/../../, so resolve from cwd.
  const absPath = path.resolve(process.cwd(), "../..", relPath);
  assert.ok(fs.existsSync(absPath), `output file should exist at ${absPath}`);
  const content = fs.readFileSync(absPath, "utf8");

  // Frontmatter sanity
  assert.match(content, /^---\n/);
  assert.match(content, /title: "Hello World"/);
  assert.match(content, /slug: "hello-world"/);
  assert.match(content, /description: "A short description\."/);
  assert.match(content, /tldr: "A short TLDR\."/);
  assert.match(content, /author: "Alice Test"/);
  assert.match(content, /image: "\/img\/hero\.jpg"/);

  // Body conversion sanity
  const body = content.split(/\n---\n/)[1] ?? "";
  assert.ok(body.length > 0, "body should not be empty");
  assert.match(body, /^# Hello/m);
  assert.match(body, /\*\*test\*\*/);
  assert.match(body, /\[link\]\(https:\/\/example\.com\)/);
  assert.match(body, /^- one$/m);
  assert.match(body, /^- two$/m);
});

test("exportDraftAsMarkdown converts code to fenced/inline markdown and decodes entities", async () => {
  const draft = fakeDraft({
    slug: "code-post",
    contentHtml:
      "<p>Voorbeeld:</p><pre><code>const x = a ** b; // Array&lt;int&gt;</code></pre><p>Inline <code>a &lt; b</code>.</p>",
  });
  const site = fakeSite();
  const relPath = await exportDraftAsMarkdown(draft, site);
  const absPath = path.resolve(process.cwd(), "../..", relPath);
  const content = fs.readFileSync(absPath, "utf8");
  const body = content.split(/\n---\n/)[1] ?? "";
  // Fenced block with contents intact and entities decoded to literals.
  assert.match(body, /```\nconst x = a \*\* b; \/\/ Array<int>\n```/);
  // Inline code stays inline, entity decoded.
  assert.match(body, /`a < b`/);
});

test("exportDraftAsMarkdown falls back to tldr when metaDescription is empty", async () => {
  const draft = fakeDraft({
    slug: "no-meta-desc",
    metaDescription: "",
    tldr: "Fallback description",
  });
  const site = fakeSite();
  const relPath = await exportDraftAsMarkdown(draft, site);
  const absPath = path.resolve(process.cwd(), "../..", relPath);
  const content = fs.readFileSync(absPath, "utf8");
  assert.match(content, /description: "Fallback description"/);
});

test("exportDraftAsMarkdown escapes double quotes in title", async () => {
  const draft = fakeDraft({
    slug: "quote-title",
    title: 'A title with "quotes" in it',
  });
  const site = fakeSite();
  const relPath = await exportDraftAsMarkdown(draft, site);
  const absPath = path.resolve(process.cwd(), "../..", relPath);
  const content = fs.readFileSync(absPath, "utf8");
  assert.match(content, /title: "A title with \\"quotes\\" in it"/);
});
