/**
 * Circuit Breaker Service
 * Prevents cascading failures by temporarily disabling failing services
 * Implements the Circuit Breaker pattern for voice system resilience
 */

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Service disabled due to failures
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

interface CircuitBreakerConfig {
  failureThreshold: number;    // Number of failures before opening
  successThreshold: number;    // Number of successes to close from half-open
  timeout: number;            // Time to wait before trying half-open (ms)
  monitoringWindow: number;   // Time window to track failures (ms)
}

interface CircuitBreakerStats {
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  state: CircuitState;
  nextAttempt: number;
}

export class CircuitBreakerService {
  private circuits: Map<string, CircuitBreakerStats> = new Map();
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: 5,      // Open after 5 failures
      successThreshold: 3,      // Close after 3 successes in half-open
      timeout: 60000,          // Wait 1 minute before retry
      monitoringWindow: 300000, // 5 minute window
      ...config
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    circuitName: string,
    fn: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    const circuit = this.getOrCreateCircuit(circuitName);

    // Check if circuit is open
    if (circuit.state === CircuitState.OPEN) {
      if (Date.now() < circuit.nextAttempt) {
        console.log(`Circuit breaker '${circuitName}' is OPEN, using fallback`);
        if (fallback) {
          return await fallback();
        }
        throw new Error(`Circuit breaker '${circuitName}' is OPEN. Service temporarily unavailable.`);
      } else {
        // Move to half-open state to test
        circuit.state = CircuitState.HALF_OPEN;
        circuit.successCount = 0;
        console.log(`Circuit breaker '${circuitName}' moving to HALF_OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess(circuitName);
      return result;
    } catch (error) {
      this.onFailure(circuitName);
      
      // If we have a fallback, use it instead of throwing
      if (fallback && circuit.state === CircuitState.OPEN) {
        console.log(`Circuit breaker '${circuitName}' failed, using fallback`);
        return await fallback();
      }
      
      throw error;
    }
  }

  /**
   * Check if a circuit allows execution
   */
  canExecute(circuitName: string): boolean {
    const circuit = this.getOrCreateCircuit(circuitName);
    
    if (circuit.state === CircuitState.CLOSED) {
      return true;
    }
    
    if (circuit.state === CircuitState.OPEN) {
      return Date.now() >= circuit.nextAttempt;
    }
    
    // HALF_OPEN - allow execution
    return true;
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getCircuitStatus(circuitName: string): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    nextAttempt?: number;
  } {
    const circuit = this.getOrCreateCircuit(circuitName);
    return {
      state: circuit.state,
      failureCount: circuit.failureCount,
      successCount: circuit.successCount,
      nextAttempt: circuit.state === CircuitState.OPEN ? circuit.nextAttempt : undefined
    };
  }

  /**
   * Manually reset a circuit breaker
   */
  reset(circuitName: string): void {
    const circuit = this.getOrCreateCircuit(circuitName);
    circuit.state = CircuitState.CLOSED;
    circuit.failureCount = 0;
    circuit.successCount = 0;
    circuit.nextAttempt = 0;
    console.log(`Circuit breaker '${circuitName}' manually reset`);
  }

  /**
   * Get all circuit breaker states for monitoring
   */
  getAllCircuitStates(): Record<string, any> {
    const states: Record<string, any> = {};
    this.circuits.forEach((circuit, name) => {
      states[name] = {
        state: circuit.state,
        failureCount: circuit.failureCount,
        successCount: circuit.successCount,
        lastFailureTime: circuit.lastFailureTime,
        lastSuccessTime: circuit.lastSuccessTime,
        nextAttempt: circuit.nextAttempt
      };
    });
    return states;
  }

  private getOrCreateCircuit(circuitName: string): CircuitBreakerStats {
    if (!this.circuits.has(circuitName)) {
      this.circuits.set(circuitName, {
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0,
        lastSuccessTime: 0,
        state: CircuitState.CLOSED,
        nextAttempt: 0
      });
    }
    return this.circuits.get(circuitName)!;
  }

  private onSuccess(circuitName: string): void {
    const circuit = this.getOrCreateCircuit(circuitName);
    circuit.lastSuccessTime = Date.now();
    circuit.successCount++;

    if (circuit.state === CircuitState.HALF_OPEN) {
      if (circuit.successCount >= this.config.successThreshold) {
        // Close the circuit - service is healthy again
        circuit.state = CircuitState.CLOSED;
        circuit.failureCount = 0;
        circuit.successCount = 0;
        console.log(`Circuit breaker '${circuitName}' closed - service recovered`);
      }
    } else if (circuit.state === CircuitState.CLOSED) {
      // Reset failure count on success in normal operation
      circuit.failureCount = Math.max(0, circuit.failureCount - 1);
    }
  }

  private onFailure(circuitName: string): void {
    const circuit = this.getOrCreateCircuit(circuitName);
    circuit.lastFailureTime = Date.now();
    circuit.failureCount++;

    // Clean old failures outside monitoring window
    const windowStart = Date.now() - this.config.monitoringWindow;
    if (circuit.lastFailureTime < windowStart) {
      circuit.failureCount = 1; // Reset to current failure
    }

    if (circuit.state === CircuitState.HALF_OPEN) {
      // Failed in half-open, go back to open
      circuit.state = CircuitState.OPEN;
      circuit.nextAttempt = Date.now() + this.config.timeout;
      console.log(`Circuit breaker '${circuitName}' failed in HALF_OPEN, going back to OPEN`);
    } else if (circuit.state === CircuitState.CLOSED) {
      // Check if we should open the circuit
      if (circuit.failureCount >= this.config.failureThreshold) {
        circuit.state = CircuitState.OPEN;
        circuit.nextAttempt = Date.now() + this.config.timeout;
        console.log(`Circuit breaker '${circuitName}' opened due to ${circuit.failureCount} failures`);
      }
    }
  }
}

// Singleton instance for global circuit breaker management
let circuitBreakerService: CircuitBreakerService | null = null;

export function getCircuitBreakerService(): CircuitBreakerService {
  if (!circuitBreakerService) {
    circuitBreakerService = new CircuitBreakerService({
      failureThreshold: 3,      // More aggressive for voice services
      successThreshold: 2,      // Faster recovery
      timeout: 30000,          // 30 second cooldown
      monitoringWindow: 120000  // 2 minute window
    });
  }
  return circuitBreakerService;
}

export function destroyCircuitBreakerService(): void {
  circuitBreakerService = null;
}