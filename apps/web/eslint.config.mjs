import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "drizzle/**"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Literal quotes/apostrophes in JSX text are fine — React escapes them.
      // For a Dutch content app this rule is pure noise (325 hits, all false).
      "react/no-unescaped-entities": "off",
      // Allow intentionally-unused bindings prefixed with `_` (the repo's
      // convention for "declared but deliberately not read", e.g. _brandVoice).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default eslintConfig;
