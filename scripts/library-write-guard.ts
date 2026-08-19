// Shared skip decision for scripts/download-library.ts (F-31c617e4).
// Existing library files are receipted — do not overwrite them.

/** True when dest already exists and the bootstrap write must skip. */
export function shouldSkipExistingLibraryFile(destExists: boolean): boolean {
  return destExists;
}
