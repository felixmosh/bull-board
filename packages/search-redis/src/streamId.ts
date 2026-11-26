function parse(id: string): [number, number] {
  const separator = id.indexOf('-');
  if (separator === -1) return [Number(id), 0];
  return [Number(id.slice(0, separator)), Number(id.slice(separator + 1))];
}

export function compareStreamIds(a: string, b: string): number {
  const [aMs, aSeq] = parse(a);
  const [bMs, bSeq] = parse(b);
  if (aMs !== bMs) return aMs < bMs ? -1 : 1;
  if (aSeq !== bSeq) return aSeq < bSeq ? -1 : 1;
  return 0;
}

export function streamIdTime(id: string): number {
  return parse(id)[0];
}
