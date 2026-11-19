# Measurement records

Moved out of `src/lib/analysis/tiers.ts` (N2.13), where they shipped to every player as strings nobody on screen reads. The engine keeps the keys, so a signal still cannot be measured, or left ungraded, without an entry here; the reasons live in this file.

## Under-resolved: signals the camera cannot resolve finely enough to grade as banded

### spine_lean_deg

kept: floor 12, over its 10: the lean moves 7.7° between takes from behind on the app's read; a 40° collapse is still named on 81% of takes, a 26° one on 4%

### hip_lead_ms

kept: smoothing moved to a time-based window, floor followed the measurement 85 -> 76 ms, back to 85 on the app's read (H40) and 88 where its seek stops short of the end (H45); arming_the_ball is not named, so the floor moves nothing a player is told

### separation_deg

kept: floor 30, far above its 14: the first floor that names no real serve from the noise (0 of 2,400 takes, from 28% at 9), and an open chest is still named: 85% at a band floor of 13, 42% of a 22° one and 90% of a 45° one at 5

### pronation_deg

not named: `pancake_contact` fires on 10% of clean serves against 35% of genuine pancakes, and an unsigned angle cannot miss its band by 85°

## Uncalibrated: signals measured and never graded

### external_rotation_deg

measured and not named: 9.4–11.8° deviation over a 48° span, which is gradeable, but read against a chosen reference frame with no zero: the same arm reads 57.1° against the trunk and 93.5° against the shoulder line. Both frames agree exactly about the size of a CHANGE (14.4° per 15° dialled, opposite ways round) and both are confounded by posture: 30° of spine lean moves the trunk frame 6–15° depending on where the arm sits. Delta gradeable in principle, absolute ruled out.

### knee_extension_deg

measured and not named: tracks its dial 0.87 to one across five rungs, deviation 5.7° against a 35.0° span: the best-conditioned depth reading here. Nothing knows what a club player should straighten, and bending less is not a fault.

### legs_peak_ms

measured and not named: 7.5 ms deviation, camera-invariant, and it times the leg drive without measuring it: the same peak whether the player drives or not

### chain_span_ms

measured and not named: 7.8 ms deviation and no band: the span scales with tempo, and the rig holds it fixed once tempo is divided out

### chain_span_ratio

measured and not named: the division removes most of the tempo dependence and not all of it: on one seed a 72% spread becomes 33%: and no band exists either way

### toss_ahead_ratio

measured and not named: the published distances are for contact (Connolly 2021, Vacek 2023), not the top of the toss; reads its rig dial linearly from the side, and from the ball when there is one, the hand when not

### toss_across_ratio

measured and not named: read only from behind, and the same contact-not-toss gap as its partner; the kick-against-flat difference it will one day carry is published for contact (Vacek 2023)

### landing_front_ratio

measured and not named: tracks the rig's lean exactly from behind and is immune to the back foot; read a third as large from the side; no published norm for how far a body may fall across its front foot

### back_foot_follow_ratio

measured and not named: reads the rig's back-foot dial exactly at every lean; needs the hips to have moved to mean anything; no norm for how far a back foot should trail

### landing_travel_ratio

measured and not named: signed by the swing's net direction and read from the side only; reads the rig's travel dial either sign, every real serve travels forward, and no study gives a distance to grade a fall back against

### hitch_share_ratio

measured and not named: separates a hitch from a slow serve on the rig at 60 fps and above, every real serve reads zero, and no study gives a pause length to grade against

### leg_lead_ms

measured and not named: holds at 30 fps within 20 ms rms from the side, said only as an order, and the gap scales with tempo and has no club band

### arm_cock_ratio

measured and not named: the published signature is an angle (Gao 2026) and no study gives it as a hand height; tracks its dial from 0.156 to 0.044 at every camera angle, deviation 0.024 rig and 0.009 real, and the one real population sits on the end the research calls the fault

### landing_offset_ratio

measured and not named: well conditioned from behind the server: 0.0035 square against 0.0657 landed, on a 0.0045 deviation: and a quarter of that from the guide placement, where a body facing the net falls along the camera's line of sight; nothing knows what a club player should read, and the rig poses a symmetric shift where a real collapse is over the front foot, so it is validated against a model of the fault rather than the fault

### wrist_peak_ms

measured and not named: 0.5 ms deviation, no band, and timed against a contact keyframe derived from the same track

### elbow_peak_ms

measured and not named: 0.7 ms deviation but a 10.2 ms camera-angle artifact, which axes.ts cannot remove because image x cannot be de-mixed
