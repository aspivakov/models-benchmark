import type { FieldVerdict } from './types';

function norm(s: string): string {
  return (s ?? '').toLowerCase().trim();
}

function isBlank(s: string): boolean {
  const n = norm(s);
  return n === '' || n === 'not specified';
}

export function scoreSeniority(expected: string, actual: string): FieldVerdict {
  const e = isBlank(expected) ? 'not specified' : norm(expected);
  const a = isBlank(actual) ? 'not specified' : norm(actual);
  return { match: e === a, expected, actual };
}

const REMOTE_POLICY_GROUPS: Record<string, string> = {
  remote: 'remote',
  'fully remote': 'remote',
  '100% remote': 'remote',
  'remote-first': 'remote',
  'on-site': 'on-site',
  onsite: 'on-site',
  'in-office': 'on-site',
  hybrid: 'hybrid',
  'not specified': 'not specified',
  '': 'not specified',
};

export function scoreRemotePolicy(expected: string, actual: string): FieldVerdict {
  const e = REMOTE_POLICY_GROUPS[norm(expected)] ?? norm(expected);
  const a = REMOTE_POLICY_GROUPS[norm(actual)] ?? norm(actual);
  return { match: e === a, expected, actual };
}

type Range = { min: number; max: number };

function parseYearsRange(s: string): Range | null {
  const n = norm(s);
  if (n === '' || n === 'not specified') return null;

  // Strip "years", "yrs", "y", and "+" markers for cleaner parsing
  const cleaned = n.replace(/years?|yrs?|\byr\b/g, '').trim();

  // Range with explicit "+"  e.g. "0-2+"
  const rangePlus = cleaned.match(/^(\d+)\s*[-–]\s*(\d+)\s*\+/);
  if (rangePlus) {
    return { min: parseInt(rangePlus[1], 10), max: Infinity };
  }

  // Range e.g. "3-5"
  const range = cleaned.match(/^(\d+)\s*[-–]\s*(\d+)/);
  if (range) {
    return { min: parseInt(range[1], 10), max: parseInt(range[2], 10) };
  }

  // "5+"
  const plus = cleaned.match(/^(\d+)\s*\+/);
  if (plus) {
    return { min: parseInt(plus[1], 10), max: Infinity };
  }

  // Single number "5"
  const single = cleaned.match(/^(\d+)/);
  if (single) {
    const v = parseInt(single[1], 10);
    return { min: v, max: v };
  }

  return null;
}

function rangesOverlap(a: Range, b: Range): boolean {
  return a.min <= b.max && b.min <= a.max;
}

export function scoreYearsExperience(expected: string, actual: string): FieldVerdict {
  const e = parseYearsRange(expected);
  const a = parseYearsRange(actual);

  if (e === null && a === null) {
    return { match: true, expected, actual };
  }

  if (e === null || a === null) {
    // One parsed, one didn't — fall back to normalized string match
    return { match: norm(expected) === norm(actual), expected, actual };
  }

  const overlap = rangesOverlap(e, a);
  const minClose = Math.abs(e.min - a.min) <= 1;
  return {
    match: overlap && minClose,
    expected,
    actual,
    notes: overlap && minClose ? undefined : `range mismatch (expected ${e.min}-${e.max}, actual ${a.min}-${a.max})`,
  };
}

const COMPANY_SUFFIXES = [
  'inc.',
  'inc',
  'llc',
  'ltd.',
  'ltd',
  'gmbh',
  'corp.',
  'corp',
  'co.',
  'company',
  'limited',
];

function normalizeCompany(s: string): string {
  let n = norm(s);
  // Strip parenthesized aliases
  n = n.replace(/\([^)]*\)/g, ' ');
  // Strip punctuation except internal hyphens/letters
  n = n.replace(/[.,;:!?'"]/g, ' ');
  // Collapse whitespace
  n = n.replace(/\s+/g, ' ').trim();
  // Strip trailing suffix tokens
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of COMPANY_SUFFIXES) {
      if (n.endsWith(' ' + suf) || n === suf) {
        n = n.slice(0, n.length - suf.length).trim();
        changed = true;
        break;
      }
    }
  }
  return n.replace(/\s+/g, ' ').trim();
}

export function scoreCompany(expected: string, actual: string): FieldVerdict {
  const e = normalizeCompany(expected);
  const a = normalizeCompany(actual);
  if (e === '' && a === '') return { match: true, expected, actual };
  return { match: e === a, expected, actual };
}

function normalizeTitle(s: string): string {
  let n = norm(s);
  // Remove parenthesized qualifiers
  n = n.replace(/\([^)]*\)/g, ' ');
  // Strip punctuation
  n = n.replace(/[.,;:!?'"\/\\]/g, ' ');
  return n.replace(/\s+/g, ' ').trim();
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function scoreTitle(expected: string, actual: string): FieldVerdict {
  const e = normalizeTitle(expected);
  const a = normalizeTitle(actual);
  if (e === '' && a === '') return { match: true, expected, actual };
  if (e === '' || a === '') return { match: false, expected, actual };

  if (e === a) return { match: true, expected, actual };
  if (e.includes(a) || a.includes(e)) return { match: true, expected, actual, notes: 'substring match' };

  const eWords = new Set(e.split(' ').filter(Boolean));
  const aWords = new Set(a.split(' ').filter(Boolean));
  const j = jaccard(eWords, aWords);
  return {
    match: j >= 0.7,
    expected,
    actual,
    notes: `jaccard=${j.toFixed(2)}`,
  };
}
