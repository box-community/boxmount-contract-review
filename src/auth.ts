import { createServer } from "node:http";
import { exec } from "node:child_process";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  BoxClient,
  BoxDeveloperTokenAuth,
  BoxOAuth,
  OAuthConfig,
} from "box-node-sdk";
import type { TokenStorage } from "box-node-sdk/box";
import type { AccessToken } from "box-node-sdk/schemas";
import { PROJECT_ROOT, type DemoConfig } from "./config.js";

const TOKENS_PATH = resolve(PROJECT_ROOT, ".box-tokens.json");
const REDIRECT_PORT = 8787;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const REFRESH_SKEW_MS = 60_000;

type StoredAccessToken = AccessToken & { obtainedAt?: number };

class FileTokenStorage implements TokenStorage {
  async store(token: AccessToken): Promise<undefined> {
    const stored: StoredAccessToken = {
      ...token,
      obtainedAt: Date.now(),
    };
    await writeFile(
      TOKENS_PATH,
      `${JSON.stringify(stored, null, 2)}\n`,
      { mode: 0o600 },
    );
    return undefined;
  }

  async get(): Promise<undefined | StoredAccessToken> {
    try {
      const raw = await readFile(TOKENS_PATH, "utf8");
      return JSON.parse(raw) as StoredAccessToken;
    } catch {
      return undefined;
    }
  }

  async clear(): Promise<undefined> {
    await rm(TOKENS_PATH, { force: true });
    return undefined;
  }
}

async function authorizeInBrowser(
  auth: BoxOAuth,
  clientId: string,
): Promise<void> {
  const authorizeUrl = auth.getAuthorizeUrl({
    clientId,
    redirectUri: REDIRECT_URI,
    responseType: "code",
  });

  const code = await new Promise<string>((resolveCode, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(
        req.url!,
        `http://localhost:${REDIRECT_PORT}`,
      );
      const authCode = url.searchParams.get("code");
      if (authCode) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<h2>✓ Box authentication complete. You can close this tab.</h2>",
        );
        server.close();
        resolveCode(authCode);
      } else {
        const error = url.searchParams.get("error_description") ||
          url.searchParams.get("error") ||
          "Missing authorization code";
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h2>Authentication failed: ${error}</h2>`);
        server.close();
        reject(new Error(`OAuth callback error: ${error}`));
      }
    });
    server.listen(REDIRECT_PORT, () => {
      console.log(
        "Opening your browser for Box login...\n" +
          "If it does not open automatically, visit:\n" +
          `  ${authorizeUrl}\n`,
      );
      const open =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "start"
            : "xdg-open";
      exec(`${open} "${authorizeUrl}"`);
    });
    server.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${REDIRECT_PORT} is in use. Close the other process and retry.`,
          ),
        );
      } else {
        reject(err);
      }
    });
  });

  await auth.getTokensAuthorizationCodeGrant(code);
}

async function accessTokenIsStale(
  token: StoredAccessToken,
): Promise<boolean> {
  if (!token.expiresIn || token.expiresIn <= 0) return true;

  let obtainedAt = token.obtainedAt;
  if (!obtainedAt) {
    try {
      obtainedAt = (await stat(TOKENS_PATH)).mtimeMs;
    } catch {
      return true;
    }
  }

  return Date.now() + REFRESH_SKEW_MS >= obtainedAt + token.expiresIn * 1000;
}

export type BoxAuth =
  | {
      mode: "oauth";
      client: BoxClient;
      accessToken: string;
      refreshToken: string;
      clientId: string;
      clientSecret: string;
    }
  | {
      mode: "developer-token";
      client: BoxClient;
      accessToken: string;
    };

export async function authenticateBox(opts: {
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
}): Promise<BoxAuth> {
  if (opts.clientId && opts.clientSecret) {
    const tokenStorage = new FileTokenStorage();
    const auth = new BoxOAuth({
      config: new OAuthConfig({
        clientId: opts.clientId,
        clientSecret: opts.clientSecret,
        tokenStorage,
      }),
    });

    const existing = await tokenStorage.get();
    if (!existing?.refreshToken) {
      await authorizeInBrowser(auth, opts.clientId);
    }

    let token: AccessToken;
    try {
      const cached = await tokenStorage.get();
      if (cached?.accessToken && !(await accessTokenIsStale(cached))) {
        token = cached;
      } else {
        console.log("Refreshing Box access token...");
        token = await auth.refreshToken();
      }
    } catch {
      console.log(
        "Saved Box login could not be refreshed. Opening browser...",
      );
      await tokenStorage.clear();
      await authorizeInBrowser(auth, opts.clientId);
      token = await auth.retrieveToken();
    }
    if (!token.accessToken) {
      throw new Error(
        "Box OAuth succeeded but no access token was returned.",
      );
    }

    return {
      mode: "oauth",
      client: new BoxClient({ auth }),
      accessToken: token.accessToken,
      refreshToken: token.refreshToken ?? "",
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
    };
  }

  if (opts.accessToken) {
    const auth = new BoxDeveloperTokenAuth({
      token: opts.accessToken,
    });
    return {
      mode: "developer-token",
      client: new BoxClient({ auth }),
      accessToken: opts.accessToken,
    };
  }

  throw new Error(
    "Provide BOX_CLIENT_ID + BOX_CLIENT_SECRET for OAuth, " +
      "or BOX_ACCESS_TOKEN for a developer token.",
  );
}

export async function resolveAuth(
  config: DemoConfig,
): Promise<DemoConfig> {
  const auth = await authenticateBox({
    clientId: config.boxClientId || undefined,
    clientSecret: config.boxClientSecret || undefined,
    accessToken: config.boxAccessToken || undefined,
  });

  if (auth.mode === "oauth") {
    return {
      ...config,
      boxAccessToken: auth.accessToken,
      boxRefreshToken: auth.refreshToken,
      boxClientId: auth.clientId,
      boxClientSecret: auth.clientSecret,
    };
  }

  return {
    ...config,
    boxAccessToken: auth.accessToken,
  };
}

export async function clearTokens(): Promise<void> {
  await rm(TOKENS_PATH, { force: true });
}
