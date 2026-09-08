import { readFile, rm, writeFile } from "node:fs/promises";
import { STATE_PATH } from "./config.js";

export type DemoState = {
  sandboxId: string;
  boxFolderId: string;
  mountPath: string;
  outputPath: string;
  createdAt: string;
  expiresAt: string;
};

export async function readState(): Promise<DemoState | null> {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    return JSON.parse(raw) as DemoState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeState(state: DemoState): Promise<void> {
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
}

export async function removeState(): Promise<void> {
  await rm(STATE_PATH, { force: true });
}
