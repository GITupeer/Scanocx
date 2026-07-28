<?php

use App\Http\Controllers\Api\AdminUserController;
use App\Http\Controllers\Api\AiController;
use App\Http\Controllers\Api\AuthController;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
Route::post('/reset-password', [AuthController::class, 'resetPassword']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::patch('/me', [AuthController::class, 'updateProfile']);
    Route::post('/change-password', [AuthController::class, 'changePassword']);

    Route::get('/ai/quota', [AiController::class, 'quota']);
    Route::get('/ai/usage', [AiController::class, 'usage']);
    Route::post('/ai/analyze', [AiController::class, 'analyze']);
    Route::get('/ai/batches/{id}', [AiController::class, 'batch']);

    Route::middleware('role:admin')->prefix('admin')->group(function () {
        Route::get('/users', [AdminUserController::class, 'index']);
        Route::patch('/users/{user}', [AdminUserController::class, 'update']);
    });
});
