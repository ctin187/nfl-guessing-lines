import { formatSpread } from '../lib/lines.js'

const Stat = ({ value, label }) => (
  <div className="summary__stat">
    <b className="num">{value}</b>
    <span>{label}</span>
  </div>
)

/** Progress before the reveal, scoreboard after it. */
export default function WeekSummary({ total, entered, summary, revealed }) {
  const pct = total ? Math.round((entered / total) * 100) : 0

  if (!summary) {
    return (
      <section className="summary" aria-label="Week progress">
        <div className="summary__row">
          <Stat value={`${entered}/${total}`} label="Lines set" />
          <Stat value={`${pct}%`} label="Complete" />
          <Stat value={total - entered} label="Remaining" />
        </div>
        <div className="progress"><i style={{ width: `${pct}%` }} /></div>
      </section>
    )
  }

  return (
    <section className="summary" aria-label="Week results">
      <div className="summary__row">
        <Stat value={summary.avgError.toFixed(2)} label="Avg error" />
        <Stat value={summary.exact} label="Exact" />
        <Stat value={summary.withinOne} label="Within 1" />
        <Stat value={formatSpread(summary.worst).replace('+', '')} label="Worst" />
      </div>
      <p className="summary__note">
        {summary.count} of {total} graded
        {revealed < total ? ` · ${total - revealed} game${total - revealed === 1 ? '' : 's'} without a market line` : ''}
        {summary.wrongSide ? ` · ${summary.wrongSide} on the wrong side` : ''}
      </p>
    </section>
  )
}
