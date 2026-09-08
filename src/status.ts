import { requireE2bApiKey } from "./config.js";
import {
  REMOTE_MOUNT_PATH,
  boxMountStatus,
  connectSandbox,
  shellQuote,
} from "./sandbox.js";
import { readState } from "./state.js";

async function main(): Promise<void> {
  const state = await readState();
  if (!state) {
    throw new Error("No active demo is registered. Run npm run demo.");
  }

  console.log(`Sandbox: ${state.sandboxId}`);
  console.log(`Box folder: ${state.boxFolderId}`);
  console.log(`Expected expiry: ${new Date(state.expiresAt).toLocaleString()}`);

  try {
    const sandbox = await connectSandbox(
      state.sandboxId,
      requireE2bApiKey(),
    );
    console.log(`\n${await boxMountStatus(sandbox)}`);

    const listing = await sandbox.commands.run(
      `ls -la ${shellQuote(REMOTE_MOUNT_PATH)} && ` +
        `ls -la ${shellQuote(`${REMOTE_MOUNT_PATH}/Reviewed`)}`,
      { timeoutMs: 30_000 },
    );
    console.log(`\nMounted workspace:\n${listing.stdout.trim()}`);
    console.log("\nOpen E2B Dashboard → Sandboxes → Filesystem");
    console.log(`Path: ${REMOTE_MOUNT_PATH}`);
  } catch (error) {
    throw new Error(
      `The saved sandbox is no longer reachable.\n` +
        `It may have reached E2B's one-hour limit.\n` +
        `Run npm run teardown to clear local state.\n\n` +
        `${(error as Error).message}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(`\nStatus failed:\n${(error as Error).message}`);
  process.exitCode = 1;
});
