/**
 * The backgrounds a person can choose for the space behind the pages. Each
 * entry's look lives in globals.css under `[data-surface="<id>"]`, which sets
 * the surface variables (`--surface-background`, `--surface-texture` and the
 * rest) and the colour of text drawn straight onto the surface. So adding a
 * background means adding one entry here and one block there, and no page
 * changes. The picker in the user menu previews each entry with that same CSS.
 *
 * This file holds no React, so the root layout (a server component) can
 * import the boot script. The stored choice lives in surface-preference.ts.
 */
export const SURFACES = [
  { id: "plain", label: "Plain", description: "A flat, quiet background." },
  { id: "wood", label: "Wood desk", description: "Wood grain under a desk lamp." },
] as const;

export type SurfaceId = (typeof SURFACES)[number]["id"];

export const DEFAULT_SURFACE: SurfaceId = "plain";

export const SURFACE_STORAGE_KEY = "csm_surface";

/**
 * Runs inline in <head>, before the first paint, so someone who chose the
 * wood desk doesn't see a flash of the plain background on every load. It
 * only copies a known id onto <html>, and anything else leaves the default.
 */
export const SURFACE_BOOT_SCRIPT = `try{var s=localStorage.getItem(${JSON.stringify(SURFACE_STORAGE_KEY)});if(${JSON.stringify(SURFACES.map((s) => s.id))}.indexOf(s)>-1)document.documentElement.dataset.surface=s}catch(e){}`;
