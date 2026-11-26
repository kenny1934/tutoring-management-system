import { createChoicePreference } from "./preference";
import { DEFAULT_SURFACE, SURFACES, SURFACE_STORAGE_KEY, type SurfaceId } from "./surfaces";

/** Read legacy background settings using the supported Plain surface. */
export const surfacePreference = createChoicePreference<SurfaceId>(
  SURFACE_STORAGE_KEY,
  SURFACES.map((s) => s.id),
  DEFAULT_SURFACE,
);
