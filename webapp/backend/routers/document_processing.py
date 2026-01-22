"""
Document processing endpoints.
Provides handwriting removal and document cleaning functionality.
"""
import io
import logging
import base64
import numpy as np
from enum import Enum
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

router = APIRouter()
logger = logging.getLogger(__name__)

# Try to import optional dependencies
try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    logger.warning("opencv-python not installed. Handwriting removal will be unavailable.")

try:
    import fitz  # PyMuPDF
    FITZ_AVAILABLE = True
except ImportError:
    FITZ_AVAILABLE = False
    logger.warning("PyMuPDF not installed. PDF processing will be unavailable.")


class ProcessingMode(str, Enum):
    """Processing mode for black ink removal aggressiveness"""
    CONSERVATIVE = "conservative"  # Minimal removal, preserve text
    BALANCED = "balanced"          # Default mode
    AGGRESSIVE = "aggressive"      # Maximum removal, may affect thin text


class HandwritingRemovalRequest(BaseModel):
    """Request model for handwriting removal with base64 PDF"""
    pdf_base64: str
    remove_blue: bool = True
    remove_red: bool = True
    remove_green: bool = True
    remove_pencil: bool = True
    pencil_threshold: int = 200  # Grayscale threshold for pencil (0-255)
    # Black ink removal parameters
    remove_black_ink: bool = False
    black_ink_mode: ProcessingMode = ProcessingMode.BALANCED
    # Manual threshold override (0 = use preset, 1-20 = manual stroke width threshold)
    black_ink_stroke_threshold: int = 0


class HandwritingRemovalResponse(BaseModel):
    """Response model with cleaned PDF"""
    pdf_base64: str
    pages_processed: int
    success: bool
    message: str


def remove_colored_ink(image: np.ndarray,
                       remove_blue: bool = True,
                       remove_red: bool = True,
                       remove_green: bool = True) -> np.ndarray:
    """
    Remove colored ink (blue, red, green) from an image.
    Works by detecting pixels in specific HSV color ranges and replacing with white.
    """
    if not CV2_AVAILABLE:
        raise RuntimeError("OpenCV not available for color ink removal")
    # Convert to HSV for better color detection
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    # Create a mask for colors to remove
    mask = np.zeros(image.shape[:2], dtype=np.uint8)

    if remove_blue:
        # Blue ink range (covers light blue to dark blue)
        lower_blue = np.array([90, 30, 30])
        upper_blue = np.array([130, 255, 255])
        blue_mask = cv2.inRange(hsv, lower_blue, upper_blue)
        mask = cv2.bitwise_or(mask, blue_mask)

    if remove_red:
        # Red ink range (red wraps around in HSV, need two ranges)
        lower_red1 = np.array([0, 30, 30])
        upper_red1 = np.array([10, 255, 255])
        lower_red2 = np.array([160, 30, 30])
        upper_red2 = np.array([180, 255, 255])
        red_mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
        red_mask2 = cv2.inRange(hsv, lower_red2, upper_red2)
        mask = cv2.bitwise_or(mask, red_mask1)
        mask = cv2.bitwise_or(mask, red_mask2)

    if remove_green:
        # Green ink range
        lower_green = np.array([35, 30, 30])
        upper_green = np.array([85, 255, 255])
        green_mask = cv2.inRange(hsv, lower_green, upper_green)
        mask = cv2.bitwise_or(mask, green_mask)

    # Dilate mask slightly to catch edges of handwriting
    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.dilate(mask, kernel, iterations=1)

    # Replace masked areas with white
    result = image.copy()
    result[mask > 0] = [255, 255, 255]

    return result


def remove_pencil_marks(image: np.ndarray, threshold: int = 200) -> np.ndarray:
    """
    Remove light pencil marks by thresholding grayscale intensity.
    Only removes light gray marks, preserving darker printed text.
    """
    if not CV2_AVAILABLE:
        raise RuntimeError("OpenCV not available for pencil mark removal")
    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Create mask for light gray pixels (pencil marks)
    # These are pixels that are lighter than typical printed text but not pure white
    # Pencil marks are usually in range 180-230, while printed text is < 150
    pencil_mask = (gray > threshold) & (gray < 250)

    # Replace pencil marks with white
    result = image.copy()
    result[pencil_mask] = [255, 255, 255]

    return result


def get_mode_thresholds(mode: ProcessingMode) -> dict:
    """
    Return threshold values based on processing mode.

    These thresholds control how aggressively we identify handwriting:
    - removal_threshold: Score needed to classify as handwriting (lower = more removal)
    - max_stroke_width: Maximum stroke width to consider as handwriting (pixels at full scale)
    - min_stroke_width: Minimum stroke width (below this is noise)
    - intensity_range: Grayscale range for handwriting (0=black, 255=white)
    """
    if mode == ProcessingMode.CONSERVATIVE:
        return {
            'removal_threshold': 0.7,  # High = less removal
            'max_stroke_width': 6,     # Pixels at 300 DPI
            'min_stroke_width': 1,
            'intensity_range': (20, 80),  # Only lighter marks
        }
    elif mode == ProcessingMode.AGGRESSIVE:
        return {
            'removal_threshold': 0.2,  # Very low = more removal
            'max_stroke_width': 12,    # Include thicker strokes
            'min_stroke_width': 0.5,
            'intensity_range': (0, 150),  # Include darker marks too
        }
    else:  # BALANCED
        return {
            'removal_threshold': 0.4,
            'max_stroke_width': 8,
            'min_stroke_width': 1,
            'intensity_range': (10, 100),
        }


def remove_black_handwriting(image: np.ndarray, mode: ProcessingMode, manual_stroke_threshold: int = 0) -> np.ndarray:
    """
    Remove black handwriting while preserving printed text.

    Strategy: Remove thin, dark strokes that are likely handwriting.
    Printed text at 300 DPI typically has thicker, more consistent strokes.

    Args:
        image: BGR image array
        mode: Processing aggressiveness level

    Returns:
        Processed image with black handwriting removed
    """
    if not CV2_AVAILABLE:
        raise RuntimeError("OpenCV not available for black handwriting removal")
    try:
        original_height, original_width = image.shape[:2]
        thresholds = get_mode_thresholds(mode)

        # Work on a downscaled version for performance
        scale_factor = 0.33 if max(original_height, original_width) > 2500 else (
            0.5 if max(original_height, original_width) > 1500 else 1.0
        )

        if scale_factor < 1.0:
            analysis_image = cv2.resize(image, None, fx=scale_factor, fy=scale_factor,
                                         interpolation=cv2.INTER_AREA)
        else:
            analysis_image = image

        gray = cv2.cvtColor(analysis_image, cv2.COLOR_BGR2GRAY)
        logger.info(f"Black ink removal [{mode.value}]: image {analysis_image.shape}, scale {scale_factor:.2f}")

        # Get dark pixels using Otsu's threshold (better for scanned docs)
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Find connected components
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(binary)
        logger.info(f"Found {num_labels - 1} dark components")

        # Distance transform gives distance to nearest background pixel
        # For a stroke, the max distance at centerline ≈ half the stroke width
        dist_transform = cv2.distanceTransform(binary, cv2.DIST_L2, 5)

        # Create removal mask
        removal_mask = np.zeros(gray.shape, dtype=np.uint8)

        # Scale thresholds - use manual override if provided
        if manual_stroke_threshold > 0:
            scaled_max_stroke = manual_stroke_threshold * scale_factor
            scaled_min_stroke = 0.5 * scale_factor
            logger.info(f"Using manual stroke threshold: {manual_stroke_threshold}")
        else:
            scaled_max_stroke = thresholds['max_stroke_width'] * scale_factor
            scaled_min_stroke = thresholds['min_stroke_width'] * scale_factor
        min_area = max(3, int(5 * scale_factor * scale_factor))
        max_area = int(50000 * scale_factor * scale_factor)

        # Track stats for debugging
        removed_count = 0
        checked_count = 0

        for label_id in range(1, min(num_labels, 3000)):  # Skip background, limit iterations
            area = stats[label_id, cv2.CC_STAT_AREA]

            # Skip by area
            if area < min_area or area > max_area:
                continue

            checked_count += 1
            component_mask = labels == label_id

            # Get stroke width from distance transform
            # Max distance in component ≈ half of max stroke width
            distances = dist_transform[component_mask]
            if len(distances) < 2:
                continue

            max_half_width = float(np.max(distances))
            mean_half_width = float(np.mean(distances))
            stroke_width = max_half_width * 2  # Full stroke width

            # Get intensity
            intensities = gray[component_mask]
            mean_intensity = float(np.mean(intensities))

            # Decision logic - simpler and more direct
            is_handwriting = False

            # Check stroke width (primary criterion)
            if scaled_min_stroke <= stroke_width <= scaled_max_stroke:
                # Check intensity is in expected range for ink
                intensity_min, intensity_max = thresholds['intensity_range']
                if mean_intensity <= intensity_max:  # Dark enough to be ink
                    is_handwriting = True

            if is_handwriting:
                removal_mask[component_mask] = 255
                removed_count += 1

        logger.info(f"Checked {checked_count} components, marked {removed_count} for removal")

        # Upscale mask if we downscaled
        if scale_factor < 1.0:
            removal_mask = cv2.resize(removal_mask, (original_width, original_height),
                                       interpolation=cv2.INTER_NEAREST)

        # Dilate slightly to catch anti-aliased edges
        kernel = np.ones((3, 3), dtype=np.uint8)
        removal_mask = cv2.dilate(removal_mask, kernel, iterations=1)

        # Apply mask - replace with white
        result = image.copy()
        result[removal_mask > 0] = [255, 255, 255]

        logger.info(f"Black ink removal completed, removed {removed_count} components")
        return result

    except Exception as e:
        logger.error(f"Error in black ink removal: {e}", exc_info=True)
        return image


def apply_morphological_cleanup(image: np.ndarray) -> np.ndarray:
    """
    Apply morphological operations to clean up small artifacts.
    """
    if not CV2_AVAILABLE:
        raise RuntimeError("OpenCV not available for morphological cleanup")
    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Apply slight Gaussian blur to smooth out noise
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)

    # Threshold to binary
    _, binary = cv2.threshold(blurred, 240, 255, cv2.THRESH_BINARY)

    # Small opening to remove tiny specks
    kernel = np.ones((2, 2), np.uint8)
    cleaned = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)

    # Convert back to BGR
    result = cv2.cvtColor(cleaned, cv2.COLOR_GRAY2BGR)

    # Blend with original to preserve some texture
    # This prevents the image from looking too processed
    alpha = 0.7
    result = cv2.addWeighted(image, 1 - alpha, result, alpha, 0)

    return result


def process_pdf_page(page_pixmap,
                     remove_blue: bool,
                     remove_red: bool,
                     remove_green: bool,
                     remove_pencil: bool,
                     pencil_threshold: int,
                     remove_black_ink: bool = False,
                     black_ink_mode: ProcessingMode = ProcessingMode.BALANCED,
                     black_ink_stroke_threshold: int = 0) -> bytes:
    """
    Process a single PDF page to remove handwriting.
    Returns PNG bytes of the cleaned page.
    """
    # Convert PyMuPDF pixmap to numpy array
    img_data = page_pixmap.samples
    img = np.frombuffer(img_data, dtype=np.uint8)

    # Reshape based on pixmap dimensions
    if page_pixmap.n == 4:  # RGBA
        img = img.reshape(page_pixmap.height, page_pixmap.width, 4)
        img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
    else:  # RGB
        img = img.reshape(page_pixmap.height, page_pixmap.width, 3)
        img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

    # Apply handwriting removal
    result = img.copy()

    # Remove colored ink
    if remove_blue or remove_red or remove_green:
        result = remove_colored_ink(result, remove_blue, remove_red, remove_green)

    # Remove pencil marks
    if remove_pencil:
        result = remove_pencil_marks(result, pencil_threshold)

    # Remove black handwriting using stroke analysis
    if remove_black_ink:
        result = remove_black_handwriting(result, black_ink_mode, black_ink_stroke_threshold)

    # Apply cleanup (optional - can be aggressive)
    # result = apply_morphological_cleanup(result)

    # Encode as PNG
    _, png_data = cv2.imencode('.png', result)
    return png_data.tobytes()


@router.post("/document-processing/remove-handwriting", response_model=HandwritingRemovalResponse)
async def remove_handwriting(request: HandwritingRemovalRequest):
    """
    Remove handwriting from a PDF document.

    Processes each page to remove:
    - Blue ink (enabled by default)
    - Red ink (enabled by default)
    - Green ink (enabled by default)
    - Pencil marks (enabled by default)
    - Black/dark ink (disabled by default, uses stroke analysis)

    The black ink removal uses stroke-based detection to distinguish
    handwriting from printed text based on:
    - Stroke thickness (handwriting is often thinner)
    - Stroke variance (handwriting has variable width)
    - Intensity (ballpoint pen is often lighter than laser toner)

    Processing modes for black ink:
    - conservative: Minimal removal, preserves printed text
    - balanced: Default settings
    - aggressive: Maximum removal, may affect thin printed text

    Returns a cleaned PDF as base64.
    """
    if not CV2_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="OpenCV not installed. Please install opencv-python."
        )

    if not FITZ_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="PyMuPDF not installed. Please install PyMuPDF."
        )

    try:
        # Decode input PDF
        pdf_bytes = base64.b64decode(request.pdf_base64)

        # Open PDF with PyMuPDF
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        # Create new PDF for output
        output_doc = fitz.open()

        pages_processed = 0

        for page_num in range(len(doc)):
            page = doc[page_num]

            # Render page to high-resolution image (300 DPI)
            mat = fitz.Matrix(300 / 72, 300 / 72)  # 300 DPI
            pix = page.get_pixmap(matrix=mat)

            # Process the page
            cleaned_png = process_pdf_page(
                pix,
                request.remove_blue,
                request.remove_red,
                request.remove_green,
                request.remove_pencil,
                request.pencil_threshold,
                request.remove_black_ink,
                request.black_ink_mode,
                request.black_ink_stroke_threshold
            )

            # Create new page from cleaned image
            img = fitz.open(stream=cleaned_png, filetype="png")

            # Get original page dimensions
            rect = page.rect

            # Create new page with same dimensions
            new_page = output_doc.new_page(width=rect.width, height=rect.height)

            # Insert cleaned image
            new_page.insert_image(rect, stream=cleaned_png)

            pages_processed += 1

        # Save to bytes
        output_bytes = output_doc.write()
        output_base64 = base64.b64encode(output_bytes).decode('utf-8')

        # Cleanup
        doc.close()
        output_doc.close()

        return HandwritingRemovalResponse(
            pdf_base64=output_base64,
            pages_processed=pages_processed,
            success=True,
            message=f"Successfully processed {pages_processed} pages"
        )

    except Exception as e:
        logger.error(f"Error processing PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process PDF: {str(e)}"
        )


@router.post("/document-processing/remove-handwriting-file")
async def remove_handwriting_file(
    file: UploadFile = File(...),
    remove_blue: bool = Query(True, description="Remove blue ink"),
    remove_red: bool = Query(True, description="Remove red ink"),
    remove_green: bool = Query(True, description="Remove green ink"),
    remove_pencil: bool = Query(True, description="Remove pencil marks"),
    pencil_threshold: int = Query(200, ge=150, le=240, description="Pencil detection threshold"),
    remove_black_ink: bool = Query(False, description="Remove black/dark ink using stroke analysis"),
    black_ink_mode: ProcessingMode = Query(ProcessingMode.BALANCED, description="Black ink removal aggressiveness")
):
    """
    Remove handwriting from an uploaded PDF file.
    Returns the cleaned PDF as a file download.
    """
    if not CV2_AVAILABLE or not FITZ_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Required libraries not installed (opencv-python, PyMuPDF)"
        )

    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported"
        )

    try:
        # Read uploaded file
        pdf_bytes = await file.read()

        # Create request and process
        request = HandwritingRemovalRequest(
            pdf_base64=base64.b64encode(pdf_bytes).decode('utf-8'),
            remove_blue=remove_blue,
            remove_red=remove_red,
            remove_green=remove_green,
            remove_pencil=remove_pencil,
            pencil_threshold=pencil_threshold,
            remove_black_ink=remove_black_ink,
            black_ink_mode=black_ink_mode
        )

        result = await remove_handwriting(request)

        # Decode result and return as file
        output_bytes = base64.b64decode(result.pdf_base64)

        # Generate output filename
        original_name = file.filename.rsplit('.', 1)[0]
        output_filename = f"{original_name}_cleaned.pdf"

        return Response(
            content=output_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{output_filename}"'
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing uploaded PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process PDF: {str(e)}"
        )


@router.get("/document-processing/status")
async def get_status():
    """
    Check if document processing is available.
    Returns status of required dependencies.
    """
    return {
        "available": CV2_AVAILABLE and FITZ_AVAILABLE,
        "opencv": CV2_AVAILABLE,
        "pymupdf": FITZ_AVAILABLE,
        "features": {
            "remove_colored_ink": CV2_AVAILABLE,
            "remove_pencil": CV2_AVAILABLE,
            "remove_black_ink": CV2_AVAILABLE,
            "pdf_processing": FITZ_AVAILABLE
        }
    }
