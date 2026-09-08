import type { Sandbox } from "e2b";
import { assignReviewTask } from "./box.js";
import type { DemoConfig } from "./config.js";
import {
  REVIEW_OUTPUT_PATH,
  runContractAgent,
} from "./contract-agent.js";
import {
  REMOTE_MOUNT_PATH,
  shellQuote,
} from "./sandbox.js";

export async function runReviewJob(
  sandbox: Sandbox,
  config: DemoConfig,
): Promise<{
  outputPath: string;
  taskAssignment: "assigned" | "skipped" | "failed";
}> {
  try {
    await sandbox.commands.run(
      [
        `test -s ${shellQuote(`${REMOTE_MOUNT_PATH}/Incoming/Acme-MSA.docx`)}`,
        `test -s ${shellQuote(`${REMOTE_MOUNT_PATH}/Playbook/approved-contract-playbook.md`)}`,
      ].join(" && "),
      { timeoutMs: 30_000 },
    );
  } catch {
    throw new Error(
      "The seeded contract workspace was not found in the mount.\n" +
        "Run npm run seed, then retry npm run demo.",
    );
  }

  await runContractAgent(sandbox, config);

  // Local filesystem events normally trigger an immediate cycle. Leave a
  // small buffer before verifying and handing the sandbox to the user.
  await new Promise((resolve) => setTimeout(resolve, 8_000));
  await sandbox.commands.run(
    `test -s ${shellQuote(REVIEW_OUTPUT_PATH)}`,
    { timeoutMs: 30_000 },
  );

  let taskAssignment: "assigned" | "skipped" | "failed" = "skipped";
  if (config.boxReviewerUserId) {
    try {
      await assignReviewTask(
        config.boxAccessToken,
        config.boxFolderId,
        config.boxReviewerUserId,
      );
      taskAssignment = "assigned";
    } catch {
      taskAssignment = "failed";
    }
  }

  return { outputPath: REVIEW_OUTPUT_PATH, taskAssignment };
}
