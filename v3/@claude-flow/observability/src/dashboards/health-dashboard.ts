/**
 * Health Dashboard - /health endpoint, component status, ready/live probes
 *
 * Features:
 * - HTTP health endpoint
 * - Component health checks
 * - Liveness probes
 * - Readiness probes
 * - Startup probes
 * - Dependency health tracking
 * - Aggregated health status
 */

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  message?: string;
  lastCheck: number;
  responseTime?: number;
  metadata?: Record<string, unknown>;
}

export interface HealthCheckResult {
  status: HealthStatus;
  message?: string;
  metadata?: Record<string, unknown>;
}

export type HealthCheck = () => Promise<HealthCheckResult>;

export interface HealthDashboardConfig {
  port?: number;
  path?: string;
  enableHTTP?: boolean;
  checkInterval?: number;
  timeout?: number;
}

export interface AggregatedHealth {
  status: HealthStatus;
  timestamp: number;
  uptime: number;
  components: ComponentHealth[];
  version?: string;
  environment?: string;
}

export class HealthDashboard {
  private components = new Map<string, HealthCheck>();
  private componentHealth = new Map<string, ComponentHealth>();
  private config: Required<HealthDashboardConfig>;
  private startTime: number;
  private intervalHandle?: NodeJS.Timeout;

  constructor(config: HealthDashboardConfig = {}) {
    this.config = {
      port: config.port ?? 3000,
      path: config.path ?? '/health',
      enableHTTP: config.enableHTTP ?? true,
      checkInterval: config.checkInterval ?? 30000, // 30 seconds
      timeout: config.timeout ?? 5000,
    };
    this.startTime = Date.now();
  }

  /**
   * Register a component health check
   */
  registerComponent(name: string, check: HealthCheck): void {
    this.components.set(name, check);
  }

  /**
   * Unregister a component health check
   */
  unregisterComponent(name: string): void {
    this.components.delete(name);
    this.componentHealth.delete(name);
  }

  /**
   * Check health of a specific component
   */
  async checkComponent(name: string): Promise<ComponentHealth> {
    const check = this.components.get(name);
    if (!check) {
      return {
        name,
        status: 'unhealthy',
        message: 'Component not registered',
        lastCheck: Date.now(),
      };
    }

    const startTime = Date.now();

    try {
      const result = await this.withTimeout(check(), this.config.timeout);
      const responseTime = Date.now() - startTime;

      const health: ComponentHealth = {
        name,
        status: result.status,
        message: result.message,
        lastCheck: Date.now(),
        responseTime,
        metadata: result.metadata,
      };

      this.componentHealth.set(name, health);
      return health;
    } catch (error) {
      const health: ComponentHealth = {
        name,
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Health check failed',
        lastCheck: Date.now(),
        responseTime: Date.now() - startTime,
      };

      this.componentHealth.set(name, health);
      return health;
    }
  }

  /**
   * Check health of all components
   */
  async checkAll(): Promise<ComponentHealth[]> {
    const checks = Array.from(this.components.keys()).map((name) =>
      this.checkComponent(name)
    );
    return Promise.all(checks);
  }

  /**
   * Get aggregated health status
   */
  async getHealth(): Promise<AggregatedHealth> {
    const components = await this.checkAll();

    // Determine overall status
    let status: HealthStatus = 'healthy';
    for (const component of components) {
      if (component.status === 'unhealthy') {
        status = 'unhealthy';
        break;
      } else if (component.status === 'degraded') {
        status = 'degraded';
      }
    }

    return {
      status,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      components,
      version: '3.0.0-alpha.1',
      environment: process.env.NODE_ENV ?? 'development',
    };
  }

  /**
   * Liveness probe - indicates if the application is running
   */
  async liveness(): Promise<{ alive: boolean }> {
    // Simple check - if we can respond, we're alive
    return { alive: true };
  }

  /**
   * Readiness probe - indicates if the application can serve traffic
   */
  async readiness(): Promise<{ ready: boolean; components: string[] }> {
    const components = await this.checkAll();
    const unhealthyComponents = components
      .filter((c) => c.status === 'unhealthy')
      .map((c) => c.name);

    return {
      ready: unhealthyComponents.length === 0,
      components: unhealthyComponents,
    };
  }

  /**
   * Startup probe - indicates if the application has finished starting
   */
  async startup(): Promise<{ started: boolean; components: string[] }> {
    const components = await this.checkAll();
    const notStartedComponents = components
      .filter((c) => c.status === 'unhealthy')
      .map((c) => c.name);

    return {
      started: notStartedComponents.length === 0,
      components: notStartedComponents,
    };
  }

  /**
   * Start periodic health checks
   */
  start(): void {
    if (this.intervalHandle) return;

    // Run initial check
    this.checkAll().catch((error) => {
      console.error('Initial health check failed:', error);
    });

    // Start periodic checks
    this.intervalHandle = setInterval(() => {
      this.checkAll().catch((error) => {
        console.error('Periodic health check failed:', error);
      });
    }, this.config.checkInterval);
  }

  /**
   * Stop periodic health checks
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
  }

  /**
   * Get cached component health
   */
  getCachedHealth(name: string): ComponentHealth | undefined {
    return this.componentHealth.get(name);
  }

  /**
   * Get all cached component health
   */
  getAllCachedHealth(): ComponentHealth[] {
    return Array.from(this.componentHealth.values());
  }

  /**
   * Create HTTP response for health endpoint
   */
  async createHealthResponse(): Promise<{
    status: number;
    body: AggregatedHealth;
  }> {
    const health = await this.getHealth();

    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

    return {
      status: statusCode,
      body: health,
    };
  }

  /**
   * Utility to wrap promise with timeout
   */
  private withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), timeout)
      ),
    ]);
  }

  /**
   * Get uptime in seconds
   */
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get uptime formatted
   */
  getUptimeFormatted(): string {
    const uptime = this.getUptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
  }
}

/**
 * Global health dashboard instance
 */
export const healthDashboard = new HealthDashboard();

/**
 * Create a new health dashboard
 */
export function createHealthDashboard(config?: HealthDashboardConfig): HealthDashboard {
  return new HealthDashboard(config);
}

/**
 * Built-in health checks
 */

/**
 * Memory health check
 */
export function memoryHealthCheck(thresholdMB: number = 1000): HealthCheck {
  return async () => {
    const used = process.memoryUsage();
    const heapUsedMB = used.heapUsed / 1024 / 1024;

    if (heapUsedMB > thresholdMB) {
      return {
        status: 'degraded',
        message: `Memory usage high: ${heapUsedMB.toFixed(2)} MB`,
        metadata: { heapUsedMB },
      };
    }

    return {
      status: 'healthy',
      message: `Memory usage: ${heapUsedMB.toFixed(2)} MB`,
      metadata: { heapUsedMB },
    };
  };
}

/**
 * Database health check
 */
export function databaseHealthCheck(checkConnection: () => Promise<boolean>): HealthCheck {
  return async () => {
    try {
      const connected = await checkConnection();
      if (connected) {
        return { status: 'healthy', message: 'Database connected' };
      }
      return { status: 'unhealthy', message: 'Database not connected' };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Database check failed',
      };
    }
  };
}

/**
 * API health check
 */
export function apiHealthCheck(url: string, timeout: number = 5000): HealthCheck {
  return async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { status: 'healthy', message: `API reachable: ${url}` };
      }

      return {
        status: 'degraded',
        message: `API returned ${response.status}`,
        metadata: { statusCode: response.status },
      };
    } catch (error) {
      clearTimeout(timeoutId);
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'API unreachable',
      };
    }
  };
}

/**
 * Disk space health check
 */
export function diskSpaceHealthCheck(thresholdPercent: number = 90): HealthCheck {
  return async () => {
    // This is a placeholder - actual implementation would check disk space
    // using fs.statfs or similar
    return {
      status: 'healthy',
      message: 'Disk space check not implemented',
      metadata: { thresholdPercent },
    };
  };
}
