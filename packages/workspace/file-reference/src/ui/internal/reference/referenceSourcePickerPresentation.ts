import type { ReferenceNode } from "../../../contracts/referenceSource.ts";

export interface ReferencePreviewDateTimeFormatOptions {
  locale?: string;
  timeZone?: string;
}

export function formatHierarchyTitle(
  hierarchy: readonly ReferenceNode[]
): string | null {
  if (hierarchy.length === 0) {
    return null;
  }
  return hierarchy.map((crumb) => crumb.displayName).join(" / ");
}

export function formatReferencePreviewDateTime(
  ms: number,
  options: ReferencePreviewDateTimeFormatOptions = {}
): string {
  const timeZone =
    options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatter = new Intl.DateTimeFormat(options.locale, {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(ms)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
