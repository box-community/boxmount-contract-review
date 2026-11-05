# Box Mount Contract Review

Box Mount is a Box-native filesystem for AI agents. It gives an agent running in a sandbox a POSIX-compatible Box workspace, so standard tools can read, edit, and create files while Box remains the system of record for permissions, versions, policy, and audit history.

This sample runs a contract-review workflow with Box Mount in E2B. It uses Box AI by default, or an optional OpenAI agent running inside the sandbox, to compare a synthetic MSA with an approved legal playbook. The review is written into the mounted workspace so Box Mount synchronizes it back to Box.

## Prerequisites

- Node.js 20+
- An [E2B](https://e2b.dev) API key
- A Box app in the [Developer Console](https://app.box.com/developers/console)
- Box AI API access, or optionally an OpenAI API key
- The Linux x86_64 Box Mount archive

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env` with your E2B key and Box credentials.

### Box authentication

**OAuth (recommended)** — set `BOX_CLIENT_ID` and `BOX_CLIENT_SECRET`. On first
run the app opens your browser for a one-time Box login, then saves tokens to
`.box-tokens.json`. Tokens auto-refresh for up to 60 days, so you never need to
paste a new token. Your Box app must have `http://localhost:8787/callback` as a
redirect URI.

**Developer Token** — set `BOX_ACCESS_TOKEN` instead. Quick to start but expires
every 60 minutes.

### Box Mount binary

Place the separately supplied Linux archive in:

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

### 2. Run the demo

```bash
npm run demo
```

This single command does everything:

1. Authenticates with Box
2. Creates a fresh, timestamped Box folder (or uses `BOX_FOLDER_ID`)
3. Launches an E2B cloud sandbox
4. Installs Box Mount and mounts the folder inside the sandbox
5. Seeds the synthetic contract and playbook via the mount
6. Runs the AI reviewer (Box AI or OpenAI)
7. Leaves the sandbox running for exploration

If a previous demo exists, it is torn down automatically before starting.

To place demo folders under a specific parent, set `BOX_PARENT_FOLDER_ID` in
`.env`. To use a pre-existing folder instead of auto-creating one, set
`BOX_FOLDER_ID`.

### 3. Explore the live workspace

Open Box and the E2B filesystem at `/home/user/box-demo`. Changes made on
either side are synchronized while the sandbox is running.

You can check the mount at any time:

```bash
npm run status
```

### 4. Clean up and repeat

When you are finished:

```bash
npm run teardown
```

This performs a final sync, unmounts the Box folder, destroys the sandbox, and
deletes the auto-created Box folder from Box. All you need for the next demo
is `npm run demo` again.

**Repeat quickly:**

```bash
npm run demo       # auto-cleans previous demo, seeds, reviews — all in one
# ... when ready for a fresh run ...
npm run demo       # tears down and starts fresh
```

The included contract and review are synthetic demonstrations, not legal advice.
