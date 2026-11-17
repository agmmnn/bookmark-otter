import fs from 'node:fs';
import path from 'node:path';

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface CwsUploadResponse {
  uploadState?: 'SUCCESS' | 'IN_PROGRESS' | 'FAILURE' | 'NOT_FOUND';
  itemError?: Array<{
    error_code?: string;
    error_detail?: string;
  }>;
}

interface CwsPublishResponse {
  status?: string[];
  statusDetail?: string[];
}

function findChromeZip(): string {
  const explicitPath = process.env.ZIP_PATH?.trim();
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      throw new Error(`ZIP_PATH does not exist: ${explicitPath}`);
    }
    return explicitPath;
  }

  const outputDir = path.resolve(process.cwd(), '.output');
  if (!fs.existsSync(outputDir)) {
    throw new Error('Missing .output directory. Run "bun run zip" before publishing.');
  }

  const zipFiles = fs
    .readdirSync(outputDir)
    .filter((f) => f.endsWith('-chrome.zip'))
    .sort();

  if (zipFiles.length === 0) {
    throw new Error('No *-chrome.zip package found in .output/. Run "bun run zip" first.');
  }

  return path.join(outputDir, zipFiles[zipFiles.length - 1]!);
}

async function fetchAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(
      `Failed to refresh Google OAuth token: ${data.error || res.status} ${
        data.error_description || ''
      }`.trim()
    );
  }
  return data.access_token;
}

async function uploadZip(extensionId: string, accessToken: string, zipPath: string): Promise<void> {
  const zipBytes = fs.readFileSync(zipPath);
  const res = await fetch(
    `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${encodeURIComponent(extensionId)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-goog-api-version': '2',
        'Content-Type': 'application/zip',
      },
      body: zipBytes,
    }
  );

  const data = (await res.json()) as CwsUploadResponse;
  if (!res.ok || data.uploadState === 'FAILURE') {
    const details =
      data.itemError?.map((e) => `${e.error_code}: ${e.error_detail}`).join('; ') ||
      JSON.stringify(data);
    throw new Error(`Chrome Web Store upload failed (${res.status}): ${details}`);
  }

  console.log(`Uploaded ${path.basename(zipPath)} (uploadState=${data.uploadState || 'OK'})`);
}

async function publishItem(extensionId: string, accessToken: string): Promise<void> {
  const target = process.env.CWS_PUBLISH_TARGET?.trim() || 'default';
  const res = await fetch(
    `https://www.googleapis.com/chromewebstore/v1.1/items/${encodeURIComponent(
      extensionId
    )}/publish?publishTarget=${encodeURIComponent(target)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-goog-api-version': '2',
        'Content-Length': '0',
      },
    }
  );

  const data = (await res.json()) as CwsPublishResponse;
  if (!res.ok) {
    throw new Error(`Chrome Web Store publish failed (${res.status}): ${JSON.stringify(data)}`);
  }

  console.log(
    `Published item ${extensionId}: ${(data.status || ['OK']).join(', ')} ${
      data.statusDetail?.join(' ') || ''
    }`.trim()
  );
}

async function main() {
  const extensionId = process.env.CWS_EXTENSION_ID?.trim();
  const clientId = process.env.CWS_CLIENT_ID?.trim();
  const clientSecret = process.env.CWS_CLIENT_SECRET?.trim();
  const refreshToken = process.env.CWS_REFRESH_TOKEN?.trim();

  if (!extensionId || !clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing required Chrome Web Store environment variables: CWS_EXTENSION_ID, CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN.'
    );
  }

  const zipPath = findChromeZip();
  console.log(`Preparing Chrome Web Store upload for ${zipPath}...`);

  const accessToken = await fetchAccessToken(clientId, clientSecret, refreshToken);
  await uploadZip(extensionId, accessToken, zipPath);

  if (process.env.CWS_PUBLISH !== 'false') {
    await publishItem(extensionId, accessToken);
  } else {
    console.log('CWS_PUBLISH=false — uploaded as draft without submitting for review.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
