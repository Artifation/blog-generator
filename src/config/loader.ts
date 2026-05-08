import { readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { parseTenantConfig, type TenantConfig } from "./tenant.ts";

export async function loadTenant(
  slug: string,
  baseDir: string = "tenants"
): Promise<TenantConfig> {
  const file = path.join(baseDir, slug, "config.yaml");
  const raw = await readFile(file, "utf-8");
  const data = yaml.load(raw);
  return parseTenantConfig(data);
}
