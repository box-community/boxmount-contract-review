import { readFile, readdir } from "node:fs/promises";
import { join, posix } from "node:path";
import type { Sandbox } from "e2b";
import {
  REMOTE_MOUNT_PATH,
  remoteFixturePath,
  shellQuote,
} from "./sandbox.js";

const IGNORED_FIXTURE_FILES = new Set([".gitkeep", ".DS_Store"]);

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else if (
      entry.isFile() &&
      !IGNORED_FIXTURE_FILES.has(entry.name)
    ) {
      files.push(path);
    }
  }

  return files;
}

export async function uploadFixtures(
  sandbox: Sandbox,
  fixtureRoot: string,
): Promise<string[]> {
  const localFiles = await listFiles(fixtureRoot);
  const uploaded: string[] = [];

  for (const localPath of localFiles) {
    const remotePath = remoteFixturePath(fixtureRoot, localPath);
    await sandbox.commands.run(
      `mkdir -p ${shellQuote(posix.dirname(remotePath))}`,
      { timeoutMs: 30_000 },
    );

    const data = await readFile(localPath);
    const upload = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
    await sandbox.files.write(remotePath, upload, {
      requestTimeoutMs: 120_000,
    });
    uploaded.push(remotePath);
  }

  await sandbox.commands.run(
    `mkdir -p ${shellQuote(`${REMOTE_MOUNT_PATH}/Reviewed`)}`,
    { timeoutMs: 30_000 },
  );

  return uploaded;
}
