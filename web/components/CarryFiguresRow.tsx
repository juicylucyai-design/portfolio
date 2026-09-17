import type { CarryFigures } from '@nksq/contracts';
import { Stat } from '@/components/Stat';
import { usd } from '@/lib/format';

/** The four carry stat tiles for one basis (projected or current). Renders nothing if there's nothing to show. */
export function CarryFiguresRow({ label, figures, profitNote }: { label: string; figures: CarryFigures; profitNote: string }) {
  if (figures.totalCarryUsd === null) return null;
  return (
    <div className="stats">
      <Stat label={`${label} profit`} value={usd(figures.profitUsd)} note={profitNote} />
      <Stat label="Hurdle" value={usd(figures.hurdleAmountUsd)} note="Minimum return on cost, compounded annually over the holding period, before carry applies." />
      <Stat label="Carriable profit" value={usd(figures.carriableProfitUsd)} note="Profit above the hurdle." />
      <Stat
        label={`${label} carry`}
        value={usd(figures.totalCarryUsd)}
        note={`Origination ${usd(figures.originationCarryUsd)} · Monitoring ${usd(figures.monitoringCarryUsd)} · Closure ${usd(figures.closureCarryUsd)}.`}
        accent
      />
    </div>
  );
}
