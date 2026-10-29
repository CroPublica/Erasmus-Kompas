// @ts-check
import { defineConfig } from 'astro/config';

// Where the site is served from. Defaults suit a site at the root of its own domain; set SITE_URL / SITE_BASE for
// a sub-path (e.g. SITE_BASE=/atlas when it lives at https://example.org/atlas/).
const base = process.env.SITE_BASE || '/';
export default defineConfig({
  site: process.env.SITE_URL || undefined,
  base,
  trailingSlash: 'always',
  build: { format: 'directory' },
});
