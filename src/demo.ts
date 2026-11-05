import type { Sandbox } from "e2b";
import { resolveAuth } from "./auth.js";
import {
  assignReviewTask,
  createDemoFolder,
  deleteDemoFolder,
  validateBoxAccess,
} from "./box.js";
import {
  FIXTURES_PATH,
  getConfig,
  requireE2bApiKey,
} from "./config.js";
import {
  REVIEW_OUTPUT_PATH,
  reviewProvider,
} from "./contract-agent.js";
import { uploadFixtures } from "./fixtures.js";
import { runReviewJob } from "./run-review-job.js";
import {
  REMOTE_BINARY,
  REMOTE_DATA_PATH,
  REMOTE_MOUNT_PATH,
  SANDBOX_TIMEOUT_MS,
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

const BLUE = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function banner(text: string): void {
  const width = 60;
  const line = "═".repeat(width);
  console.log("");
  console.log(`${BLUE}╔${line}╗${RESET}`);
  const pad = Math.max(0, width - text.length);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  console.log(
    `${BLUE}║${RESET}${" ".repeat(left)}${BOLD}${text}${RESET}${" ".repeat(right)}${BLUE}║${RESET}`,
  );
  console.log(`${BLUE}╚${line}╝${RESET}`);
  console.log("");
}

function step(n: number, total: number, label: string): void {
  console.log(
    `\n${BLUE}[${n}/${total}]${RESET} ${BOLD}${label}${RESET}`,
  );
}

function info(text: string): void {
  console.log(`  ${DIM}→${RESET} ${text}`);
}

function success(text: string): void {
  console.log(`  ${GREEN}✓${RESET} ${text}`);
}

function cmd(text: string): void {
  console.log(`  ${DIM}$${RESET} ${YELLOW}${text}${RESET}`);
}

function warn(text: string): void {
  console.log(`  ${YELLOW}⚠${RESET} ${text}`);
}

const TOTAL_STEPS = 7;

async function teardownExisting(
  boxAccessToken: string,
): Promise<void> {
  const state = await readState();
  if (!state) return;

  info("Previous demo found — cleaning up first...");

  if (state.sandboxId) {
    try {
      const sandbox = await connectSandbox(
        state.sandboxId,
        requireE2bApiKey(),
      );
      await unmountBox(sandbox).catch(() => undefined);
      await sandbox.kill().catch(() => undefined);
      info(`Destroyed sandbox ${state.sandboxId}`);
    } catch {
      info("Previous sandbox already expired");
    }
  }

  if (state.boxFolderAutoCreated) {
    try {
      await deleteDemoFolder(boxAccessToken, state.boxFolderId);
      info(`Deleted Box folder ${state.boxFolderId}`);
    } catch {
      info("Could not delete the previous Box folder (it may already be gone)");
    }
  }

  await removeState();
}

async function main(): Promise<void> {
  banner("Box Mount — Contract Review Demo");

  step(1, TOTAL_STEPS, "Authenticate with Box");
  const baseConfig = getConfig();
  const config = await resolveAuth(baseConfig);

  await teardownExisting(config.boxAccessToken);

  const box = await validateBoxAccess(
    config.boxAccessToken,
    config.boxParentFolderId === "0"
      ? "0"
      : config.boxParentFolderId,
  );
  success(`Signed in as ${BOLD}${box.user}${RESET}`);

  step(2, TOTAL_STEPS, "Prepare Box folder");

  let boxFolderId: string;
  let autoCreated: boolean;

  if (config.boxFolderId) {
    boxFolderId = config.boxFolderId;
    autoCreated = false;
    info(`Using existing folder ${boxFolderId} (from BOX_FOLDER_ID)`);
  } else {
    info("Creating a timestamped folder in Box with Incoming/, Playbook/, and Reviewed/ subfolders...");
    const { folderId, folderName } = await createDemoFolder(
      config.boxAccessToken,
      config.boxParentFolderId,
    );
    boxFolderId = folderId;
    autoCreated = true;
    success(`${BOLD}${folderName}${RESET} (id: ${folderId})`);
  }

  step(3, TOTAL_STEPS, "Launch E2B cloud sandbox");

  const fullConfig = { ...config, boxFolderId };
  const sandbox = await createDemoSandbox(fullConfig);
  const createdAt = new Date();

  success(`Sandbox ${BOLD}${sandbox.sandboxId}${RESET}`);
  info(
    `Timeout: ${SANDBOX_TIMEOUT_MS / 60_000} minutes — expires ${new Date(createdAt.getTime() + SANDBOX_TIMEOUT_MS).toLocaleTimeString()}`,
  );

  let mounted = false;
  let handedOff = false;
  let cleaningUp = false;

  const cleanupFailedRun = async (): Promise<void> => {
    if (cleaningUp || handedOff) return;
    cleaningUp = true;
    if (sandbox && mounted) {
      await unmountBox(sandbox).catch(() => undefined);
    }
    await sandbox?.kill().catch(() => undefined);
    if (autoCreated) {
      await deleteDemoFolder(config.boxAccessToken, boxFolderId).catch(
        () => undefined,
      );
    }
    await removeState();
  };

  const onInterrupt = (): void => {
    console.log("\n\nInterrupted — cleaning up...");
    void cleanupFailedRun().finally(() => process.exit(130));
  };
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onInterrupt);

  try {
    step(4, TOTAL_STEPS, "Install Box Mount and mount the folder");

    info("Uploading the Box Mount binary to the sandbox...");
    const version = await installBoxMount(
      sandbox,
      config.boxMountArchive,
    );
    success(`Installed ${version}`);

    info(`Mounting Box folder ${boxFolderId} at ${REMOTE_MOUNT_PATH}`);
    cmd(
      `box-mount --data-path ${REMOTE_DATA_PATH} mount ${REMOTE_MOUNT_PATH} ${boxFolderId}`,
    );
    await mountBox(sandbox, boxFolderId);
    mounted = true;
    success("Box folder is live inside the sandbox");

    step(5, TOTAL_STEPS, "Seed contract workspace via the mount");

    info(
      "Copying fixture files into the mount — Box Mount syncs them to Box automatically.",
    );
    const uploaded = await uploadFixtures(sandbox, FIXTURES_PATH);
    for (const path of uploaded) {
      info(`${DIM}${path}${RESET}`);
    }
    success(
      `${uploaded.length} file(s) written to the mounted folder`,
    );

    info("Waiting a moment for Box Mount to sync...");
    await new Promise((resolve) => setTimeout(resolve, 5_000));

    const statusLine = await boxMountStatus(sandbox);
    cmd(
      `box-mount --data-path ${REMOTE_DATA_PATH} status`,
    );
    info(statusLine);

    await writeState({
      boxFolderId,
      boxFolderAutoCreated: autoCreated,
      sandboxId: sandbox.sandboxId,
      mountPath: REMOTE_MOUNT_PATH,
      outputPath: REVIEW_OUTPUT_PATH,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(
        createdAt.getTime() + SANDBOX_TIMEOUT_MS,
      ).toISOString(),
    });

    step(6, TOTAL_STEPS, "Run contract review");

    const provider = reviewProvider(config);
    if (provider === "OpenAI") {
      info(
        `The OpenAI agent reads Acme-MSA.docx and the playbook directly from ${REMOTE_MOUNT_PATH}.`,
      );
      info(
        "To the agent it's just a local directory — Box Mount handles the rest.",
      );
    } else {
      info(
        "Box AI compares the contract against the playbook server-side.",
      );
    }
    info(
      `${BOLD}${provider}${RESET} is reviewing Acme-MSA.docx against the approved playbook...`,
    );

    const { outputPath, taskAssignment } = await runReviewJob(
      sandbox,
      fullConfig,
    );

    success("Review memo generated");
    info(`Output: ${outputPath}`);

    if (taskAssignment === "assigned") {
      success("Box review task assigned to the configured reviewer");
    } else if (taskAssignment === "skipped") {
      info("No reviewer configured — task assignment skipped");
    } else {
      warn(
        "Could not assign the review task. Confirm BOX_REVIEWER_USER_ID.",
      );
    }

    step(7, TOTAL_STEPS, "Done!");

    handedOff = true;

    console.log("");
    console.log(
      `  The sandbox is still running. The mounted folder at ${BOLD}${REMOTE_MOUNT_PATH}${RESET}`,
    );
    console.log(
      "  is a live, bidirectional mirror of the Box folder.",
    );
    console.log("");
    console.log(
      `  ${DIM}Try it:${RESET} edit a file in Box and watch it appear in the sandbox, or vice versa.`,
    );
    console.log("");
    console.log(`  ${DIM}Sandbox ID:${RESET}  ${sandbox.sandboxId}`);
    console.log(
      `  ${DIM}Expires at:${RESET}  ${new Date(createdAt.getTime() + SANDBOX_TIMEOUT_MS).toLocaleString()}`,
    );
    console.log(
      `  ${DIM}Box folder:${RESET}  ${boxFolderId}`,
    );
    console.log("");
    console.log(`  ${DIM}npm run status${RESET}     — check the sandbox and mount`);
    console.log(
      `  ${DIM}npm run exec -- ls ${REMOTE_MOUNT_PATH}${RESET}  — run commands in the sandbox`,
    );
    console.log(`  ${DIM}npm run teardown${RESET}   — sync, unmount, and clean up`);
    console.log("");
  } catch (error) {
    await cleanupFailedRun();
    throw error;
  } finally {
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onInterrupt);
  }
}

main().catch((error: unknown) => {
  const message = (error as Error).message;
  if (
    message.includes("401") ||
    message.toLowerCase().includes("auth")
  ) {
    console.error(
      `\n${YELLOW}Demo failed.${RESET} A token or API key may have expired or be invalid.\n` +
        "Refresh the relevant value in .env and retry.",
    );
  } else {
    console.error(`\n${YELLOW}Demo failed:${RESET}\n${message}`);
  }
  process.exitCode = 1;
});
