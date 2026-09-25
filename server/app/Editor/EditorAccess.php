<?php

declare(strict_types=1);

namespace App\Editor;

use Illuminate\Http\Request;

final class EditorAccess
{
    public function authorized(Request $request): bool
    {
        $code = (string) config('editor.access_code');

        return strlen($code) >= 16 && $request->session()->has('profile_id')
            && (int) $request->session()->get('editor_until', 0) > time()
            && hash_equals(hash('sha256', $code), (string) $request->session()->get('editor_key', ''));
    }

    public function profile(Request $request): string
    {
        abort_unless($this->authorized($request), 403, 'Для редактора нужен код доступа методиста.');

        return $request->session()->get('profile_id');
    }

    public function login(Request $request, string $input): void
    {
        $code = (string) config('editor.access_code');
        abort_unless(strlen($code) >= 16 && hash_equals($code, $input), 403, 'Неверный код доступа.');
        abort_unless($request->session()->has('profile_id'), 401);
        $request->session()->regenerate();
        $request->session()->put(['editor_key' => hash('sha256', $code), 'editor_until' => time() + 8 * 3600]);
    }
}
