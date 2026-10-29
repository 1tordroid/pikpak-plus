"""Media Playback Routes

Resolves a PikPak file (or a torrent's folder) into playable stream links for
the in-app player and for external players such as VLC.
"""
import logging
import os
import re
from flask import Blueprint, jsonify
from app.api.utils.async_helpers import run_async
from app.api.utils.dependencies import get_pikpak_service, get_supabase_service
from app.core.auth import require_auth, get_current_user
from app.services.user_service import UserService

logger = logging.getLogger(__name__)

# Create blueprint
bp = Blueprint('media', __name__)

FILE_ID_PATTERN = re.compile(r'^[A-Za-z0-9_-]{1,64}$')
VIDEO_EXTENSIONS = {
    '.mp4', '.m4v', '.mkv', '.webm', '.mov', '.avi', '.wmv', '.flv',
    '.ts', '.m2ts', '.mts', '.mpg', '.mpeg', '.3gp', '.ogv', '.rmvb',
}
FOLDER_KIND = 'drive#folder'
# Torrent folders are rarely deeper than this; bounds PikPak API calls
MAX_FOLDER_DEPTH = 3
MAX_VIDEOS = 200


def _is_video(item: dict) -> bool:
    if item.get('kind') == FOLDER_KIND:
        return False
    if (item.get('mime_type') or '').startswith('video/'):
        return True
    if (item.get('file_category') or '').upper() == 'VIDEO':
        return True
    ext = (item.get('file_extension') or os.path.splitext(item.get('name') or '')[1]).lower()
    return ext in VIDEO_EXTENSIONS


def _summarize(item: dict, path: str = '') -> dict:
    return {
        "id": item.get('id'),
        "name": item.get('name'),
        "path": path,
        "size": int(item.get('size') or 0),
        "mime_type": item.get('mime_type') or '',
        "thumbnail": item.get('thumbnail_link') or '',
    }


def _streams(details: dict) -> list:
    """Build stream list: PikPak transcodes first (best browser support), then the original file"""
    streams = []
    for media in details.get('medias') or []:
        url = ((media.get('link') or {}).get('url') or '').strip()
        if not url:
            continue
        video = media.get('video') or {}
        streams.append({
            "label": media.get('media_name') or 'Stream',
            "url": url,
            "width": video.get('width'),
            "height": video.get('height'),
            "codec": video.get('video_codec') or '',
            "is_origin": bool(media.get('is_origin')),
            "is_default": bool(media.get('is_default')),
        })

    original = (((details.get('links') or {}).get('application/octet-stream') or {}).get('url')
                or details.get('web_content_link') or '')
    if original and not any(s['url'] == original for s in streams):
        streams.append({
            "label": "Original file",
            "url": original,
            "width": None,
            "height": None,
            "codec": '',
            "is_origin": True,
            "is_default": False,
        })

    # Transcodes before the original, highest resolution first
    streams.sort(key=lambda s: (s['is_origin'], -(s['height'] or 0)))
    return streams


async def _collect_videos(pikpak_service, folder_id: str) -> list:
    videos = []
    queue = [(folder_id, '', 0)]
    while queue and len(videos) < MAX_VIDEOS:
        parent_id, path, depth = queue.pop(0)
        page_token = None
        while True:
            result = await pikpak_service.list_folder(parent_id, page_token)
            for item in result.get('files') or []:
                if item.get('kind') == FOLDER_KIND:
                    if depth + 1 < MAX_FOLDER_DEPTH:
                        queue.append((item.get('id'), f"{path}{item.get('name')}/", depth + 1))
                elif _is_video(item):
                    videos.append(_summarize(item, path))
            page_token = result.get('next_page_token')
            if not page_token or len(videos) >= MAX_VIDEOS:
                break
    videos.sort(key=lambda v: (v['path'], v['name'] or ''))
    return videos[:MAX_VIDEOS]


@bp.route('/media/<file_id>', methods=['GET'])
@require_auth
def get_media(file_id: str):
    """Resolve a file or folder into playable videos

    Returns either:
        {"type": "folder", "name": ..., "videos": [...]}
        {"type": "file", "is_video": bool, ..., "streams": [...]}
    """
    async def _async_get_media():
        try:
            if not FILE_ID_PATTERN.match(file_id):
                return jsonify({"error": "Invalid file id"}), 400

            user_data = get_current_user()
            user_service = UserService(get_supabase_service())
            if user_service.is_user_blocked(user_data['email']):
                return jsonify({
                    "error": "Account blocked",
                    "message": "Your account has been blocked. You cannot perform this action."
                }), 403

            pikpak_service = get_pikpak_service()
            details = await pikpak_service.get_file_details(file_id)

            if details.get('kind') == FOLDER_KIND:
                videos = await _collect_videos(pikpak_service, file_id)
                return jsonify({
                    "type": "folder",
                    "id": file_id,
                    "name": details.get('name'),
                    "videos": videos,
                })

            return jsonify({
                "type": "file",
                **_summarize(details),
                "is_video": _is_video(details),
                "streams": _streams(details),
            })
        except Exception as e:
            logger.error(f"Failed to resolve media {file_id}: {e}")
            return jsonify({"error": "Could not load this file from PikPak. It may have been deleted."}), 502

    return run_async(_async_get_media())
