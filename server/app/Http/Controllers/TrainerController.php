<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Game\AttemptService;
use App\Game\Progress;
use App\Game\ScenarioCatalog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class TrainerController extends Controller
{
    public function __construct(private AttemptService $attempts, private Progress $progress, private ScenarioCatalog $catalog) {}

    private function profile(Request $r): string
    {
        $id = $r->session()->get('profile_id');
        abort_unless($id && DB::table('profiles')->where('id', $id)->exists(), 401);

        return $id;
    }

    public function bootstrap(Request $r): array
    {
        if (! $r->session()->has('profile_id')) {
            $id = (string) Str::uuid();
            DB::table('profiles')->insert(['id' => $id, 'name' => 'Проводник '.random_int(10, 99), 'brigade' => 'Бригада №12', 'depot' => 'Москва', 'created_at' => now(), 'updated_at' => now()]);
            $r->session()->put('profile_id', $id);
            $r->session()->regenerate();
        }

        return ['csrf' => csrf_token()] + $this->me($r);
    }

    public function me(Request $r): array
    {
        $id = $this->profile($r);

        return ['profile' => DB::table('profiles')->where('id', $id)->first(), 'progress' => $this->progress->summary($id), 'active_attempt' => DB::table('attempts')->where('profile_id', $id)->where('status', '!=', 'completed')->value('id')];
    }

    public function update(Request $r): array
    {
        $d = $r->validate(['name' => 'required|string|min:2|max:40', 'portrait' => 'required|in:conductor_card,chief_card']);
        DB::table('profiles')->where('id', $this->profile($r))->update($d);

        return $this->me($r);
    }

    public function scenarios(): array
    {
        $result = [];
        foreach (DB::table('scenario_versions')->select('scenario')->distinct()->pluck('scenario') as $id) {
            $s = $this->catalog->get($id);
            $result[] = ['id' => $s->id, 'title' => $s->title, 'intro' => $s->intro, 'version' => $s->version];
        }

return $result;
    }

    public function start(Request $r): array
    {
        $d = $r->validate(['scenario' => 'required|in:service,security', 'mode' => 'required|in:train,check', 'seat' => 'required|boolean']);

        return $this->attempts->create($this->profile($r), $d['scenario'], $d['mode'], $d['seat']);
    }

    public function show(Request $r, string $id): array
    {
        return $this->attempts->load($this->profile($r), $id);
    }

    public function command(Request $r, string $id, string $operation)
    {
        abort_unless(in_array($operation, ['actions', 'pause', 'finish'], true), 404);
        $rules = ['request_id' => 'required|uuid', 'expected_revision' => 'required|integer|min:0'];
        if ($operation === 'actions') {
            $rules += ['thread_id' => 'required|string', 'action_id' => 'required|string'];
        }if ($operation === 'pause') {
            $rules += ['paused' => 'required|boolean'];
        }$d = $r->validate($rules);
        [$status,$body] = $this->attempts->command($this->profile($r), $id, $operation, $d);

        return response()->json($body, $status);
    }

    public function progress(Request $r): array
    {
        return $this->progress->summary($this->profile($r));
    }

    public function notifications(Request $r)
    {
        $id = $this->profile($r);
        $this->progress->syncNotifications($id);

        return DB::table('notifications')->where('profile_id', $id)->orderByDesc('id')->get();
    }

    public function read(Request $r, string $id): array
    {
        DB::table('notifications')->where('profile_id', $this->profile($r))->where('id', $id)->update(['read' => true]);

        return ['ok' => true];
    }

    public function join(Request $r): array
    {
        $id = $this->profile($r);
        DB::table('challenge_entries')->insertOrIgnore(['profile_id' => $id, 'joined_at' => now(), 'expires_at' => now()->addDay()]);

        return $this->progress->summary($id);
    }

    public function leaderboard(Request $r): array
    {
        $d = $r->validate(['scope' => 'required|in:brigade,depot,company']);
        $me = DB::table('profiles')->where('id', $this->profile($r))->first();
        $q = DB::table('profiles');
        if ($d['scope'] !== 'company') {
            $q->where($d['scope'], $me->{$d['scope']});
        }$rows = [];
        foreach ($q->get() as $p) {
            $points = (int) DB::table('best_results')->where('profile_id', $p->id)->sum('score');
            $bonus = (int) DB::table('bonuses')->where('profile_id', $p->id)->where('expires_at', '>', now())->sum('points');
            $rows[] = ['id' => $p->id, 'name' => $p->name, 'brigade' => $p->brigade, 'depot' => $p->depot, 'demo' => $p->demo, 'permanent' => $points, 'total' => $points + $bonus];
        }
        usort($rows, fn ($a, $b) => ($b['total'] <=> $a['total']) ?: ($b['permanent'] <=> $a['permanent']) ?: strcmp($a['id'], $b['id']));
        $rank = 0;
        $last = null;
        foreach ($rows as $i => &$row) {
            $key = $row['total'].':'.$row['permanent'];
            if ($key !== $last) {
                $rank = $i + 1;
            }$row['rank'] = $rank;
            $last = $key;
        }

return $rows;
    }

    public function export(Request $r)
    {
        $token = $r->bearerToken();
        abort_unless($token && DB::table('integration_tokens')->where('hash', hash('sha256', $token))->where('scope', 'results:read')->where('expires_at', '>', now())->exists(), 401);

        return DB::table('attempts')->where('status','completed')->select('id','profile_id','scenario','version','mode','result','finished_at')->orderBy('id')->cursorPaginate(50);
    }
}
