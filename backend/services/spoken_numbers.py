"""Convert spoken numbers in dictation to digits for rule-based extraction.

"ANC four twenty" -> "ANC 420", "temp one oh one point three" -> "temp 101.3",
"platelets eighty eight thousand" -> "platelets 88000", "zero point four" -> "0.4".

Mirrors apps/web/lib/spoken-numbers.ts — keep the two in step.
"""
from __future__ import annotations

import re

UNITS = {
    "zero": 0, "oh": 0, "o": 0, "nought": 0,
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
}
TEENS = {
    "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
}
TENS = {
    "twenty": 20, "thirty": 30, "forty": 40, "fourty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
}

_WORD_RE = re.compile(r"[A-Za-z]+")
_GAP_RE = re.compile(r"^[\s-]*$")


def _kind(word: str) -> str | None:
    if word in UNITS:
        return "unit"
    if word in TEENS:
        return "teen"
    if word in TENS:
        return "tens"
    if word in ("hundred", "thousand", "point"):
        return word
    return None


def _value(word: str) -> int:
    return UNITS.get(word, TEENS.get(word, TENS.get(word, 0)))


def _parse_integer(words: list[str]) -> int:
    kinds = [_kind(w) for w in words]
    if len(words) > 1 and all(k == "unit" for k in kinds):
        return int("".join(str(UNITS[w]) for w in words))
    if len(words) > 1 and any(w in ("oh", "o") for w in words):
        return int("".join(str(_value(w)) for w in words))

    total = current = 0
    last: str | None = None
    scaled = False
    for word, kind in zip(words, kinds):
        v = _value(word)
        if kind == "unit":
            current += v
        elif kind in ("teen", "tens"):
            # Colloquial pairs: "four twenty" = 420, "twelve fifty" = 1250.
            if last in ("unit", "teen", "tens") and not scaled and 0 < current < 100:
                current = current * 100 + v
            else:
                current += v
        elif kind == "hundred":
            current = (current or 1) * 100
            scaled = True
        elif kind == "thousand":
            total += (current or 1) * 1000
            current = 0
            scaled = False
        last = kind
    return total + current


def _is_lone_o(tokens: list[tuple[str, int, int]], i: int) -> bool:
    """A bare "o" is only a zero inside a number ("one o five"), never on its own."""
    if tokens[i][0] != "o":
        return False
    prev_ok = i > 0 and _kind(tokens[i - 1][0]) is not None
    next_ok = i + 1 < len(tokens) and _kind(tokens[i + 1][0]) is not None
    return not (prev_ok and next_ok)


def spoken_numbers_to_digits(text: str) -> str:
    """Replace each run of spoken number words with digits; other text is unchanged."""
    tokens = [(m.group(0).lower(), m.start(), m.end()) for m in _WORD_RE.finditer(text)]
    out: list[str] = []
    cursor = 0
    i = 0
    while i < len(tokens):
        word = tokens[i][0]
        if _kind(word) in (None, "point") or _is_lone_o(tokens, i):
            i += 1
            continue
        j = i
        while j + 1 < len(tokens):
            if not _GAP_RE.match(text[tokens[j][2]:tokens[j + 1][1]]):
                break
            nxt = tokens[j + 1][0]
            if _kind(nxt):
                j += 1
                continue
            if (
                nxt == "and"
                and j + 2 < len(tokens)
                and _kind(tokens[j + 2][0])
                and _GAP_RE.match(text[tokens[j + 1][2]:tokens[j + 2][1]])
            ):
                j += 2
                continue
            break
        words = [t[0] for t in tokens[i:j + 1] if t[0] != "and"]
        if len(words) == 1 and words[0] in ("oh", "o"):
            i = j + 1
            continue
        while words and words[-1] == "point":
            words.pop()
        if "point" in words:
            p = words.index("point")
            int_words, dec_words = words[:p], [w for w in words[p + 1:] if _kind(w) in ("unit", "teen")]
        else:
            int_words, dec_words = words, []
        integer = _parse_integer(int_words) if int_words else 0
        value = f"{integer}.{''.join(str(_value(w)) for w in dec_words)}" if dec_words else str(integer)
        out.append(text[cursor:tokens[i][1]])
        out.append(value)
        cursor = tokens[j][2]
        i = j + 1
    out.append(text[cursor:])
    return "".join(out)
