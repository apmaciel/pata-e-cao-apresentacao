const STORAGE_KEY = 'pec_reporter_id';

let memoryFallback: string | null = null;

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID.
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// getReporterFingerprint returns a persistent anonymous id identifying this
// browser on each report, generating and storing one on first use.
// Falls back to an in-memory id (lost on reload) if localStorage is blocked,
// so reporting still works — just without a stable id across visits.
export function getReporterFingerprint(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = generateId();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    if (!memoryFallback) memoryFallback = generateId();
    return memoryFallback;
  }
}
