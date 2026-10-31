# Demo browser diagnostic

Generated: 2026-10-31T18:03:02.423Z

This is an instrumented software-browser diagnostic, not a physical-device FPS guarantee or an isolated CPU/GPU benchmark. No performance thresholds are invented or enforced.


Catalog: 1255 entities, 450 systems, 767 planets. Source: organized-demo.

- regions: 32 / 32 — within bound
- systemsPerRegion: 16 / 16 — within bound
- planets: 767 / 1024 — within bound
- exoplanetHosts: 449 / 512 — within bound

| Profile / view | Draw callbacks | Callback mean / p95 ms | Interval p95 ms | Cadence Hz | Draws mean / max | Heap MiB |
|---|---:|---:|---:|---:|---:|---:|
| desktop / Earth (Earth) | 44 | 0.345 / 0.4 | 50 | 21.865 | 14 / 14 | 15.151 |
| desktop / Earth hierarchy: system (Solar System) | 43 | 0.323 / 0.4 | 50 | 21.724 | 20 / 20 | 13.675 |
| desktop / Earth hierarchy: cloud (Solar Neighborhood) | 44 | 0.523 / 0.6 | 50 | 21.864 | 91 / 91 | 18.448 |
| desktop / Earth hierarchy: galaxy (Milky Way) | 44 | 0.532 / 0.6 | 50 | 22.242 | 133 / 133 | 17.697 |
| desktop / Earth hierarchy: universe (Universe) | 44 | 0.239 / 0.3 | 50 | 22.242 | 18 / 18 | 14.263 |
| desktop / Largest populated region (Draco) | 44 | 0.584 / 0.7 | 50 | 22.242 | 108 / 108 | 13.497 |
| desktop / Richest non-Solar system (TRAPPIST-1) | 44 | 0.325 / 0.4 | 50 | 22.052 | 21 / 21 | 13.896 |
| constrained-mobile / Earth (Earth) | 45 | 0.951 / 1.3 | 50 | 22.374 | 11 / 11 | 15.617 |
| constrained-mobile / Earth hierarchy: system (Solar System) | 44 | 1.268 / 1.7 | 50 | 22.242 | 20 / 20 | 16.745 |
| constrained-mobile / Earth hierarchy: cloud (Solar Neighborhood) | 43 | 1.281 / 1.6 | 50 | 21.914 | 36 / 36 | 17.471 |
| constrained-mobile / Earth hierarchy: galaxy (Milky Way) | 46 | 2.048 / 2.5 | 50 | 22.69 | 133 / 133 | 14.367 |
| constrained-mobile / Earth hierarchy: universe (Universe) | 44 | 0.539 / 0.9 | 50 | 22.242 | 18 / 18 | 15.876 |
| constrained-mobile / Largest populated region (Draco) | 45 | 0.982 / 1.3 | 50 | 22.375 | 36 / 36 | 14.898 |
| constrained-mobile / Richest non-Solar system (TRAPPIST-1) | 44 | 0.775 / 1.1 | 50 | 22.051 | 21 / 21 | 20.331 |

- desktop: first scene ready 2255.2 ms after navigation start; 0 page errors; ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver).
- constrained-mobile: first scene ready 1108.9 ms after navigation start; 0 page errors; ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver).

Each view follows public navigation and a settled camera URL, then 1 second warmup and a requested 2 second sampling window. Actual window durations, per-view resources and raw draw methods are in measure-demo.json. Rendered callback intervals exclude RAF callbacks that did not draw. Heap usage is optional; resource counters count core API objects rather than GPU bytes.
