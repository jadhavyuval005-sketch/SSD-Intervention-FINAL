"""Where recordings are kept: a local folder (default) or Amazon S3."""
import uuid

from flask import Response, current_app, send_file

# What we accept, identified from the file's first bytes (not from what the browser claims).
def sniff_audio(head: bytes):
    """Return (mime, extension) for a supported recording, else None."""
    if head[:4] == b"\x1a\x45\xdf\xa3":
        return "audio/webm", "webm"       # Chrome / Edge / Firefox (WebM)
    if head[:4] == b"OggS":
        return "audio/ogg", "ogg"         # Firefox (Ogg)
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "audio/wav", "wav"
    if head[4:8] == b"ftyp":
        return "audio/mp4", "m4a"         # Safari / iOS
    if head[:3] == b"ID3" or (len(head) > 1 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0):
        return "audio/mpeg", "mp3"
    return None


class LocalStorage:
    def __init__(self, root):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key):
        path = (self.root / key).resolve()
        if self.root not in path.parents:          # never leave the upload folder
            raise ValueError("Invalid storage key")
        return path

    def save(self, file_storage, user_id, ext):
        key = f"audio/{user_id}/{uuid.uuid4().hex}.{ext}"
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        file_storage.save(path)
        return key

    def response(self, key, mime):
        return send_file(self._path(key), mimetype=mime, conditional=True)

    def delete(self, key):
        try:
            self._path(key).unlink(missing_ok=True)
        except (OSError, ValueError):
            current_app.logger.warning("Could not delete recording %s", key)


class S3Storage:
    def __init__(self, bucket, region):
        try:
            import boto3
        except ImportError as exc:
            raise RuntimeError("STORAGE_BACKEND=s3 needs boto3: pip install boto3") from exc
        if not bucket:
            raise RuntimeError("Set S3_BUCKET when STORAGE_BACKEND=s3.")
        self.bucket = bucket
        self.client = boto3.client("s3", region_name=region or None)

    def save(self, file_storage, user_id, ext):
        key = f"audio/{user_id}/{uuid.uuid4().hex}.{ext}"
        self.client.upload_fileobj(
            file_storage.stream, self.bucket, key, ExtraArgs={"ServerSideEncryption": "AES256"}
        )
        return key

    def response(self, key, mime):
        obj = self.client.get_object(Bucket=self.bucket, Key=key)
        return Response(obj["Body"].iter_chunks(64 * 1024), mimetype=mime)

    def delete(self, key):
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except Exception:  # noqa: BLE001 - deleting is best effort
            current_app.logger.warning("Could not delete recording %s", key)


def get_storage():
    app = current_app
    store = app.extensions.get("vaaniai_storage")
    if store is None:
        if app.config["STORAGE_BACKEND"] == "s3":
            store = S3Storage(app.config["S3_BUCKET"], app.config["AWS_REGION"])
        else:
            store = LocalStorage(app.config["UPLOAD_DIR"])
        app.extensions["vaaniai_storage"] = store
    return store
