import { readdir, readFile, writeFile } from "node:fs/promises";

/** Build-only resource hint; never imports or executes the scene. */
export default function scenePreload() {
  let config;
  let bootFile;
  return {
    name: "scene-preload",
    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [
              {
                name: "scene-preload-chunk",
                apply: "build",
                async generateBundle(_options, bundle) {
                  if (this.environment.name !== "client") return;
                  const chunks = Object.values(bundle).filter((entry) => entry.type === "chunk");
                  bootFile = chunks.find((chunk) =>
                    chunk.facadeModuleId
                      ?.replaceAll("\\", "/")
                      .endsWith("/src/scripts/solar-system-boot.ts")
                  )?.fileName;
                  // Opt-in metadata for reproducible bundle audits, outside published assets.
                  if (process.env.SCENE_BUNDLE_AUDIT) {
                    await writeFile(
                      process.env.SCENE_BUNDLE_AUDIT,
                      JSON.stringify(
                        chunks.map((chunk) => ({
                          fileName: chunk.fileName,
                          bytes: Buffer.byteLength(chunk.code),
                          modules: chunk.modules
                        })),
                        null,
                        2
                      )
                    );
                  }
                }
              }
            ]
          }
        });
      },
      "astro:config:done": ({ config: resolved }) => {
        config = resolved;
      },
      "astro:build:start": () => {
        bootFile = undefined;
      },
      "astro:build:generated": async ({ dir }) => {
        if (!bootFile) return;
        const assetsPrefix = config.build.assetsPrefix;
        const prefix =
          typeof assetsPrefix === "string"
            ? assetsPrefix
            : (assetsPrefix?.js ?? assetsPrefix?.fallback);
        const href = `${(prefix || config.base).replace(/\/$/, "")}/${bootFile}`;
        const escapedHref = href.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
        const link = `<link rel="modulepreload" href="${escapedHref}" crossorigin>`;
        async function inject(directory) {
          for (const entry of await readdir(directory, { withFileTypes: true })) {
            const file = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
            if (entry.isDirectory()) await inject(file);
            else if (entry.name.endsWith(".html")) {
              const html = await readFile(file, "utf8");
              if (!/<canvas\b[^>]*\bid=["']solar-canvas["']/i.test(html)) continue;
              const alreadyPreloaded = [...html.matchAll(/<link\b[^>]*>/gi)].some(
                ([tag]) =>
                  /\brel=["']modulepreload["']/i.test(tag) &&
                  (tag.includes(`href="${escapedHref}"`) || tag.includes(`href='${escapedHref}'`))
              );
              if (alreadyPreloaded) continue;
              const updated = html.replace(/<head\b[^>]*>/i, `$&${link}`);
              if (updated !== html) await writeFile(file, updated);
            }
          }
        }
        await inject(dir);
      }
    }
  };
}
