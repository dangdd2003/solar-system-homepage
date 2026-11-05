// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://www.dangdd.dev",
  server: {
    host: "0.0.0.0",
    // Hosting platforms assign the port via PORT; Astro's default 4321 otherwise
    port: Number(process.env.PORT) || 4321,
    // Applies to both `astro dev` and `astro preview`; vite.server.allowedHosts covers dev only
    allowedHosts: true
  },
  devToolbar: {
    enabled: false
  }
});
