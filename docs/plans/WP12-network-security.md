# WP12: Network Security Layer

## Metadata
- **Wave:** 3 (Network Infrastructure)
- **Dependencies:** WP03 (Discovery), WP09 (Provider uses security)
- **Effort:** Medium
- **Package:** `@claude-flow/network`

## Objective

Implement security controls for network agent communication including authentication, encryption, and access control.

## Requirements

### Functional Requirements

1. **Authentication**
   - API key authentication
   - Mutual TLS (mTLS) option
   - IP allowlisting

2. **Encryption**
   - TLS for transport security
   - Certificate management

3. **Access Control**
   - Network CIDR restrictions
   - Per-agent permissions
   - Rate limiting

### Technical Specifications

```typescript
// v3/@claude-flow/network/src/security.ts
export interface NetworkSecurityConfig {
  authentication: {
    method: 'none' | 'api-key' | 'mtls';
    apiKey?: string;
    allowedIPs?: string[];  // CIDR notation
  };
  tls?: {
    enabled: boolean;
    certPath?: string;
    keyPath?: string;
    caCertPath?: string;
  };
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

export class NetworkSecurity {
  constructor(config: NetworkSecurityConfig);

  // Authentication
  async authenticate(request: IncomingRequest): Promise<AuthResult>;
  generateApiKey(): string;
  validateApiKey(key: string): boolean;

  // IP validation
  isIPAllowed(ip: string): boolean;
  addAllowedNetwork(cidr: string): void;
  removeAllowedNetwork(cidr: string): void;

  // TLS
  getTLSOptions(): TLSOptions | null;

  // Rate limiting
  checkRateLimit(agentId: string): RateLimitResult;
  recordRequest(agentId: string, tokens: number): void;
}

export interface AuthResult {
  authenticated: boolean;
  agentId?: string;
  reason?: string;
}
```

### Security Modes

| Mode | Use Case | Configuration |
|------|----------|---------------|
| `none` | Development, trusted LAN | No auth required |
| `api-key` | Shared secret | Simple header auth |
| `mtls` | Production, zero-trust | Cert-based auth |

## Implementation Tasks

- [ ] Create `NetworkSecurity` class
- [ ] Implement API key generation/validation
- [ ] Implement IP CIDR checking
- [ ] Add TLS configuration handling
- [ ] Implement rate limiting with sliding window
- [ ] Create authentication middleware
- [ ] Create unit tests
- [ ] Document security configuration

## Acceptance Criteria

1. ✅ API key auth blocks unauthorized requests
2. ✅ IP allowlisting works with CIDR
3. ✅ TLS configuration applies correctly
4. ✅ Rate limiting enforced
5. ✅ Security auditable

## Files to Create

```
v3/@claude-flow/network/src/
├── security.ts
├── rate-limiter.ts
├── ip-validator.ts
└── tests/security.test.ts
```

## References

- Plan Section: 2.1.6 Security Model
