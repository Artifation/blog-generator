import { test } from "node:test";
import assert from "node:assert/strict";
import { roleAtLeast } from "../roles";

test("roleAtLeast respects the owner > editor > viewer hierarchy", () => {
  // owner satisfies everything
  assert.ok(roleAtLeast("owner", "owner"));
  assert.ok(roleAtLeast("owner", "editor"));
  assert.ok(roleAtLeast("owner", "viewer"));

  // editor satisfies editor/viewer but not owner
  assert.ok(!roleAtLeast("editor", "owner"));
  assert.ok(roleAtLeast("editor", "editor"));
  assert.ok(roleAtLeast("editor", "viewer"));

  // viewer satisfies only viewer
  assert.ok(!roleAtLeast("viewer", "owner"));
  assert.ok(!roleAtLeast("viewer", "editor"));
  assert.ok(roleAtLeast("viewer", "viewer"));
});

test("roleAtLeast rejects unknown / missing roles", () => {
  assert.ok(!roleAtLeast(undefined, "viewer"));
  assert.ok(!roleAtLeast("", "viewer"));
  assert.ok(!roleAtLeast("superadmin", "viewer"));
});
