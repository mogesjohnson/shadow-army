/** The name within edit distance 2 of `typed`, closest first, if there is one. For "did you mean" hints. */
export function closestName(typed: string, names: string[]): string | undefined {
  const distance = (a: string, b: string): number => {
    const row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0]!;
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cur = row[j]!;
        row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = cur;
      }
    }
    return row[b.length]!;
  };
  let best: { name: string; d: number } | undefined;
  for (const name of names) {
    const d = distance(typed, name);
    if (d <= 2 && (!best || d < best.d)) best = { name, d };
  }
  return best?.name;
}
