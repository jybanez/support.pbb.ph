@php
    $appName = config('app.name', 'PBB Support System');
    $helperUiBundleRev = '0.21.112';
@endphp
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ $appName }}</title>
    <link rel="stylesheet"
          href="/vendor/helpers.pbb.ph/dist/helpers.ui.bundle.min.css?v={{ $helperUiBundleRev }}"
          data-ui-bundle="ui"
          data-ui-loader-href="{{ url('/vendor/helpers.pbb.ph/dist/helpers.ui.bundle.min.css') }}?v={{ $helperUiBundleRev }}">
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body data-theme="dark">
    <div id="app"
         data-page="{{ request()->path() === '/' ? 'dashboard' : request()->path() }}"
         data-app-name="{{ $appName }}">
    </div>
</body>
</html>
