import type { BodyId } from "./bodies";

export type InteractionMode = "orbit" | "reading";
export type SectionId = "hero" | "about" | "projects" | "more" | "contact";
export type ActiveBodyOrOverview = BodyId | "overview";

const BODY_TO_SECTION: ReadonlyMap<ActiveBodyOrOverview, SectionId> = new Map<
  ActiveBodyOrOverview,
  SectionId
>([
  ["sun", "about"],
  ["mars", "projects"],
  ["earth", "more"],
  ["saturn", "contact"],
  ["overview", "hero"]
]);

const SECTION_TO_BODY: Record<SectionId, ActiveBodyOrOverview> = {
  hero: "overview",
  about: "sun",
  projects: "mars",
  more: "earth",
  contact: "saturn"
};

const VALID_SECTIONS: ReadonlySet<string> = new Set<string>([
  "hero",
  "about",
  "projects",
  "more",
  "contact"
]);

export function isSectionId(id: string): id is SectionId {
  return VALID_SECTIONS.has(id);
}

export function bodyIdToSectionId(bodyId: ActiveBodyOrOverview): SectionId {
  return BODY_TO_SECTION.get(bodyId) ?? "hero";
}

export function sectionIdToBodyId(sectionId: string): ActiveBodyOrOverview {
  return isSectionId(sectionId) ? SECTION_TO_BODY[sectionId] : "overview";
}

export class ModeController {
  private mode: InteractionMode = "reading";
  private readonly listeners = new Set<(mode: InteractionMode) => void>();

  constructor(initialMode?: InteractionMode | undefined) {
    this.mode = initialMode ?? "reading";
    this.applyMode();
  }

  getMode(): InteractionMode {
    return this.mode;
  }

  setMode(mode: InteractionMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.applyMode();
    this.notify();
  }

  toggle(): InteractionMode {
    const next = this.mode === "orbit" ? "reading" : "orbit";
    this.setMode(next);
    return next;
  }

  subscribe(listener: (mode: InteractionMode) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private applyMode(): void {
    if (typeof document !== "undefined" && document.body) {
      document.body.dataset.mode = this.mode;
    }
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this.mode));
  }
}
