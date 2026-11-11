/**
 * Tokenizer: finds English word tokens in a string of text (ADR-0003).
 * Handles contractions (don't, o'clock) and curly apostrophes; single
 * letters and numbers are not tokens.
 */

export interface Token {
  text: string;
  start: number;
  end: number; // exclusive
}

const WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

/** All word tokens in `text`, in order, with character offsets. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(text)) !== null) {
    // Strip trailing apostrophe groups that aren't contractions ("rock 'n' roll" edge).
    const raw = m[0];
    if (raw.length === 1) continue; // single letters: "a", "I" — not learnable words
    tokens.push({ text: raw, start: m.index, end: m.index + raw.length });
  }
  return tokens;
}

/** True for ALL-CAPS tokens (acronyms like NASA, BBC) — never tagged. */
export function isAcronym(token: string): boolean {
  return token.length > 1 && token === token.toUpperCase() && /[A-Z]/.test(token);
}

/**
 * True for token shapes that are proper nouns, never learnable English
 * words: CamelCase brands and products ("VirusTotal", "AbuseIPDB",
 * "GreyNoise", "iPhone", "McDonald") and pluralized acronyms ("URLs",
 * "IPs", "IDs"). Pure ALL-CAPS tokens are acronyms (see isAcronym).
 */
export function isBrandLike(token: string): boolean {
  return /[a-z][A-Z]/.test(token) || /^[A-Z]{2,}s$/.test(token);
}
