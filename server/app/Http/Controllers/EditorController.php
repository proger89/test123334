<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Editor\DraftContent;
use App\Editor\EditorAccess;
use App\Editor\EditorDraft;
use App\Editor\EditorService;
use App\Editor\PreviewService;
use App\Game\AttemptCommand;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class EditorController extends Controller
{
    public function __construct(private EditorAccess $access, private EditorService $editor, private PreviewService $previews) {}

    public function status(Request $request): array
    {
        return ['authorized' => $this->access->authorized($request)];
    }

    public function login(Request $request): array
    {
        $input = $request->validate(['code' => 'required|string|max:128']);
        $this->access->login($request, $input['code']);

        return ['authorized' => true, 'csrf' => csrf_token()];
    }

    public function logout(Request $request): array
    {
        $request->session()->forget(['editor_key', 'editor_until']);

        return ['authorized' => false];
    }

    public function index(Request $request): array
    {
        $profile = $this->access->profile($request);
        $versions = DB::table('scenario_versions')->orderByDesc('id')->get()->map(fn (object $row) => [
            'scenario' => $row->scenario, 'version' => $row->version, 'title' => json_decode($row->definition)->title, 'ranked' => $row->ranked,
        ]);
        $drafts = DB::table('scenario_drafts')->where('profile_id', $profile)->orderByDesc('updated_at')->get()->map(fn (object $row) => [
            'id' => $row->id, 'title' => json_decode($row->definition)->title ?? 'Без названия', 'published_version' => $row->published_version,
        ]);

        return ['versions' => $versions, 'drafts' => $drafts];
    }

    private function view(EditorDraft $draft): array
    {
        return $draft->jsonSerialize() + ['issues' => $this->editor->issues($draft)];
    }

    private function respond(callable $operation): JsonResponse
    {
        try {
            return response()->json($operation());
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => ['message' => $e->getMessage()]], 422);
        } catch (\DomainException $e) {
            return response()->json(['error' => ['message' => $e->getMessage()]], 409);
        }
    }

    public function create(Request $request): JsonResponse
    {
        $profile = $this->access->profile($request);
        $input = $request->validate(['request_id' => 'required|uuid', 'scenario' => 'required|in:service,security', 'version' => 'required|string|max:100']);

        return $this->respond(fn () => $this->view($this->editor->create($profile, $input['request_id'], $input['scenario'], $input['version'])));
    }

    public function show(Request $request, string $id): array
    {
        return $this->view($this->editor->draft($this->access->profile($request), $id));
    }

    public function save(Request $request, string $id): JsonResponse
    {
        $profile = $this->access->profile($request);
        $input = $request->validate(['expected_revision' => 'required|integer|min:0', 'definition' => 'required|string|max:150000']);

        return $this->respond(fn () => $this->view($this->editor->save($profile, $id, $input['expected_revision'], DraftContent::parse($input['definition']))));
    }

    public function publish(Request $request, string $id): JsonResponse
    {
        $profile = $this->access->profile($request);
        $input = $request->validate(['expected_revision' => 'required|integer|min:0']);

        return $this->respond(fn () => $this->view($this->editor->publish($profile, $id, $input['expected_revision'])));
    }

    public function preview(Request $request, string $id): JsonResponse
    {
        $profile = $this->access->profile($request);
        $input = $request->validate(['expected_revision' => 'required|integer|min:0', 'seat' => 'required|boolean']);

        return $this->respond(fn () => $this->previews->start($profile, $id, $input['expected_revision'], $input['seat']));
    }

    public function previewState(Request $request, string $id): array
    {
        return $this->previews->load($this->access->profile($request), $id);
    }

    public function previewCommand(Request $request, string $id, string $operation): JsonResponse
    {
        $profile = $this->access->profile($request);
        abort_unless(in_array($operation, ['actions', 'pause', 'finish'], true), 404);
        $rules = ['request_id' => 'required|uuid', 'expected_revision' => 'required|integer|min:0'];
        if ($operation === 'actions') {
            $rules += ['thread_id' => 'required|string', 'action_id' => 'required|string'];
        }
        if ($operation === 'pause') {
            $rules += ['paused' => 'required|boolean'];
        }
        $command = AttemptCommand::fromArray($operation, $request->validate($rules));
        [$status, $body] = $this->previews->command($profile, $id, $command);

        return response()->json($body, $status);
    }
}
