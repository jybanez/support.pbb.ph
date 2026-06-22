<?php

use App\Http\Controllers\Api\RelaySitrepHandlerController;
use App\Http\Controllers\Api\RelaySourceHeartbeatController;
use App\Http\Controllers\Api\RelaySupportRequestLifecycleHandlerController;
use App\Http\Controllers\Api\RelaySupportRequestHandlerController;
use Illuminate\Support\Facades\Route;

Route::post('/relay/sitreps', [RelaySitrepHandlerController::class, 'store'])
    ->middleware('throttle:120,1');

Route::post('/relay/support-requests', [RelaySupportRequestHandlerController::class, 'store'])
    ->middleware('throttle:120,1');

Route::post('/relay/support-request-lifecycle', [RelaySupportRequestLifecycleHandlerController::class, 'store'])
    ->middleware('throttle:120,1');

Route::post('/relay/source-heartbeats', [RelaySourceHeartbeatController::class, 'store'])
    ->middleware('throttle:120,1');
