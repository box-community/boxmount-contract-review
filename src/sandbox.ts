import { readFile } from "node:fs/promises";
import { relative, sep } from "node:path";
import { Sandbox } from "e2b";
import type { DemoConfig } from "./config.js";

export const SANDBOX_TIMEOUT_MS = 60 * 60 * 1000;
export const REMOTE_BIN_DIR = "/home/user/bin";
export const REMOTE_BINARY = `${REMOTE_BIN_DIR}/box-mount`;
export const REMOTE_DATA_PATH = "/home/user/.box-mount";
export const REMOTE_MOUNT_PATH = "/home/user/box-demo";

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export async function createDemoSandbox(
  config: DemoConfig,
  timeoutMs = SANDBOX_TIMEOUT_MS,
): Promise<Sandbox> {
  const envs: Record<string, string> = {
    BOX_ACCESS_TOKEN: config.boxAccessToken,
  };
  if (config.openaiApiKey) {
    envs.OPENAI_API_KEY = config.openaiApiKey;
    envs.OPENAI_MODEL = config.openaiModel;
  }

  return Sandbox.create({
    apiKey: config.e2bApiKey,
    timeoutMs,
    envs,
    metadata: {
      name: "box-mount-contract-review",
      box_folder_id: config.boxFolderId,
      reviewer: config.openaiApiKey ? "openai" : "box-ai",
    },
  });
}

export async function connectSandbox(
  sandboxId: string,
  apiKey: string,
): Promise<Sandbox> {
  return Sandbox.connect(sandboxId, {
    apiKey,
    timeoutMs: 5 * 60 * 1000,
  });
}

export async function installBoxMount(
  sandbox: Sandbox,
  archivePath: string,
): Promise<string> {
  const archive = await readFile(archivePath);
  const archiveData = archive.buffer.slice(
    archive.byteOffset,
    archive.byteOffset + archive.byteLength,
  ) as ArrayBuffer;

  await sandbox.files.write("/tmp/box-mount.tar.gz", archiveData, {
    requestTimeoutMs: 180_000,
  });

  await sandbox.files.write(
    "/tmp/install-box-mount.py",
    [
      "import os",
      "import shutil",
      "import tarfile",
      "from pathlib import Path",
      "",
      "archive = Path('/tmp/box-mount.tar.gz')",
      "root = Path('/tmp/box-mount-extracted')",
      "target = Path('/home/user/bin/box-mount')",
      "shutil.rmtree(root, ignore_errors=True)",
      "root.mkdir(parents=True)",
      "",
      "with tarfile.open(archive, 'r:gz') as bundle:",
      "    root_resolved = root.resolve()",
      "    for member in bundle.getmembers():",
      "        destination = (root / member.name).resolve()",
      "        if not destination.is_relative_to(root_resolved):",
      "            raise RuntimeError('Archive contains an unsafe path')",
      "    bundle.extractall(root)",
      "",
      "files = [path for path in root.rglob('*') if path.is_file()]",
      "executables = [path for path in files if os.access(path, os.X_OK)]",
      "named = [path for path in files if 'box-mount' in path.name.lower()]",
      "",
      "if len(executables) == 1:",
      "    source = executables[0]",
      "elif len(named) == 1:",
      "    source = named[0]",
      "elif len(files) == 1:",
      "    source = files[0]",
      "else:",
      "    raise RuntimeError(",
      "        f'Expected one Box Mount executable; found {len(files)} files'",
      "    )",
      "",
      "target.parent.mkdir(parents=True, exist_ok=True)",
      "shutil.copy2(source, target)",
      "target.chmod(0o755)",
    ].join("\n"),
  );

  const result = await sandbox.commands.run(
    [
      "python3 /tmp/install-box-mount.py",
      `${shellQuote(REMOTE_BINARY)} --version`,
    ].join(" && "),
    { timeoutMs: 120_000 },
  );

  const version = result.stdout.match(/\d+\.\d+\.\d+/)?.[0];
  return version ? `Box Mount ${version}` : "Box Mount binary verified";
}

export async function mountBox(
  sandbox: Sandbox,
  boxFolderId: string,
): Promise<void> {
  await sandbox.commands.run(
    [
      `mkdir -p ${shellQuote(REMOTE_MOUNT_PATH)} &&`,
      shellQuote(REMOTE_BINARY),
      `--data-path ${shellQuote(REMOTE_DATA_PATH)}`,
      `mount ${shellQuote(REMOTE_MOUNT_PATH)} ${shellQuote(boxFolderId)}`,
    ].join(" "),
    { timeoutMs: 300_000 },
  );
}

export async function unmountBox(sandbox: Sandbox): Promise<void> {
  await sandbox.commands.run(
    [
      shellQuote(REMOTE_BINARY),
      `--data-path ${shellQuote(REMOTE_DATA_PATH)}`,
      `unmount ${shellQuote(REMOTE_MOUNT_PATH)}`,
    ].join(" "),
    { timeoutMs: 300_000 },
  );
}

export async function boxMountStatus(sandbox: Sandbox): Promise<string> {
  const result = await sandbox.commands.run(
    [
      shellQuote(REMOTE_BINARY),
      `--data-path ${shellQuote(REMOTE_DATA_PATH)}`,
      "status",
    ].join(" "),
    { timeoutMs: 30_000 },
  );
  return result.stdout.trim();
}

export function remoteFixturePath(
  fixtureRoot: string,
  localPath: string,
): string {
  const path = relative(fixtureRoot, localPath).split(sep).join("/");
  return `${REMOTE_MOUNT_PATH}/${path}`;
}
