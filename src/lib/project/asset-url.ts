/** Folder of project images; same as `ASSET_DIR` in `src-tauri/src/project/format.rs`. */
export const PROJECT_ASSET_PREFIX = "assets/images/";

/**
 * Turns a model `src` into a URL the WebView can load.
 *
 * Args:
 *   src: `ImageElement.src` / `AssetInfo.src`.
 *   root: Absolute project folder, or null when no project is open (browser-only mode).
 *   convert: Maps an absolute file path to an asset-protocol URL (`convertFileSrc` in the app).
 *
 * Returns:
 *   Asset-protocol URL for project files; any other value (bundled / `blob:` URL) unchanged.
 */
export function resolveAssetUrl(src: string, root: string | null, convert: (path: string) => string): string {
  if (root === null || !src.startsWith(PROJECT_ASSET_PREFIX)) return src;
  // asset protocol 的 scope 以原生路徑比對，Windows 路徑必須統一使用反斜線
  const separator = root.includes("\\") ? "\\" : "/";
  const base = root.replace(/[\\/]+$/, "");
  return convert(`${base}${separator}${src.split("/").join(separator)}`);
}
