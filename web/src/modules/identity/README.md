# Identity preview

Mount `IdentityProvider` once inside the application `I18nProvider`. Any client page or module can import `useIdentityDialog` from `@/modules/identity` and call `openLogin()` or `closeLogin()`. `isOpen` exposes the current dialog state. `LoginDialog` is also available as a controlled component with `open` and `onOpenChange`.

Google and email/password are presentation previews. They perform no network requests, create no account or session, and persist no input. Closing the dialog unmounts its fields; previewing email sign-in also clears the password. Labels update in place through the global language provider. The shared dialog owns keyboard, focus trapping, bounded scrolling and reduced-motion behavior; focus returns to the opener after closing.

Add a provider integration such as Firebase only when real authentication is implemented. Keep supplier credentials, SDK initialization and account state outside the presentation components; the current preview deliberately has no authentication adapter or simulated user.
