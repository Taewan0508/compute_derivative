// Client-safe constants and helpers. Kept separate from lib/compute-data.ts
// because that module uses node:fs and must never be imported into client bundles.

/**
 * Display order for GPU series across charts and tables.
 *
 * Newest datacenter chips come first (B200, H200, H100 SXM, A100 SXM4), then
 * the workstation cards (RTX 5090, RTX PRO 6000 WS). Names match the `gpu_name`
 * column in the Ornn CSVs.
 */
export const GPU_ORDER = ['B200', 'H200', 'H100 SXM', 'A100 SXM4', 'RTX 5090', 'RTX PRO 6000 WS']

/**
 * Sorts a list into {@link GPU_ORDER}.
 *
 * Names missing from the list sort after known names, because `indexOf` returns
 * `-1` for them.
 *
 * @template T - Item type. Must include a `gpuName` matching the Ornn series name.
 * @param items - Rows or series to reorder. The input array is not mutated.
 * @returns A new array in canonical GPU order.
 */
export function sortByGpuOrder<T extends { gpuName: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => GPU_ORDER.indexOf(a.gpuName) - GPU_ORDER.indexOf(b.gpuName))
}
