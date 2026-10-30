# Browser storage

Application-owned local storage goes through the public `browserStorage` service in `web/src/lib/storage`. It provides synchronous `getItem`, `setItem` and `removeItem` string operations. `createStorageService(resolveStorage)` supplies the same contract for tests or a different storage implementation.

The resolver runs only when an operation is performed. Importing the service or rendering on the server never reads `window.localStorage`; attempting an operation without browser storage throws. Access denial, quota failures and native storage errors remain visible to the caller. The transport does not silently replace failed writes with a successful-looking memory cache.

Consumers own their keys, serialization, schemas, defaults and recovery behavior. Audio preferences, welcome/tour flags, source selection and the local workspace use the same transport while retaining their existing stored formats. The local workspace still validates bounds and canonical data, serializes mutations with Web Locks and checks stale snapshots. Cross-tab subscriptions remain with the domain stores that understand those snapshots.

Do not move application language into storage: the global `lang` query parameter remains authoritative. Third-party SDK persistence remains owned by its SDK; it is not application workspace storage.

Run `npm run test:storage` from `web/` for lazy resolution, unavailable storage and transport error checks. Workspace and audio tests verify the domain behavior built on top of this service.
