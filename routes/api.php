<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AdminUsersController;
use App\Http\Controllers\Api\BootstrapController;
use App\Http\Controllers\Api\CurrentSitrepController;
use App\Http\Controllers\Api\CurrentSitrepSupportController;
use App\Http\Controllers\Api\RelaySitrepHandlerController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\SourceHeartbeatController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::post('/relay/sitreps', [RelaySitrepHandlerController::class, 'store'])
    ->middleware('throttle:120,1');

Route::middleware('web')->group(function (): void {
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
        Route::get('/sitreps/current', [CurrentSitrepController::class, 'show']);
        Route::get('/sitreps/current/support', [CurrentSitrepSupportController::class, 'show']);
        Route::get('/source-heartbeats', [SourceHeartbeatController::class, 'index']);
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/session/ping', [AuthController::class, 'ping']);
    });
});
