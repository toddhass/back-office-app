// Compares the build ID baked into the currently-running JS bundle against
// version.json, fetched fresh (cache: "no-store" bypasses the browser's
// HTTP cache entirely, and the "?t=" query string bypasses any CDN/edge
// cache keyed on the URL - both matter, since a hard refresh alone didn't
// resolve a real stale-asset symptom once). If they don't match, the page
// is showing an old build and force-reloads once to recover automatically,
// instead of relying on someone noticing and hard-refreshing manually.
const RELOAD_FLAG_KEY = "back_office_version_reload_attempted";

export async function checkForNewVersion(): Promise<void> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const data: { buildId?: string } = await res.json();

    if (data.buildId && data.buildId !== __BUILD_ID__) {
      // Only reload once per stale detection - if version.json itself is
      // somehow still stale after a reload, this avoids a reload loop.
      const alreadyAttempted = sessionStorage.getItem(RELOAD_FLAG_KEY);
      if (!alreadyAttempted) {
        sessionStorage.setItem(RELOAD_FLAG_KEY, "1");
        window.location.reload();
      }
    } else {
      sessionStorage.removeItem(RELOAD_FLAG_KEY);
    }
  } catch {
    // Network hiccup or version.json missing (e.g. local dev) - never block
    // the app over this, it's a recovery mechanism, not a requirement.
  }
}
