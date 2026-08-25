/**
 * Virtual card numbers, generated server-side only (`cards.md`: "A card
 * number produced in the browser is a bug"). Every number starts on the
 * `4242` test BIN and carries a valid Luhn check digit, so nothing produced
 * here can ever resemble a real PAN.
 *
 * The full number is returned exactly once, by `generateCardNumber`. Callers
 * must not persist it — store `last4` and `numberRef` only.
 */

const BIN = "4242"
const PAN_LENGTH = 16

/** The Luhn check digit that makes `digits` + that digit pass validation. */
export function luhnCheckDigit(digits: string): number {
  let sum = 0
  // Walk right to left; digits one position left of the check digit double.
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i])
    if (i % 2 === 0) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return (10 - (sum % 10)) % 10
}

/** True if `digits` (including its own check digit) passes Luhn. */
export function isValidLuhn(digits: string): boolean {
  const body = digits.slice(0, -1)
  const checkDigit = Number(digits[digits.length - 1])
  return luhnCheckDigit(body) === checkDigit
}

/**
 * Generates a full card number on the `4242` BIN with a valid Luhn check
 * digit, plus the pieces safe to keep: `last4` and an opaque `numberRef`
 * that is not reversible to the number. The `number` field must be returned
 * to the caller exactly once and never stored.
 */
export function generateCardNumber(): {
  number: string
  last4: string
  numberRef: string
} {
  let body = BIN
  while (body.length < PAN_LENGTH - 1) {
    body += String(Math.floor(Math.random() * 10))
  }
  const number = body + String(luhnCheckDigit(body))

  return {
    number,
    last4: number.slice(-4),
    numberRef: crypto.randomUUID(),
  }
}
