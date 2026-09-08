import Sheet from './Sheet.jsx'
import { formatSpread } from '../lib/lines.js'

const Stat = ({ value, label }) => (
  <div className="summary__stat">
    <b className="num">{value}</b>
    <span>{label}</span>
  </div>
)

/**
 * Zoomed-out view of the season: how you are doing overall, and every week at a
 * glance. Tapping a week jumps to it.
 */
export default function SeasonSheet({ schedule, week, weeks, season, onPick, onClose }) {
  const graded = weeks.filter((w) => w.summary)
  // With one week graded the "best" week is also the worst; not worth saying.
  const best = graded.length > 1
    ? graded.reduce((a, b) => (b.summary.avgError < a.summary.avgError ? b : a))
    : null

  return (
    <Sheet title={`${schedule.season} regular season`} onClose={onClose}>
      {season ? (
        <section className="summary" style={{ marginTop: 0, marginBottom: 16 }} aria-label="Season to date">
          <div className="summary__row">
            <Stat value={season.avgError.toFixed(2)} label="Avg error" />
            <Stat value={season.exact} label="Exact" />
            <Stat value={`${Math.round((season.withinOne / season.count) * 100)}%`} label="Within 1" />
            <Stat value={season.count} label="Graded" />
          </div>
          <p className="summary__note">
            {best ? `Best week: ${best.week} at ${best.summary.avgError.toFixed(2)} · ` : ''}
            {`worst miss ${formatSpread(season.worst).replace('+', '')}`}
            {season.wrongSide ? ` · ${season.wrongSide} on the wrong side` : ''}
          </p>
        </section>
      ) : (
        <p className="field__hint" style={{ margin: '0 0 16px' }}>
          Nothing revealed yet. Once a week is graded, your season numbers show up here.
        </p>
      )}

      <div className="weekgrid">
        {weeks.map((w) => {
          const pct = w.total ? Math.round((w.entered / w.total) * 100) : 0
          return (
            <button
              key={w.week}
              type="button"
              className="weekcell"
              aria-current={w.week === week}
              onClick={() => { onPick(w.week); onClose() }}
            >
              <b>Week {w.week}</b>
              <span>
                {w.summary
                  ? `${w.summary.avgError.toFixed(2)} avg`
                  : w.revealed
                    ? `${w.revealed}/${w.total} revealed`
                    : `${w.entered}/${w.total} set`}
              </span>
              <span className="bar">
                <i style={{ width: `${w.summary ? 100 : pct}%` }} />
              </span>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
