# Helper Library Integration

The app vendors the shared helper runtime under:

```text
public/vendor/helpers.pbb.ph/dist
```

Current source checkout:

```text
C:\wamp64\www\hotline-helpers
```

Pinned helper commit at foundation scaffold:

```text
b5df4887b6d3fcbb84eb016614ff7a7d1b34bff6
```

The app shell uses the bundled helper CSS and loads helper factories through `uiLoader` from:

```text
public/vendor/helpers.pbb.ph/js/ui/ui.loader.js
```

`uiLoader` is configured with `preferBundles=true`, so registered helper keys resolve through:

```text
public/vendor/helpers.pbb.ph/dist/helpers.ui.bundle.min.js
public/vendor/helpers.pbb.ph/dist/helpers.ui.bundle.min.css
```

Current helper-owned foundation controls:

- `ui.navbar` for the app navbar and authenticated user menu.
- `ui.form.modal.login` for the shared Login modal.
- `ui.form.modal.reauth` for session-expired reauthentication.
- `ui.form.modal.account` for current-user account editing.
- `ui.form.modal.change.password` for password changes.
- `ui.form.modal` for the admin Settings form.
- `ui.splitter` for the dashboard map/current-SITREP layout.
- `ui.map.controls` for MapLibre dashboard controls.
- `ui.virtual.list` for SITREP source cards.
- `ui.elapsed.time` for SITREP source freshness.
- `ui.toggle.button` for source boundary visibility toggles.
- `ui.clock` for the authenticated header alert clock.
- `ui.dialog.alert` for failed-login feedback.

Keep Support app code adapter-only around these helpers: normalize API payloads, map field names to backend contracts, and keep helper structure/style ownership in the shared library.

Refresh vendored helper files only from the official helper repository or local official checkout. Do not copy helper files ad hoc from another downstream app.
