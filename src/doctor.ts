import { access } from "node:fs/promises";
import { join } from "node:path";
import { BoxApiError } from "box-node-sdk";
import {
  CommandExitError,
  type Sandbox,
} from "e2b";
import { validateBoxAccess } from "./box.js";
import { FIXTURES_PATH, getDemoConfig } from "./config.js";
import {
  createDemoSandbox,
  installBoxMount,
} from "./sandbox.js";

async function validateOpenAi(
  sandbox: Sandbox,
  model: string,
): Promise<void> {
  await sandbox.files.write(
    "/tmp/check-openai.mjs",
    [
      'const response = await fetch("https://api.openai.com/v1/models", {',
      "  headers: {",
      '    authorization: "Bearer " + process.env.OPENAI_API_KEY,',
      "  },",
      "});",
      "if (!response.ok) {",
      "  console.error(",
      '    "OpenAI key check failed (" + response.status + "): " +',
      "      (await response.text()),",
      "  );",
      "  process.exit(1);",
      "}",
      "const payload = await response.json();",
      "const model = process.env.OPENAI_MODEL;",
      "if (!payload.data?.some((entry) => entry.id === model)) {",
      '  console.error("OpenAI model is not available to this key: " + model);',
      "  process.exit(1);",
      "}",
    ].join("\n"),
  );
  try {
    await sandbox.commands.run("node /tmp/check-openai.mjs", {
      timeoutMs: 30_000,
    });
  } catch (error) {
    if (error instanceof CommandExitError) {
      throw new Error(
        error.stderr.trim() ||
          error.stdout.trim() ||
          "OpenAI validation failed.",
      );
    }
    throw error;
  }
  console.log(`✓ OpenAI key works and can access ${model}`);
}

async function main(): Promise<void> {
  const config = getDemoConfig();
  await access(
    join(FIXTURES_PATH, "Incoming", "Acme-MSA.docx"),
  );
  await access(
    join(
      FIXTURES_PATH,
      "Playbook",
      "approved-contract-playbook.md",
    ),
  );

  console.log("✓ Configuration and fixtures found");
  const box = await validateBoxAccess(
    config.boxAccessToken,
    config.boxFolderId,
  );
  console.log(`✓ Box token works for ${box.user}`);
  console.log(`✓ Box folder is accessible: ${box.folder}`);

  let sandbox: Sandbox | undefined;
  try {
    console.log("Creating a short-lived E2B compatibility check...");
    sandbox = await createDemoSandbox(config, 5 * 60 * 1000);
    await installBoxMount(
      sandbox,
      config.boxMountArchive,
    );
    console.log("✓ E2B accepted the Box Mount Linux binary");
    if (config.openaiApiKey) {
      await validateOpenAi(sandbox, config.openaiModel);
    } else {
      console.log("ℹ No OpenAI key configured; the demo will use Box AI");
    }
  } finally {
    await sandbox?.kill().catch(() => undefined);
  }

  console.log("\nSetup looks good. Next: npm run seed");
}

main().catch((error: unknown) => {
  if (
    error instanceof BoxApiError &&
    error.responseInfo.statusCode === 401
  ) {
    console.error(
      "\nDoctor failed:\nBox authentication failed. Your Developer Token " +
        "may have expired.\nGenerate a new token and update " +
        "BOX_ACCESS_TOKEN in .env.",
    );
  } else {
    console.error(`\nDoctor failed:\n${(error as Error).message}`);
  }
  process.exitCode = 1;
});
