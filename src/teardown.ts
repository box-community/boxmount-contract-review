import { requireE2bApiKey } from "./config.js";
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

  console.log(`Reconnecting to ${state.sandboxId}...`);
  let sandbox;
  try {
    sandbox = await connectSandbox(
      state.sandboxId,
      requireE2bApiKey(),
    );
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("404") || message.toLowerCase().includes("not found")) {
      await removeState();
      console.log("The sandbox no longer exists. Local state cleared.");
      return;
    }
    throw error;
  }

  try {
    console.log("Running Box Mount's final sync and unmount...");
    await unmountBox(sandbox);
  } catch (error) {
    console.warn(
      `Warning: clean unmount failed; the sandbox will still be destroyed.\n` +
        `${(error as Error).message}`,
    );
  } finally {
    console.log("Destroying E2B sandbox...");
    await sandbox.kill().catch(() => undefined);
    await removeState();
  }

  console.log("Demo sandbox destroyed and local state cleared.");
}

main().catch((error: unknown) => {
  console.error(`\nTeardown failed:\n${(error as Error).message}`);
  process.exitCode = 1;
});
