import { renderColored } from './colorize';
import type { AlignedLine } from './types';

const CSS = `
#ll-overlay {
  position: absolute; left: 50%; transform: translateX(-50%); bottom: 16%; z-index: 60;
  pointer-events: none; text-align: center; width: max-content; max-width: 80%;
  box-sizing: border-box; padding: .25em .6em; border-radius: .3em;
  background: rgba(8,8,8,.75); color: #fff; line-height: 1.3;
  font-family: "YouTube Noto", Roboto, Arial, Helvetica, sans-serif;
}
#ll-overlay[hidden], #ll-overlay [hidden] { display: none; }
#ll-overlay [data-word] { pointer-events:auto; cursor:pointer; background:none; border:0; padding:0; font:inherit; color:inherit; }
#ll-overlay [data-word]:hover { text-decoration:underline; }
#ll-overlay [data-word]:focus-visible { outline:2px solid white; outline-offset:2px; }
#ll-overlay .ll-src { font-size: .9em; opacity: .85; }
#ll-overlay .ll-tgt { font-weight: 700; }
#ll-overlay .ll-loading { font-size: .7em; color: #fff; font-weight: 400; }
`;

let observer: ResizeObserver | null = null;

export function mountOverlay(): { root: HTMLElement; destroy(): void } {
  const player = document.querySelector<HTMLElement>('#movie_player');
  if (!player) throw new Error('#movie_player not found');

  if (!document.getElementById('ll-overlay-style')) {
    const style = document.createElement('style');
    style.id = 'll-overlay-style';
    style.textContent = CSS;
    document.head.append(style);
  }

  let root = player.querySelector<HTMLElement>('#ll-overlay');
  if (!root) {
    root = document.createElement('div');
    root.id = 'll-overlay';
    root.hidden = true;
    for (const cls of ['ll-src', 'll-tgt', 'll-loading']) {
      const row = document.createElement('div');
      row.className = cls;
      root.append(row);
    }
    player.append(root);
  }

  const el = root;
  const resize = () => { el.style.fontSize = `${player.clientHeight * 0.04}px`; };
  observer?.disconnect();
  observer = new ResizeObserver(resize);
  observer.observe(player);
  resize();

  return {
    root: el,
    destroy() {
      observer?.disconnect();
      observer = null;
      el.remove();
    },
  };
}

// Shows `line` in the overlay, or hides the box when there is no current line.
export function renderLine(root: HTMLElement, line: AlignedLine | null) {
  const src = root.querySelector<HTMLElement>('.ll-src');
  const tgt = root.querySelector<HTMLElement>('.ll-tgt');
  if (!src || !tgt) return;
  // YouTube's native English caption remains visible while translation loads.
  // Showing the source here too would create two identical English captions.
  if (!line?.tgt) {
    root.hidden = root.dataset.waiting !== 'true';
    src.replaceChildren();
    tgt.replaceChildren();
    return;
  }
  src.replaceChildren(renderColored(line.src, line.pairs.map((p) => p.src)));
  tgt.replaceChildren(renderColored(line.tgt, line.pairs.map((p) => p.tgt)));
  tgt.hidden = !line.tgt;
  root.hidden = false;
}

export function renderBuffering(root: HTMLElement, waiting: boolean, language = 'Spanish') {
  const label = root.querySelector<HTMLElement>('.ll-loading');
  if (!label) return;
  root.dataset.waiting = String(waiting);
  label.textContent = waiting ? `Preparing ${language} captions… Playback will resume automatically. Turn bilingual captions off to continue in English.` : '';
  label.hidden = !waiting;
  root.hidden = !waiting && !root.querySelector('.ll-tgt')?.textContent;
}
