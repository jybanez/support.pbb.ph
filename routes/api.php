<?php

use App\Http\Controllers\Api\RelaySitrepHandlerController;
use App\Http\Controllers\Api\RelaySupportRequestHandlerController;
use Illuminate\Support\Facades\Route;

Route::post('/relay/sitreps', [RelaySitrepHandlerController::class, 'store'])
    ->middleware('throttle:120,1');

Route::post('/relay/support-requests', [RelaySupportRequestHandlerController::class, 'store'])
    ->middleware('throttle:120,1');
