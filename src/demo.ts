import type { Sandbox } from "e2b";
import { getDemoConfig } from "./config.js";
import {
  REVIEW_OUTPUT_PATH,
  reviewProvider,
} from "./contract-agent.js";
import { runReviewJob } from "./run-review-job.js";
import {
  REMOTE_MOUNT_PATH,
  SANDBOX_TIMEOUT_MS,
  boxMountStatus,
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

async function main(): Promise<void> {
  const existing = await readState();
  if (existing) {
    throw new Error(
      `A demo is already registered (${existing.sandboxId}).\n` +
        "Run npm run status or npm run teardown before starting another.",
    );
  }

  const config = getDemoConfig();
  let sandbox: Sandbox | undefined;
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
    await removeState();
  };

  const onInterrupt = (): void => {
    console.log("\nInterrupted; cleaning up the incomplete demo...");
    void cleanupFailedRun().finally(() => process.exit(130));
  };
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onInterrupt);

  try {
    console.log("Creating the E2B contract-review sandbox...");
    sandbox = await createDemoSandbox(config);
    const createdAt = new Date();

    await writeState({
      sandboxId: sandbox.sandboxId,
      boxFolderId: config.boxFolderId,
      mountPath: REMOTE_MOUNT_PATH,
      outputPath: REVIEW_OUTPUT_PATH,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(
        createdAt.getTime() + SANDBOX_TIMEOUT_MS,
      ).toISOString(),
    });

    console.log(`Sandbox: ${sandbox.sandboxId}`);
    await installBoxMount(
      sandbox,
      config.boxMountArchive,
    );
    console.log("Installed Box Mount");

    console.log(`Mounting Box folder ${config.boxFolderId}...`);
    await mountBox(sandbox, config.boxFolderId);
    mounted = true;
    console.log(await boxMountStatus(sandbox));

    const provider = reviewProvider(config);
    console.log(
      `${provider} is reviewing Acme-MSA.docx against the approved playbook...`,
    );
    if (provider === "OpenAI") {
      console.log(
        "The OpenAI review agent is running inside the E2B sandbox.",
      );
    }
    const { outputPath, taskAssignment } = await runReviewJob(
      sandbox,
      config,
    );

    handedOff = true;
    console.log("\nReview complete and synchronized to Box.");
    console.log(`Output: ${outputPath}`);
    if (taskAssignment === "assigned") {
      console.log("Box review task assigned to the configured reviewer.");
    } else if (taskAssignment === "skipped") {
      console.log(
        "No Box reviewer configured; review task assignment skipped.",
      );
    } else {
      console.warn(
        "Box review task could not be assigned. Confirm the reviewer ID " +
          "and that the reviewer can access the output file.",
      );
    }
    console.log(`Sandbox: ${sandbox.sandboxId}`);
    console.log(`Expires: ${new Date(createdAt.getTime() + SANDBOX_TIMEOUT_MS).toLocaleString()}`);
    console.log("\nThe sandbox remains running for exploration.");
    console.log("  npm run status");
    console.log("  npm run teardown");
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
    message.toLowerCase().includes("authentication")
  ) {
    console.error(
      "\nDemo failed. A Developer Token or API key may have expired or be invalid.\n" +
        "Refresh the relevant value in .env and retry.",
    );
  } else {
    console.error(`\nDemo failed:\n${message}`);
  }
  process.exitCode = 1;
});
