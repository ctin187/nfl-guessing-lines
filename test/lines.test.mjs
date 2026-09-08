import test from 'node:test'
import assert from 'node:assert/strict'
import {
  consensusFromBookmakers, flipConsensus, formatSpread, gradeGuess, parseSpread, stepSpread, summarize,
} from '../src/lib/lines.js'

test('parseSpread accepts the shapes a handicapper actually types', () => {
  assert.equal(parseSpread('-3.5'), -3.5)
  assert.equal(parseSpread('+7'), 7)
  assert.equal(parseSpread('3'), 3)
  assert.equal(parseSpread('  -10  '), -10)
  assert.equal(parseSpread('−6.5'), -6.5) // unicode minus, e.g. from a paste
  assert.equal(parseSpread('pk'), 0)
  assert.equal(parseSpread('.5'), 0.5)
  assert.equal(parseSpread(-2.5), -2.5)
})

test('parseSpread rejects junk', () => {
  for (const bad of ['', '  ', 'abc', '-', '3.5.5', '--3', '3-', NaN, null, undefined]) {
    assert.equal(parseSpread(bad), null, `expected null for ${JSON.stringify(bad)}`)
  }
})

test('formatSpread always carries a sign and trims trailing zeros', () => {
  assert.equal(formatSpread(-3.5), '-3.5')
  assert.equal(formatSpread(7), '+7')
  assert.equal(formatSpread(0), 'PK')
  assert.equal(formatSpread(-3.25), '-3.25')
  assert.equal(formatSpread(null), '—')
})

test('stepSpread moves in half points and snaps off-grid values', () => {
  assert.equal(stepSpread(-3, -1), -3.5)
  assert.equal(stepSpread(-3.5, 1), -3)
  assert.equal(stepSpread(null, -1), -0.5)
  assert.equal(stepSpread(-3.2, 1), -2.5)
  assert.equal(stepSpread(60, 1), 60)
})

const book = (key, point) => ({
  key,
  title: key,
  markets: [{ key: 'spreads', outcomes: [{ name: 'Kansas City Chiefs', point }, { name: 'Buffalo Bills', point: -point }] }],
})

test('consensus takes the median home spread and reports the spread of books', () => {
  const c = consensusFromBookmakers(
    [book('a', -3), book('b', -3.5), book('c', -2.5), book('d', -3.5)],
    'Kansas City Chiefs',
  )
  assert.equal(c.line, -3.25)
  assert.equal(c.books, 4)
  assert.equal(c.min, -3.5)
  assert.equal(c.max, -2.5)
})

test('consensus ignores an outlier book more than the mean does', () => {
  const withOutlier = consensusFromBookmakers(
    [book('a', -3), book('b', -3), book('c', -3), book('d', -14)],
    'Kansas City Chiefs',
  )
  assert.equal(withOutlier.line, -3)
  assert.ok(withOutlier.mean < -5)
})

test('consensus returns null when no book posts a spread', () => {
  assert.equal(consensusFromBookmakers([], 'Kansas City Chiefs'), null)
  assert.equal(
    consensusFromBookmakers([{ key: 'a', markets: [{ key: 'h2h', outcomes: [] }] }], 'Kansas City Chiefs'),
    null,
  )
  assert.equal(consensusFromBookmakers([book('a', -3)], 'Someone Else'), null)
})

test('consensus honours a bookmaker filter', () => {
  const c = consensusFromBookmakers([book('a', -3), book('b', -10)], 'Kansas City Chiefs', { onlyBooks: ['a'] })
  assert.equal(c.line, -3)
  assert.equal(c.books, 1)
})

test('flipConsensus mirrors the quote onto the other side', () => {
  const c = flipConsensus(consensusFromBookmakers([book('a', -3), book('b', -4)], 'Kansas City Chiefs'))
  assert.equal(c.line, 3.5)
  assert.equal(c.min, 3)
  assert.equal(c.max, 4)
})

test('gradeGuess tiers by absolute error and flags the wrong favourite', () => {
  assert.equal(gradeGuess(-3.5, -3.5).tier, 'exact')
  assert.equal(gradeGuess(-3.5, -3.5).label, 'Exact')
  assert.equal(gradeGuess(-3, -3.5).label, 'Off by 0.5')
  assert.equal(gradeGuess(-3, -3.5).tier, 'sharp')
  assert.equal(gradeGuess(-1, -3.5).tier, 'close')
  assert.equal(gradeGuess(2, -3.5).tier, 'wide')
  assert.equal(gradeGuess(10, -3.5).tier, 'miss')
  assert.equal(gradeGuess(3, -3.5).wrongSide, true)
  assert.equal(gradeGuess(-1, -3.5).wrongSide, false)
  assert.equal(gradeGuess(0, -3.5).wrongSide, false) // a pick'em is not a side
  assert.equal(gradeGuess(null, -3.5), null)
})

test('summarize rolls a week of grades into a scoreboard', () => {
  const s = summarize([
    gradeGuess(-3.5, -3.5),
    gradeGuess(-3, -3.5),
    gradeGuess(7, -3),
    null,
  ])
  assert.equal(s.count, 3)
  assert.equal(s.exact, 1)
  assert.equal(s.withinOne, 2)
  assert.equal(s.wrongSide, 1)
  assert.equal(s.worst, 10)
  assert.equal(s.best, 0)
  assert.equal(summarize([]), null)
})
