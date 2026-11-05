import { requireE2bApiKey } from "./config.js";
import {
  REMOTE_MOUNT_PATH,
  connectSandbox,
  shellQuote,
} from "./sandbox.js";
import { readState } from "./state.js";

async function main(): Promise<void> {
  const state = await readState();
  if (!state?.sandboxId) {
    throw new Error("No running demo. Run npm run demo first.");
  }

  const command = process.argv.slice(2).join(" ");
  if (!command) {
    console.log("Usage: npm run exec -- <command>");
    console.log(`Mount path: ${REMOTE_MOUNT_PATH}`);
    console.log("");
    console.log("Examples:");
    console.log(`  npm run exec -- ls ${REMOTE_MOUNT_PATH}`);
    console.log(
      `  npm run exec -- echo "Approved." \\> ${REMOTE_MOUNT_PATH}/Reviewed/notes.txt`,
    );
    return;
  }

  const sandbox = await connectSandbox(
    state.sandboxId,
    requireE2bApiKey(),
  );
  const result = await sandbox.commands.run(command, {
    timeoutMs: 30_000,
  });

  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
}

main().catch((error: unknown) => {
  console.error(`\nExec failed:\n${(error as Error).message}`);
  process.exitCode = 1;
});
