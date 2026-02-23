import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { tmpdir, networkInterfaces } from 'os';

/** Collect all non-internal IPv4 addresses from the system. */
function getAllIPv4Addresses(): string[] {
  const addresses: string[] = [];
  try {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const iface of nets[name] ?? []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push(iface.address);
        }
      }
    }
  } catch { /* ignore */ }
  return addresses;
}

/** Build an OpenSSL config with SAN entries for localhost + all LAN IPs. */
function buildOpensslConfig(extraIPs: string[]): string {
  const ipEntries = [
    'IP.1 = 127.0.0.1',
    'IP.2 = 0.0.0.0',
    ...extraIPs.map((ip, i) => `IP.${i + 3} = ${ip}`),
  ].join('\n');

  return `
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = Pilot Companion

[v3_req]
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
${ipEntries}
`.trim();
}

/** Generate a cert+key pair and write them to disk. */
function generateCert(configDir: string): { cert: Buffer; key: Buffer } {
  const certPath = join(configDir, 'companion-cert.pem');
  const keyPath = join(configDir, 'companion-key.pem');
  const tempConfigPath = join(tmpdir(), `pilot-openssl-${Date.now()}.cnf`);

  const lanIPs = getAllIPv4Addresses();
  const opensslConfig = buildOpensslConfig(lanIPs);

  if (lanIPs.length > 0) {
    console.log(`[CompanionTLS] Generating cert with SAN IPs: 127.0.0.1, ${lanIPs.join(', ')}`);
  }

  try {
    writeFileSync(tempConfigPath, opensslConfig);

    const keyData = execSync('openssl genrsa 2048', { encoding: 'buffer' });
    const certData = execSync(
      `openssl req -new -x509 -key /dev/stdin -out /dev/stdout -days 3650 -config "${tempConfigPath}"`,
      { input: keyData, encoding: 'buffer' }
    );

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    writeFileSync(certPath, certData);
    writeFileSync(keyPath, keyData);

    return { cert: certData, key: keyData };
  } catch (error) {
    if (error instanceof Error && error.message.includes('openssl')) {
      throw new Error(
        'OpenSSL not found. Please install OpenSSL to generate TLS certificates for Pilot Companion.'
      );
    }
    throw error;
  } finally {
    if (existsSync(tempConfigPath)) {
      unlinkSync(tempConfigPath);
    }
  }
}

/**
 * Check whether an existing cert covers all current LAN IPs.
 * Returns false if any current IP is missing from the cert's SAN list.
 */
function certCoversCurrentIPs(certPath: string): boolean {
  try {
    const sanText = execSync(
      `openssl x509 -in "${certPath}" -noout -ext subjectAltName 2>/dev/null`,
      { encoding: 'utf-8' }
    );
    const currentIPs = getAllIPv4Addresses();
    for (const ip of currentIPs) {
      if (!sanText.includes(ip)) {
        console.log(`[CompanionTLS] Current IP ${ip} not in cert SAN — will regenerate`);
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures TLS certificate and private key exist for Pilot Companion.
 * Generates a self-signed certificate that includes all current LAN IPs
 * in its Subject Alternative Names. Regenerates if IPs have changed.
 *
 * @param configDir - Directory to store/read cert and key files
 * @returns Promise resolving to cert and key as Buffers
 */
export async function ensureTLSCert(configDir: string): Promise<{ cert: Buffer; key: Buffer }> {
  const certPath = join(configDir, 'companion-cert.pem');
  const keyPath = join(configDir, 'companion-key.pem');

  // If cert exists, check it still covers all current LAN IPs
  if (existsSync(certPath) && existsSync(keyPath)) {
    if (certCoversCurrentIPs(certPath)) {
      return {
        cert: readFileSync(certPath),
        key: readFileSync(keyPath),
      };
    }
    // IPs changed — regenerate
    console.log('[CompanionTLS] Regenerating cert to include new network interfaces');
  }

  return generateCert(configDir);
}

/**
 * Force-regenerate the TLS cert (e.g. after network change).
 * Returns the new cert+key for hot-swapping on a running server.
 */
export async function regenerateTLSCert(configDir: string): Promise<{ cert: Buffer; key: Buffer }> {
  console.log('[CompanionTLS] Force-regenerating TLS cert');
  return generateCert(configDir);
}
