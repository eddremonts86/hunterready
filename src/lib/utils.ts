/**
 * `cn` — the class merger every vendored shadcn component imports from `@/lib/utils`.
 *
 * Written by hand rather than copied, because the generator does not create it and the two lines are
 * not worth a mystery: `clsx` flattens conditionals and arrays into a class string, and `tailwind-merge`
 * then resolves conflicts in favour of the last one, so a caller's `px-3` beats a component's default
 * `px-4` instead of both landing in the attribute and the cascade deciding by stylesheet order.
 *
 * This file is ours, unlike `src/components/ui/*` — those are vendored copies that must not be
 * hand-edited (CLAUDE.md), because the ability to diff them against upstream is the only thing that
 * makes updating them safe.
 */
import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: Array<ClassValue>): string {
  return twMerge(clsx(inputs))
}
