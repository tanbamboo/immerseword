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
  {
    suffix: /ed$/,
    make: (s) => [
      s, // walked → walk
      s.slice(0, -1), // stopped → stop (dedup consonant) — only if valid
      s + 'e', // believed → believe
    ],
  },
  // walking → walk, making → make, running → run
  {
    suffix: /ing$/,
    make: (s) => [
      s, // walking → walk
      s + 'e', // making → make
      s.slice(0, -1), // running → run (dedup)
    ],
  },
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

export interface LemmatizerOptions {
  /** Known-lemma set used to validate rule outputs (e.g., frequency list). */
  knownLemmas?: ReadonlySet<string>;
}

export function createLemmatizer(options: LemmatizerOptions = {}) {
  const known = options.knownLemmas;

  const valid = (form: string): boolean => (known ? known.has(form) : true);

  return {
    /** Best-effort lemma for a surface form. */
    lemma(surface: string): string {
      const word = surface.toLowerCase();
      if (word.length <= 2) return word;

      const irregular = IRREGULAR[word];
      if (irregular) return irregular;

      // A surface form that is itself a known lemma (e.g., "running" as a
      // noun, "sets" when "sets" is listed) keeps its own rank first; the
      // classifier prefers surface rank via rankOf, so here we only fall
      // through to rules when the surface is not a known lemma.
      if (known?.has(word)) {
        // Still try rules first: "studies" may be known AND have lemma
        // "study" known — the lemma unifies its inflections' statuses.
        for (const rule of SUFFIX_RULES) {
          if (rule.suffix.test(word)) {
            const stem = word.replace(rule.suffix, '');
            for (const candidate of rule.make(stem)) {
              if (valid(candidate) && candidate !== word) return candidate;
            }
          }
        }
        return word;
      }

      for (const rule of SUFFIX_RULES) {
        if (rule.suffix.test(word)) {
          const stem = word.replace(rule.suffix, '');
          for (const candidate of rule.make(stem)) {
            if (valid(candidate) && candidate.length > 1) return candidate;
          }
        }
      }
      return word;
    },
  };
}

/** Stateless convenience wrapper when no validation set is available. */
export const lemmatize = (surface: string): string => createLemmatizer().lemma(surface);
