<?php

declare(strict_types=1);
use App\Http\Controllers\TrainerController as T;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::get('/api/health/ready', function () {
    DB::table('scenario_versions')->count();

    return ['ready' => true];
});
Route::get('/api/v1/integrations/results', [T::class, 'export']);
Route::prefix('/api/v1')->middleware('throttle:trainer')->group(function () {
    Route::get('/bootstrap', [T::class, 'bootstrap'])->block();
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
});
