// ABOUTME: Debounced file watching for drwn write --watch and drwn dev loops.
// ABOUTME: Watches drwn overlay files and dynamically refreshes linked source roots.

import { existsSync, watch, watchFile, unwatchFile, type FSWatcher, type StatsListener } from "node:fs";
import { join, relative } from "node:path";
import { loadConfigLocal } from "./config-local";
import { createRecursiveWatcher, type RecursiveWatcher } from "./write-watch-recursive";

export interface WriteWatchOptions {
  projectRoot: string;
  extraLinkedSourceRoots?: string[];
  debounceMs?: number;
  onTrigger: () => void | Promise<void>;
}

export function normalizeWatchPath(path: string) {
  return path.replace(/^file:/, "");
}

const IGNORE_PREFIXES = [
  ".agents/drwn/vendor/",
  ".agents/drwn/generated/",
  ".claude/",
  ".codex/",
  ".cursor/",
  ".opencode/",
];

export function linkedRootOverlapsProject(projectRoot: string, linkedRoots: string[]) {
  const normalizedProject = projectRoot.replace(/\/$/, "");
  return linkedRoots.some((root) => {
    const normalized = normalizeWatchPath(root).replace(/\/$/, "");
    return normalized.startsWith(normalizedProject) || normalizedProject.startsWith(normalized);
  });
}

export function shouldIgnoreWatchEvent(projectRoot: string, eventPath: string, linkedRoots: string[]) {
  if (!linkedRootOverlapsProject(projectRoot, linkedRoots)) {
    return false;
  }
  const rel = relative(projectRoot, eventPath).replace(/\\/g, "/");
  if (rel.startsWith("..")) {
    return false;
  }
  if (rel === ".agents/drwn/write-record.json") {
    return true;
  }
  return IGNORE_PREFIXES.some((prefix) => rel === prefix.slice(0, -1) || rel.startsWith(prefix));
}

export async function loadLinkedSourceRoots(projectRoot: string, extraRoots: string[] = []) {
  const local = await loadConfigLocal(projectRoot);
  const fromOverrides = Object.values(local?.sourceOverrides ?? {}).map((value) => normalizeWatchPath(value));
  const roots = [...extraRoots.map((root) => normalizeWatchPath(root)), ...fromOverrides];
  return [...new Set(roots.filter((root) => root && existsSync(root)))];
}

export function collectWriteWatchPaths(projectRoot: string, linkedSourceRoots: string[] = []) {
  const linked = linkedSourceRoots.map((path) => normalizeWatchPath(path)).filter((path) => path && existsSync(path));
  return [
    join(projectRoot, ".agents", "drwn"),
    join(projectRoot, "AGENTS.md"),
    join(projectRoot, ".claude", "CLAUDE.md"),
    ...linked,
  ];
}

export { createRecursiveWatcher, type RecursiveWatcher } from "./write-watch-recursive";

export function startWriteWatch(options: WriteWatchOptions) {
  const debounceMs = options.debounceMs ?? 300;
  const extraLinked = (options.extraLinkedSourceRoots ?? []).map((path) => normalizeWatchPath(path));

  let timer: ReturnType<typeof setTimeout> | null = null;
  let inProgress = false;
  let queued = false;
  let linkedRoots: string[] = [];
  const linkedWatchers = new Map<string, RecursiveWatcher>();
  const polledFiles: Array<{ path: string; listener: StatsListener }> = [];
  const observedFileState = new Map<string, string>();
  const fileState = (path: string) => {
    try {
      const stats = Bun.file(path);
      return `${stats.size}:${stats.lastModified}`;
    } catch {
      return "absent";
    }
  };

  const closeLinkedWatchers = () => {
    for (const watcher of linkedWatchers.values()) {
      watcher.close();
    }
    linkedWatchers.clear();
  };

  const refreshLinkedWatchers = async () => {
    const nextRoots = await loadLinkedSourceRoots(options.projectRoot, extraLinked);
    linkedRoots = nextRoots;
    const stale = [...linkedWatchers.keys()].filter((root) => !nextRoots.includes(root));
    for (const root of stale) {
      linkedWatchers.get(root)?.close();
      linkedWatchers.delete(root);
    }
    for (const root of nextRoots) {
      if (linkedWatchers.has(root)) {
        continue;
      }
      linkedWatchers.set(
        root,
        createRecursiveWatcher(root, (eventPath) => schedule(eventPath)),
      );
    }
  };

  const runTrigger = async () => {
    if (inProgress) {
      queued = true;
      return;
    }
    inProgress = true;
    try {
      await refreshLinkedWatchers();
      await options.onTrigger();
      for (const file of polledFiles) {
        observedFileState.set(file.path, fileState(file.path));
      }
    } finally {
      inProgress = false;
      if (queued) {
        queued = false;
        void runTrigger();
      }
    }
  };

  const schedule = (eventPath?: string) => {
    if (eventPath && shouldIgnoreWatchEvent(options.projectRoot, eventPath, linkedRoots)) {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      void runTrigger();
    }, debounceMs);
  };

  const watchPolledFile = (path: string) => {
    observedFileState.set(path, fileState(path));
    const listener: StatsListener = (current, previous) => {
      if (current.mtimeMs === previous.mtimeMs && current.size === previous.size) {
        return;
      }
      const currentState = fileState(path);
      if (observedFileState.get(path) === currentState) return;
      observedFileState.set(path, currentState);
      schedule(path);
    };
    watchFile(path, { interval: Math.max(50, Math.min(500, debounceMs)), persistent: true }, listener);
    polledFiles.push({ path, listener });
  };

  const drwnDir = join(options.projectRoot, ".agents", "drwn");
  const watchers: Array<RecursiveWatcher | FSWatcher> = [];
  if (existsSync(drwnDir)) {
    watchers.push(createRecursiveWatcher(drwnDir, schedule));
    for (const filename of ["config.json", "config.local.json", "card.lock", "card.lock.local"]) {
      watchPolledFile(join(drwnDir, filename));
    }
  } else {
    const parent = join(options.projectRoot, ".agents");
    if (existsSync(parent)) {
      watchers.push(watch(parent, { persistent: true }, (_event, filename) => {
        if (filename?.toString() === "drwn") {
          schedule(join(parent, "drwn"));
        }
      }));
    }
  }
  watchPolledFile(join(options.projectRoot, "AGENTS.md"));
  watchPolledFile(join(options.projectRoot, ".claude", "CLAUDE.md"));

  void refreshLinkedWatchers();

  return () => {
    if (timer) {
      clearTimeout(timer);
    }
    closeLinkedWatchers();
    for (const watcher of watchers) {
      watcher.close();
    }
    for (const file of polledFiles) {
      unwatchFile(file.path, file.listener);
    }
  };
}
