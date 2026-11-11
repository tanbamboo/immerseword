/**
 * Lemmatizer (ADR-0003): maps surface forms (runs, running, ran, studies,
 * happier …) to dictionary lemmas (run, study, happy) using
 *
 *   1. a committed irregular-forms table (suppletive & strong forms), then
 *   2. ordered suffix rules validated against a known-lemma set.
 *
 * No NLP dependency; deterministic and unit-tested. When nothing validates,
 * the lowercased surface form is returned as its own best guess.
 */

/** Irregular → lemma. Includes suppletive comparatives and common plurals. */
const IRREGULAR: Record<string, string> = {
  // be
  am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  // have
  has: 'have', had: 'have',
  // do
  does: 'do', did: 'do', done: 'do', doing: 'do',
  // go
  goes: 'go', went: 'go', gone: 'go', going: 'go',
  // say / make / know
  says: 'say', said: 'say', made: 'make', knew: 'know', known: 'know',
  // think / take / see / come / want
  thought: 'think', took: 'take', taken: 'take', saw: 'see', seen: 'see',
  came: 'come', comes: 'come', coming: 'come', wanted: 'want', wants: 'want',
  // use / find / give / tell / work
  used: 'use', uses: 'use', using: 'use', found: 'find', gave: 'give',
  given: 'give', told: 'tell', worked: 'work', works: 'work',
  // call / try / ask / need / feel
  called: 'call', tried: 'try', asked: 'ask', needed: 'need', felt: 'feel',
  // become / leave / put / mean / keep
  became: 'become', becomes: 'become', left: 'leave', put: 'put',
  meant: 'mean', kept: 'keep',
  // let / begin / seem / help / talk
  let: 'let', began: 'begin', begun: 'begin', began_: 'begin', seemed: 'seem',
  helped: 'help', talked: 'talk',
  // turn / start / show / hear / play
  turned: 'turn', started: 'start', showed: 'show', shown: 'show',
  heard: 'hear', played: 'play',
  // run / move / like / live / believe
  ran: 'run', runs: 'run', running: 'run', moved: 'move', liked: 'like',
  lived: 'live', believed: 'believe',
  // hold / bring / happen / write / provide
  held: 'hold', brought: 'bring', happened: 'happen', wrote: 'write',
  written: 'write', provided: 'provide',
  // sit / stand / lose / pay / meet
  sat: 'sit', stood: 'stand', lost: 'lose', paid: 'pay', met: 'meet',
  // include / continue / set / learn / change / lead
  included: 'include', continued: 'continue', set: 'set', learned: 'learn',
  learnt: 'learn', changed: 'change', led: 'lead',
  // understand / watch / follow / stop / create / speak / read / allow
  understood: 'understand', watched: 'watch', followed: 'follow',
  stopped: 'stop', created: 'create', spoke: 'speak', spoken: 'speak',
  read: 'read', allowed: 'allow',
  // add / spend / grow / open / walk / win / offer / remember / love
  added: 'add', spent: 'spend', grew: 'grow', grown: 'grow', opened: 'open',
  walked: 'walk', won: 'win', offered: 'offer', remembered: 'remember',
  loved: 'love',
  // consider / appear / buy / wait / serve / die / send / expect
  considered: 'consider', appeared: 'appear', bought: 'buy', waited: 'wait',
  served: 'serve', died: 'die', sent: 'send', expected: 'expect',
  // build / stay / fall / cut / reach / kill / remain
  built: 'build', stayed: 'stay', fell: 'fall', fallen: 'fall', cut: 'cut',
  reached: 'reach', killed: 'kill', remained: 'remain',
  // bring / teach / catch / choose / feel / fly / draw / drink / drive / eat
  taught: 'teach', caught: 'catch', chose: 'choose', chosen: 'choose',
  flew: 'fly', flown: 'fly', drew: 'draw', drawn: 'draw', drank: 'drink',
  drunk: 'drink', drove: 'drive', driven: 'drive', ate: 'eat', eaten: 'eat',
  // give-more verbs
  forgot: 'forget', forgotten: 'forget', got: 'get', gotten: 'get',
  gave_: 'give', hid: 'hide', hidden: 'hide', kept_: 'keep', lay: 'lie',
  lain: 'lie', lent: 'lend', paid_: 'pay', rang: 'ring', rung: 'ring',
  rose: 'rise', risen: 'rise', shook: 'shake', shaken: 'shake', sang: 'sing',
  sung: 'sing', sank: 'sink', sunk: 'sink', slept: 'sleep', slid: 'slide',
  spent_: 'spend', spread: 'spread', stole: 'steal', stolen: 'steal',
  swore: 'swear', sworn: 'swear', swam: 'swim', swum: 'swim', tore: 'tear',
  torn: 'tear', threw: 'throw', thrown: 'throw', woke: 'wake', woken: 'wake',
  wore: 'wear', worn: 'wear', withdrew: 'withdraw', withdrawn: 'withdraw',
  // irregular plurals
  children: 'child', men: 'man', women: 'woman', people: 'person',
  feet: 'foot', teeth: 'tooth', geese: 'goose', mice: 'mouse', oxen: 'ox',
  // suppletive comparatives/superlatives
  better: 'good', best: 'good', worse: 'bad', worst: 'bad',
  less: 'little', least: 'little', more: 'much', most: 'much',
  farther: 'far', further: 'far', farthest: 'far', furthest: 'far',
};

/**
 * Candidate stems for -ed/-ing surfaces, best-first. English inflectional
 * spelling disambiguates most cases: a doubled final consonant means the
 * base dropped nothing (running→run), a vowel + single consonant tail with
 * no doubling means an e-drop verb (hoping→hope, shaping→shape, an e-drop
 * verb with a short vowel would double: hopping), and a consonant + l tail
 * is a syllabic-le verb (disgruntled→disgruntle). Everything else keeps the
 * bare stem first (walked→walk, glistened→glisten); the remaining variants
 * stay in the list as late candidates for validation to pick up
 * (controlling→control).
 */
const DOUBLED_CONSONANT = /(bb|dd|ff|gg|mm|nn|pp|rr|tt)$/;
// E-drop consonants: vowel + one of these usually dropped an e (hoping →
// hope, shaping → shape). Syllable-coda n/l/r tails are usually complete
// stems (glisten, revel, render) and stay bare-first.
const VOWEL_CONS_TAIL = /[aeiou][pbtdcgvzmkfs]$/;
const CONS_L_TAIL = /[b-df-hj-np-tv-xz]l$/; // disgruntl(e), handl(e)

function edIngCandidates(stem: string): string[] {
  if (DOUBLED_CONSONANT.test(stem)) return [stem.slice(0, -1), stem, stem + 'e'];
  if (VOWEL_CONS_TAIL.test(stem)) return [stem + 'e', stem, stem.slice(0, -1)];
  if (CONS_L_TAIL.test(stem)) return [stem + 'e', stem, stem.slice(0, -1)];
  return [stem, stem + 'e', stem.slice(0, -1)];
}

/**
 * Ordered suffix rules. Each produces candidate stems; the first stem that
 * exists in the known-lemma set wins. Doubling/e-drop cases handled by
 * trying progressively shorter stems.
 */
const SUFFIX_RULES: Array<{ suffix: RegExp; make: (stem: string) => string[] }> = [
  // studies → study, cities → city
  { suffix: /ies$/, make: (s) => [s + 'y'] },
  // boxes, buses(invalid handled by validation), churches, dishes, glasses
  { suffix: /sses$/, make: (s) => [s + 'ss'] },
  { suffix: /shes$/, make: (s) => [s + 'sh'] },
  { suffix: /ches$/, make: (s) => [s + 'ch'] },
  { suffix: /xes$/, make: (s) => [s + 'x'] },
  { suffix: /zes$/, make: (s) => [s + 'z'] },
  // walked → walk, studied → study (ied handled above), stopped → stop
  { suffix: /ied$/, make: (s) => [s + 'y'] },
  { suffix: /ed$/, make: edIngCandidates },
  // walking → walk, making → make, running → run
  { suffix: /ing$/, make: edIngCandidates },
  // quickly → quick
  { suffix: /ly$/, make: (s) => [s, s.slice(0, -1)] },
  // happiness → happy, darkness → dark, stiffness → stiff
  { suffix: /iness$/, make: (s) => [s + 'y'] },
  { suffix: /ness$/, make: (s) => [s] },
  // bigger → big, happier → happy (ier → y)
  { suffix: /ier$/, make: (s) => [s + 'y', s + 'ie'] },
  {
    suffix: /er$/,
    make: (s) => [
      s, // bigger→big? no: 'bigg' — validated below; walker → walk
      s.slice(0, -1), // bigger → big
      s + 'e', // writer → write? ('writ'+'e')
    ],
  },
  { suffix: /iest$/, make: (s) => [s + 'y'] },
  {
    suffix: /est$/,
    make: (s) => [
      s, // smallest → small
      s.slice(0, -1), // biggest → big
      s + 'e', // finest? ('fin'+'e') weak but harmless under validation
    ],
  },
  // plural -s (last among plural rules): cats → cat, houses → house
  { suffix: /s$/, make: (s) => [s, s + 'e'] },
];

/**
 * Conservative fallback rules for rare (unlisted) words — high-precision
 * inflectional suffixes only. A bare -s is deliberately excluded: rare-word
 * plurals ("petrichors") are rarer than wrong stems, and noun endings like
 * -us/-er/-est ("susurrus", "gossamer", "forest") must never be stripped.
 */
const FALLBACK_RULES: Array<{
  suffix: RegExp;
  guard: (word: string) => boolean;
  make: (stem: string) => string[];
}> = [
  { suffix: /ies$/, guard: (w) => w.length >= 6, make: (s) => [s + 'y'] },
  { suffix: /ied$/, guard: (w) => w.length >= 6, make: (s) => [s + 'y'] },
  { suffix: /ing$/, guard: (w) => w.length >= 6, make: edIngCandidates },
  { suffix: /ed$/, guard: (w) => w.length >= 6, make: edIngCandidates },
];

export interface LemmatizerOptions {
  /** Known-lemma set used to validate rule outputs (e.g., frequency list). */
  knownLemmas?: ReadonlySet<string>;
}

export function createLemmatizer(options: LemmatizerOptions = {}) {
  const known = options.knownLemmas;

  // Pass-1 rules only fire on lexicon validation; without a lexicon, only
  // the conservative fallbacks below apply (agentive/ambiguous suffixes
  // would otherwise mangle rare words like "gossamer").
  const valid = (form: string): boolean => (known ? known.has(form) : false);

  return {
    /** Best-effort lemma for a surface form. */
    lemma(surface: string): string {
      // Possessives first: the tokenizer keeps "market's" as one token (for
      // display), the lemma is the possessed noun.
      const word = surface.toLowerCase().replace(/['’]s$/, '');
      if (word.length <= 2) return word;

      const irregular = IRREGULAR[word];
      if (irregular) return irregular;

      // Pass 1 — validated stems: the suffix rules are applied with their
      // candidates checked against the known-lemma set. This keeps listed
      // surfaces intact ("news" stays "news") while still unifying listed
      // inflections to a listed lemma ("studies" → "study").
      for (const rule of SUFFIX_RULES) {
        if (rule.suffix.test(word)) {
          const stem = word.replace(rule.suffix, '');
          for (const candidate of rule.make(stem)) {
            if (valid(candidate) && candidate !== word && candidate.length > 1) return candidate;
          }
        }
      }

      // Pass 2 — rare-word fallback: the surface is NOT itself a known lemma
      // and no stem validated (the corpus is frequency-biased, so rare lemmas
      // like "cacophony" are absent while "cacophonies" appears in real text).
      // Only high-precision inflectional suffixes qualify; agentive -er and
      // -est nouns ("gossamer", "forest") must never be stripped.
      if (!known?.has(word)) {
        for (const rule of FALLBACK_RULES) {
          if (rule.suffix.test(word) && rule.guard(word)) {
            const stem = word.replace(rule.suffix, '');
            const candidate = rule.make(stem).find((s) => s.length >= 3);
            if (candidate) return candidate;
          }
        }
      }

      return word;
    },
  };
}

/**
 * Stateless convenience wrapper — irregulars plus conservative fallbacks
 * only (no lexicon, so no aggressive suffix rules). Production paths pass a
 * corpus-validated lemmatizer instead.
 */
export const lemmatize = (surface: string): string => createLemmatizer().lemma(surface);
