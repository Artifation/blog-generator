import { getDb, ensureSchema } from "../lib/db/client";
import { sites, topics, drafts, publishedPosts, users } from "../lib/db/schema";

await ensureSchema();
const db = getDb();

const s = await db.select().from(sites);
console.log(`sites: ${s.length}`);
for (const x of s) console.log(`  ${x.slug} (${x.id}) ${x.name} / ${x.domain}`);

const u = await db.select().from(users);
console.log(`\nusers: ${u.length}`);
for (const x of u) console.log(`  ${x.email} role=${x.role} site=${x.siteId}`);

const t = await db.select().from(topics);
console.log(`\ntopics: ${t.length}`);
const byStatus: Record<string, number> = {};
for (const x of t) byStatus[x.status] = (byStatus[x.status] ?? 0) + 1;
console.log(`  by status: ${JSON.stringify(byStatus)}`);

const d = await db.select().from(drafts);
console.log(`\ndrafts: ${d.length}`);
const dByStatus: Record<string, number> = {};
for (const x of d) dByStatus[x.status] = (dByStatus[x.status] ?? 0) + 1;
console.log(`  by status: ${JSON.stringify(dByStatus)}`);

const p = await db.select().from(publishedPosts);
console.log(`\npublished posts: ${p.length}`);
