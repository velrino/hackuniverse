# Design-system navigation

[Velrino UI documentation](https://velrino.github.io/velrino-ui/) is the canonical interactive gallery. `DesignSystemLink` opens it in a new tab from the application header and universe menu, preserving the URL-driven language and selecting Cyan with sci-fi surfaces. The existing universe stays mounted in its original tab.

`/design` is a compatibility redirect for existing bookmarks. It preserves the valid `lang` selection; normal HTTP redirects also retain the incoming section fragment. Invalid or repeated language values use English, matching the application locale policy.

This module contains only navigation. Runtime primitives still come from the pinned `@velrino/ui` release through `src/components/ui`, with application tokens mapped in `src/styles/hud.css`. Gallery code, translations and showcase CSS are no longer bundled here. The first-visit intro, scene, application i18n and telemetry remain application-owned.
