import 'server-only';

export type GoogleWalletConfig = {
  issuerId: string;
  serviceAccountEmail: string;
  /** PEM, real newlines (converted from a literal-\n env var if needed). */
  privateKey: string;
};

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is required for Google Wallet passes; see .env.example`,
    );
  }
  return value;
}

export function getGoogleWalletConfig(): GoogleWalletConfig {
  return {
    issuerId: readEnv('GOOGLE_WALLET_ISSUER_ID'),
    serviceAccountEmail: readEnv('GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL'),
    // The private key is normally pasted into a single-line env var with
    // literal "\n" sequences standing in for real newlines.
    privateKey: readEnv('GOOGLE_WALLET_SERVICE_ACCOUNT_PRIVATE_KEY').replace(
      /\\n/g,
      '\n',
    ),
  };
}
