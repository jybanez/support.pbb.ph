<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('support:sitreps:consolidate')->everyFifteenMinutes();
Schedule::command('support:sitreps:relay-latest')->everyFiveMinutes();
Schedule::command('support:source-heartbeats:publish')->everyMinute()->withoutOverlapping();
