// ── Bounty Hunter Simulation — File Watcher ──

import { watch } from 'node:fs';
import { join } from 'node:path';

const WATCH_FILES = ['config.mjs', 'irons.mjs', 'archetypes.mjs'];
const DEFAULT_DEBOUNCE = 300;

// ── Start watching sim files for changes ──
// Options:
//   basePath  — directory containing the .mjs files
//   onRerun   — async callback fired when a file changes
//   debounceMs — debounce window (default 300ms)
// Returns: { stop } function to close all watchers
export function startWatch({ basePath, onRerun, debounceMs = DEFAULT_DEBOUNCE }) {
  let timer = null;
  let running = false;
  const watchers = [];

  function trigger(filename) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (running) return; // skip if previous rerun still going
      running = true;
      try {
        console.log(`\n  File changed: ${filename}`);
        await onRerun();
      } finally {
        running = false;
      }
    }, debounceMs);
  }

  for (const file of WATCH_FILES) {
    const filePath = join(basePath, file);
    try {
      const watcher = watch(filePath, (eventType) => {
        // Both 'change' and 'rename' — editors do atomic saves (write tmp → rename)
        trigger(file);
      });
      watchers.push(watcher);
    } catch (err) {
      console.error(`  Warning: Could not watch ${file}: ${err.message}`);
    }
  }

  console.log(`  Watching: ${WATCH_FILES.join(', ')}`);

  return {
    stop() {
      if (timer) clearTimeout(timer);
      for (const w of watchers) w.close();
    },
  };
}
