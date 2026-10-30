# Local universe workspace

The web application separates its immutable bundled demo from an editable browser workspace. Local editing uses the same [canonical catalog contract](UNIVERSE-DATA.md) and renderer. Account authentication, remote persistence and provider ingestion remain future integrations; the local editor does not call a backend or upload its catalog.

## Sources and everyday use

| Source option | Current behavior |
| --- | --- |
| Demo | Explore the bundled catalog and guided tour. Editing never changes or copies these records. |
| Local | Create and manage multiple universes saved in this browser. A new workspace has zero universes and zero planets. |
| Account | Open the login presentation preview while keeping the current Demo or Local source. No authenticated account source is connected. |

Run from the repository root:

```sh
cd web
npm install
npm run dev -- --port 3032
```

Open [localhost:3032/?lang=en](http://localhost:3032/?lang=en). The hamburger menu has Go to, Settings and About tabs. Go to opens the searchable atlas; in Settings, choose Local under Universe source. Use the floating Actions button to create an object or open Manage objects. Creating from Demo also saves into Local and switches to that source after a successful save; it does not alter the fixture. The universe selector switches among saved local roots. Manage objects searches the active universe by name or type and displays 24 objects per page, with Explore, Edit and Delete actions. Planet details also expose local edit/delete actions.

The editor supports `universe → galaxy → cloud → system → planet`. Names are required; descriptions and planet HTTPS references are optional. Objects without websites are valid. An explicit parent must have the preceding kind. Auto parent reuses a suitable chain in the active universe and creates only missing, empty ancestors. Creating a planet in an empty workspace therefore creates its four ancestor groups and that one planet, without filler planets.

Editing retains the object's ID, kind, visual seed, array order, classification, tags and existing star metadata. A parent change is restricted to the correct kind within the same universe. Creation uses a kind-prefixed cryptographic UUID and an unsigned 32-bit visual seed; refresh, language changes and edits do not reroll appearance. Application localization does not translate saved names or descriptions.

Creation uses a step-based dialog: Type, Details, Location and Review, each with one simple question. Universe creation skips Location, and editing skips the immutable Type stage. Stages appear across the top on desktop and mobile. Click any stage or use Back/Continue to navigate freely without validating or erasing the draft. Only the final Create/Save action validates fields; it opens the first invalid stage and focuses its field. Optional description and website fields are disclosed on request; existing values start expanded, and an invalid website is revealed before receiving focus. Location presents the parent suggested by the current Local selection and its ancestors, with Change exposing other choices. Choices remain independent for each object type. Review shows name, type and location, plus only the description or website supplied. Draft values survive step and locale changes, and Demo IDs are never used as Local parents. Nothing is persisted until final confirmation; cancelling closes the draft. Closing and navigation are blocked only while a save is in progress.

Select and StepNavigation presentation comes from the versioned [`@velrino/ui` v0.0.4 release](https://github.com/velrino/velrino-ui/releases/tag/v0.0.4) through thin public exports. The application owns stage definitions, field validation, selected values and parent suggestions. The package manifest and lockfile use the immutable GitHub archive, so clean installations do not depend on a sibling checkout or development tarball. [UI issue #37](https://github.com/velrino/velrino-ui/issues/37) tracks the shared component work.

Deletion requires confirmation and displays the number of affected objects. Deleting a group removes its complete descendant subtree; deleting a universe removes that catalog. Navigation falls back to a surviving parent or universe, and deleting the final universe returns to the empty workspace. There is no undo or cross-universe move operation.

## Persistence and concurrent tabs

`hackuniverse.workspace.v1` stores a `schemaVersion: 1` envelope containing `activeUniverseId` and canonical universe documents. Derived `planets` indexes are rebuilt rather than persisted as duplicate records. The source preference uses the separate `hackuniverse.data-source.v1` key. Opening an empty workspace does not write demo or placeholder content.

| Bound | Applies to |
| --- | --- |
| 20 universes | The complete local workspace |
| 2,000 entities | All roots, groups and planets across those universes |
| 2 MiB | The complete serialized workspace, measured as UTF-8 bytes |

The browser may impose a smaller available storage quota. A successful mutation is published only after persistence succeeds. Invalid, unsupported or oversized stored data is reported as corrupt and kept untouched. Unavailable storage and quota failures report an error instead of claiming a save; Try again reloads the current snapshot.

Workspace writes acquire an exclusive Web Lock, then recheck the expected snapshot before writing and verify it afterward. This serializes cooperating tabs on the same origin and rejects stale changes as conflicts. Storage/focus notifications load the latest valid snapshot; an editor opened against older data must be reopened before submitting. There is no silent overwrite retry or automatic merge. Waiting for a write lock has a two-second deadline; cancellation prevents a late grant from performing a delayed write. Browsers without Web Locks can read the workspace, but mutations are blocked with an unavailable-storage result. Enable the required browser capabilities and retry rather than bypassing the lock.

Local data belongs to the exact origin and browser profile. `http://localhost:3032`, `http://localhost:3000` and the production HTTPS site have separate workspaces. Another browser, profile or device does not receive these records automatically. Clearing site data removes them. JSON export/import lets you transfer a saved copy manually; there is no account synchronization, automatic upload or backup service.

Settings → Copy view link shares only the current destination ID and camera pose, with `source=local`. It does not include or upload saved objects. The receiving browser needs the same workspace IDs before the view can resolve; import a JSON export separately when needed. See [camera links](UNIVERSE-EXPLORER.md#camera-links) for validation and restore behavior.

## JSON import and export

Import JSON and Export JSON transfer the complete Local workspace, including every saved universe. Export downloads a canonical `schemaVersion: 1` workspace envelope with `activeUniverseId` and `universes`; it does not include the bundled Demo, source preference, credentials or derived `planets` indexes. IDs, visual seeds, entity order and optional canonical metadata remain intact. Readable JSON is used when it fits the size limit, otherwise the export uses compact JSON so the download remains re-importable.

Import follows File → Options → Confirm. File starts with a file chooser; Paste JSON instead reveals a text input. Options shows the incoming totals and the import mode. Edit JSON (advanced) optionally opens the installed `json-edit-react` 2.0.5 editor with the real GitHub Dark theme from `@json-edit-react/themes` 1.0.0; opening this editor is not required to import a backup. Editor controls are localized in English and Brazilian Portuguese. Confirm shows current and resulting universe, entity and planet totals before the final action. Edits remain a draft until confirmation, and invalid content cannot be imported. Confirm or cancel any active inline JSON edit before navigating or importing.

Add universes is the default merge mode. It appends incoming universes without replacing existing IDs; any ID collision with Local is rejected, even when the objects appear identical. Existing active-universe selection is retained unless Local was empty. To restore a complete saved snapshot, choose Replace local workspace. When Local contains existing objects, replacement requires an explicit checkbox acknowledging how many objects it replaces. Replacement does not provide undo; export a backup first if you need the current content. The final save uses the existing write lock and expected-snapshot checks, so a concurrent tab change requires another review instead of being silently overwritten.

Transfer validation accepts only the canonical workspace envelope, not a provider response or an inferred alternate format. It checks JSON syntax, supported fields, globally unique IDs, hierarchy, references and active selection. Both incoming data and the resulting workspace must fit 20 universes, 2,000 entities and 2 MiB of UTF-8 JSON. Structural checks also limit nesting to 16 levels and traversal to 50,000 JSON nodes. Prototype-sensitive keys and unsupported non-JSON object structures are rejected before the editor or canonical parser consumes them. These are structural and resource checks, not a classifier for illegal, private or otherwise inappropriate content.

File reading, review, validation and download happen in the browser. There is no upload or provider request, and raw JSON, file contents and editor values must not be sent to telemetry or logs. Import errors use generic messages rather than echoing rejected content. Keep exported files private when their saved names, descriptions or references are private. Imports remain isolated from Demo and do not establish account ownership or synchronization.

## Composition boundaries

Import the application composition through its public entry:

```tsx
import { UniverseWorkspaceHost } from "@/modules/universe-workspace";
import type { UniverseCatalog } from "@/modules/universe/domain";

export function Workspace({ demoCatalog }: { demoCatalog: UniverseCatalog }) {
  return <UniverseWorkspaceHost demoCatalog={demoCatalog} />;
}
```

The host accepts a validated `demoCatalog` and optional `demoTour`. `DemoUniverseHost` supplies the bundled choices. The workspace domain owns pure CRUD and validation, its storage adapter owns browser persistence and locking, and its hooks coordinate source selection, editor state and presentation commands. Module-owned messages provide EN/PT interface copy.

The reusable universe receives a canonical catalog and optional `UniverseManagement` ports for actions, selection actions, source controls, navigation requests and entity-transition completion. It does not import browser workspace storage, login state or a supplier SDK. `FloatButtonGroup`, imported from `@/components/ui/float-button-group`, is a controlled shared disclosure of ordinary buttons, with Escape/outside dismissal and native keyboard navigation.

`IdentityProvider` is mounted globally inside localization. Any client module can use `useIdentityDialog` from `@/modules/identity` to open the same login dialog. Google and email/password actions are presentation previews: no Firebase SDK, authentication request, user session or credential persistence exists. Fields live only in component state, closing unmounts them, and the email preview clears its password on submission. Connecting authentication must not move provider initialization into the dialog or renderer.

## Creation and deletion feedback

Successful creation emits a 1.35-second scene effect: planetary accretion, an emerging star system, gaseous cloud wisps, spiral galaxy formation or viewport-scaled universe expansion. Deletion chooses a burst or inward collapse before attempting the saved change. Each transition has a token so completion cannot apply a pending deletion twice; storage is checked again when deletion commits.

Effects reuse shared round-particle resources, with at most 128 particles below 640 pixels, 256 on larger viewports, or 320 for a larger-screen universe effect. One particle draw and one core sprite add at most two draws. Creation follows a visible moving target; deletion can use its previous position or the current scene focus when its representation is unavailable. The effect does not own the camera, tour or flight controls, and progresses independently of paused orbital motion.

Reduced motion completes the scene effect immediately. A 1.45-second scene deadline also releases hidden/offscreen effects, and workspace orchestration has a 1.8-second fallback when WebGL or scene initialization is unavailable. The visible status and editor recovery do not depend on particle rendering. Timers and owned geometry/materials are cleaned up on completion, cancellation or disposal. These are configured budgets, not measured physical-device performance.

## Validation and roadmap

From `web/`, run `npm run test:workspace` for the workspace domain and storage suite. It compiles into ignored `.workspace-tests/` output and covers hierarchy creation, stable identity, cascades, quotas, corrupt data, stale snapshots, write locks, bounded JSON transfer and inline editor lifecycle. Run `npm run test:catalog` and `npm run test:scene` for their separate contracts; browser journeys are documented in [the web guide](../web/README.md#browser-verification). These commands do not establish deployment status or physical-device performance.

[Issue #36](https://github.com/velrino/hackuniverse/issues/36) tracks the frontend workspace, and [issue #38](https://github.com/velrino/hackuniverse/issues/38) tracks JSON transfer. [Issue #37](https://github.com/velrino/hackuniverse/issues/37) tracks future account/provider integration. Real authentication, authorization, server persistence, synchronization and ingestion require their own boundary contracts; choosing Account today does not enable them.
