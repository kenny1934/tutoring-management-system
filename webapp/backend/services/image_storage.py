"""
Image storage service for uploading images to Google Cloud Storage.
Used for inbox message attachments.
"""

import io
import uuid
from typing import Optional

from google.cloud import storage
from PIL import Image

# Configuration
BUCKET_NAME = "csm-inbox-images"
MAX_SIZE = 1920  # Max dimension (width or height)
QUALITY = 80  # JPEG compression quality (0-100)
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def resize_and_compress_image(file_bytes: bytes) -> bytes:
    """
    Resize image if larger than MAX_SIZE and compress to JPEG.
    Returns compressed image bytes.
    """
    img = Image.open(io.BytesIO(file_bytes))

    # Convert RGBA to RGB (JPEG doesn't support alpha)
    if img.mode in ('RGBA', 'LA', 'P'):
        # Create white background
        background = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')

    # Resize if needed (maintain aspect ratio)
    if max(img.size) > MAX_SIZE:
        img.thumbnail((MAX_SIZE, MAX_SIZE), Image.LANCZOS)

    # Compress to JPEG
    buffer = io.BytesIO()
    img.save(buffer, 'JPEG', quality=QUALITY, optimize=True)
    buffer.seek(0)

    return buffer.getvalue()


def upload_image(file_bytes: bytes, original_filename: Optional[str] = None, prefix: str = "inbox") -> str:
    """
    Process and upload an image to Google Cloud Storage.

    Args:
        file_bytes: Raw image file bytes
        original_filename: Original filename (optional, for logging)

    Returns:
        Public URL of the uploaded image

    Raises:
        ValueError: If file is too large or not a valid image
    """
    # Check file size
    if len(file_bytes) > MAX_FILE_SIZE:
        raise ValueError(f"Image too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")

    # Process image (resize + compress)
    try:
        processed_bytes = resize_and_compress_image(file_bytes)
    except Exception as e:
        raise ValueError(f"Invalid image file: {str(e)}")

    # Generate unique filename
    blob_name = f"{prefix}/{uuid.uuid4()}.jpg"

    # Upload to GCS
    client = storage.Client()
    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(blob_name)
    blob.upload_from_string(processed_bytes, content_type='image/jpeg')

    # Return public URL
    return f"https://storage.googleapis.com/{BUCKET_NAME}/{blob_name}"


MAX_DOC_SIZE = 25 * 1024 * 1024  # 25MB for documents

ALLOWED_DOC_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "image/gif",
    "video/mp4",
    "video/webm",
    "video/quicktime",
}


def upload_document(file_bytes: bytes, original_filename: str, content_type: str) -> str:
    """
    Upload a document (PDF, Word, etc.) to Google Cloud Storage without processing.

    Args:
        file_bytes: Raw file bytes
        original_filename: Original filename (preserved in storage path)
        content_type: MIME type of the file

    Returns:
        Public URL of the uploaded document

    Raises:
        ValueError: If file is too large or content type not allowed
    """
    if len(file_bytes) > MAX_DOC_SIZE:
        raise ValueError(f"File too large. Maximum size is {MAX_DOC_SIZE // (1024*1024)}MB")

    # Strip codec parameters (e.g. "audio/webm;codecs=opus" → "audio/webm")
    base_type = content_type.split(";")[0].strip()
    if base_type not in ALLOWED_DOC_TYPES:
        raise ValueError(f"File type not allowed: {content_type}")

    # Sanitize filename: keep alphanumeric, dots, hyphens, underscores
    import re
    safe_name = re.sub(r'[^\w.\-]', '_', original_filename)
    blob_name = f"inbox/docs/{uuid.uuid4()}_{safe_name}"

    client = storage.Client()
    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(blob_name)
    blob.upload_from_string(file_bytes, content_type=content_type)

    return f"https://storage.googleapis.com/{BUCKET_NAME}/{blob_name}"


def delete_image(url: str) -> bool:
    """
    Delete an image from Google Cloud Storage.

    Args:
        url: Full public URL of the image

    Returns:
        True if deleted successfully, False otherwise
    """
    try:
        # Extract blob name from URL
        prefix = f"https://storage.googleapis.com/{BUCKET_NAME}/"
        if not url.startswith(prefix):
            return False

        blob_name = url[len(prefix):]

        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(blob_name)
        blob.delete()

        return True
    except Exception:
        return False
