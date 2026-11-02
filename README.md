# Box Mount Contract Review

Box Mount is a Box-native filesystem for AI agents. It gives an agent running in a sandbox a POSIX-compatible Box workspace, so standard tools can read, edit, and create files while Box remains the system of record for permissions, versions, policy, and audit history.

This sample runs a contract-review workflow with Box Mount in E2B. It uses Box AI by default, or an optional OpenAI agent running inside the sandbox, to compare a synthetic MSA with an approved legal playbook. The review is written into the mounted workspace so Box Mount synchronizes it back to Box.

## Prerequisites

- Node.js 20+
- An [E2B](https://e2b.dev) API key
- A Box Developer Token
- Box AI API access, or optionally an OpenAI API key
- The Linux x86_64 Box Mount archive

Developer Tokens expire after approximately 60 minutes and are for demo use only.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`, then place the separately supplied Linux archive in:

```text
private/
```

Its filename does not matter; it only needs to end in `.tar.gz` or `.tgz`.
If the directory contains multiple archives, set `BOX_MOUNT_ARCHIVE` to the
one to use. The setup check extracts the archive and validates the executable
with `box-mount --version`.

The Box Mount binary is not included in this repository.

Box AI is the default reviewer and requires no additional key. To run the
OpenAI reviewer inside E2B instead, set `OPENAI_API_KEY` in `.env`. You can
optionally override `OPENAI_MODEL`; a blank or missing OpenAI key always falls
back to Box AI.

To assign a Box review task after the memo is synchronized, set
`BOX_REVIEWER_USER_ID` to the reviewer's Box user ID. Leave it blank to skip
task assignment.

## Run

### 1. Validate your environment (optional)

```bash
npm run doctor
```

This checks your Box and E2B access, fixtures, and Box Mount binary.

### 2. Set up a fresh demo workspace

```bash
npm run setup
```

This creates a new Box folder (timestamped so they never collide), seeds the
synthetic MSA and playbook into it via Box Mount, and saves the folder ID to
local state. If a previous demo exists, it is torn down automatically.

To place demo folders under a specific parent, set `BOX_PARENT_FOLDER_ID` in
`.env`. To use a pre-existing folder instead of auto-creating one, set
`BOX_FOLDER_ID`.

### 3. Run the review

```bash
npm run demo
```

The demo creates an E2B sandbox, mounts the Box folder, runs the selected reviewer, and writes the resulting memo into `Reviewed/`. When an OpenAI key is configured, that reviewer runs inside E2B against the mounted files. If a Box reviewer is configured, the demo assigns that person a review task on the output. The sandbox remains running so you can explore it.

### 4. Explore the live workspace

Open Box and the E2B filesystem at `/home/user/box-demo`. Changes made on either side are synchronized while the sandbox is running.

You can check the mount at any time:

```bash
npm run status
```

### 5. Clean up and repeat

When you are finished:

```bash
npm run teardown
```

This performs a final sync, unmounts the Box folder, destroys the sandbox, and
deletes the auto-created Box folder from Box. All you need for the next demo
is `npm run setup` again.

**Repeat quickly:**

```bash
npm run setup   # auto-cleans previous demo, creates fresh folder, seeds
npm run demo    # runs the contract review
# ... when ready for a fresh run ...
npm run setup   # tears down and sets up again
npm run demo
```

The included contract and review are synthetic demonstrations, not legal advice.
