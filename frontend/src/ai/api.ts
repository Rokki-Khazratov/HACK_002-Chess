import type { CoachAction, CoachRequest, CoachTurn, Preparation } from './types';

async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (response.status === 404) throw new Error('The coach server needs updating. Restart the local server and reload this page.');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Coach request failed');
  return result as T;
}

export const loadActions = (signal: AbortSignal) => json<{ actions: CoachAction[] }>('/api/ai/actions', { signal });
export const loadHistory = (id: string, signal: AbortSignal) => json<{ turns: CoachTurn[] }>(`/api/ai/history?conversationId=${encodeURIComponent(id)}`, { signal });
export const sendToCoach = (request: CoachRequest) => json<{ turn: CoachTurn }>('/api/ai/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
});

export type PreparationDraft = { id: string; title: string; project: string; updated: number; preparation: Preparation };
export const loadPreparations = (signal: AbortSignal) => json<{ studies: PreparationDraft[] }>('/api/ai/preparations', { signal });
export const savePreparations = (studies: PreparationDraft[]) => json('/api/ai/preparations', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studies }),
});
export const loadActivePreparation = (signal: AbortSignal) => json<{ preparation: Preparation | null }>('/api/ai/active-preparation', { signal });
export const saveActivePreparation = (preparation?: Preparation) => json('/api/ai/active-preparation', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preparation: preparation ?? null }),
});

export const exportHistory = (id: string) => json<{ turns: CoachTurn[] }>(`/api/ai/export?conversationId=${encodeURIComponent(id)}`);

export function seedDemoConversation(conversationId: string, turn: CoachTurn) {
  return json<{ saved: boolean }>('/api/ai/demo-seed', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId, turn }),
  });
}
