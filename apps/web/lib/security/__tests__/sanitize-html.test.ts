import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeContentHtml } from "../sanitize-html";

test("strips <script> tags and their contents", () => {
  const out = sanitizeContentHtml('<p>hi</p><script>alert(document.cookie)</script>');
  assert.equal(out.includes("<script"), false);
  assert.equal(out.includes("alert("), false);
  assert.ok(out.includes("<p>hi</p>"));
});

test("strips event-handler attributes", () => {
  const out = sanitizeContentHtml('<img src="https://x/y.png" onerror="alert(1)">');
  assert.equal(out.toLowerCase().includes("onerror"), false);
  assert.ok(out.includes("https://x/y.png"));
});

test("drops javascript: URLs on links", () => {
  const out = sanitizeContentHtml('<a href="javascript:alert(1)">x</a>');
  assert.equal(out.toLowerCase().includes("javascript:"), false);
});

test("removes iframes / objects / embeds", () => {
  const out = sanitizeContentHtml('<iframe src="https://evil"></iframe><object data="x"></object><embed src="x">');
  assert.equal(out.includes("<iframe"), false);
  assert.equal(out.includes("<object"), false);
  assert.equal(out.includes("<embed"), false);
});

test("keeps normal blog formatting", () => {
  const html =
    '<h2>Title</h2><p>Some <strong>bold</strong> and <a href="https://example.com">link</a>.</p>' +
    '<ul><li>one</li><li>two</li></ul><blockquote>quote</blockquote>' +
    '<img src="https://cdn/x.jpg" alt="x">';
  const out = sanitizeContentHtml(html);
  assert.ok(out.includes("<h2>Title</h2>"));
  assert.ok(out.includes("<strong>bold</strong>"));
  assert.ok(out.includes('href="https://example.com"'));
  assert.ok(out.includes("<li>one</li>"));
  assert.ok(out.includes("<blockquote>quote</blockquote>"));
  assert.ok(out.includes('alt="x"'));
});

test("adds rel=noopener to target=_blank links", () => {
  const out = sanitizeContentHtml('<a href="https://x" target="_blank">x</a>');
  assert.ok(out.includes('rel="noopener noreferrer"'));
});

test("handles empty / nullish input", () => {
  assert.equal(sanitizeContentHtml(""), "");
  assert.equal(sanitizeContentHtml(null), "");
  assert.equal(sanitizeContentHtml(undefined), "");
});
