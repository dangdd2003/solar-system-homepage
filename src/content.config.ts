import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    tags: z.array(z.string()),
    order: z.number().int().default(100),
    featured: z.boolean().default(false),
    github: z.url().optional(),
    link: z.url().optional()
  })
});

export const collections = { projects };
