<?php

use App\Http\Controllers\Api\AdminUserController;
use App\Http\Controllers\Api\AiController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookController;
use App\Http\Controllers\Api\ExportController;
use App\Http\Controllers\Api\OcrController;
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

    Route::get('/books', [BookController::class, 'index']);
    Route::post('/books', [BookController::class, 'store']);
    Route::get('/books/{localId}', [BookController::class, 'show']);
    Route::patch('/books/{localId}', [BookController::class, 'update']);
    Route::delete('/books/{localId}', [BookController::class, 'destroy']);
    Route::post('/books/{localId}/pages', [BookController::class, 'storePage']);
    Route::patch('/books/{localId}/pages/{pageLocalId}', [BookController::class, 'updatePage']);
    Route::delete('/books/{localId}/pages/{pageLocalId}', [BookController::class, 'destroyPage']);

    Route::get('/ai/quota', [AiController::class, 'quota']);
    Route::get('/ai/usage', [AiController::class, 'usage']);
    Route::post('/ai/analyze', [AiController::class, 'analyze']);
    Route::get('/ai/batches/{id}', [AiController::class, 'batch']);

    Route::get('/ocr/quota', [OcrController::class, 'quota']);
    Route::post('/ocr/reserve', [OcrController::class, 'reserve']);
    Route::post('/ocr/consume', [OcrController::class, 'consume']);
    Route::post('/ocr/release', [OcrController::class, 'release']);

    Route::get('/export/quota', [ExportController::class, 'quota']);
    Route::post('/export/consume', [ExportController::class, 'consume']);

    Route::middleware('role:admin')->prefix('admin')->group(function () {
        Route::get('/users', [AdminUserController::class, 'index']);
        Route::patch('/users/{user}', [AdminUserController::class, 'update']);
    });
});
