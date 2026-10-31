# Demo browser diagnostic

Generated: 2026-10-31T11:22:06.900Z

This is an instrumented software-browser diagnostic, not a physical-device FPS guarantee or an isolated CPU/GPU benchmark. No performance thresholds are invented or enforced.


Catalog: 1214 entities, 435 systems, 741 planets. Source: organized-demo.

- regions: 32 / 32 — within bound
- systemsPerRegion: 16 / 16 — within bound
- planets: 741 / 1024 — within bound
- exoplanetHosts: 434 / 512 — within bound

| Profile / view | Draw callbacks | Callback mean / p95 ms | Interval p95 ms | Cadence Hz | Draws mean / max | Heap MiB |
|---|---:|---:|---:|---:|---:|---:|
| desktop / Earth (Earth) | 44 | 0.311 / 0.4 | 50 | 21.501 | 14 / 14 | 15.088 |
| desktop / Earth hierarchy: system (Solar System) | 44 | 0.284 / 0.4 | 50 | 22.052 | 20 / 20 | 13.806 |
| desktop / Earth hierarchy: cloud (Solar Neighborhood) | 43 | 0.267 / 0.4 | 50 | 21.724 | 21 / 21 | 16.979 |
| desktop / Earth hierarchy: galaxy (Milky Way) | 43 | 0.479 / 0.6 | 50 | 21.725 | 133 / 133 | 14.133 |
| desktop / Earth hierarchy: universe (Universe) | 42 | 0.229 / 0.3 | 50 | 21.392 | 18 / 18 | 16.03 |
| desktop / Largest populated region (Draco) | 45 | 0.571 / 0.7 | 50 | 22.374 | 108 / 108 | 18.378 |
| desktop / Richest non-Solar system (TRAPPIST-1) | 44 | 0.314 / 0.4 | 50 | 22.052 | 21 / 21 | 13.463 |
| constrained-mobile / Earth (Earth) | 43 | 0.44 / 0.8 | 50.1 | 21.538 | 11 / 11 | 15.159 |
| constrained-mobile / Earth hierarchy: system (Solar System) | 45 | 0.613 / 1.1 | 50 | 22.375 | 20 / 20 | 16.183 |
| constrained-mobile / Earth hierarchy: cloud (Solar Neighborhood) | 43 | 0.184 / 0.3 | 50 | 21.54 | 6 / 6 | 17.194 |
| constrained-mobile / Earth hierarchy: galaxy (Milky Way) | 44 | 1.289 / 1.8 | 50 | 21.864 | 133 / 133 | 20.195 |
| constrained-mobile / Earth hierarchy: universe (Universe) | 44 | 0.305 / 0.8 | 50 | 22.052 | 18 / 18 | 20.016 |
| constrained-mobile / Largest populated region (Draco) | 43 | 0.623 / 1 | 50 | 21.54 | 36 / 36 | 16.166 |
| constrained-mobile / Richest non-Solar system (TRAPPIST-1) | 44 | 0.643 / 1.1 | 50 | 22.436 | 21 / 21 | 14.632 |

- desktop: first scene ready 2114.1 ms after navigation start; 0 page errors; ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver).
- constrained-mobile: first scene ready 999.3 ms after navigation start; 0 page errors; ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver).

Each view follows public navigation and a settled camera URL, then 1 second warmup and a requested 2 second sampling window. Actual window durations, per-view resources and raw draw methods are in measure-demo.json. Rendered callback intervals exclude RAF callbacks that did not draw. Heap usage is optional; resource counters count core API objects rather than GPU bytes.
