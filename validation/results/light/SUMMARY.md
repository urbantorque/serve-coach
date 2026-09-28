# Light from the pixels: synthetic corpus

Generated 2026-09-28T03:52:16.378Z by `tools/validate/light-eval.ts` in 73 s over 124 clips. **Rendered synthetic clips only; no real courts.**

The app's light evidence (`app/src/analysis/quality/light.ts`) on a 16 × 16 luma grid, sampled like the sparse pass (4 Hz scan plus a 15 Hz fill around the serve), the player's box left out. Flicker: relative amplitude of 100 Hz mains flicker at its alias (warning ≥ 3%, info ≥ 1%). Dark (court lights): the top band (median of its cells) below 18 luma and below 0.2 of the bottom band.

| Lighting | Clips | Sky luma (median, range) | Court luma (median) | Called dark | Flicker, sparse pass (median, max) | Flicker, every frame (median) | Called flickering |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bright, 60 fps | 90 | 183 (29–200) | 101 | 0 of 90 | 0.10%, 0.40% | 0.03% | 0 of 90 |
| dusk, 60 fps | 5 | 135 (134–135) | 7 | 0 of 5 | 0.22%, 0.30% | 0.06% | 0 of 5 |
| bright, 120 fps | 5 | 183 (183–183) | 100 | 0 of 5 | 0.12%, 0.14% | 0.03% | 0 of 5 |
| bright, 240 fps | 8 | 183 (183–185) | 101 | 0 of 8 | 0.13%, 0.30% | 0.01% | 0 of 8 |
| bright, 30 fps | 6 | 183 (183–197) | 101 | 0 of 6 | 0.12%, 0.14% | 0.07% | 0 of 6 |
| night + 100 Hz flicker, 240 fps | 5 | 0 (0–0) | 170 | 5 of 5 | 11.56%, 11.66% | 13.93% | 5 of 5 |
| overcast, 60 fps | 5 | 182 (180–182) | 62 | 0 of 5 | 0.15%, 0.16% | 0.04% | 0 of 5 |

Night renders called dark: 5 of 5; daylight, overcast and dusk renders called dark: 0 of 119.
Flickering renders detected on the sparse pass: 5 of 5; false alarms on renders without flicker: 0 of 119.

Limits: one synthetic night preset (floodlights, 240 fps, ±30% flicker at 100 Hz) and no flicker-free night render, no LED lights, no indoor hall; the renders have no auto-exposure hunting or rolling-shutter banding. The thresholds are initial values. Pixel evidence only lowers the class the player gave (day → night-lights or flicker), never raises it.

## Per clip

| Clip | Lighting | fps | Sky | Court | Dark | Flicker (sparse) | Flicker (every frame) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| advanced-s1 | bright | 60 | 183 | 101 | no | 0.11% | 0.04% |
| advanced-s2 | bright | 60 | 183 | 101 | no | 0.13% | 0.03% |
| advanced-s3 | bright | 60 | 183 | 101 | no | 0.17% | 0.02% |
| advanced-s4 | bright | 60 | 183 | 101 | no | 0.09% | 0.04% |
| advanced-s5 | bright | 60 | 183 | 100 | no | 0.08% | 0.04% |
| apexout-s1 | bright | 60 | 29 | 94 | no | 0.10% | 0.02% |
| apexout-s2 | bright | 60 | 30 | 94 | no | 0.07% | 0.02% |
| apexout-s3 | bright | 60 | 29 | 94 | no | 0.05% | 0.02% |
| apexout-s4 | bright | 60 | 29 | 98 | no | 0.05% | 0.01% |
| apexout-s5 | bright | 60 | 30 | 98 | no | 0.08% | 0.01% |
| baseline-s1 | bright | 60 | 183 | 101 | no | 0.14% | 0.03% |
| baseline-s2 | bright | 60 | 183 | 102 | no | 0.09% | 0.03% |
| baseline-s3 | bright | 60 | 183 | 94 | no | 0.12% | 0.03% |
| baseline-s4 | bright | 60 | 183 | 99 | no | 0.14% | 0.03% |
| baseline-s5 | bright | 60 | 183 | 101 | no | 0.10% | 0.04% |
| beginner-s1 | bright | 60 | 183 | 101 | no | 0.12% | 0.03% |
| beginner-s2 | bright | 60 | 183 | 102 | no | 0.10% | 0.02% |
| beginner-s3 | bright | 60 | 183 | 100 | no | 0.12% | 0.04% |
| beginner-s4 | bright | 60 | 183 | 95 | no | 0.17% | 0.06% |
| beginner-s5 | bright | 60 | 183 | 101 | no | 0.11% | 0.04% |
| crf18-s1 | bright | 60 | 183 | 101 | no | 0.14% | 0.03% |
| crf18-s2 | bright | 60 | 183 | 102 | no | 0.08% | 0.03% |
| crf18-s3 | bright | 60 | 183 | 94 | no | 0.12% | 0.03% |
| crf18-s4 | bright | 60 | 183 | 99 | no | 0.14% | 0.04% |
| crf18-s5 | bright | 60 | 183 | 100 | no | 0.10% | 0.04% |
| crf28-s1 | bright | 60 | 183 | 101 | no | 0.14% | 0.03% |
| crf28-s2 | bright | 60 | 183 | 102 | no | 0.09% | 0.03% |
| crf28-s3 | bright | 60 | 183 | 94 | no | 0.12% | 0.03% |
| crf28-s4 | bright | 60 | 183 | 99 | no | 0.14% | 0.03% |
| crf28-s5 | bright | 60 | 183 | 100 | no | 0.10% | 0.04% |
| crf36-s1 | bright | 60 | 183 | 101 | no | 0.14% | 0.03% |
| crf36-s2 | bright | 60 | 183 | 102 | no | 0.09% | 0.03% |
| crf36-s3 | bright | 60 | 183 | 94 | no | 0.13% | 0.03% |
| crf36-s4 | bright | 60 | 183 | 99 | no | 0.14% | 0.03% |
| crf36-s5 | bright | 60 | 183 | 101 | no | 0.11% | 0.04% |
| default75-s1 | bright | 60 | 187 | 102 | no | 0.07% | 0.02% |
| default75-s2 | bright | 60 | 187 | 102 | no | 0.06% | 0.01% |
| default75-s3 | bright | 60 | 187 | 102 | no | 0.06% | 0.02% |
| dist12-s1 | bright | 60 | 199 | 107 | no | 0.05% | 0.02% |
| dist12-s2 | bright | 60 | 199 | 107 | no | 0.03% | 0.01% |
| dist12-s3 | bright | 60 | 199 | 107 | no | 0.01% | 0.00% |
| dist12-s4 | bright | 60 | 199 | 107 | no | 0.03% | 0.00% |
| dist12-s5 | bright | 60 | 199 | 107 | no | 0.04% | 0.01% |
| dist4-s1 | bright | 60 | 183 | 99 | no | 0.19% | 0.06% |
| dist4-s2 | bright | 60 | 183 | 97 | no | 0.20% | 0.04% |
| dist4-s3 | bright | 60 | 183 | 94 | no | 0.06% | 0.02% |
| dist4-s4 | bright | 60 | 183 | 96 | no | 0.15% | 0.04% |
| dist4-s5 | bright | 60 | 183 | 98 | no | 0.15% | 0.03% |
| dist7-s1 | bright | 60 | 184 | 102 | no | 0.14% | 0.03% |
| dist7-s2 | bright | 60 | 184 | 102 | no | 0.08% | 0.02% |
| dist7-s3 | bright | 60 | 186 | 101 | no | 0.09% | 0.01% |
| dist7-s4 | bright | 60 | 184 | 101 | no | 0.12% | 0.02% |
| dist7-s5 | bright | 60 | 184 | 102 | no | 0.09% | 0.02% |
| dusk-s1 | dusk | 60 | 135 | 7 | no | 0.30% | 0.07% |
| dusk-s2 | dusk | 60 | 135 | 7 | no | 0.16% | 0.05% |
| dusk-s3 | dusk | 60 | 135 | 5 | no | 0.22% | 0.05% |
| dusk-s4 | dusk | 60 | 134 | 7 | no | 0.29% | 0.07% |
| dusk-s5 | dusk | 60 | 134 | 7 | no | 0.19% | 0.06% |
| fence9-s1 | bright | 60 | 54 | 104 | no | 0.02% | 0.00% |
| fence9-s2 | bright | 60 | 54 | 104 | no | 0.03% | 0.01% |
| fence9-s3 | bright | 60 | 54 | 104 | no | 0.01% | 0.01% |
| fps120-s1 | bright | 120 | 183 | 101 | no | 0.14% | 0.03% |
| fps120-s2 | bright | 120 | 183 | 102 | no | 0.09% | 0.01% |
| fps120-s3 | bright | 120 | 183 | 94 | no | 0.12% | 0.02% |
| fps120-s4 | bright | 120 | 183 | 99 | no | 0.14% | 0.03% |
| fps120-s5 | bright | 120 | 183 | 100 | no | 0.10% | 0.03% |
| fps240-s1 | bright | 240 | 183 | 101 | no | 0.14% | 0.01% |
| fps240-s2 | bright | 240 | 183 | 102 | no | 0.09% | 0.01% |
| fps240-s3 | bright | 240 | 183 | 94 | no | 0.12% | 0.01% |
| fps240-s4 | bright | 240 | 183 | 99 | no | 0.14% | 0.01% |
| fps240-s5 | bright | 240 | 183 | 100 | no | 0.10% | 0.01% |
| fps30-s1 | bright | 30 | 183 | 101 | no | 0.13% | 0.07% |
| fps30-s2 | bright | 30 | 183 | 102 | no | 0.09% | 0.07% |
| fps30-s3 | bright | 30 | 183 | 94 | no | 0.12% | 0.08% |
| fps30-s4 | bright | 30 | 183 | 99 | no | 0.14% | 0.09% |
| fps30-s5 | bright | 30 | 183 | 100 | no | 0.10% | 0.07% |
| front45-s1 | bright | 60 | 188 | 86 | no | 0.11% | 0.02% |
| front45-s2 | bright | 60 | 188 | 86 | no | 0.09% | 0.02% |
| front45-s3 | bright | 60 | 188 | 86 | no | 0.07% | 0.02% |
| front45-s4 | bright | 60 | 183 | 86 | no | 0.08% | 0.03% |
| front45-s5 | bright | 60 | 183 | 86 | no | 0.10% | 0.02% |
| h160-s1 | bright | 60 | 183 | 101 | no | 0.14% | 0.03% |
| h160-s2 | bright | 60 | 183 | 102 | no | 0.10% | 0.04% |
| h160-s3 | bright | 60 | 183 | 95 | no | 0.18% | 0.03% |
| h160-s4 | bright | 60 | 183 | 99 | no | 0.10% | 0.04% |
| h160-s5 | bright | 60 | 183 | 100 | no | 0.11% | 0.04% |
| h195-s1 | bright | 60 | 183 | 101 | no | 0.14% | 0.04% |
| h195-s2 | bright | 60 | 183 | 102 | no | 0.11% | 0.03% |
| h195-s3 | bright | 60 | 183 | 94 | no | 0.07% | 0.04% |
| h195-s4 | bright | 60 | 183 | 98 | no | 0.12% | 0.02% |
| h195-s5 | bright | 60 | 183 | 100 | no | 0.14% | 0.02% |
| lefty-s1 | bright | 60 | 190 | 106 | no | 0.17% | 0.03% |
| lefty-s2 | bright | 60 | 187 | 106 | no | 0.09% | 0.04% |
| lefty-s3 | bright | 60 | 191 | 99 | no | 0.10% | 0.02% |
| lefty-s4 | bright | 60 | 192 | 105 | no | 0.15% | 0.03% |
| lefty-s5 | bright | 60 | 192 | 106 | no | 0.15% | 0.02% |
| night240-s1 | night + 100 Hz | 240 | 0 | 170 | yes | 11.38% | 13.93% |
| night240-s2 | night + 100 Hz | 240 | 0 | 170 | yes | 11.08% | 13.85% |
| night240-s3 | night + 100 Hz | 240 | 0 | 169 | yes | 11.56% | 13.93% |
| night240-s4 | night + 100 Hz | 240 | 0 | 170 | yes | 11.61% | 14.35% |
| night240-s5 | night + 100 Hz | 240 | 0 | 170 | yes | 11.66% | 14.34% |
| overcast-s1 | overcast | 60 | 182 | 62 | no | 0.16% | 0.04% |
| overcast-s2 | overcast | 60 | 182 | 63 | no | 0.11% | 0.03% |
| overcast-s3 | overcast | 60 | 182 | 59 | no | 0.15% | 0.04% |
| overcast-s4 | overcast | 60 | 180 | 61 | no | 0.15% | 0.04% |
| overcast-s5 | overcast | 60 | 180 | 62 | no | 0.10% | 0.05% |
| quick-rear30-lefty | bright | 30 | 197 | 106 | no | 0.07% | 0.04% |
| quick-side60 | bright | 60 | 185 | 101 | no | 0.14% | 0.03% |
| quick-slomo | bright | 240 | 185 | 93 | no | 0.30% | 0.02% |
| rear-s1 | bright | 60 | 200 | 106 | no | 0.09% | 0.03% |
| rear-s2 | bright | 60 | 200 | 106 | no | 0.08% | 0.02% |
| rear-s3 | bright | 60 | 200 | 106 | no | 0.10% | 0.01% |
| rear-s4 | bright | 60 | 200 | 106 | no | 0.10% | 0.02% |
| rear-s5 | bright | 60 | 200 | 106 | no | 0.07% | 0.02% |
| sample-checkin | bright | 60 | 192 | 102 | no | 0.06% | 0.02% |
| sample-retest | bright | 60 | 197 | 102 | no | 0.05% | 0.01% |
| session | bright | 60 | 183 | 105 | no | 0.07% | 0.02% |
| shake-s1 | bright | 60 | 183 | 101 | no | 0.30% | 0.03% |
| shake-s2 | bright | 60 | 183 | 102 | no | 0.25% | 0.04% |
| shake-s3 | bright | 60 | 183 | 100 | no | 0.22% | 0.03% |
| shake-s4 | bright | 60 | 183 | 101 | no | 0.40% | 0.03% |
| shake-s5 | bright | 60 | 183 | 101 | no | 0.33% | 0.04% |
| slomo-s1 | bright | 240 | 183 | 101 | no | 0.13% | 0.01% |
| slomo-s2 | bright | 240 | 183 | 102 | no | 0.09% | 0.01% |
