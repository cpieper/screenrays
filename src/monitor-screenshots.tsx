import { Cache, Clipboard, environment, getPreferenceValues, MenuBarExtra, open, showHUD } from "@raycast/api";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { useEffect, useState } from "react";

interface Preferences {
  screenshotsDirectory: string;
  enableLogging: boolean;
}

interface ScreenshotFile {
  name: string;
  path: string;
  createdAt: Date;
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".tiff", ".bmp", ".heic"]);
const cache = new Cache();
const CACHE_KEY = "lastProcessedTimestamp";

function resolveDirectory(dir: string): string {
  if (dir.startsWith("~")) {
    return join(homedir(), dir.slice(1));
  }
  return dir;
}

function getScreenshots(directory: string): ScreenshotFile[] {
  try {
    const entries = readdirSync(directory);
    const screenshots: ScreenshotFile[] = [];

    for (const entry of entries) {
      const ext = entry.substring(entry.lastIndexOf(".")).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;

      const fullPath = join(directory, entry);
      const stat = statSync(fullPath);
      screenshots.push({
        name: entry,
        path: fullPath,
        createdAt: stat.birthtime,
      });
    }

    screenshots.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return screenshots;
  } catch {
    return [];
  }
}

function getLastProcessedTimestamp(): number | null {
  const value = cache.get(CACHE_KEY);
  if (value) {
    const parsed = Number(value);
    if (!isNaN(parsed)) return parsed;
  }
  return null;
}

function setLastProcessedTimestamp(ts: number) {
  cache.set(CACHE_KEY, String(ts));
}

export default function Command() {
  const { screenshotsDirectory, enableLogging } = getPreferenceValues<Preferences>();
  const log = enableLogging ? console.log : () => {};
  const directory = resolveDirectory(screenshotsDirectory);
  const [screenshots, setScreenshots] = useState<ScreenshotFile[]>([]);

  useEffect(() => {
    const allScreenshots = getScreenshots(directory);
    setScreenshots(allScreenshots);

    const lastProcessed = getLastProcessedTimestamp();

    // On first launch, just record the current state — don't copy everything
    if (lastProcessed === null) {
      if (allScreenshots.length > 0) {
        setLastProcessedTimestamp(allScreenshots[0].createdAt.getTime());
      } else {
        setLastProcessedTimestamp(Date.now());
      }
      log("ScreenRays: first launch, recorded current state");
      return;
    }

    // Find new files since last check
    const newFiles = allScreenshots.filter((s) => s.createdAt.getTime() > lastProcessed);
    log(
      `ScreenRays: found ${allScreenshots.length} total, ${newFiles.length} new since ${new Date(lastProcessed).toISOString()}`,
    );

    if (newFiles.length > 0) {
      // Update the marker to the newest file
      setLastProcessedTimestamp(newFiles[0].createdAt.getTime());

      // Copy each new file to clipboard (newest last, so it ends up as the active clipboard item)
      const copyAll = async () => {
        for (const file of [...newFiles].reverse()) {
          try {
            await Clipboard.copy({ file: file.path });
            log(`ScreenRays: copied ${file.name}`);
          } catch (e) {
            console.error(`ScreenRays: failed to copy ${file.name}:`, e);
          }
        }
        if (environment.launchType !== "background") {
          await showHUD(`Copied ${newFiles.length} new screenshot${newFiles.length > 1 ? "s" : ""}`);
        }
      };
      copyAll();
    }
  }, [directory]);

  const recentScreenshots = screenshots.slice(0, 10);

  return (
    <MenuBarExtra icon="screenrays-icon.png" tooltip="ScreenRays">
      {screenshots.length === 0 ? (
        <MenuBarExtra.Item title="No screenshots found" />
      ) : (
        <MenuBarExtra.Section title="Recent Screenshots">
          {recentScreenshots.map((screenshot) => (
            <MenuBarExtra.Item
              key={screenshot.path}
              title={screenshot.name}
              subtitle={formatRelativeTime(screenshot.createdAt)}
              onAction={async () => {
                await Clipboard.copy({ file: screenshot.path });
                await showHUD(`Copied ${screenshot.name}`);
              }}
            />
          ))}
        </MenuBarExtra.Section>
      )}
      <MenuBarExtra.Section>
        <MenuBarExtra.Item title="Open Screenshots Folder" onAction={() => open(directory)} />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}
