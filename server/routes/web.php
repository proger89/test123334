<?php

declare(strict_types=1);
use App\Http\Controllers\EditorController as E;
use App\Http\Controllers\TrainerController as T;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::get('/api/health/ready', function () {
    DB::table('scenario_versions')->count();

    return ['ready' => true];
});
Route::get('/api/v1/integrations/results', [T::class, 'export']);
Route::prefix('/api/v1')->middleware('throttle:trainer')->group(function () {
    Route::get('/editor/access', [E::class, 'status']);
    Route::post('/editor/login', [E::class, 'login'])->middleware('throttle:5,1')->block();
    Route::post('/editor/logout', [E::class, 'logout'])->block();
    Route::get('/editor', [E::class, 'index']);
    Route::post('/editor/drafts', [E::class, 'create']);
    Route::get('/editor/drafts/{id}', [E::class, 'show'])->whereUuid('id');
    Route::put('/editor/drafts/{id}', [E::class, 'save'])->whereUuid('id');
    Route::post('/editor/drafts/{id}/publish', [E::class, 'publish'])->whereUuid('id');
    Route::post('/editor/drafts/{id}/preview', [E::class, 'preview'])->whereUuid('id');
    Route::get('/editor/previews/{id}', [E::class, 'previewState'])->whereUuid('id');
    Route::post('/editor/previews/{id}/{operation}', [E::class, 'previewCommand'])->whereUuid('id');
    Route::get('/bootstrap', [T::class, 'bootstrap'])->block();
    Route::get('/session', [T::class, 'session']);
    Route::get('/me', [T::class, 'me']);
    Route::patch('/me', [T::class, 'update']);
    Route::get('/scenarios', [T::class, 'scenarios']);
    Route::post('/attempts', [T::class, 'start']);
    Route::get('/attempts/{id}', [T::class, 'show'])->whereUuid('id');
    Route::post('/attempts/{id}/practice', [T::class, 'practice'])->whereUuid('id');
    Route::post('/attempts/{id}/{operation}', [T::class, 'command'])->whereUuid('id');
    Route::get('/me/progress', [T::class, 'progress']);
    Route::get('/leaderboard', [T::class, 'leaderboard']);
    Route::get('/notifications', [T::class, 'notifications']);
    Route::patch('/notifications/{id}', [T::class, 'read'])->whereNumber('id');
    Route::post('/challenges/join', [T::class, 'join']);
    Route::post('/demo/bonus-expiry', [T::class, 'demoBonus']);
});
