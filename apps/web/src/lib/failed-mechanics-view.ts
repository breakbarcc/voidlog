// Shared with the client-side table (components/failed-mechanics-table.tsx),
// so it must not import the database client — the loading lives in
// failed-mechanics.ts.

export const TOP_FAILED_MECHANICS = 5;

export interface FailedMechanic {
  bossId: string;
  mechanicName: string;
  displayName: string;
  count: number;
  /** Attempts with at least one fail of this mechanic. */
  attempts: number;
}

/** One table's worth: the top fails and the number of attempts they're counted over. */
export interface FailedMechanicsView {
  mechanics: FailedMechanic[];
  attempts: number;
}
