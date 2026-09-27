let hasChanges = false;

export function markAnalysisChanged() { hasChanges = true; }
export function clearAnalysisChanges() { hasChanges = false; }
export function hasUnsavedAnalysis() { return hasChanges; }

export function confirmDiscardAnalysis() {
  return !hasChanges || window.confirm('Your unsaved moves and board analysis will be lost if you leave this page. Leave anyway?');
}
