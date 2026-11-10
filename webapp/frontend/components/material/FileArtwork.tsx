import { FileText, FolderSync } from "lucide-react";
import styles from "./MaterialWorkspace.module.css";

/** Folder layers are illustrative; a PDF image is shown only after that file is opened. */
export function FileArtwork({ folder, shared, cover }: { folder: boolean; shared?: boolean; cover?: string | null }) {
  return <div data-material-artwork={folder ? "folder" : "file"} className={styles.materialArtwork} aria-hidden="true">
    {folder ? <>
      <div className={styles.materialFolderBack} />
      <div className={styles.materialFolderPaper} /><div className={styles.materialFolderPaper} />
      <div data-material-folder-face className={styles.materialFolderFront}>{shared && <FolderSync size={16} />}</div>
    </> : <div className={styles.materialFilePaper}>
      {/* The existing selected blob supplies this preview, without opening other files. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {cover ? <img src={cover} alt="" /> : <FileText size={28} strokeWidth={1.25} />}
    </div>}
  </div>;
}
