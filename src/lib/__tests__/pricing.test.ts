/**
 * The price, and the two variables that decide whether anybody can pay it.
 *
 * ## This file was documented before it existed
 *
 * `pricing.ts` said "`pricing.test.ts` exists to say that out loud rather than to check arithmetic"
 * and there was no such file. That is the failure this repository keeps finding in a larger shape —
 * four features shipped as schema plus documentation and no code — arriving here as a test named in
 * prose and never written. The sentence is now true.
 *
 * ## What is worth asserting about a constant
 *
 * Not that `12 === 12`. Two things:
 *
 *  1. **`display` and `amount` cannot disagree.** They are separate fields written by hand, one of them
 *     for copy, and the failure mode is a page advertising €10 while Stripe charges €12. This cannot
 *     prove the constant matches the Stripe Price — only a live account can — but it can prove the file
 *     does not contradict itself, which is the half that changes without anybody noticing.
 *
 *  2. **`hasCheckout()` needs both halves.** A key without a price, or a price without a key, is a
 *     "Get Pro" button that answers 503. The pricing surface reads this one boolean to decide between
 *     a button and a sentence, so a partial configuration must read as *not configured* rather than as
 *     nearly configured.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { PRICING, hasCheckout, stripePriceId } from '@/lib/pricing'

/** Not real, and shaped so a secret scanner cannot mistake it for one — see `provider-schema.test.ts`. */
const KEY = 'sk_test_fixture_not_a_credential_0000'
const PRICE = 'price_fixture_not_a_credential_0000'

const before = {
  key: process.env.STRIPE_SECRET_KEY,
  price: process.env.HR_STRIPE_PRICE_ID,
}

function set(key: string | undefined, price: string | undefined) {
  if (key === undefined) delete process.env.STRIPE_SECRET_KEY
  else process.env.STRIPE_SECRET_KEY = key
  if (price === undefined) delete process.env.HR_STRIPE_PRICE_ID
  else process.env.HR_STRIPE_PRICE_ID = price
}

afterEach(() => {
  set(before.key, before.price)
})

describe('the price', () => {
  it('says the same number in the copy as in the amount', () => {
    /*
      `display` is what a person reads and `amount` is what the rest of the code reasons about. Derived
      from each other they could not drift; written separately they can, so this is the check that they
      have not.
    */
    expect(PRICING.display).toContain(String(PRICING.amount))
    expect(PRICING.currency).toBe('EUR')
    expect(PRICING.display.startsWith('€')).toBe(true)
    expect(PRICING.period).toBe('month')
  })

  it('is a whole number of euros, because the copy has no separator in it', () => {
    /*
      `display` is a hand-written string rather than `Intl.NumberFormat`, deliberately — a localised
      separator would make one page say €12,00 and another €12.00. That choice is only safe while the
      amount has no fractional part, and this is the assertion that notices the day it gains one.
    */
    expect(Number.isInteger(PRICING.amount)).toBe(true)
  })
})

describe('whether this deployment can take money', () => {
  it('is closed with no configuration at all, which is every developer machine', () => {
    set(undefined, undefined)
    expect(stripePriceId()).toBeUndefined()
    expect(hasCheckout()).toBe(false)
  })

  it('is closed with only half of it, because half is a button that 503s', () => {
    set(KEY, undefined)
    expect(hasCheckout()).toBe(false)

    set(undefined, PRICE)
    expect(hasCheckout()).toBe(false)
  })

  it('treats an empty string as absent, in both halves', () => {
    /*
      The state a deployment is actually in. `docker-compose.yml` passes `${STRIPE_SECRET_KEY:-}`, so an
      unset variable arrives as a declared empty string rather than as missing — and a truthiness check
      on `process.env.X !== undefined` alone would read that as configured and hand somebody a checkout
      that cannot work.
    */
    set('', PRICE)
    expect(hasCheckout()).toBe(false)

    set(KEY, '')
    expect(stripePriceId()).toBeUndefined()
    expect(hasCheckout()).toBe(false)
  })

  it('is open with both, and hands back the price id it was given', () => {
    set(KEY, PRICE)
    expect(stripePriceId()).toBe(PRICE)
    expect(hasCheckout()).toBe(true)
  })
})
