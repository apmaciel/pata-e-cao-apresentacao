import { SERVICE_CATALOG } from './serviceCatalog';

export function statusClass(status: string): string {
  const map: Record<string, string> = {
    pending: 'text-yellow-700 bg-yellow-50',
    under_review: 'text-yellow-700 bg-yellow-50',
    approved: 'text-green-700 bg-green-50',
    suspended: 'text-red-700 bg-red-50',
    rejected: 'text-gray-500 bg-gray-100',
  };
  return map[status] ?? 'text-gray-500 bg-gray-100';
}

export function serviceLabel(value: string): string {
  return SERVICE_CATALOG.find((s) => s.value === value)?.labelKey ?? value;
}

export const STATUS_TABS = [
  { value: '', labelKey: 'admin.all' },
  { value: 'pending', labelKey: 'admin.statusPending' },
  { value: 'approved', labelKey: 'admin.statusApproved' },
  { value: 'suspended', labelKey: 'admin.statusSuspended' },
  { value: 'rejected', labelKey: 'admin.statusRejected' },
] as const;
