import type { ReactNode } from 'react';

/** A dashboard/position stat tile. The explanation goes in the `note` tooltip (hover), not as visible text,
 *  so tiles in the same row stay the same height regardless of how long each one's explanation is. */
export function Stat({ label, value, note, accent }: { label: string; value: ReactNode; note?: string; accent?: boolean }) {
  return (
    <div className="stat" title={note}>
      <span className="label">{label}</span>
      <span className={accent ? 'value accent' : 'value'}>{value}</span>
    </div>
  );
}
