import { describe, expect, it } from "vitest"
import { generateCardNumber, isValidLuhn, luhnCheckDigit } from "./cardNumber"

/**
 * The generator is the one place a number that could resemble a real PAN
 * could escape, so the BIN and the check digit are both pinned here.
 */

describe("luhnCheckDigit", () => {
  it("produces the digit that completes a known Luhn sequence", () => {
    // 4242424242424242 is the canonical test PAN; its body implies check digit 2.
    expect(luhnCheckDigit("424242424242424")).toBe(2)
  })

  it("returns a single digit for any body", () => {
    for (let i = 0; i < 50; i++) {
      const body = String(i).padStart(15, "4")
      const digit = luhnCheckDigit(body)
      expect(digit).toBeGreaterThanOrEqual(0)
      expect(digit).toBeLessThanOrEqual(9)
    }
  })
})

describe("isValidLuhn", () => {
  it("accepts a valid number", () => {
    expect(isValidLuhn("4242424242424242")).toBe(true)
  })

  it("rejects a number with a wrong check digit", () => {
    expect(isValidLuhn("4242424242424243")).toBe(false)
  })

  it("rejects a transposed digit", () => {
    expect(isValidLuhn("4242424242424422")).toBe(false)
  })
})

describe("generateCardNumber", () => {
  it("always generates on the 4242 test BIN with a valid check digit", () => {
    for (let i = 0; i < 200; i++) {
      const { number } = generateCardNumber()
      expect(number).toHaveLength(16)
      expect(number.startsWith("4242")).toBe(true)
      expect(/^\d{16}$/.test(number)).toBe(true)
      expect(isValidLuhn(number)).toBe(true)
    }
  })

  it("returns last4 matching the generated number", () => {
    const { number, last4 } = generateCardNumber()
    expect(last4).toBe(number.slice(-4))
    expect(last4).toHaveLength(4)
  })

  it("returns an opaque reference that is not the number", () => {
    const { number, numberRef } = generateCardNumber()
    expect(numberRef).not.toContain(number)
    expect(numberRef).not.toMatch(/^\d{16}$/)
  })

  it("does not repeat itself", () => {
    const numbers = new Set(
      Array.from({ length: 100 }, () => generateCardNumber().number),
    )
    expect(numbers.size).toBeGreaterThan(90)
  })
})
