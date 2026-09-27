# Quality layer (engine-core)

`checks.ts` computes the capture-quality checks that need only engine data (METRICS §3.25, CAPTURE `cq.*` ids): frame rate, time base, dropped frames, player size at 1080p-equivalent, framing at contact and landing, toss headroom (the §2.4.3 apex case), ball visibility, camera level (tilt), camera stability (orientation steps), roles, lost tracking, pose tracking quality, serve segmentation, gravity-vs-body scale, plausibility, audio, view and light condition.

Pixel checks (exposure, flicker, blur, background drift) need the frames and belong to the pipeline. The session overall is Good (every serve passes; info ignored), Fair (any warning, ≥ 70% analysable) or Limited (a session-level block on view, time base or frame rate, or < 50% analysable). Serves failing a blocking per-serve check are excluded from statistics and counted in "X of N measured".

Dropped frames (`cq.dropped-frames`, `FRAMES_DROPPED`) are time gaps between consecutive analysed frames that their frame numbers do not account for (`engine.ts` `missingShare`). Frames the pipeline chose to skip (every 3rd outside a serve's core) and frames with no body found are not dropped frames; `cq.tracking` covers the latter (integration change: the old pose-coverage measure flagged "Close other apps" on clean clips).
