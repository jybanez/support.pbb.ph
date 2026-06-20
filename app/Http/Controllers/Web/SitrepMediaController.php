<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Support\Sitreps\CurrentSitrepMediaService;
use Illuminate\Http\Request;
use Pbb\Hotline\Media\MediaRef;
use Symfony\Component\HttpFoundation\Response;

class SitrepMediaController extends Controller
{
    public function incidentMedia(
        Request $request,
        CurrentSitrepMediaService $media,
        string $sourceHubId,
        string $incidentId,
        string $mediaType,
        string $mediaId,
    ): Response {
        return $this->serve($request, $media, implode('/', [
            'media',
            $sourceHubId,
            $incidentId,
            'incident_media',
            $mediaType,
            $mediaId,
        ]));
    }

    public function messageAttachment(
        Request $request,
        CurrentSitrepMediaService $media,
        string $sourceHubId,
        string $incidentId,
        string $messageId,
        string $attachmentId,
    ): Response {
        return $this->serve($request, $media, implode('/', [
            'media',
            $sourceHubId,
            $incidentId,
            'message_attachment',
            $messageId,
            $attachmentId,
        ]));
    }

    private function serve(Request $request, CurrentSitrepMediaService $media, string $path): Response
    {
        $current = $media->current();

        if (! $current || ! is_array($current->sitrep_payload)) {
            abort(404, 'No current SITREP media is available.');
        }

        $ref = $media->findRefByPath($current->sitrep_payload, $path);

        if ($ref === null) {
            abort(404, 'Media reference is not part of the current SITREP.');
        }

        $resolved = (new MediaRef(
            $ref,
            $media->cachePath(),
            $media->sdkConfig($current->sitrep_payload),
        ))->resolve();

        $localPath = $this->localPath($resolved['local_path'] ?? null);

        if (($resolved['status'] ?? null) === 'failed' || $localPath === null || ! is_file($localPath)) {
            return response()->json([
                'ok' => false,
                'status' => $resolved['status'] ?? 'failed',
                'error' => $resolved['error'] ?? 'media_not_available',
                'http_status' => $resolved['http_status'] ?? null,
            ], 404);
        }

        $headers = [
            'Content-Type' => $this->contentType($resolved['mime_type'] ?? null),
            'Cache-Control' => 'private, max-age=300',
            'X-Hotline-Media-Cache' => ($resolved['status'] ?? null) === 'cached' ? 'hit' : 'miss',
        ];

        return response()->file($localPath, $headers);
    }

    private function localPath(mixed $value): ?string
    {
        $path = trim((string) $value);

        return $path !== '' ? $path : null;
    }

    private function contentType(mixed $value): string
    {
        $type = trim((string) $value);

        return $type !== '' ? $type : 'application/octet-stream';
    }
}
