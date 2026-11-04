/**
 * Converts spoken numbers in dictation to digits so on-device extraction can read them:
 * "ANC four twenty" → "ANC 420", "temp one oh one point three" → "temp 101.3",
 * "platelets eighty eight thousand" → "platelets 88000", "zero point four" → "0.4".
 *
 * Used on a copy of the transcript for analysis; the clinician's text is not changed.
 * Mirrored in backend/services/spoken_numbers.py — keep the two in step.
 */

const UNITS: Record<string, number> = {
  zero: 0, oh: 0, o: 0, nought: 0,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
}
const TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}

type Kind = "unit" | "teen" | "tens" | "hundred" | "thousand" | "point"

function kindOf(word: string): Kind | null {
  if (word in UNITS) return "unit"
  if (word in TEENS) return "teen"
  if (word in TENS) return "tens"
  if (word === "hundred") return "hundred"
  if (word === "thousand") return "thousand"
  if (word === "point") return "point"
  return null
}

function valueOf(word: string): number {
  return UNITS[word] ?? TEENS[word] ?? TENS[word] ?? 0
}

/** Integer value of a run of number words (no "point"). */
function parseInteger(words: string[]): number | null {
  if (!words.length) return null
  const kinds = words.map(kindOf)
  // "one oh one", "four two zero": a string of single digits is read digit by digit.
  const allUnits = kinds.every((k) => k === "unit")
  if (allUnits && words.length > 1) return Number(words.map((w) => UNITS[w]).join(""))
  // "oh" inside a run ("one oh five") also means digit-by-digit reading.
  if (words.length > 1 && words.some((w) => w === "oh" || w === "o")) {
    return Number(words.map((w) => String(valueOf(w))).join(""))
  }

  let total = 0
  let current = 0
  let last: Kind | null = null
  let scaled = false // current already includes a "hundred"
  for (let i = 0; i < words.length; i++) {
    const k = kinds[i]
    const v = valueOf(words[i])
    if (k === "unit") {
      current += v
    } else if (k === "teen" || k === "tens") {
      // Colloquial pairs: "four twenty" = 420, "twelve fifty" = 1250, "nine fifteen" = 915.
      if ((last === "unit" || last === "teen" || last === "tens") && !scaled && current > 0 && current < 100) {
        current = current * 100 + v
      } else {
        current += v
      }
    } else if (k === "hundred") {
      current = (current || 1) * 100
      scaled = true
    } else if (k === "thousand") {
      total += (current || 1) * 1000
      current = 0
      scaled = false
    }
    last = k
  }
  return total + current
}

/** Decimal digits after "point": "point six" → "6", "point two five" → "25". */
function parseDecimals(words: string[]): string {
  return words.map((w) => String(valueOf(w))).join("")
}

const WORD_RE = /[A-Za-z]+/g

/** Replaces each run of spoken number words with digits; everything else is left as is. */
export function spokenNumbersToDigits(text: string): string {
  const tokens: { word: string; start: number; end: number }[] = []
  for (const m of text.matchAll(WORD_RE)) tokens.push({ word: m[0].toLowerCase(), start: m.index!, end: m.index! + m[0].length })

  let out = ""
  let cursor = 0
  let i = 0
  while (i < tokens.length) {
    if (!kindOf(tokens[i].word) || kindOf(tokens[i].word) === "point" || isLoneO(tokens, i)) {
      i++
      continue
    }
    // Grow the run while tokens are number words separated only by spaces/hyphens
    // (or "and" between two number words: "one hundred and twenty").
    let j = i
    while (j + 1 < tokens.length) {
      const gap = text.slice(tokens[j].end, tokens[j + 1].start)
      if (!/^[\s-]*$/.test(gap)) break
      const next = tokens[j + 1].word
      if (kindOf(next)) {
        j++
        continue
      }
      if (next === "and" && j + 2 < tokens.length && kindOf(tokens[j + 2].word) && /^[\s-]*$/.test(text.slice(tokens[j + 1].end, tokens[j + 2].start))) {
        j += 2
        continue
      }
      break
    }
    const words = tokens.slice(i, j + 1).map((t) => t.word).filter((w) => w !== "and")
    // "oh" on its own is an interjection ("Oh well"), not a zero.
    if (words.length === 1 && (words[0] === "oh" || words[0] === "o")) {
      i = j + 1
      continue
    }
    // Trailing "point" with nothing after it is not part of the number.
    while (words.length && words[words.length - 1] === "point") words.pop()
    const pointAt = words.indexOf("point")
    const intWords = pointAt === -1 ? words : words.slice(0, pointAt)
    const decWords = pointAt === -1 ? [] : words.slice(pointAt + 1).filter((w) => kindOf(w) === "unit" || kindOf(w) === "teen")
    const integer = intWords.length ? parseInteger(intWords) : 0
    // A lone "one"/"o" etc. that is clearly a word ("no one") still converts harmlessly to a digit.
    if (integer === null) {
      i = j + 1
      continue
    }
    const value = decWords.length ? `${integer}.${parseDecimals(decWords)}` : String(integer)
    out += text.slice(cursor, tokens[i].start) + value
    cursor = tokens[j].end
    i = j + 1
  }
  return out + text.slice(cursor)
}

/** A bare "o" is only a zero inside a number ("one o five"), never on its own. */
function isLoneO(tokens: { word: string }[], i: number): boolean {
  if (tokens[i].word !== "o") return false
  const prev = tokens[i - 1]?.word
  const next = tokens[i + 1]?.word
  return !(prev && kindOf(prev)) || !(next && kindOf(next))
}
