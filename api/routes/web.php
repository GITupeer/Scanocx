<?php

use App\Http\Controllers\BookTextController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/b/{token}', [BookTextController::class, 'show'])
    ->where('token', '[a-f0-9]{32}');
