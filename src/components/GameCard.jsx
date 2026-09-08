import { memo } from 'react'
import SpreadInput from './SpreadInput.jsx'
import { TEAM_BY_ID } from '../data/teams.js'
import { describeSpread, formatSpread, gradeGuess } from '../lib/lines.js'
import { formatKickoff } from '../lib/schedule.js'

// Only name a window that says something the date and time do not. "Wednesday"
// next to a Wednesday date is noise; "Sunday Night" is not.
const NAMED_WINDOWS = new Set(['Thursday Night', 'Sunday Night', 'Monday Night', 'Sunday morning'])

const SOURCE_LABEL = {
  captured: 'from your captured pre-game snapshot',
  live: 'live from The Odds API',
}

function GameCard({ game, guess, reveal, captured, phase, onGuess }) {
  const home = TEAM_BY_ID[game.home]
  const away = TEAM_BY_ID[game.away]
  const grade = reveal ? gradeGuess(guess, reveal.line) : null
  const editable = !reveal

  return (
    <article className={`card${reveal ? ' card--revealed' : ''}`}>
      <div className="card__meta">
        <span className="num">{formatKickoff(game)}</span>
        {NAMED_WINDOWS.has(game.slot)
          ? <><span className="dot">·</span><span>{game.slot}</span></>
          : null}
        {phase === 'live' ? <span className="card__status card__status--live">In progress</span> : null}
        {phase === 'final' ? <span className="card__status card__status--final">Final</span> : null}
      </div>

      <div className="matchup">
        <div className="matchup__team">
          <span className="matchup__abbr">{away.id}</span>
          <span className="matchup__name">{away.name}</span>
        </div>
        <div className="matchup__team">
          <span className="matchup__abbr">{home.id}</span>
          <span className="matchup__name">{home.name}</span>
          <span className="matchup__fav">Home</span>
        </div>
      </div>

      {game.neutralSite ? (
        <p className="card__venue">Neutral site{game.venue ? ` · ${game.venue}` : ''}</p>
      ) : null}

      {editable ? (
        <SpreadInput
          inputId={`line-${game.id}`}
          value={guess ?? null}
          onChange={onGuess}
          home={home.id}
          away={away.id}
        />
      ) : null}

      {reveal ? (
        <>
          <div className="reveal">
            <div className="reveal__cell">
              <span className="reveal__label">Your line</span>
              <b className="num">{formatSpread(guess ?? null)}</b>
              <small>{guess === null || guess === undefined ? 'not entered' : describeSpread(guess, { home: home.id, away: away.id })}</small>
            </div>
            <div className="reveal__cell">
              <span className="reveal__label">Consensus</span>
              <b className="num">{formatSpread(reveal.line)}</b>
              <small>{describeSpread(reveal.line, { home: home.id, away: away.id })}</small>
            </div>
            <div className="reveal__cell reveal__cell--grade">
              {grade ? (
                <>
                  <span className={`grade grade--${grade.tier}`}>{grade.label}</span>
                  {grade.wrongSide ? <span className="grade__side">Wrong side</span> : null}
                </>
              ) : (
                <span className="grade grade--miss">No guess</span>
              )}
            </div>
          </div>
          <p className="books">
            {reveal.books} book{reveal.books === 1 ? '' : 's'}
            {Number.isFinite(reveal.min) && reveal.min !== reveal.max
              ? ` · range ${formatSpread(reveal.min, { pk: '0' })} to ${formatSpread(reveal.max, { pk: '0' })}`
              : ''}
            {' · '}
            {SOURCE_LABEL[reveal.source] || reveal.source}
          </p>
        </>
      ) : null}

      {editable && captured ? (
        <p className="books">Market line captured — hidden until you reveal this week.</p>
      ) : null}
    </article>
  )
}

export default memo(GameCard)
