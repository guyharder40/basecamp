// Bad-language filter — server side. Shared rules for every text write.
// Rebuilt from the live Basecamp spec: catches leetspeak, stretched,
// suffixed, asterisk-masked (including fused tokens like "sh*tty_boots"),
// spaced and dotted variants. Never flags ordinary hunting words that merely
// contain a bad string (bass, compass, woodcock, crappie).
//
// Approach: normalise the input (lowercase, leet decode, collapse repeats,
// strip separators * . _ - spaces inside tokens) and match whole normalised
// words / fused tokens against a stem list. Allowlisted hunting words are
// removed from the token stream before matching.

export const FIELD_LIMITS = {
  campName: 80,
  textShort: 120, // titles, names, species, stand notes
  textBody: 2000, // chat, notes, comments, captions, bios
  gearName: 120,
  groupName: 60,
  groupAbout: 500,
  licenseNumber: 60,
} as const;

// Allowlist: ordinary hunting words that contain a bad string. Checked
// BEFORE the bad-word match, on the raw token level.
const ALLOWLIST = new Set([
  'bass', 'compass', 'woodcock', 'crappie', 'scrap', 'grass', 'class',
  'pass', 'mass', 'glass', 'brass', 'assistant', 'assassin', 'cassette',
  'cockpit', 'peacock', 'hitchcock', 'shuttlecock', 'titmouse', 'tit',
  'dickson', 'dickinson', 'cummins', 'document', 'cucumber', 'cumberland',
  'shitake', 'shitake', 'shiitake', 'cocktail', 'cockatoo',
  'cocker', 'cockers', 'cockerspaniel', 'hello', 'hellos', 'damnation',
  'cumulative', 'cumbersome',
]);

// Bad stems, written in plain form. Keep this list server-side only.
const BAD_STEMS = [
  'fuck', 'shit', 'bitch', 'bastard', 'cunt', 'dick', 'cock', 'pussy',
  'whore', 'slut', 'damn', 'hell', 'asshole', 'motherfucker', 'douche',
  'piss', 'crap', 'bollocks', 'wank', 'twat', 'prick', 'dildo', 'fag',
  'nigger', 'nigga', 'retard', 'cum', 'blowjob', 'handjob', 'porn',
];

const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a',
  '$': 's', '!': 'i', '|': 'l', '+': 't', '€': 'e', '£': 'l',
};

// Normalise one token: lowercase, leet-decode, drop separators, collapse
// stretched repeats (shiiit -> shit, fuuuck -> fuck), drop trailing
// suffix noise is handled by stem matching below.
export function normaliseToken(raw: string): string {
  let s = raw.toLowerCase();
  s = s.split('').map(ch => LEET[ch] ?? ch).join('');
  // Remove separators used to mask words: * . _ - space inside a token is
  // already split; keep only letters here.
  s = s.replace(/[^a-z]/g, '');
  // Collapse 3+ repeated letters to 2 ("shiiit" -> "shiit"). Doubles are
  // kept here; the caller also tests a de-doubled form so "ass" still
  // matches while "shiit" (stretched "shit") matches too.
  s = s.replace(/([a-z])\1{2,}/g, '$1$1');
  return s;
}

function splitTokens(text: string): string[] {
  // Split on whitespace and punctuation that separates words, but keep
  // intra-word separators (* . _) inside tokens so fused masks like
  // "sh*tty_boots" stay one token until normalisation strips them.
  return text
    .toLowerCase()
    .split(/[\s,;:"'()\[\]{}<>/?\\|+=~`]+/)
    .filter(Boolean);
}

export interface ProfanityResult { flagged: boolean; matched?: string; }

/** Check a free-text value. Returns flagged=true with the matched stem. */
export function checkText(text: string): ProfanityResult {
  if (!text) return { flagged: false };
  const tokens = splitTokens(text);
  let letterRun = '';
  const flushRun = (): ProfanityResult | null => {
    if (letterRun.length >= 3 && !ALLOWLIST.has(letterRun)) {
      const hit = matchStem(letterRun);
      if (hit) return { flagged: true, matched: hit };
    }
    letterRun = '';
    return null;
  };
  for (const raw of tokens) {
    const norm = normaliseToken(raw);
    if (!norm) continue;
    // Spaced-out letters: "s h i t" / "s.h.i.t" — consecutive
    // single-letter tokens join into one word and are tested as such.
    if (norm.length === 1) { letterRun += norm; continue; }
    const runHit = flushRun();
    if (runHit) return runHit;
    if (ALLOWLIST.has(norm)) continue;
    // Test both the normalised token and its de-doubled form
    // ("shiit" -> "shit", "ass" stays "ass").
    const dedup = norm.replace(/([a-z])\1/g, '$1');
    const forms = dedup === norm ? [norm] : [norm, dedup];
    for (const form of forms) {
      if (ALLOWLIST.has(form)) continue;
      const hit = matchStem(form);
      if (hit) return { flagged: true, matched: hit };
    }
    // Masked letters: a mask char (* . _ -) inside a token stands in for
    // an unknown letter ("sh*tty" -> "sh?tty" matches "shit").
    const masked = maskedToken(raw);
    if (masked.includes('?')) {
      for (const stem of BAD_STEMS) {
        if (maskedMatch(masked, stem)) return { flagged: true, matched: stem };
      }
    }
  }
  const runHit = flushRun();
  if (runHit) return runHit;
  return { flagged: false };
}

// Mask chars stand in for one unknown letter each.
function maskedToken(raw: string): string {
  let s = raw.toLowerCase();
  s = s.split('').map(ch => LEET[ch] ?? ch).join('');
  s = s.replace(/[*._\-]/g, '?');
  s = s.replace(/[^a-z?]/g, '');
  return s;
}
// Does the stem align at position 0..2 of the masked token, with '?'
// matching any letter? ("sh?tty" matches "shit" at 0.)
function maskedMatch(masked: string, stem: string): boolean {
  for (let start = 0; start <= 2 && start + stem.length <= masked.length; start++) {
    let ok = true;
    for (let j = 0; j < stem.length; j++) {
      const c = masked[start + j];
      if (c !== '?' && c !== stem[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

function matchStem(norm: string): string | null {
  for (const stem of BAD_STEMS) {
    if (norm === stem) return stem;
    // Stem at the start of the token: suffixed forms ("shitty",
    // "fucking") and fused masked tokens ("sh*tty_boots" ->
    // "shittyboots"). The allowlist above keeps ordinary words that
    // merely start with a bad string (crappie, cocker, hello) safe.
    if (norm.startsWith(stem)) {
      if (ALLOWLIST.has(norm)) continue;
      return stem;
    }
    if (norm.endsWith(stem + 's') || norm.endsWith(stem + 'es')) {
      if (!ALLOWLIST.has(norm)) return stem;
    }
    // Fused token: stem appears near the start after a mask char was
    // stripped, e.g. "sh*tty_boots" -> "shittyboots" contains "shit".
    const idx = norm.indexOf(stem);
    if (idx > 0 && idx <= 2) return stem;
  }
  // "ass" only as a standalone word, never inside another word.
  if (norm === 'ass' || norm === 'asses' || norm === 'arse') return 'ass';
  return null;
}

/** Convenience: throw-style check used by routes. Returns an error string or null. */
export function profanityError(...texts: (string | undefined | null)[]): string | null {
  for (const t of texts) {
    if (!t) continue;
    const r = checkText(t);
    if (r.flagged) return 'That wording is not allowed in Basecamp. Please reword it and try again.';
  }
  return null;
}
