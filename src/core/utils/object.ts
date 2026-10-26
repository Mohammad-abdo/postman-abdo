/** Keeps only the listed keys that are not `undefined`. */
export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  keys.forEach((k) => {
    if (obj[k] !== undefined) out[k] = obj[k];
  });
  return out;
}

export const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Moves `id` to `index` within an ordered list and returns the new id order. */
export function reorder(ids: string[], id: string, index: number): string[] {
  const rest = ids.filter((x) => x !== id);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
  return rest;
}

export const safeFileName = (name: string) => name.replace(/[^\w\- ]+/g, '_');
