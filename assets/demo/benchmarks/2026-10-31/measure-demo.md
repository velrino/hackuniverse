# Demo browser diagnostic

Generated: 2026-10-31T19:07:05.088Z

This is an instrumented software-browser diagnostic, not a physical-device FPS guarantee or an isolated CPU/GPU benchmark. No performance thresholds are invented or enforced.


Catalog: 1270 entities, 450 systems, 767 planets. Source: organized-demo.

- regions: 32 / 32 — within bound
- systemsPerRegion: 16 / 16 — within bound
- planets: 767 / 1024 — within bound
- exoplanetHosts: 449 / 512 — within bound

| Profile / view | Draw callbacks | Callback mean / p95 ms | Interval p95 ms | Cadence Hz | Draws mean / max | Heap MiB |
|---|---:|---:|---:|---:|---:|---:|
| desktop / Earth (Earth) | 45 | 0.373 / 0.5 | 50 | 22.564 | 14 / 14 | 15.199 |
| desktop / Earth hierarchy: system (Solar System) | 44 | 0.391 / 0.5 | 50 | 22.242 | 20 / 20 | 16.201 |
| desktop / Earth hierarchy: cloud (Solar Neighborhood) | 45 | 0.56 / 0.6 | 50 | 22.566 | 91 / 91 | 15.815 |
| desktop / Earth hierarchy: galaxy (Milky Way) | 45 | 0.52 / 0.6 | 50 | 22.564 | 133 / 133 | 15.807 |
| desktop / Earth hierarchy: universe (Universe) | 45 | 0.431 / 0.5 | 50 | 22.564 | 63 / 63 | 17.401 |
| desktop / Largest populated region (Draco) | 43 | 0.635 / 0.8 | 50 | 21.724 | 108 / 108 | 17.873 |
| desktop / Richest non-Solar system (TRAPPIST-1) | 44 | 0.339 / 0.4 | 50 | 22.241 | 21 / 21 | 15.485 |
| constrained-mobile / Earth (Earth) | 45 | 0.847 / 1.1 | 50 | 22.76 | 11 / 11 | 16.202 |
| constrained-mobile / Earth hierarchy: system (Solar System) | 45 | 0.989 / 1.3 | 50 | 22.374 | 20 / 20 | 15.035 |
| constrained-mobile / Earth hierarchy: cloud (Solar Neighborhood) | 44 | 1.123 / 1.5 | 50 | 22.436 | 36 / 36 | 16.357 |
| constrained-mobile / Earth hierarchy: galaxy (Milky Way) | 45 | 1.927 / 2.4 | 50 | 22.375 | 133 / 133 | 16.743 |
| constrained-mobile / Earth hierarchy: universe (Universe) | 44 | 1.225 / 1.7 | 50 | 22.051 | 63 / 63 | 14.136 |
| constrained-mobile / Largest populated region (Draco) | 44 | 0.993 / 1.4 | 50 | 21.865 | 36 / 36 | 15.504 |
| constrained-mobile / Richest non-Solar system (TRAPPIST-1) | 43 | 1.221 / 1.6 | 50 | 21.54 | 21 / 21 | 14.637 |

- desktop: first scene ready 2312.6 ms after navigation start; 0 page errors; ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver).
- constrained-mobile: first scene ready 1092.8 ms after navigation start; 0 page errors; ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver).

Each view follows public navigation and a settled camera URL, then 1 second warmup and a requested 2 second sampling window. Actual window durations, per-view resources and raw draw methods are in measure-demo.json. Rendered callback intervals exclude RAF callbacks that did not draw. Heap usage is optional; resource counters count core API objects rather than GPU bytes.
