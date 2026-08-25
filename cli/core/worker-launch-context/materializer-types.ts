// ABOUTME: Defines the renderer-neutral result consumed by the immutable launch-context store.
// ABOUTME: Keeps target materializers independent from publication and receipt ownership.

export interface RenderedWorkerLaunchTarget {
  targetDir: string | null;
  launch: { args: string[]; env: Record<string, string> };
}
