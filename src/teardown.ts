import { resolveAuth } from "./auth.js";
import { deleteDemoFolder } from "./box.js";
import { getConfig, requireE2bApiKey } from "./config.js";
import {
  REMOTE_DATA_PATH,
  REMOTE_MOUNT_PATH,
  connectSandbox,
  unmountBox,
} from "./sandbox.js";
import { readState, removeState } from "./state.js";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

function info(text: string): void {
  console.log(`  ${DIM}→${RESET} ${text}`);
}

function cmd(text: string): void {
  console.log(`  ${DIM}$${RESET} ${YELLOW}${text}${RESET}`);
}

async function main(): Promise<void> {
  const state = await readState();
  if (!state) {
    console.log("No active demo is registered.");
    return;
  }

  if (state.sandboxId) {
    info(`Reconnecting to sandbox ${BOLD}${state.sandboxId}${RESET}...`);
    let sandbox;
    try {
      sandbox = await connectSandbox(
        state.sandboxId,
        requireE2bApiKey(),
      );
    } catch (error) {
      const message = (error as Error).message;
      if (
        message.includes("404") ||
        message.toLowerCase().includes("not found")
      ) {
        info("Sandbox no longer exists — skipping unmount.");
      } else {
        throw error;
      }
    }

    if (sandbox) {
      try {
        info("Running Box Mount's final sync and unmount...");
        cmd(
          `box-mount --data-path ${REMOTE_DATA_PATH} unmount ${REMOTE_MOUNT_PATH}`,
        );
        await unmountBox(sandbox);
        console.log(`  ${GREEN}✓${RESET} Unmounted and synced`);
      } catch (error) {
        console.warn(
          `  ${YELLOW}⚠${RESET} Clean unmount failed; the sandbox will still be destroyed.\n` +
            `    ${(error as Error).message}`,
        );
      } finally {
        info("Destroying E2B sandbox...");
        await sandbox.kill().catch(() => undefined);
        console.log(`  ${GREEN}✓${RESET} Sandbox destroyed`);
      }
    }
  }

  if (state.boxFolderAutoCreated) {
    try {
      info(
        `Deleting auto-created Box folder ${BOLD}${state.boxFolderId}${RESET}...`,
      );
      const config = await resolveAuth(getConfig());
      await deleteDemoFolder(
        config.boxAccessToken,
        state.boxFolderId,
      );
      console.log(`  ${GREEN}✓${RESET} Box folder deleted`);
    } catch (error) {
      console.warn(
        `  ${YELLOW}⚠${RESET} Could not delete Box folder ${state.boxFolderId}.\n` +
          `    ${(error as Error).message}`,
      );
    }
  }

  await removeState();
  console.log(
    `\n${GREEN}✓${RESET} Demo state cleared. Run ${BOLD}npm run demo${RESET} for a fresh demo.`,
  );
}

main().catch((error: unknown) => {
  console.error(`\nTeardown failed:\n${(error as Error).message}`);
  process.exitCode = 1;
});
