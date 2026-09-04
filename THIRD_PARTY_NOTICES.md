# Third-party notices

## Archify repository analysis design

The repository extraction stages, deterministic graph concepts, confidence
vocabulary, and import-resolution approach in
`backend/app/analysis/repository_graph.py` were adapted for PipeLens from:

- `Aryan1718/Archify` at commit
  `2e711ee34587bd7942261467251a9bbe0be59521`
- https://github.com/Aryan1718/Archify
- package: `archify-cli`
- declared license: MIT

No upstream source file is vendored verbatim; PipeLens uses its own request,
response, and visualization data models.

## Archify graph/viewer contract

The typed graph evidence and navigation design (search, focus,
upstream/downstream reach, routes, and source anchors) was informed by:

- `tt-a1i/archify`, stable version `v2.13.0` at integration time
- https://github.com/tt-a1i/archify
- license: MIT
- copyright (c) 2026 tt-a1i (Archify)
- copyright (c) 2025 Cocoon AI

PipeLens does not vendor the Archify renderer or its standalone HTML viewer.
