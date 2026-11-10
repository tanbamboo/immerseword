/**
 * Pass pill (PRD F3): the small floating 3-pass companion in the page's
 * bottom-right corner. Shows the current pass with its reading hint,
 * advances the flow, and renders the session summary when done. Shadow DOM
 * isolated; only visible while a session is active.
 */

import type { IwPass, IwSession } from '../shared/types';

export interface PillDeps {
  transition: (action: 'next' | 'reset') => Promise<void>;
}

const PASS_INFO: Record<Exclude<IwPass, 'done'>, { name: string; hint: string; next: string }> = {
  1: {
    name: 'Gist',
    hint: 'Read for the overall meaning. Don’t stop for words.',
    next: 'Start Pass 2 · Study',
  },
  2: {
    name: 'Study',
    hint: 'Tap words you don’t know and classify them honestly.',
    next: 'Start Pass 3 · Fluency',
  },
  3: {
    name: 'Fluency',
    hint: 'Reread at full speed — enjoy how much clearer it feels.',
    next: 'Finish session',
  },
};

const STYLE = `
  :host { all: initial; }
  * { box-sizing: border-box; font: 13px/1.45 system-ui, "Segoe UI", sans-serif; }
  .pill {
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
    width: 300px; max-width: calc(100vw - 32px);
    background: #1f2933; color: #f3f4f6;
    border-radius: 14px; padding: 12px 14px;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.35);
  }
  .row { display: flex; align-items: center; gap: 8px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #6b7280; flex: none; }
  .dot.on { background: #34d399; box-shadow: 0 0 6px #34d399; }
  .pass-label { font-weight: 700; letter-spacing: 0.01em; }
  .pass-name { color: #a5f3fc; }
  .spacer { flex: 1; }
  .hint { margin: 8px 0 10px; color: #d1d5db; font-size: 12.5px; }
  button {
    width: 100%; border: 0; border-radius: 9px; padding: 8px 10px;
    background: #4f46e5; color: #fff; font-weight: 600; cursor: pointer;
  }
  button:hover { background: #6366f1; }
  button.ghost { background: transparent; color: #9ca3af; border: 1px solid #4b5563; }
  button.ghost:hover { color: #e5e7eb; }
  .steps { display: flex; gap: 5px; margin-top: 10px; }
  .steps span { flex: 1; height: 4px; border-radius: 2px; background: #4b5563; }
  .steps span.done { background: #34d399; }
  .steps span.now { background: #a5f3fc; }
  .summary { max-height: 300px; overflow: auto; }
  .summary h3 { margin: 0 0 8px; font-size: 14px; }
  .summary table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .summary td { padding: 3px 0; color: #d1d5db; }
  .summary td.num { text-align: right; color: #fff; font-weight: 600; }
  .summary .actions { display: grid; gap: 6px; margin-top: 10px; }
`;

export function createPassPill(deps: PillDeps) {
  const host = document.createElement('div');
  host.className = 'iw-ui';
  host.id = 'iw-pass-pill';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  const box = document.createElement('div');
  box.className = 'pill';
  box.style.display = 'none';
  shadow.append(style, box);
  document.documentElement.append(host);

  let current: IwSession | null = null;

  function fmtDuration(ms: number): string {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  }

  function render(): void {
    box.innerHTML = '';
    if (!current) {
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';

    if (current.pass === 'done') {
      renderSummary();
      return;
    }

    const info = PASS_INFO[current.pass];

    const row = document.createElement('div');
    row.className = 'row';
    const passLabel = document.createElement('span');
    passLabel.className = 'pass-label';
    const passNum = Number(current.pass);
    passLabel.textContent = `Pass ${passNum} of 3`;
    const passName = document.createElement('span');
    passName.className = 'pass-name';
    passName.textContent = `· ${info.name}`;
    const spacer = document.createElement('span');
    spacer.className = 'spacer';
    const close = document.createElement('button');
    close.className = 'ghost';
    close.style.width = 'auto';
    close.textContent = '✕';
    close.title = 'End session';
    close.addEventListener('click', () => void deps.transition('reset'));
    row.append(passLabel, passName, spacer, close);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = info.hint;

    const next = document.createElement('button');
    next.textContent = info.next;
    next.addEventListener('click', () => void deps.transition('next'));

    const steps = document.createElement('div');
    steps.className = 'steps';
    for (let i = 1; i <= 3; i++) {
      const seg = document.createElement('span');
      if (i < passNum) seg.classList.add('done');
      if (i === passNum) seg.classList.add('now');
      steps.append(seg);
    }

    box.append(row, hint, next, steps);
  }

  function renderSummary(): void {
    const session = current!;
    box.className = 'pill summary';

    const title = document.createElement('h3');
    title.textContent = 'Session complete ✨';
    const table = document.createElement('table');

    const totalMs = Date.now() - session.startedAt;
    const rows: Array<[string, string]> = [
      ['Total time', fmtDuration(totalMs)],
      ...session.history
        .filter((h) => h.pass !== 'done')
        .map((h, i) => {
          const end = h.exitedAt ?? session.history[i + 1]?.enteredAt ?? Date.now();
          const info = PASS_INFO[h.pass as Exclude<IwPass, 'done'>];
          return [`Pass ${h.pass} · ${info.name}`, fmtDuration(end - h.enteredAt)] as [string, string];
        }),
      ['Lookups', String(session.stats.lookups)],
      ['Marked known', String(session.stats.classified.known)],
      ['Marked learning', String(session.stats.classified.learning)],
      ['Marked unknown', String(session.stats.classified.unknown)],
    ];
    for (const [label, value] of rows) {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.textContent = label;
      const td2 = document.createElement('td');
      td2.className = 'num';
      td2.textContent = value;
      tr.append(td1, td2);
      table.append(tr);
    }

    const actions = document.createElement('div');
    actions.className = 'actions';
    const again = document.createElement('button');
    again.textContent = 'New 3-pass session';
    again.addEventListener('click', () => void deps.transition('reset'));
    const dismiss = document.createElement('button');
    dismiss.className = 'ghost';
    dismiss.textContent = 'Close';
    dismiss.addEventListener('click', () => {
      current = null;
      render();
      document.documentElement.dataset.iwPass = '';
      delete document.documentElement.dataset.iwPass;
    });
    actions.append(again, dismiss);

    box.append(title, table, actions);
  }

  return {
    update(session: IwSession | null): void {
      current = session;
      box.className = 'pill';
      render();
    },
    get current(): IwSession | null {
      return current;
    },
  };
}
