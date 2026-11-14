import { readdir, readFile, writeFile } from "node:fs/promises";

/** Build-only resource hint; never imports or executes the scene. */
export default function scenePreload() {
  let config;
  let bootFiles = [];
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
                  const bootChunk = chunks.find((chunk) =>
                    chunk.facadeModuleId
                      ?.replaceAll("\\", "/")
                      .endsWith("/src/scripts/solar-system-boot.ts")
                  );
                  if (bootChunk) {
                    const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
                    const visited = new Set();
                    const queue = [bootChunk];
                    while (queue.length > 0) {
                      const chunk = queue.shift();
                      if (visited.has(chunk.fileName)) continue;
                      visited.add(chunk.fileName);
                      for (const imp of chunk.imports ?? []) {
                        const target = byFile.get(imp);
                        if (target?.type === "chunk" && !visited.has(target.fileName)) {
                          queue.push(target);
                        }
                      }
                    }
                    bootFiles = [...visited];
                  } else {
                    bootFiles = [];
                  }
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
        bootFiles = [];
      },
      "astro:build:generated": async ({ dir }) => {
        if (bootFiles.length === 0) return;
        const assetsPrefix = config.build.assetsPrefix;
        const prefix =
          typeof assetsPrefix === "string"
            ? assetsPrefix
            : (assetsPrefix?.js ?? assetsPrefix?.fallback);
        const base = (prefix || config.base).replace(/\/$/, "");
        const links = bootFiles.map((file) => {
          const href = `${base}/${file}`;
          const escapedHref = href.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
          return {
            escapedHref,
            tag: `<link rel="modulepreload" href="${escapedHref}" crossorigin>`
          };
        });
        async function inject(directory) {
          const entries = await readdir(directory, { withFileTypes: true });
          await Promise.all(
            entries.map(async (entry) => {
              const file = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
              if (entry.isDirectory()) {
                await inject(file);
              } else if (entry.name.endsWith(".html")) {
                const html = await readFile(file, "utf8");
                if (!/<canvas\b[^>]*\bid=["']solar-canvas["']/i.test(html)) return;
                const existingTags = [...html.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => tag);
                const missing = links
                  .filter(
                    ({ escapedHref }) =>
                      !existingTags.some(
                        (tag) =>
                          /\brel=["']modulepreload["']/i.test(tag) &&
                          (tag.includes(`href="${escapedHref}"`) ||
                            tag.includes(`href='${escapedHref}'`))
                      )
                  )
                  .map(({ tag }) => tag)
                  .join("");
                if (!missing) return;
                // Before </head>, not after <head>: the stylesheet links Astro emits come first.
                const updated = html.replace(/<\/head>/i, `${missing}$&`);
                if (updated !== html) await writeFile(file, updated);
              }
            })
          );
        }
        await inject(dir);
      }
    }
  };
}
