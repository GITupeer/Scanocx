<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Role;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $userRole = Role::findOrCreate('user');
        $adminRole = Role::findOrCreate('admin');

        $adminEmail = env('ADMIN_EMAIL', 'upeertv@gmail.com');
        $adminPassword = env('ADMIN_PASSWORD', 'password');

        $admin = User::query()->firstOrCreate(
            ['email' => $adminEmail],
            [
                'name' => 'Admin',
                'password' => $adminPassword,
                'plan' => User::PLAN_PRO,
            ]
        );

        if (! $admin->hasRole('admin')) {
            $admin->assignRole($adminRole);
        }
        if (! $admin->hasRole('user')) {
            $admin->assignRole($userRole);
        }

        // Upewnij się, że wskazany adres ma rolę admin (np. istniejące konto).
        $explicitAdmin = User::query()->where('email', 'upeertv@gmail.com')->first();
        if ($explicitAdmin && ! $explicitAdmin->hasRole('admin')) {
            $explicitAdmin->assignRole($adminRole);
        }
    }
}
