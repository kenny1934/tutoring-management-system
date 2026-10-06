import { createChoicePreference } from "./preference";
import { DEFAULT_SURFACE, SURFACES, SURFACE_STORAGE_KEY, type SurfaceId } from "./surfaces";

/** The page background this person chose on this device. */
export const surfacePreference = createChoicePreference<SurfaceId>(
  SURFACE_STORAGE_KEY,
  SURFACES.map((s) => s.id),
  DEFAULT_SURFACE,
);
