<?php

use App\Http\Controllers\Api\AdminUsersController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BootstrapController;
use App\Http\Controllers\Api\CurrentSitrepMediaController;
use App\Http\Controllers\Api\CurrentSitrepController;
use App\Http\Controllers\Api\RealtimeAdmissionController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\SourceHeartbeatController;
use App\Http\Controllers\Api\SupportRequestsController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Web\SitrepMediaController;
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

Route::middleware('auth')->group(function (): void {
    Route::get('/media/{sourceHubId}/{incidentId}/incident_media/{mediaType}/{mediaId}', [SitrepMediaController::class, 'incidentMedia'])
        ->where('sourceHubId', '[A-Za-z0-9_-]+')
        ->whereNumber('incidentId')
        ->where('mediaType', '[A-Za-z0-9_-]+')
        ->whereNumber('mediaId')
        ->name('support.sitrep-media.incident');

    Route::get('/media/{sourceHubId}/{incidentId}/message_attachment/{messageId}/{attachmentId}', [SitrepMediaController::class, 'messageAttachment'])
        ->where('sourceHubId', '[A-Za-z0-9_-]+')
        ->whereNumber('incidentId')
        ->whereNumber('messageId')
        ->whereNumber('attachmentId')
        ->name('support.sitrep-media.attachment');
});

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
        Route::post('/support-requests/{supportRequest}/accept', [SupportRequestsController::class, 'accept']);
        Route::post('/support-requests/{supportRequest}/reject', [SupportRequestsController::class, 'reject']);
        Route::post('/support-requests/{supportRequest}/assign', [SupportRequestsController::class, 'assign']);
        Route::post('/support-requests/{supportRequest}/en-route', [SupportRequestsController::class, 'markEnRoute']);
        Route::post('/support-requests/{supportRequest}/complete', [SupportRequestsController::class, 'complete']);
        Route::get('/sitreps/current', [CurrentSitrepController::class, 'show']);
        Route::get('/sitreps/current/media', [CurrentSitrepMediaController::class, 'index']);
        Route::get('/source-heartbeats', [SourceHeartbeatController::class, 'index']);
        Route::post('/realtime/source-heartbeats/admission', [RealtimeAdmissionController::class, 'sourceHeartbeats']);
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/session/ping', [AuthController::class, 'ping']);
    });
});
