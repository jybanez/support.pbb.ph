<?php

use App\Http\Controllers\Web\SupportMapBoundaryController;
use App\Http\Controllers\Web\SupportMapConfigController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('app');
});

Route::view('/dashboard', 'app')->name('dashboard');
Route::get('/support-map.json', [SupportMapConfigController::class, 'show'])->name('support.map-config');
Route::get('/map-boundaries/{scope}/{code}.geojson', [SupportMapBoundaryController::class, 'show'])
    ->whereIn('scope', ['barangay', 'city', 'province', 'region'])
    ->where('code', '[A-Za-z0-9_-]+')
    ->name('support.map-boundary');
