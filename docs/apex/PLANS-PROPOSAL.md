# Free and Plus: a proposed table (F1.2)

For the owner to agree, change or turn down. Nothing here is switched on: the
gate stays open (`GATED` is false) until payments are, and the table lives in
`src/lib/plans.ts`. Prices are the owner's alone; the app shows whatever
`VITE_PRICE_LINE` and `VITE_PRICE_LINE_ANNUAL` say, and no yearly button or
trial line appears until those are set.

## The rule it follows

Free must be a real coach on every serve, or nobody stays long enough to want
more. Plus is for the player who comes back: the plan over weeks, the record
over months, and the laptop studio. Nothing about safety is ever paid: an
injury warning, a refusal and its reason, and "how sure I am" are free on
every serve.

## The table

| What | Free | Plus | Since |
| --- | --- | --- | --- |
| Every serve read on the device, the score and the first fix with its drill | Yes | Yes | today |
| Injury warnings, refusals, how sure I am | Yes | Yes | today |
| The whole breakdown | First serve | Every serve | today (`breakdown`) |
| The held frame and the shape to aim for (B1.1, B2.1) | Yes | Yes | proposed free: it is the moment that sells the rest |
| The fault demonstrations and the lesson for each fault (C1.2, C1.3) | First fix | Every fix | proposed |
| A guided set, hands-free (C1.1) | One set a week | Every set | proposed |
| The drill loop check after a block (C1.4) | Yes | Yes | proposed free: it is how free proves a drill works |
| The plan in steps (`pathway`) | No | Yes | today |
| Whole practice sessions (`sessions`) | No | Yes | today |
| Side by side with the best serve (`compare`) | No | Yes | today |
| Speed over time (`speedTrend`) | Latest only | Yes | today |
| A page for the coach (`coachShare`) | No | Yes | today |
| History | Newest 5 to reopen | All | today (`history`) |
| Progress as one story (D1.2) | The first screen | Go deeper too | proposed |
| The studio: keys, zoom, lines and angles, stills (E1.1) | Keys and zoom | Drawing, measuring, stills | proposed |
| Backups of everything, the plan included (D1.1) | Yes | Yes | today: a player's data is never held back |

## Ways to pay, ready for the owner's numbers

- **Monthly**, as built in N6.5.
- **Yearly** (F1.1): a second Stripe price, `STRIPE_ANNUAL_PRICE_ID`, and
  `VITE_PRICE_LINE_ANNUAL` for the words on the button.
- **A trial** (F1.1): `TRIAL_DAYS`, 1 to 30, on the server and
  `VITE_TRIAL_DAYS` for the pricing line. Plus is on from the first day and
  the pass runs to the trial's end; Stripe charges after it unless the player
  cancels.

All three run end to end against the stand-in (`payments.test.ts`, and the
`serve-coach-pay-offers` launch entry, which labels its prices as test
prices).

## What the owner decides

1. The table above, row by row, especially the five marked proposed.
2. The monthly and yearly prices, and whether to offer a trial and how long.
3. When payments go on.
