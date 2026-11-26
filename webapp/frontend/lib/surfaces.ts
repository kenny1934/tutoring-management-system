/** Shared page surface and compatibility with saved background preferences. */
export const SURFACES = [
  { id: "plain", label: "Plain", description: "A flat, quiet background." },
] as const;

export type SurfaceId = (typeof SURFACES)[number]["id"];
export const DEFAULT_SURFACE: SurfaceId = "plain";
export const SURFACE_STORAGE_KEY = "csm_surface";

/** Apply Plain before the first paint and retire an old Wood desk selection. */
export const SURFACE_BOOT_SCRIPT = `document.documentElement.dataset.surface=${JSON.stringify(DEFAULT_SURFACE)};try{if(localStorage.getItem(${JSON.stringify(SURFACE_STORAGE_KEY)})==="wood")localStorage.setItem(${JSON.stringify(SURFACE_STORAGE_KEY)},${JSON.stringify(DEFAULT_SURFACE)})}catch(e){}`;
