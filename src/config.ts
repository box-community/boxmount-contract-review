import {
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

export const PROJECT_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

loadDotenv({
  path: resolve(PROJECT_ROOT, ".env"),
  quiet: true,
  override: true,
});

export const STATE_PATH = resolve(PROJECT_ROOT, ".demo-state.json");
export const FIXTURES_PATH = resolve(
  PROJECT_ROOT,
  "fixtures",
  "box-workspace",
);
const PRIVATE_PATH = resolve(PROJECT_ROOT, "private");
const ARCHIVE_EXTENSIONS = [".tar.gz", ".tgz"];

export type DemoConfig = {
  e2bApiKey: string;
  boxAccessToken: string;
  boxFolderId: string;
  boxReviewerUserId: string;
  openaiApiKey: string;
  openaiModel: string;
  boxMountArchive: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and provide a value.`,
    );
  }
  return value;
}

export function requireE2bApiKey(): string {
  return required("E2B_API_KEY");
}

function resolveBoxMountArchive(): string {
  const configuredArchive = process.env.BOX_MOUNT_ARCHIVE?.trim();
  if (configuredArchive) {
    const path = isAbsolute(configuredArchive)
      ? configuredArchive
      : resolve(PROJECT_ROOT, configuredArchive);
    if (!existsSync(path)) {
      throw new Error(`BOX_MOUNT_ARCHIVE does not exist: ${path}`);
    }
    if (!ARCHIVE_EXTENSIONS.some((extension) => path.endsWith(extension))) {
      throw new Error(
        "BOX_MOUNT_ARCHIVE must be a .tar.gz or .tgz archive.",
      );
    }
    return path;
  }

  const archives = readdirSync(PRIVATE_PATH)
    .map((name) => resolve(PRIVATE_PATH, name))
    .filter(
      (path) =>
        statSync(path).isFile() &&
        ARCHIVE_EXTENSIONS.some((extension) => path.endsWith(extension)),
    );

  if (archives.length === 1) {
    return archives[0]!;
  }
  if (archives.length > 1) {
    throw new Error(
      [
        "Multiple Box Mount archives were found in private/.",
        "Keep only one .tar.gz/.tgz file, or set BOX_MOUNT_ARCHIVE",
        "to the archive you want to use.",
      ].join("\n"),
    );
  }

  throw new Error(
    [
      "Box Mount was not found.",
      "",
      "Place the supplied .tar.gz or .tgz Linux x86_64 archive in",
      "private/. The filename does not matter.",
    ].join("\n"),
  );
}

export function getDemoConfig(): DemoConfig {
  return {
    e2bApiKey: required("E2B_API_KEY"),
    boxAccessToken: required("BOX_ACCESS_TOKEN"),
    boxFolderId: required("BOX_FOLDER_ID"),
    boxReviewerUserId:
      process.env.BOX_REVIEWER_USER_ID?.trim() || "",
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() || "",
    openaiModel: process.env.OPENAI_MODEL?.trim() || "gpt-5.5",
    boxMountArchive: resolveBoxMountArchive(),
  };
}
