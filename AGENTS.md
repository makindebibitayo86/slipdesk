# Notes for AI agents working on Slip Desk

Read this before changing anything in this repository.

## Always bump the footer version

Every time you change the app (any edit to `slip-desk.html`, `css/`, `js/` or `pages/`), update the version shown in the footer **as part of the same change**, without being asked.

1. In `js/app.js`, change the `version:` line (currently `'v1.2'`), found in the footer config object near the top of the footer section. The footer shows it as "Slip Desk · IT support tool · vX.Y".
2. Use the `vMAJOR.MINOR` format:
   - **MINOR** goes up by one for every piece of work that changes how the app looks or behaves (v1.2 -> v1.3).
   - **MAJOR** goes up only when the owner asks for it (v1.9 -> v2.0).
   - Do not bump it for changes to documentation or the scratch file only.
3. If you edited a script that `slip-desk.html` loads with a `?v=` number (for example `js/app.js?v=14`), raise that number by one too, so browsers do not keep serving the old cached file.
4. Tell the owner the new version number in your reply, with a one-line summary of what changed.

## Always give the git steps

At the end of every reply that changes the app, give the owner the git commands to ship it, from `git add .` down to `git push`, ready to copy and paste, with the new version number in the commit message. Example:

```
git add .
git commit -m "v1.94: one-line summary of the change"
git push
```

Only give the commands; do not run them unless the owner asks.

## Other conventions

- The app is plain HTML, CSS and JS and must keep working by double-clicking `slip-desk.html` (no build step, no server).
- Pages are `.js` files in `pages/`, not `.html`, on purpose (see `README.md`).
- `nav-notch-scratch.html` is a test page for the navbar and footer. Try layout ideas there first when the owner asks, and only copy them into the real project once approved.
- The footer styles live inside `js/app.js`, not in `css/`. Navbar styles are in `css/01-base.css`.
