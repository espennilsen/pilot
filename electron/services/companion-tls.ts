import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { networkInterfaces } from 'os';
import forge from 'node-forge';

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
  } catch { /* Expected: network interface enumeration may fail on some systems */ }
  return addresses;
}

/** Generate a self-signed cert+key pair with SAN entries for localhost + all LAN IPs. */
function generateCert(configDir: string): { cert: Buffer; key: Buffer } {
  const certPath = join(configDir, 'companion-cert.pem');
  const keyPath = join(configDir, 'companion-key.pem');

  const lanIPs = getAllIPv4Addresses();

  if (lanIPs.length > 0) {
    console.log(`[CompanionTLS] Generating cert with SAN IPs: 127.0.0.1, ${lanIPs.join(', ')}`);
  }

  // Generate 2048-bit RSA key pair
  const keys = forge.pki.rsa.generateKeyPair(2048);

  // Create a self-signed certificate
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = Date.now().toString(16);
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 10); // 10 years

  const attrs = [{ name: 'commonName', value: 'Pilot Companion' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  // Build Subject Alternative Names
  const altNames: forge.pki.CertificateField[] = [
    { type: 2, value: 'localhost' }, // DNS
    { type: 7, ip: '127.0.0.1' },   // IP
    { type: 7, ip: '0.0.0.0' },     // IP
    ...lanIPs.map(ip => ({ type: 7 as const, ip })),
  ];

  cert.setExtensions([
    { name: 'keyUsage', critical: true, digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames },
  ]);

  // Self-sign
  cert.sign(keys.privateKey, forge.md.sha256.create());

  // Convert to PEM
  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  const certData = Buffer.from(certPem, 'utf-8');
  const keyData = Buffer.from(keyPem, 'utf-8');

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  writeFileSync(certPath, certData);
  writeFileSync(keyPath, keyData);

  return { cert: certData, key: keyData };
}

/**
 * Check whether an existing cert covers all current LAN IPs.
 * Returns false if any current IP is missing from the cert's SAN list.
 */
function certCoversCurrentIPs(certPath: string): boolean {
  try {
    const certPem = readFileSync(certPath, 'utf-8');
    const cert = forge.pki.certificateFromPem(certPem);

    // Extract SAN IPs from the certificate
    const sanExt = cert.getExtension('subjectAltName') as any;
    if (!sanExt?.altNames) return false;

    const certIPs = new Set<string>();
    for (const alt of sanExt.altNames) {
      if (alt.type === 7 && alt.ip) {
        certIPs.add(alt.ip);
      }
    }

    const currentIPs = getAllIPv4Addresses();
    for (const ip of currentIPs) {
      if (!certIPs.has(ip)) {
        console.log(`[CompanionTLS] Current IP ${ip} not in cert SAN — will regenerate`);
        return false;
      }
    }
    return true;
  } catch {
    /* Expected: cert file may not exist or be malformed */
    return false;
  }
}

/**
 * Ensures TLS certificate and private key exist for Pilot Companion.
 * Generates a self-signed certificate that includes all current LAN IPs
 * in its Subject Alternative Names. Regenerates if IPs have changed.
 *
 * Uses node-forge for pure-JS cert generation (no OpenSSL CLI dependency).
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
