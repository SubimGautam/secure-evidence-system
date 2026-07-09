const helmet = require('helmet');

// Defaults cover most of the OWASP secure-headers baseline (X-Content-Type-Options,
// X-Frame-Options, Referrer-Policy, etc). CSP is tightened explicitly because the
// SPA is served from a separate origin/container than this API.
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
});

module.exports = securityHeaders;
