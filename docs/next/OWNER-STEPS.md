# What only the owner can do

Kept current as the Next programme runs. Each step says what it unblocks.
Everything around these is built and tested; nothing here has been done for
you, because each one needs your account, your money, your name or your say.

## To launch the paid web app

Do these in order. Until step 5, the app runs exactly as it does today: free,
no paywalls, no requests to any payment service.

1. **Agree what is free and what Plus costs.** The proposal is in
   `src/lib/plans.ts` (seven Plus features; free keeps every read, the top fix
   and its drill, the whole breakdown on the first serve, and the five newest
   serves) with its words in `src/lib/planCopy.ts`. Change the table, not the
   screens. Write the price as players should read it, for the build setting
   `VITE_PRICE_LINE` (for example `£4 a month`). The Apex round's proposal,
   placing everything built since (the studio, the guided set, the lessons),
   is `docs/apex/PLANS-PROPOSAL.md`.
   **Optional, a year and a trial (F1.1):** a second recurring price for a
   year (`STRIPE_ANNUAL_PRICE_ID`, with `VITE_PRICE_LINE_ANNUAL` for its
   words), and free days before the first charge (`TRIAL_DAYS` on the
   server, 1 to 30, and `VITE_TRIAL_DAYS` for the pricing page). Leave them
   unset and neither appears.
2. **Make a Stripe account**, then in it: a product called Serve Coach Plus
   with one recurring price (its id, `price_…`, is `STRIPE_PRICE_ID`), and the
   customer portal switched on (Settings, Billing, Customer portal), which is
   where "Change your card or cancel" goes. Start in test mode (`sk_test_…`).
3. **Make the pass key pair** on your own machine: `node scripts/pass-keys.mjs`.
   It prints two lines and writes nothing. The secret one is
   `ENTITLEMENT_PRIVATE_JWK`; the public one is `VITE_ENTITLEMENT_PUBLIC_JWK`.
   Do it once: a new pair stops every pass already issued.
4. **Buy a domain**, and make a git remote for this repo (unblocks hosting and
   a first tagged release).
5. **Create the Cloudflare Pages project** from the repo. Build command
   `npm run build`, output `dist`. Build settings: `VITE_SITE_URL` (the domain,
   `https://…`, no trailing slash), `VITE_SITE_OPERATOR` (your name or
   company, as the terms name it), `VITE_SITE_CONTACT` (an email for privacy
   and the terms), `VITE_PAYMENTS=on`, `VITE_PRICE_LINE`,
   `VITE_ENTITLEMENT_PUBLIC_JWK`. Secrets (encrypted): `STRIPE_SECRET_KEY`,
   `STRIPE_PRICE_ID`, `ENTITLEMENT_PRIVATE_JWK`. `public/_headers` and
   `functions/api/[[route]].ts` are picked up as they are.
6. **Try it in Stripe's test mode first**, with a test card, before switching
   the keys to live. On your machine the same flow runs against a stand-in
   with `VITE_PAYMENTS=mock` (`.claude/launch.json`, `serve-coach-pay`), which
   needs nothing from you; Stripe's own test mode needs your test keys, and a
   local run of the function needs Cloudflare's `wrangler` (a download).
7. **Have the privacy page and the terms read by someone qualified** where you
   trade. They say only what the app does, in its own voice
   (`src/screens/InfoPage.tsx`), and name no jurisdiction, refund policy or
   company details beyond what you set in step 5.
8. **Switch Stripe to live**, put the live key in place of the test one, and
   deploy.

Two things to know before step 8:

- A Plus pass is a bearer token: "Use Plus on another device" copies a link
  that carries it, and anyone holding the link has Plus until it runs out. That
  is the price of having no accounts. Accounts would end it; they are a bigger
  change and yours to ask for.
- Cancelling takes effect at the end of the period paid for, and the app
  learns of it when the pass comes up for renewal, within its last three days.

## To settle open measurements

- **Cross-origin isolation (M1.1).** Threads made each swing refine 1.7 times
  faster, but every isolated whole read on this loaded machine abandoned the
  refine. Time a few reads on a quiet machine with `ISOLATE=1`; if they hold,
  remove the `# ` from the three lines at the foot of `public/_headers`.
- **Agree to install WebKit and Firefox for Playwright** (`npx playwright
  install webkit firefox`, about 200 MB from Microsoft's Playwright CDN).
  Unblocks proving that clips decode and read in Safari's engine and Firefox,
  not only Chrome.
- **Confirm THETIS's licence** on the dataset's own site (Gourgari et al.,
  2013). Unblocks scoring the real pipeline against Kinect skeletons, and
  checking flat, kick and slice serves against `SERVE_TYPE_SHIFT`.
- **Point at openly licensed 720p or 1080p serve footage**, or film a few of
  your own serves on a modern phone and agree to them sitting in `bench-data/`
  (never in the repo). Unblocks deciding `RETEST_SD`, the real-footage noise
  measured on two 320 x 240 clips and not yet adopted (N2.2), which the
  accuracy page shows as measured and not used.
- **A radar-checked serve**, to put a measured error on the speed range, which
  the app and the accuracy page say no radar has checked.
- **Real serves on a modern phone, above all.** Scored against truth on a drawn
  body, the pose models read the raised arm at contact as hanging down and the
  app refused 37 of 40 serves (N2.8). A drawn figure is not a player, so this
  may not hold on real footage; a few of your own serves, filmed by the guide,
  would say.

## A design question

- **The laptop rail.** Settled in the Apex round (W6.3), as its handover asked:
  Studio is on the rail and opens the latest serve in the review studio;
  Pathways stays a sheet from Today's goal, and `DESIGN.md` says so. Say if
  you want Pathways on the rail too.

## Later

- A first tagged release, once there is a remote.
- Whether to add accounts and sync of numbers (opt-in, said plainly), which
  the handover allows and nothing yet needs.
