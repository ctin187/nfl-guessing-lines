import Sheet from './Sheet.jsx'

/** Grid of all 18 weeks with per-week fill state, so jumping around is one tap. */
export default function WeekPicker({ schedule, week, stats, onPick, onClose }) {
  const weeks = Array.from({ length: schedule.weeks }, (_, i) => i + 1)
  return (
    <Sheet title={`${schedule.season} regular season`} onClose={onClose}>
      <div className="weekgrid">
        {weeks.map((w) => {
          const s = stats(w)
          const pct = s.total ? Math.round((s.entered / s.total) * 100) : 0
          return (
            <button
              key={w}
              type="button"
              className="weekcell"
              aria-current={w === week}
              onClick={() => { onPick(w); onClose() }}
            >
              <b>Week {w}</b>
              <span>
                {s.revealed
                  ? `${s.revealed}/${s.total} revealed`
                  : `${s.entered}/${s.total} set`}
              </span>
              <span className="bar"><i style={{ width: `${pct}%` }} /></span>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
