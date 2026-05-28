// Single source of truth for the platform's service catalog. Used by:
//   - SearchProviders.tsx (filter dropdown)
//   - ProviderApplyForm.tsx (registration dropdown)
//   - Header.tsx (?service= query params on the featured nav links)
//
// The `value` strings are the canonical tokens persisted on providers.services
// and accepted by the backend search filter. Any new service must be added
// here and translated in every locale under "services.catalog.<key>".

export interface ServiceOption {
  value: string;
  labelKey: string;
}

export const SERVICE_CATALOG: ServiceOption[] = [
  { value: 'walking', labelKey: 'services.catalog.walking' },
  { value: 'training', labelKey: 'services.catalog.training' },
  { value: 'boarding', labelKey: 'services.catalog.boarding' },
];

/** Translation key for the canonical service token, or null if unknown. */
export function serviceLabelKey(value: string): string | null {
  return SERVICE_CATALOG.find((s) => s.value === value)?.labelKey ?? null;
}
