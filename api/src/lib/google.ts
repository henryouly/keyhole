import { OAuth2Client } from "google-auth-library";
import { env } from "./env.js";

export const PROVIDER_ID = "google-calendar";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "openid",
  "email",
  "profile",
];

const CALLBACK_PATH = "/api/oauth/google/callback";

export function googleRedirectUri(): string {
  return `${env.APP_URL}${CALLBACK_PATH}`;
}

export function googleOAuthClient(): OAuth2Client {
  return new OAuth2Client({
    clientId: env.GCAL_CLIENT_ID,
    clientSecret: env.GCAL_CLIENT_SECRET,
    redirectUri: googleRedirectUri(),
  });
}

export function buildAuthUrl(state: string): string {
  return googleOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_CALENDAR_SCOPES,
    state,
  });
}

export interface ExchangedTokens {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number | null;
  scope: string | null;
  accountEmail: string | null;
}

/** Exchange an authorization code. Throws NO_REFRESH_TOKEN when Google omits it. */
export async function exchangeCode(code: string): Promise<ExchangedTokens> {
  const client = googleOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error(
      "NO_REFRESH_TOKEN: Google did not return a refresh token. " +
        "Remove Keyhole access at myaccount.google.com/permissions and reconnect.",
    );
  }
  let accountEmail: string | null = null;
  if (tokens.id_token) {
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.GCAL_CLIENT_ID,
    });
    accountEmail = ticket.getPayload()?.email ?? null;
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAtMs: tokens.expiry_date ?? null,
    scope: tokens.scope ?? null,
    accountEmail,
  };
}

export interface RefreshedTokens {
  accessToken: string;
  expiresAtMs: number | null;
  refreshToken: string | null;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<RefreshedTokens> {
  const client = googleOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  if (!credentials.access_token) throw new Error("REFRESH_FAILED");
  return {
    accessToken: credentials.access_token,
    expiresAtMs: credentials.expiry_date ?? null,
    refreshToken: credentials.refresh_token ?? null,
  };
}

/** Best-effort: never throws. Used on disconnect. */
export async function revokeRefreshToken(
  refreshToken: string,
): Promise<void> {
  try {
    await googleOAuthClient().revokeToken(refreshToken);
  } catch {
    // Token already dead or network hiccup — row deletion is the real revoke.
  }
}
