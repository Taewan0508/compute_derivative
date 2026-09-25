import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges Tailwind class names into one string.
 *
 * `clsx` joins conditionals and arrays, then `tailwind-merge` drops earlier
 * utilities that conflict with later ones, so a call-site override wins.
 *
 * @param inputs - Class names, arrays, or conditional objects accepted by `clsx`.
 * @returns A single class string safe to put on `className`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
