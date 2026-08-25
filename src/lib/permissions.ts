export type Toggles = Record<string, boolean | string[]>;

/** Merges a Permission Template's toggles with an employee's individual overrides. */
export function effectiveToggles(
  templateToggles: Toggles | null | undefined,
  overrides: Toggles | null | undefined
): Toggles {
  return { ...(templateToggles ?? {}), ...(overrides ?? {}) };
}
