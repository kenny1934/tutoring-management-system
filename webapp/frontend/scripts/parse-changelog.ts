import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

interface ChangelogItem {
  description: string;
}

interface ChangelogSection {
  title: string;
  items: ChangelogItem[];
}

interface ChangelogRelease {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const changelogPath = resolve(__dirname, "../../../CHANGELOG.md");
const outputPath = resolve(__dirname, "../lib/changelog-data.json");

function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  const lines = markdown.split("\n");

  let currentRelease: ChangelogRelease | null = null;
  let currentSection: ChangelogSection | null = null;

  for (const line of lines) {
    // Match release header: ## [version](url) (date) or ## [version] (date) or ## version (date)
    const releaseMatch = line.match(
      /^## \[?(\d+\.\d+\.\d+)\]?(?:\([^)]*\))?\s*\((\d{4}-\d{2}-\d{2})\)/
    );
    if (releaseMatch) {
      currentRelease = {
        version: releaseMatch[1],
        date: releaseMatch[2],
        sections: [],
      };
      releases.push(currentRelease);
      currentSection = null;
      continue;
    }

    // Match section header: ### Section Name
    const sectionMatch = line.match(/^### (.+)/);
    if (sectionMatch && currentRelease) {
      currentSection = {
        title: sectionMatch[1],
        items: [],
      };
      currentRelease.sections.push(currentSection);
      continue;
    }

    // Match list item: * description or - description
    const itemMatch = line.match(/^[*-]\s+(.+)/);
    if (itemMatch && currentSection) {
      currentSection.items.push({
        description: itemMatch[1],
      });
    }
  }

  return releases;
}

try {
  const markdown = readFileSync(changelogPath, "utf-8");
  const releases = parseChangelog(markdown);
  writeFileSync(outputPath, JSON.stringify(releases, null, 2));
  console.log(
    `Parsed ${releases.length} release(s) → ${outputPath}`
  );
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === "ENOENT") {
    console.warn("No CHANGELOG.md found, writing empty changelog data");
    writeFileSync(outputPath, "[]");
  } else {
    console.error("Error parsing CHANGELOG.md:", err);
    throw err;
  }
}
