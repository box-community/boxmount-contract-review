import { requireE2bApiKey } from "./config.js";
import {
  REMOTE_DATA_PATH,
  REMOTE_MOUNT_PATH,
  boxMountStatus,
  connectSandbox,
  shellQuote,
} from "./sandbox.js";
import { readState } from "./state.js";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

function cmd(text: string): void {
  console.log(`  ${DIM}$${RESET} ${YELLOW}${text}${RESET}`);
}

async function main(): Promise<void> {
  const state = await readState();
  if (!state) {
    throw new Error(
      "No active demo is registered. Run npm run demo.",
    );
  }

  console.log(`\n  ${DIM}Box folder:${RESET}  ${BOLD}${state.boxFolderId}${RESET}`);
  if (state.boxFolderAutoCreated) {
    console.log(`  ${DIM}             (auto-created; teardown will delete it)${RESET}`);
  }

  if (!state.sandboxId) {
    console.log(
      `\n  No sandbox is running. Run ${BOLD}npm run demo${RESET} to start.`,
    );
    return;
  }

  console.log(`  ${DIM}Sandbox:${RESET}     ${BOLD}${state.sandboxId}${RESET}`);
  if (state.expiresAt) {
    console.log(
      `  ${DIM}Expires at:${RESET}  ${new Date(state.expiresAt).toLocaleString()}`,
    );
  }

  try {
    const sandbox = await connectSandbox(
      state.sandboxId,
      requireE2bApiKey(),
    );

    console.log("");
    cmd(`box-mount --data-path ${REMOTE_DATA_PATH} status`);
    const status = await boxMountStatus(sandbox);
    console.log(`  ${status}`);

    console.log("");
    cmd(`ls -la ${REMOTE_MOUNT_PATH}`);
    const listing = await sandbox.commands.run(
      `ls -la ${shellQuote(REMOTE_MOUNT_PATH)} 2>/dev/null && ` +
        `echo "" && ls -la ${shellQuote(`${REMOTE_MOUNT_PATH}/Reviewed`)} 2>/dev/null`,
      { timeoutMs: 30_000 },
    );
    console.log(
      listing.stdout
        .trim()
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n"),
    );

    console.log("");
    console.log(
      `  ${GREEN}✓${RESET} Sandbox is live. Mount path: ${BOLD}${REMOTE_MOUNT_PATH}${RESET}`,
    );
    console.log("");
  } catch (error) {
    throw new Error(
      `The saved sandbox is no longer reachable.\n` +
        `It may have reached E2B's timeout limit.\n` +
        `Run ${BOLD}npm run teardown${RESET} to clear state.\n\n` +
        `${(error as Error).message}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(`\nStatus failed:\n${(error as Error).message}`);
  process.exitCode = 1;
});
