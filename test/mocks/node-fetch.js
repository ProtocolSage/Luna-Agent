// Mock for node-fetch to avoid ESM issues in Jest
const crossFetch = require("cross-fetch");

// Re-export cross-fetch as node-fetch replacement
module.exports = crossFetch;
module.exports.default = crossFetch;

// Add common node-fetch exports
module.exports.Headers = crossFetch.Headers;
module.exports.Request = crossFetch.Request;
module.exports.Response = crossFetch.Response;
