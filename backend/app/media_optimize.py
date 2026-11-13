"""Re-encodes uploaded videos to a smaller H.264 MP4 (max 1080p) in the background.

The browser uploads the original straight to S3. After it registers the file in the media library,
this worker downloads it, runs ffmpeg, and (if the result is clearly smaller) writes it back to the
SAME S3 key, so every URL already saved in products/homepage keeps working.
"""
import logging, os, shutil, subprocess, tempfile
from concurrent.futures import ThreadPoolExecutor
from .config import get_settings
from .db import db
from .helpers import now

log = logging.getLogger('emxin.media')
_pool = ThreadPoolExecutor(max_workers=1)  # one encode at a time so the shop stays fast


def ffmpeg_available() -> bool:
    return shutil.which('ffmpeg') is not None


def queue_video(key: str, s3_client) -> bool:
    settings = get_settings()
    if not settings.video_compression_enabled or not ffmpeg_available():
        return False
    db.media_library.update_one({'key': key}, {'$set': {'optimize_status': 'queued'}})
    _pool.submit(_optimize, key, s3_client)
    return True


def _optimize(key: str, s3) -> None:
    settings = get_settings(); bucket = settings.aws_s3_bucket
    work = tempfile.mkdtemp(prefix='emxin-vid-')
    src, out = os.path.join(work, 'in'), os.path.join(work, 'out.mp4')
    try:
        db.media_library.update_one({'key': key}, {'$set': {'optimize_status': 'processing'}})
        s3.download_file(bucket, key, src)
        before = os.path.getsize(src)
        cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', src,
               # keep aspect ratio, cap at 1920x1080, never upscale, even dimensions for H.264
               '-vf', "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
               '-c:v', 'libx264', '-preset', 'medium', '-crf', str(settings.video_crf), '-pix_fmt', 'yuv420p',
               '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-threads', '2', out]
        subprocess.run(cmd, check=True, timeout=60 * 30)
        after = os.path.getsize(out)
        if after < before * 0.9:
            s3.upload_file(out, bucket, key, ExtraArgs={'ContentType': 'video/mp4', 'CacheControl': 'public, max-age=31536000'})
            db.media_library.update_one({'key': key}, {'$set': {'optimize_status': 'done', 'size': after, 'original_size': before, 'optimized_at': now()}})
        else:
            db.media_library.update_one({'key': key}, {'$set': {'optimize_status': 'kept-original', 'original_size': before}})
    except Exception as e:  # never break uploads because of compression
        log.exception('video optimize failed for %s', key)
        db.media_library.update_one({'key': key}, {'$set': {'optimize_status': 'failed', 'optimize_error': str(e)[:300]}})
    finally:
        shutil.rmtree(work, ignore_errors=True)
