<?php

use App\Http\Controllers\Api\AdminUsersController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BootstrapController;
use App\Http\Controllers\Api\CurrentSitrepController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\SourceHeartbeatController;
use App\Http\Controllers\Api\SupportRequestsController;
use App\Http\Controllers\Api\UserController;
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

Route::prefix('api')->group(function (): void {
    Route::get('/bootstrap', [BootstrapController::class, 'show']);
    Route::get('/csrf-token', [AuthController::class, 'csrfToken']);
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:6,1');

    Route::middleware('auth')->group(function (): void {
        Route::get('/user', [AuthController::class, 'user']);
        Route::post('/user', [UserController::class, 'update']);
        Route::post('/user/password', [UserController::class, 'updatePassword']);
        Route::get('/admin/users', [AdminUsersController::class, 'index']);
        Route::post('/admin/users', [AdminUsersController::class, 'store']);
        Route::post('/admin/users/{user}', [AdminUsersController::class, 'update']);
        Route::delete('/admin/users/{user}', [AdminUsersController::class, 'destroy']);
        Route::get('/settings', [SettingsController::class, 'show']);
        Route::post('/settings', [SettingsController::class, 'update']);
        Route::get('/support-requests', [SupportRequestsController::class, 'index']);
        Route::get('/support-requests/{supportRequest}', [SupportRequestsController::class, 'show']);
        Route::post('/support-requests/{supportRequest}/receive', [SupportRequestsController::class, 'receive']);
        Route::get('/sitreps/current', [CurrentSitrepController::class, 'show']);
        Route::get('/source-heartbeats', [SourceHeartbeatController::class, 'index']);
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/session/ping', [AuthController::class, 'ping']);
    });
});
