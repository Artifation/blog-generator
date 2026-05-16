import { redirect } from "next/navigation";
import { getCurrentSite } from "~/lib/auth";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const site = await getCurrentSite();
  redirect(site ? "/dashboard" : "/login");
}
