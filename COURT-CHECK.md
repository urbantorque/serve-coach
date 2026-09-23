# Twenty minutes on a court

Three parts of this app have never run on a phone: recording off the viewfinder,
the glance screen, and the target dial drawn onto a real still. Everything about
them was decided from a pane that reports `document.hidden` — no camera, no
encoder, no decode of a recording. The unit tests cover the choosing, and the
choosing is exactly the part that cannot tell you it chose wrong.

This is the list that closes that. Nine steps, most of them one tap. Do them in
order — each one is only meaningful if the one before it worked.

**Before you go**, host the app over HTTPS and open it on the phone you actually
film with. `localhost` on a laptop proves nothing here: the camera, the encoder
and the storage quota are all different on a phone, and two of them are gated on
a secure context.

Against each step is **what it proves**, so that if you only get through four you
know what four you got.

---

## At home, with signal

**1 — Open the app and tap `Download now to use offline`. Wait for it to finish.**

Proves the 24 MB of model and runtime cache. Everything after step 6 depends on
it.

**2 — Open the app at `?check`. Read the first line. Tap `Copy this` and paste it
somewhere you can find later — a note to yourself is fine.**

Proves what this browser will record and open, before anything is filmed. This
is the block to send back. If the first line says **"records a file it cannot
then open"**, stop and send it now: the rest of the list is about a recorder that
is going to produce something unreadable, and knowing that costs a court trip
otherwise.

If the block says `opens video/mp4; codecs="hvc1" no`, your phone's default
recording format cannot be read by this browser. That is worth knowing and is not
a reason to stop — the in-app recorder does not use it.

---

## On the court

**3 — Tap `Check your framing first`. Stand the phone where you will film from,
side-on, four to five metres back. Read what it says.**

Proves the camera opens, the pose model runs live, and the cues are the ones the
upload path would give. Note whether it ever says something you know is wrong —
particularly "you are leaning, or the phone is tilted", which it cannot tell
apart and admits it.

**4 — With the viewfinder still open, look for a record button. Press it, serve
once, press stop.**

Proves `MediaRecorder` runs on this phone, off a stream the pose model is also
using. **If there is no record button, that is a result** — it means the browser
would not promise a container the app can read back, and the block from step 2
says which. Film with the camera app instead and carry on at step 6.

**5 — Look at what comes up.**

You should land on a **glance**: one score, one line, two buttons. Not the full
report. Proves the recording was decoded and analysed — the single most untested
path in the app.

If it says it could not read the clip, that is the honest refusal working, and
the thing to report is what it said and what you actually filmed.

**6 — Tap through to the full report. Scroll to the keyframe pictures.**

Proves the six stills captured off real video, and the **target dial** — a small
arc with a shaded band and your reading marked on it, in the plate beside a
picture. Nobody has seen this drawn over a real still. Look at whether the dial
and the picture disagree.

**7 — Press share. Send the card to yourself.**

Proves the share sheet accepts a file from this browser, and that the shared
image carries the dial. Compare what you receive against what is on the report:
they are supposed to be the same evidence, not a quieter version.

**8 — Film a basket. Six serves, one clip, keep filming between them. Then open
the full report and press the button that offers to compare them.**

A clip recorded in the app lands on the glance even when it holds six serves —
that is deliberate, because measuring them all is a video pass each and nobody
standing on a baseline wants to wait for six of them. So the comparison is one
tap further on, from the report. Filming with the camera app and picking the
file gets there on its own, and is the other half worth trying.

Proves the sweep, the consistency panel, and the best-against-worst picture strip
on footage that was not synthesised.

**Bring back the timings.** This is the only step on this list that produces a
figure nothing else in the project can: how long the most expensive thing this
app does actually takes, on a phone, on the path a picked multi-serve clip now
enters automatically.

You do not need a stopwatch. Every analysis now records what it cost —
`Analysis.cost.ms`, with `coldEngine` saying whether the 24 MB of model downloads
happened inside that span. It rides on the stored report, so the way to read it
off a phone is **Your serves → Export**, then open the `.json` and look at
`cost` on each entry.

Do it twice: once on a single serve, and once after sweeping a basket, since a
sweep is one pass per serve and the sum is what a player actually waits for.
Note whether the phone gets warm, and whether you would have waited.

---

## Then, without signal

**9 — Turn on aeroplane mode. Close the app completely and reopen it. Analyse
one of the clips from your camera roll.**

Proves the offline claim, which is the whole reason the model is cached. If this
fails, everything before it works only at home.

**The morning after**, open it once more. Reports are supposed to still be
there. On an iPhone that has not been added to the home screen they may not be,
and that is the seven-day clearance the storage panel warns about arriving early.

---

## What to send back

- The block from step 2, and a second one from step 9 (the offline line will have
  changed).
- For each step: worked, did not work, or did not appear.
- For anything that failed: what was on the screen, in your words. Not a
  diagnosis — "it sat on the analysing screen for a minute and then went back
  home" is more useful than "the decoder failed".
- Roughly how warm the phone got by step 8.

Do not send the clips. Nothing here needs them, and they are the one thing the
app is built never to move.

## If you would rather not film yourself

Steps 1, 2 and 9 are worth doing on their own and take about three minutes.
They cover the two things most likely to be silently wrong — what this browser
will record, and whether the app really works with the network off. Everything
from step 3 needs somebody serving.

## This is not the fixture shoot

`src/lib/analysis/__tests__/fixtures/README.md` asks for six labelled clips to
validate the *measurements*. This list validates the *app on a device*. They are
different jobs and neither substitutes for the other: a fixture is pose output
with a hand-written label, and it would tell you nothing about whether the record
button appears.
