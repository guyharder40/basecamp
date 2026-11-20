// Client-side mirror of the server bad-language filter, for the live
// warning that disables Send / Post / Save until the text is reworded.
// The server is the authority — it re-checks every write before saving.
// Same rules: leetspeak, stretched, suffixed, asterisk-masked (including
// fused tokens), spaced/dotted variants; never flags bass, compass,
// woodcock, crappie.

const ALLOWLIST = new Set([
  'bass', 'compass', 'woodcock', 'crappie', 'scrap', 'grass', 'class',
  'pass', 'mass', 'glass', 'brass', 'assistant', 'assassin', 'cassette',
  'cockpit', 'peacock', 'hitchcock', 'shuttlecock', 'titmouse',
  'dickson', 'dickinson', 'cummins', 'document', 'cucumber', 'cumberland',
  'shitake', 'shiitake', 'cocktail', 'cockatoo',
  'cocker', 'cockers', 'cockerspaniel', 'hello', 'hellos', 'damnation',
  'cumulative', 'cumbersome',
]);
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
function normaliseToken(raw: string): string {
  let s = raw.toLowerCase().split('').map(ch => LEET[ch] ?? ch).join('');
  s = s.replace(/[^a-z]/g, '');
  s = s.replace(/([a-z])\1{2,}/g, '$1$1');
  return s;
}
function matchStem(norm: string): boolean {
  for (const stem of BAD_STEMS) {
    if (norm === stem) return true;
    if (norm.startsWith(stem) && !ALLOWLIST.has(norm)) return true;
    if ((norm.endsWith(stem + 's') || norm.endsWith(stem + 'es')) && !ALLOWLIST.has(norm)) return true;
    const idx = norm.indexOf(stem);
    if (idx > 0 && idx <= 2) return true;
  }
  return norm === 'ass' || norm === 'asses' || norm === 'arse';
}
/** True when the text would be refused by the server filter. */
export function containsBadLanguage(text: string): boolean {
  if (!text) return false;
  const tokens = text.toLowerCase().split(/[\s,;:"'()\[\]{}<>/?\\|+=~`]+/).filter(Boolean);
  let letterRun = '';
  const flushRun = (): boolean => {
    if (letterRun.length >= 3 && !ALLOWLIST.has(letterRun) && matchStem(letterRun)) return true;
    letterRun = '';
    return false;
  };
  for (const raw of tokens) {
    const norm = normaliseToken(raw);
    if (!norm) continue;
    if (norm.length === 1) { letterRun += norm; continue; }
    if (flushRun()) return true;
    if (ALLOWLIST.has(norm)) continue;
    const dedup = norm.replace(/([a-z])\1/g, '$1');
    for (const form of dedup === norm ? [norm] : [norm, dedup]) {
      if (ALLOWLIST.has(form)) continue;
      if (matchStem(form)) return true;
    }
    const masked = maskedToken(raw);
    if (masked.includes('?')) {
      for (const stem of BAD_STEMS) {
        if (maskedMatch(masked, stem)) return true;
      }
    }
  }
  return flushRun();
}
function maskedToken(raw: string): string {
  let s = raw.toLowerCase().split('').map(ch => LEET[ch] ?? ch).join('');
  s = s.replace(/[*._\-]/g, '?');
  s = s.replace(/[^a-z?]/g, '');
  return s;
}
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
export const BAD_LANGUAGE_WARNING = 'That wording is not allowed in Basecamp. Please reword it.';
