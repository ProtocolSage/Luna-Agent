export declare class SecurityService {
    private static instance;
    constructor();
    static getInstance(): SecurityService;
    initialize(): void;
    logSecurityEvent(event: string, data?: any): void;
    validateOrigin(origin: string): boolean;
    logAuditEvent(event: string, data?: any): void;
    isIPBanned(ip: string): boolean;
    createSession(headers: any, cookies: any): string;
    validateSession(sessionId: string): boolean;
    validateInput(input: any): {
        valid: boolean;
        issues: any[];
    };
    validateAudioData(audioData: ArrayBuffer): boolean;
    validateCSRFToken(token: string): boolean;
    getSecurityMetrics(): any;
    generateCSRFToken(): string;
    checkRateLimit(key: string): boolean;
    sanitizeText(text: string): string;
    cleanup(): void;
    sanitizeInput(input: string): string;
    validateApiKey(key: string): boolean;
    detectPII(text: string): boolean;
    hashSensitiveData(data: string): string;
}
