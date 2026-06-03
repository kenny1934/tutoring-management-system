// MC Drive (mcdrive.mathconcept.com) viewer-URL helper.
//
// The prototype's checktable items carry only an S3 key (`mcDriveS3Path`); the
// full PDF.js viewer URL is rebuilt here at runtime so the generated checktable
// data stays small. The S3 bucket is Referer-gated to mcdrive.mathconcept.com,
// so previews load through the MC Drive viewer page (which supplies the right
// Referer) rather than fetching the PDF bytes directly.

export const MC_DRIVE_S3_BASE =
  "https://imms-fms-sg.s3.ap-southeast-1.amazonaws.com";
export const MC_DRIVE_VIEWER_BASE =
  "https://mcdrive.mathconcept.com/viewer/pdf-js/generic/web/viewer_readonly.html";

/** rawurlencode semantics (PHP-style): like encodeURIComponent but also encodes
 *  !'()*, matching how MC Drive percent-encodes each path segment (space as
 *  %20, "(" as %28). encodeURIComponent alone leaves those un-encoded. */
function rawEnc(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

/** Build the MC Drive PDF.js viewer URL for an S3 key, e.g.
 *  "MC_Drive/Answer/01_SG_Letter Size/SG Level 1/SG101A1_..._ANS.pdf".
 *  Each path segment is raw-url-encoded, then the whole S3 URL is wrapped in a
 *  single encodeURIComponent for the `?file=` param (double-encoding, exactly
 *  as the live MC Drive site emits). */
export function mcDriveViewerUrl(s3Path: string): string {
  const s3Url = `${MC_DRIVE_S3_BASE}/${s3Path
    .split("/")
    .map(rawEnc)
    .join("/")}`;
  return `${MC_DRIVE_VIEWER_BASE}?file=${encodeURIComponent(s3Url)}`;
}
