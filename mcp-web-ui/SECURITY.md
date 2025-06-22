# MCP Web UI Framework - Security Documentation

## 🔒 Security Overview

This document outlines the security measures implemented in the MCP Web UI Framework and provides guidance for secure deployment and usage.

## ✅ Security Improvements Implemented

### 1. **XSS (Cross-Site Scripting) Protection**

**Problem**: Original code directly embedded user input into HTML templates without escaping.

**Solution**:
- Added `escapeHtml()` function for proper HTML escaping
- Added `safeJsonStringify()` for secure JSON embedding in templates
- All user-controlled data is now properly escaped before rendering

```typescript
// ✅ SECURE: Proper HTML escaping
const safeTitle = escapeHtml(data.schema.title);
return `<h1>${safeTitle}</h1>`;

// ✅ SECURE: Safe JSON embedding
data: ${safeJsonStringify(data.initialData)},
```

### 2. **Authentication Security**

**Problem**: Simple token comparison vulnerable to timing attacks.

**Solution**:
- Implemented timing-safe token comparison
- Constant-time comparison prevents token enumeration
- All endpoints now require authentication (except static files)

```typescript
// ✅ SECURE: Timing-safe comparison
let isValid = true;
for (let i = 0; i < token.length; i++) {
    if (token[i] !== expectedToken[i]) {
        isValid = false;
    }
}
```

### 3. **Input Validation & Rate Limiting**

**Problem**: No validation on session extension, potential for abuse.

**Solution**:
- Session extension limited to 5-120 minutes
- Rate limiting: max 5 sessions per user per hour
- Expired sessions cannot be extended
- Request body size limits (1MB)

```typescript
// ✅ SECURE: Input validation
if (typeof minutes !== 'number' || minutes < 5 || minutes > 120) {
    return res.status(400).json({ error: 'Invalid extension time' });
}
```

### 4. **Security Headers**

**Problem**: Missing security headers allowed various attacks.

**Solution**:
- Content Security Policy (CSP) prevents XSS
- X-Frame-Options prevents clickjacking
- X-Content-Type-Options prevents MIME sniffing
- Referrer Policy controls information leakage

```typescript
// ✅ SECURE: Comprehensive security headers
res.setHeader('Content-Security-Policy', 
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com;");
res.setHeader('X-Frame-Options', 'DENY');
res.setHeader('X-Content-Type-Options', 'nosniff');
```

### 5. **Information Disclosure Prevention**

**Problem**: Health endpoint exposed sensitive session and user IDs.

**Solution**:
- Removed sensitive data from health endpoint
- Health endpoint now requires authentication
- Generic error messages don't leak implementation details

```typescript
// ✅ SECURE: No sensitive data exposure
data: {
    status: 'active',  // No session ID or user ID
    expiresAt: this.session.expiresAt,
    uptime: Date.now() - this.session.startTime.getTime()
}
```

## 🎯 Security Features

### Multi-Tenant Isolation
- Each session has a unique UUID token
- Sessions are isolated by user ID
- No cross-user data access possible
- Automatic session cleanup prevents resource exhaustion

### Session Security
- Cryptographically secure UUID tokens
- Configurable session timeouts (default 30 minutes)
- Automatic cleanup of expired sessions
- Rate limiting prevents session flooding

### Network Security
- Configurable binding (localhost vs all interfaces)
- Dynamic port allocation prevents conflicts
- HTTPS support through reverse proxy configuration
- Remote access controls via environment variables

## ⚠️ Security Considerations

### 1. **HTTPS in Production**
Always use HTTPS in production environments:
```bash
# Use reverse proxy (nginx/Apache) for HTTPS termination
# Or configure cloud load balancer with SSL certificates
```

### 2. **Network Isolation**
For maximum security, bind to localhost only:
```typescript
const config = {
    baseUrl: 'localhost',  // Local access only
    bindAddress: '127.0.0.1'
};
```

### 3. **Token Management**
- Tokens are transmitted in URLs - ensure HTTPS
- Consider using Authorization headers instead of query params
- Monitor for token exposure in logs

### 4. **Content Security Policy**
Current CSP allows `unsafe-inline` for AlpineJS compatibility:
```typescript
"script-src 'self' 'unsafe-inline' https://unpkg.com"
```
**Recommendation**: Move to nonce-based CSP for stricter security.

### 5. **Dependency Security**
- AlpineJS loaded from CDN - pin to specific versions
- Regular `npm audit` to check for vulnerabilities
- Keep dependencies updated

## 🔧 Deployment Security Checklist

### Development Environment
- [ ] Use localhost binding only
- [ ] Enable debug logging for security events
- [ ] Use short session timeouts for testing

### Production Environment
- [ ] Deploy behind HTTPS reverse proxy
- [ ] Configure appropriate network binding
- [ ] Disable debug logging
- [ ] Set reasonable session timeouts
- [ ] Monitor failed authentication attempts
- [ ] Implement log aggregation and monitoring
- [ ] Regular security updates

### Infrastructure Security
- [ ] Firewall configuration (only necessary ports)
- [ ] Network segmentation
- [ ] Regular OS security updates
- [ ] Monitoring and alerting for security events
- [ ] Backup and recovery procedures

## 📊 Security Monitoring

### Events to Monitor
- Failed authentication attempts
- Unusual session creation patterns
- Session timeout extensions
- Rate limit violations
- Error patterns that might indicate attacks

### Logging Examples
```typescript
// Security event logging
logger.warn('Authentication failed', {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    path: req.path,
    timestamp: new Date().toISOString()
});

// Rate limit violations
logger.warn('Rate limit exceeded', {
    userId: userId,
    action: 'session_creation',
    count: userLimits.count,
    window: 'hourly'
});
```

## 🚨 Incident Response

### If Security Breach Suspected
1. **Immediate**: Terminate all active sessions
2. **Investigate**: Review logs for attack patterns
3. **Communicate**: Notify users if data potentially compromised
4. **Remediate**: Apply security patches and improvements
5. **Monitor**: Enhanced monitoring post-incident

### Emergency Session Termination
```typescript
// Terminate all sessions for a user
const sessions = sessionManager.getActiveSessions()
    .filter(s => s.userId === suspiciousUserId);
sessions.forEach(s => sessionManager.terminateSession(s.id));
```

## 📚 Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Checklist](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Content Security Policy Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

## 🔄 Security Review Schedule

- **Weekly**: Dependency vulnerability scan (`npm audit`)
- **Monthly**: Security configuration review
- **Quarterly**: Penetration testing
- **Annually**: Comprehensive security audit

---

**Remember**: Security is an ongoing process, not a one-time implementation. Stay updated with the latest security best practices and regularly review your security posture. 