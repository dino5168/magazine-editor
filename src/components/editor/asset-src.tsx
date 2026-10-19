import { createContext, useContext } from "react";
import { useProject } from "@/lib/project/project-context";

/**
 * Overrides where image elements load their files from. Template thumbnails draw sheets whose
 * images live in the template's folder, not the open project's.
 */
const AssetSrcContext = createContext<((src: string) => string) | null>(null);

/** Wraps sheets drawn from another folder; the value turns a model `src` into a loadable URL. */
export const AssetSrcProvider = AssetSrcContext.Provider;

/**
 * Returns the `src` → URL function for image elements: the nearest `AssetSrcProvider`, else the
 * open project's `resolveSrc`.
 *
 * Returns:
 *   Resolver function.
 */
export function useResolveSrc(): (src: string) => string {
  const { resolveSrc } = useProject();
  return useContext(AssetSrcContext) ?? resolveSrc;
}
