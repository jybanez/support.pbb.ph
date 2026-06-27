# Helper Library Integration

The app vendors the shared helper runtime under:

```text
public/vendor/helpers.pbb.ph/dist
```

Current source checkout:

```text
C:\wamp64\www\hotline-helpers
```

Current refreshed helper source:

```text
eee1354 Merge pull request #24 from jybanez/modal/non-dismissible-form-cancel
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

Unauthenticated boot uses `ui.form.modal.login` as a blocking branded gate:
Support renders no app shell until authenticated and opens the modal with
`showCloseButton: false`, `showCancelButton: false`, `closeOnBackdrop: false`,
and `closeOnEscape: false`.

Keep Support app code adapter-only around these helpers: normalize API payloads, map field names to backend contracts, and keep helper structure/style ownership in the shared library.

Refresh vendored helper files only from the official helper repository or local official checkout. Do not copy helper files ad hoc from another downstream app.
