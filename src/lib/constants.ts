// Tower workflow statuses
export const TOWER_STATUSES = {
  DETERMINING_OWNER_CALLS: 'determining_owner_calls',
  COULDNT_FIND_OWNER_CALLS: 'couldnt_find_owner_calls',
  DETERMINING_OWNER_TITLE: 'determining_owner_title',
  OWNER_FOUND: 'owner_found',
  CALLING_OWNER: 'calling_owner',
  RENEGOTIATION: 'renegotiation_in_process',
  CLOSED_WON: 'closed_won',
} as const;

export type TowerStatus = typeof TOWER_STATUSES[keyof typeof TOWER_STATUSES];

// Human-readable labels for each status
export const TOWER_STATUS_LABELS: Record<string, string> = {
  [TOWER_STATUSES.DETERMINING_OWNER_CALLS]: 'Determining property owner via calls',
  [TOWER_STATUSES.COULDNT_FIND_OWNER_CALLS]: "Couldn't figure out property owner via calls",
  [TOWER_STATUSES.DETERMINING_OWNER_TITLE]: 'Determining property owner via title deed purchase',
  [TOWER_STATUSES.OWNER_FOUND]: 'Property owner found',
  [TOWER_STATUSES.CALLING_OWNER]: 'Calling property owner',
  [TOWER_STATUSES.RENEGOTIATION]: 'Renegotiation in process',
  [TOWER_STATUSES.CLOSED_WON]: 'Closed Won',
  // Legacy values for backwards compatibility
  Unknown: 'Unknown',
  New: 'New',
  Researched: 'Researched',
  Contacted: 'Contacted',
  Closed: 'Closed',
};

// Options for dropdown/select components
export const TOWER_STATUS_OPTIONS = [
  { value: TOWER_STATUSES.DETERMINING_OWNER_CALLS, label: 'Determining property owner via calls' },
  { value: TOWER_STATUSES.COULDNT_FIND_OWNER_CALLS, label: "Couldn't figure out property owner via calls" },
  { value: TOWER_STATUSES.DETERMINING_OWNER_TITLE, label: 'Determining property owner via title deed purchase' },
  { value: TOWER_STATUSES.OWNER_FOUND, label: 'Property owner found' },
  { value: TOWER_STATUSES.CALLING_OWNER, label: 'Calling property owner' },
  { value: TOWER_STATUSES.RENEGOTIATION, label: 'Renegotiation in process' },
  { value: TOWER_STATUSES.CLOSED_WON, label: 'Closed Won' },
];

// Helper function to get label for a status
export function getStatusLabel(status: string): string {
  return TOWER_STATUS_LABELS[status] || status;
}
