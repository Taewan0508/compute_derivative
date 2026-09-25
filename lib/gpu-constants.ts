// Client-safe constants and helpers. Kept separate from lib/compute-data.ts
// because that module uses node:fs and must never be imported into client bundles.

export const GPU_ORDER = ['B200', 'H200', 'H100 SXM', 'A100 SXM4', 'RTX 5090', 'RTX PRO 6000 WS']

export function sortByGpuOrder<T extends { gpuName: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => GPU_ORDER.indexOf(a.gpuName) - GPU_ORDER.indexOf(b.gpuName))
}
