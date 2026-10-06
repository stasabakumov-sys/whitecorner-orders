# Modeling load performance

Updated 6 October 2026.

## Implemented

- Private GLB bytes are cached in tab memory by immutable Storage upload path (40 MiB total, 10 minute reuse window). Opening the module or switching back to a model reuses the bytes. Reloading the page starts cold.
- Rounded CAD geometry is cached separately (32 MiB total, 10 minute reuse window), keyed by the complete profile, radius, trim treatment and mating faces. Every consumer receives a clone, so dimensions, UVs and disposal cannot change another preview.
- The current model list and a fresh Storage signed URL are still requested before cached file use. RLS and private bucket access remain authoritative. Logout or account change clears both caches; late responses from the previous session are rejected. Token refresh for the same account retains the cache.
- Failed downloads are not cached. GLB parse failures evict downloaded bytes. Replacement uploads have new paths and cannot reuse the previous file.
- Initial scene preparation runs once on the final rounded geometry. Temporary source geometry is hidden and animation does not render the loading scene, avoiding redundant GPU uploads and shader compilation. Unsupported or failed rounding retains the unrounded fallback.
- No asset persistence, public bucket, database migration or new network API is introduced.

## Observed timings

Local Angular dev build, same in-app browser and actual private Classic model (9,638,772 bytes). Temporary diagnostic logs were removed before release.

| Phase | Before | After (cold) | After (warm module re-entry) |
| --- | ---: | ---: | ---: |
| Download and parse | 1,389 ms | 2,274 + 105 ms | 0 + 100 ms |
| Scene setup and rounding | 121 + 576 ms | 21 + 146 ms | 14 + 86 ms |
| Module load to ready | 2,427 ms | 2,718 ms | 474 ms |

Network speed varied between runs; the cold total is not a controlled first-load speed comparison. The measured local preparation work fell from about 697 to 167 ms, and warm re-entry avoids a second model download. Actual total time depends on network and hardware; these measurements are not a production SLA. Cache reuse survives navigation within the tab, not a full page reload.
