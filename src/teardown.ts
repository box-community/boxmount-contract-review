import { deleteDemoFolder } from "./box.js";
import {
  requireBoxAccessToken,
  requireE2bApiKey,
} from "./config.js";
import {
  connectSandbox,
  unmountBox,
} from "./sandbox.js";
import { readState, removeState } from "./state.js";

async function main(): Promise<void> {
  const state = await readState();
  if (!state) {
    console.log("No active demo is registered.");
    return;
  }

  if (state.sandboxId) {
    console.log(`Reconnecting to ${state.sandboxId}...`);
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
        console.log(
          "The sandbox no longer exists; skipping unmount.",
        );
      } else {
        throw error;
      }
    }

    if (sandbox) {
      try {
        console.log(
          "Running Box Mount's final sync and unmount...",
        );
        await unmountBox(sandbox);
      } catch (error) {
        console.warn(
          `Warning: clean unmount failed; the sandbox will still be destroyed.\n` +
            `${(error as Error).message}`,
        );
      } finally {
        console.log("Destroying E2B sandbox...");
        await sandbox.kill().catch(() => undefined);
      }
    }
  }

  if (state.boxFolderAutoCreated) {
    try {
      console.log(
        `Deleting auto-created Box folder ${state.boxFolderId}...`,
      );
      await deleteDemoFolder(
        requireBoxAccessToken(),
        state.boxFolderId,
      );
      console.log("Box folder deleted.");
    } catch (error) {
      console.warn(
        `Warning: could not delete Box folder ${state.boxFolderId}.\n` +
          `${(error as Error).message}`,
      );
    }
  }

  await removeState();
  console.log("Demo state cleared. Ready for npm run setup.");
}

main().catch((error: unknown) => {
  console.error(`\nTeardown failed:\n${(error as Error).message}`);
  process.exitCode = 1;
});
