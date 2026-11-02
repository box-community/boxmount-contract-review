import type { Sandbox } from "e2b";
import { resolveAuth } from "./auth.js";
import {
  createDemoFolder,
  deleteDemoFolder,
  validateBoxAccess,
} from "./box.js";
import {
  FIXTURES_PATH,
  getSetupConfig,
  requireE2bApiKey,
} from "./config.js";
import { uploadFixtures } from "./fixtures.js";
import {
  boxMountStatus,
  connectSandbox,
  createDemoSandbox,
  installBoxMount,
  mountBox,
  unmountBox,
} from "./sandbox.js";
import {
  readState,
  removeState,
  writeState,
} from "./state.js";

async function teardownExisting(
  boxAccessToken: string,
): Promise<void> {
  const state = await readState();
  if (!state) return;

  console.log("Cleaning up the previous demo...");

  if (state.sandboxId) {
    try {
      const sandbox = await connectSandbox(
        state.sandboxId,
        requireE2bApiKey(),
      );
      await unmountBox(sandbox).catch(() => undefined);
      await sandbox.kill().catch(() => undefined);
      console.log(`  Destroyed sandbox ${state.sandboxId}`);
    } catch {
      console.log("  Previous sandbox already expired");
    }
  }

  if (state.boxFolderAutoCreated) {
    try {
      await deleteDemoFolder(boxAccessToken, state.boxFolderId);
      console.log(`  Deleted Box folder ${state.boxFolderId}`);
    } catch {
      console.log(
        "  Could not delete the previous Box folder (it may already be gone)",
      );
    }
  }

  await removeState();
}

async function main(): Promise<void> {
  const baseConfig = getSetupConfig();
  const config = await resolveAuth(baseConfig);

  await teardownExisting(config.boxAccessToken);

  const box = await validateBoxAccess(
    config.boxAccessToken,
    config.boxParentFolderId === "0"
      ? "0"
      : config.boxParentFolderId,
  );
  console.log(`Authenticated as ${box.user}`);

  let boxFolderId: string;
  let autoCreated: boolean;

  if (config.boxFolderId) {
    boxFolderId = config.boxFolderId;
    autoCreated = false;
    console.log(
      `Using existing Box folder ${boxFolderId} (from BOX_FOLDER_ID)`,
    );
  } else {
    console.log("Creating a fresh Box folder...");
    const { folderId, folderName } = await createDemoFolder(
      config.boxAccessToken,
      config.boxParentFolderId,
    );
    boxFolderId = folderId;
    autoCreated = true;
    console.log(`Created ${folderName} (${folderId})`);
  }

  let sandbox: Sandbox | undefined;
  let mounted = false;

  try {
    console.log("Creating a temporary E2B sandbox...");
    sandbox = await createDemoSandbox(
      { ...config, boxFolderId },
      15 * 60 * 1000,
    );
    console.log(`Sandbox: ${sandbox.sandboxId}`);

    const version = await installBoxMount(
      sandbox,
      config.boxMountArchive,
    );
    console.log(`Installed ${version}`);

    console.log(`Mounting Box folder ${boxFolderId}...`);
    await mountBox(sandbox, boxFolderId);
    mounted = true;

    console.log("Copying the synthetic contract workspace...");
    const uploaded = await uploadFixtures(sandbox, FIXTURES_PATH);
    for (const path of uploaded) {
      console.log(`  ${path}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 5_000));
    console.log(await boxMountStatus(sandbox));

    console.log("Finalizing synchronization...");
    await unmountBox(sandbox);
    mounted = false;
  } finally {
    if (sandbox && mounted) {
      await unmountBox(sandbox).catch((error: unknown) => {
        console.warn(
          `Warning: clean unmount failed: ${(error as Error).message}`,
        );
      });
    }
    await sandbox?.kill().catch(() => undefined);
  }

  await writeState({
    boxFolderId,
    boxFolderAutoCreated: autoCreated,
  });

  console.log("\nSetup complete. Seed files are ready in Box.");
  console.log(`Box folder: ${boxFolderId}`);
  console.log("Next: npm run demo");
}

main().catch((error: unknown) => {
  const message = (error as Error).message;
  if (
    message.includes("401") ||
    message.toLowerCase().includes("auth")
  ) {
    console.error(
      "\nSetup failed. Your Box Developer Token may have expired.\n" +
        "Generate a new token, update BOX_ACCESS_TOKEN, and retry.",
    );
  } else {
    console.error(`\nSetup failed:\n${message}`);
  }
  process.exitCode = 1;
});
