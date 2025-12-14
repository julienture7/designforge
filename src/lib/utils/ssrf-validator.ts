/**
 * SSRF (Server-Side Request Forgery) Validator
 * 
 * Validates image proxy queries to prevent SSRF attacks by detecting:
 * - IPv4/IPv6 addresses
 * - Localhost references
 * - Internal network ranges (127.x, 10.x, 192.168.x, 172.16-31.x)
 * - Protocol schemes (file://, http://, https://)
 * - Path traversal sequences (../)
 * - URL-encoded variants of the above
 * 
 * @see Requirements 3.10, 3.11
 */

// IPv4 pattern: matches standard dotted decimal notation
const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;

// IPv6 pattern: matches various IPv6 formats including compressed
const IPV6_PATTERN = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}$|^(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}$|^(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}$|^::1$/i;

// Localhost patterns
const LOCALHOST_PATTERNS = [
  /^localhost$/i,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^::1$/,
  /^\[::1\]$/,
];

// Internal network ranges
const INTERNAL_NETWORK_PATTERNS = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,           // 10.x.x.x
  /^192\.168\.\d{1,3}\.\d{1,3}$/,              // 192.168.x.x
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/, // 172.16-31.x.x
  /^169\.254\.\d{1,3}\.\d{1,3}$/,              // Link-local
  /^0\.0\.0\.0$/,                               // All interfaces
];

// Protocol schemes that should be blocked
const BLOCKED_PROTOCOLS = [
  /^file:\/\//i,
  /^http:\/\//i,
  /^https:\/\//i,
  /^ftp:\/\//i,
  /^gopher:\/\//i,
  /^data:/i,
  /^javascript:/i,
];

// Path traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//,
  /\.\.\\/, 
  /\.\./,
];

/**
 * URL-decode a string, handling multiple levels of encoding
 * @param input - The potentially URL-encoded string
 * @returns The decoded string
 */
function decodeMultipleLevels(input: string): string {
  let decoded = input;
  let previous = '';
  
  // Decode up to 3 levels to catch double/triple encoding
  for (let i = 0; i < 3 && decoded !== previous; i++) {
    previous = decoded;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // Invalid encoding, return current state
      break;
    }
  }
  
  return decoded;
}

/**
 * Check if a query string contains SSRF attempt patterns
 * @param query - The image search query to validate
 * @returns true if SSRF attempt detected, false otherwise
 */
export function isSSRFAttempt(query: string): boolean {
  if (!query || typeof query !== 'string') {
    return false;
  }

  // Check both original and decoded versions
  const variants = [
    query,
    decodeMultipleLevels(query),
    query.toLowerCase(),
    decodeMultipleLevels(query).toLowerCase(),
  ];

  for (const variant of variants) {
    // Check for IPv4 addresses
    if (IPV4_PATTERN.test(variant)) {
      return true;
    }

    // Check for IPv6 addresses
    if (IPV6_PATTERN.test(variant)) {
      return true;
    }

    // Check for localhost
    for (const pattern of LOCALHOST_PATTERNS) {
      if (pattern.test(variant)) {
        return true;
      }
    }

    // Check for internal network ranges
    for (const pattern of INTERNAL_NETWORK_PATTERNS) {
      if (pattern.test(variant)) {
        return true;
      }
    }

    // Check for blocked protocols
    for (const pattern of BLOCKED_PROTOCOLS) {
      if (pattern.test(variant)) {
        return true;
      }
    }

    // Check for path traversal
    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
      if (pattern.test(variant)) {
        return true;
      }
    }

    // Check for IP addresses embedded in URLs or strings
    // e.g., "http://192.168.1.1/image.jpg" or "image@192.168.1.1"
    const embeddedIPv4 = /(?:^|[^\d])(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?:[^\d]|$)/;
    const match = variant.match(embeddedIPv4);
    if (match) {
      const ip = match[1];
      // Check if the embedded IP is internal
      if (ip && (
        /^127\./.test(ip) ||
        /^10\./.test(ip) ||
        /^192\.168\./.test(ip) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
        /^169\.254\./.test(ip) ||
        /^0\.0\.0\.0$/.test(ip)
      )) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Log an SSRF attempt for security monitoring
 * @param query - The malicious query that was detected
 * @param ip - The IP address of the requester (optional)
 */
export function logSSRFAttempt(query: string, ip?: string): void {
  const logEntry = {
    event: 'ssrf_attempt',
    query,
    ip: ip ?? 'unknown',
    timestamp: new Date().toISOString(),
  };
  
  // Log as warning for security monitoring
  // In production, this should be sent to a proper logging service
  console.warn('[SECURITY]', JSON.stringify(logEntry));
}

/**
 * Validate a query and log if it's an SSRF attempt
 * Combined helper for route handlers
 * @param query - The query to validate
 * @param ip - The requester's IP address
 * @returns true if the query is safe, false if SSRF detected
 */
export function validateAndLogSSRF(query: string, ip?: string): boolean {
  if (isSSRFAttempt(query)) {
    logSSRFAttempt(query, ip);
    return false;
  }
  return true;
}
