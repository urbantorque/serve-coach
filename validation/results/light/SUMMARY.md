# Light from the pixels: synthetic corpus

Generated 2026-09-28T01:49:18.369Z by `tools/validate/light-eval.ts` in 30 s over 38 clips. **Rendered synthetic clips only; no real courts.**

The app's light evidence (`app/src/analysis/quality/light.ts`) on a 16 × 16 luma grid, sampled like the sparse pass (4 Hz scan plus a 15 Hz fill around the serve), the player's box left out. Flicker: relative amplitude of 100 Hz mains flicker at its alias (warning ≥ 3%, info ≥ 1%). Dark (court lights): top-band luma below 40, or below 0.35 of the bottom band.

| Lighting | Clips | Sky luma (median, range) | Court luma (median) | Called dark | Flicker, sparse pass (median, max) | Flicker, every frame (median) | Called flickering |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bright, 60 fps | 8 | 151 (66–164) | 101 | 0 of 8 | 0.10%, 0.14% | 0.03% | 0 of 8 |
| dusk, 60 fps | 5 | 118 (107–119) | 7 | 0 of 5 | 0.22%, 0.30% | 0.06% | 0 of 5 |
| bright, 120 fps | 5 | 162 (150–164) | 101 | 0 of 5 | 0.12%, 0.14% | 0.03% | 0 of 5 |
| bright, 240 fps | 5 | 162 (150–164) | 101 | 0 of 5 | 0.12%, 0.14% | 0.01% | 0 of 5 |
| bright, 30 fps | 5 | 162 (150–164) | 101 | 0 of 5 | 0.12%, 0.14% | 0.07% | 0 of 5 |
| night + 100 Hz flicker, 240 fps | 5 | 6 (5–9) | 171 | 5 of 5 | 11.56%, 11.66% | 13.93% | 5 of 5 |
| overcast, 60 fps | 5 | 153 (141–154) | 63 | 0 of 5 | 0.15%, 0.16% | 0.04% | 0 of 5 |

Night renders called dark: 5 of 5; daylight, overcast and dusk renders called dark: 0 of 33.
Flickering renders detected on the sparse pass: 5 of 5; false alarms on renders without flicker: 0 of 33.

Limits: one synthetic night preset (floodlights, 240 fps, ±30% flicker at 100 Hz) and no flicker-free night render, no LED lights, no indoor hall; the renders have no auto-exposure hunting or rolling-shutter banding. The thresholds are initial values. Pixel evidence only lowers the class the player gave (day → night-lights or flicker), never raises it.

## Per clip

| Clip | Lighting | fps | Sky | Court | Dark | Flicker (sparse) | Flicker (every frame) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline-s1 | bright | 60 | 163 | 101 | no | 0.14% | 0.03% |
| baseline-s2 | bright | 60 | 162 | 102 | no | 0.09% | 0.03% |
| baseline-s3 | bright | 60 | 164 | 101 | no | 0.12% | 0.03% |
| baseline-s4 | bright | 60 | 151 | 101 | no | 0.14% | 0.03% |
| baseline-s5 | bright | 60 | 150 | 101 | no | 0.10% | 0.04% |
| dusk-s1 | dusk | 60 | 118 | 7 | no | 0.30% | 0.07% |
| dusk-s2 | dusk | 60 | 118 | 7 | no | 0.16% | 0.05% |
| dusk-s3 | dusk | 60 | 119 | 7 | no | 0.22% | 0.05% |
| dusk-s4 | dusk | 60 | 108 | 7 | no | 0.29% | 0.07% |
| dusk-s5 | dusk | 60 | 107 | 7 | no | 0.19% | 0.06% |
| fence9-s1 | bright | 60 | 66 | 101 | no | 0.02% | 0.00% |
| fence9-s2 | bright | 60 | 66 | 101 | no | 0.03% | 0.01% |
| fence9-s3 | bright | 60 | 66 | 101 | no | 0.01% | 0.01% |
| fps120-s1 | bright | 120 | 163 | 101 | no | 0.14% | 0.03% |
| fps120-s2 | bright | 120 | 162 | 102 | no | 0.09% | 0.01% |
| fps120-s3 | bright | 120 | 164 | 101 | no | 0.12% | 0.02% |
| fps120-s4 | bright | 120 | 151 | 101 | no | 0.14% | 0.03% |
| fps120-s5 | bright | 120 | 150 | 101 | no | 0.10% | 0.03% |
| fps240-s1 | bright | 240 | 163 | 101 | no | 0.14% | 0.01% |
| fps240-s2 | bright | 240 | 162 | 102 | no | 0.09% | 0.01% |
| fps240-s3 | bright | 240 | 164 | 101 | no | 0.12% | 0.01% |
| fps240-s4 | bright | 240 | 151 | 101 | no | 0.14% | 0.01% |
| fps240-s5 | bright | 240 | 150 | 101 | no | 0.10% | 0.01% |
| fps30-s1 | bright | 30 | 163 | 101 | no | 0.13% | 0.07% |
| fps30-s2 | bright | 30 | 162 | 102 | no | 0.09% | 0.07% |
| fps30-s3 | bright | 30 | 164 | 101 | no | 0.12% | 0.08% |
| fps30-s4 | bright | 30 | 151 | 101 | no | 0.14% | 0.09% |
| fps30-s5 | bright | 30 | 150 | 101 | no | 0.10% | 0.07% |
| night240-s1 | night + 100 Hz | 240 | 5 | 171 | yes | 11.38% | 13.93% |
| night240-s2 | night + 100 Hz | 240 | 6 | 171 | yes | 11.08% | 13.85% |
| night240-s3 | night + 100 Hz | 240 | 5 | 171 | yes | 11.56% | 13.93% |
| night240-s4 | night + 100 Hz | 240 | 8 | 172 | yes | 11.61% | 14.35% |
| night240-s5 | night + 100 Hz | 240 | 9 | 172 | yes | 11.66% | 14.34% |
| overcast-s1 | overcast | 60 | 153 | 63 | no | 0.16% | 0.04% |
| overcast-s2 | overcast | 60 | 153 | 63 | no | 0.11% | 0.03% |
| overcast-s3 | overcast | 60 | 154 | 63 | no | 0.15% | 0.04% |
| overcast-s4 | overcast | 60 | 141 | 63 | no | 0.15% | 0.04% |
| overcast-s5 | overcast | 60 | 141 | 63 | no | 0.10% | 0.05% |
