import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'fs'

// Vercel sets this automatically during a real deploy build - falls back to
// a timestamp for local dev, where there's no commit SHA to use.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now())

// Writes a version.json alongside the built app, fetched at runtime with
// no-store to detect whether the currently-running bundle is stale - see
// src/lib/versionCheck.ts. This exists specifically because a hard browser
// refresh didn't fix a stale-CSS symptom once - pointing at Vercel's CDN
// edge cache rather than just the browser, which a version check can catch
// and recover from automatically instead of needing a manual fix each time.
function versionFilePlugin() {
  return {
    name: 'version-file',
    writeBundle() {
      writeFileSync('dist/version.json', JSON.stringify({ buildId }))
    },
  }
}

export default defineConfig({
  plugins: [react(), versionFilePlugin()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
})
