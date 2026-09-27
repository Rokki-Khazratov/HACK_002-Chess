import { useEffect, useState } from 'react';
import type { Preparation } from './types';
import { loadActivePreparation, saveActivePreparation } from './api';

const KEY = 'chessscope.ai.preparation';
const EVENT = 'chessscope-preparation-change';
let selectedInMemory: Preparation | undefined;
let hasMemorySelection = false;
let selectionRevision = 0;

export function readPreparation(): Preparation | undefined {
  if (hasMemorySelection) return selectedInMemory;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return saved && typeof saved.id === 'string' && typeof saved.project === 'string' ? saved : undefined;
  } catch { return undefined; }
}

export function usePreparation() {
  const [preparation, setPreparation] = useState(readPreparation);
  useEffect(() => {
    const controller = new AbortController();
    const revision = selectionRevision;
    loadActivePreparation(controller.signal).then(({ preparation: saved }) => {
      if (!controller.signal.aborted && revision === selectionRevision) {
        selectedInMemory = saved ?? undefined; hasMemorySelection = true;
        setPreparation(selectedInMemory);
      }
    }).catch(() => { /* Keep the last known local context if the server is offline. */ });
    const update = (event: Event) => {
      if (event.type === 'storage') hasMemorySelection = false;
      setPreparation(readPreparation());
    };
    window.addEventListener(EVENT, update); window.addEventListener('storage', update);
    return () => { controller.abort(); window.removeEventListener(EVENT, update); window.removeEventListener('storage', update); };
  }, []);
  return preparation;
}

export async function selectPreparation(preparation?: Preparation) {
  // Explicit handoff: a search alone must not change the board's preparation.
  await saveActivePreparation(preparation);
  selectionRevision += 1;
  selectedInMemory = preparation;
  hasMemorySelection = true;
  try {
    if (preparation) localStorage.setItem(KEY, JSON.stringify(preparation));
    else localStorage.removeItem(KEY);
  } catch { /* Navigation still works when the browser denies persistent storage. */ }
  window.dispatchEvent(new Event(EVENT));
}
