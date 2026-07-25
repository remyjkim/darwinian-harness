// ABOUTME: Shared URL string helpers for endpoint resolution.
// ABOUTME: Keeps base URLs canonical so path concatenation never doubles slashes.

export function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}
