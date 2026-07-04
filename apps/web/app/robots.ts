import type { MetadataRoute } from "next";

/**
 * Allow crawling of the public blog, keep the authenticated admin app out of
 * search indexes. Per-site sitemaps live at /blog/<siteSlug>/sitemap.xml.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/blog/"],
        disallow: [
          "/api/",
          "/dashboard",
          "/drafts",
          "/published",
          "/topics",
          "/runs",
          "/costs",
          "/refreshes",
          "/errors",
          "/audit",
          "/account",
          "/settings",
          "/onboarding",
          "/activate",
          "/login",
          "/wiki",
        ],
      },
    ],
  };
}
