import type { Sandbox } from "e2b";
import { reviewContractWithBoxAi } from "./box.js";
import type { DemoConfig } from "./config.js";
import {
  REMOTE_MOUNT_PATH,
  shellQuote,
} from "./sandbox.js";

export const REVIEW_OUTPUT_PATH =
  `${REMOTE_MOUNT_PATH}/Reviewed/Acme-MSA-review.md`;
const REMOTE_OPENAI_AGENT_PATH = "/home/user/openai-review-agent";

const openAiRunner = String.raw`
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import mammoth from "mammoth";

const mountPath = process.argv[2];
const outputPath = process.argv[3];
const contractPath = mountPath + "/Incoming/Acme-MSA.docx";
const playbookPath =
  mountPath + "/Playbook/approved-contract-playbook.md";

const { value: contract } = await mammoth.extractRawText({
  path: contractPath,
});
const playbook = await readFile(playbookPath, "utf8");

const input = [
  "Act as a first-pass contract review assistant for a qualified enterprise legal team.",
  "Compare the agreement against the approved playbook.",
  "Follow the playbook's review standard and required output.",
  "Cite the agreement section for every finding and do not invent clauses.",
  "Return a complete review memo in Markdown only.",
  "",
  "APPROVED PLAYBOOK",
  "=================",
  playbook,
  "",
  "AGREEMENT",
  "=========",
  contract,
].join("\n");

const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    "authorization": "Bearer " + process.env.OPENAI_API_KEY,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: process.env.OPENAI_MODEL || "gpt-5.5",
    input,
  }),
});

if (!response.ok) {
  throw new Error(
    "OpenAI request failed (" +
      response.status +
      "): " +
      (await response.text()),
  );
}

const payload = await response.json();
const review =
  payload.output_text ||
  (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("\n")
    .trim();

if (!review) {
  throw new Error("OpenAI returned no review text.");
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  review +
    "\n\n---\n_AI-generated with OpenAI inside E2B. " +
    "Qualified legal review is required._\n",
  "utf8",
);

console.log(outputPath);
`;

export function reviewProvider(config: DemoConfig): "OpenAI" | "Box AI" {
  return config.openaiApiKey ? "OpenAI" : "Box AI";
}

async function runOpenAiAgent(sandbox: Sandbox): Promise<string> {
  await sandbox.commands.run(
    `mkdir -p ${shellQuote(REMOTE_OPENAI_AGENT_PATH)}`,
    { timeoutMs: 30_000 },
  );
  await sandbox.files.write(
    `${REMOTE_OPENAI_AGENT_PATH}/review.mjs`,
    openAiRunner,
  );
  await sandbox.files.write(
    `${REMOTE_OPENAI_AGENT_PATH}/package.json`,
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: { mammoth: "1.12.1" },
    }),
  );
  await sandbox.commands.run("npm install --silent", {
    cwd: REMOTE_OPENAI_AGENT_PATH,
    timeoutMs: 180_000,
  });
  const result = await sandbox.commands.run(
    [
      "node review.mjs",
      shellQuote(REMOTE_MOUNT_PATH),
      shellQuote(REVIEW_OUTPUT_PATH),
    ].join(" "),
    {
      cwd: REMOTE_OPENAI_AGENT_PATH,
      timeoutMs: 300_000,
    },
  );
  return result.stdout.trim();
}

async function runBoxAiReview(
  sandbox: Sandbox,
  boxAccessToken: string,
  boxFolderId: string,
): Promise<string> {
  const review = await reviewContractWithBoxAi(
    boxAccessToken,
    boxFolderId,
  );

  await sandbox.commands.run(
    `mkdir -p ${shellQuote(`${REMOTE_MOUNT_PATH}/Reviewed`)}`,
    { timeoutMs: 30_000 },
  );

  await sandbox.files.write(
    REVIEW_OUTPUT_PATH,
    `${review}\n\n---\n` +
      "_AI-generated with Box AI for demonstration purposes. " +
      "Qualified legal review is required._\n",
  );

  return REVIEW_OUTPUT_PATH;
}

export async function runContractAgent(
  sandbox: Sandbox,
  config: DemoConfig,
): Promise<string> {
  if (config.openaiApiKey) {
    return runOpenAiAgent(sandbox);
  }
  return runBoxAiReview(
    sandbox,
    config.boxAccessToken,
    config.boxFolderId,
  );
}
