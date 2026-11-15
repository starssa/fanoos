/** "*" | "example.com" | "*.example.com" (also matches example.com itself). */
export function hostMatches(pattern: string, host: string): boolean {
  if (pattern === '*') return true;
  if (pattern.indexOf('*.') === 0) {
    const base = pattern.slice(2);
    return host === base || host.slice(-(base.length + 1)) === '.' + base;
  }
  return host === pattern;
}

/** Numeric semver compare: -1, 0, 1. Pre-release tags are ignored. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function fmtTime(s: number): string {
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p2 = (n: number) => (n < 10 ? '0' : '') + n; // no padStart: Chrome 47 (Tizen 2017)
  return (h ? h + ':' + p2(m) : String(m)) + ':' + p2(sec);
}
