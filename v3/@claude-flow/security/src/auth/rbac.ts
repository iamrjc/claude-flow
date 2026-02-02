/**
 * Role-Based Access Control (RBAC)
 *
 * Features:
 * - Role hierarchy (admin > operator > viewer)
 * - Permission mapping
 * - Resource-based permissions
 * - Dynamic permission checks
 *
 * @module @claude-flow/security/auth/rbac
 */

import type { TokenScope } from './token-manager.js';

/**
 * User role enumeration
 */
export enum Role {
  ADMIN = 'admin',
  OPERATOR = 'operator',
  VIEWER = 'viewer',
}

/**
 * Permission types
 */
export enum Permission {
  // Agent permissions
  AGENT_SPAWN = 'agent:spawn',
  AGENT_MANAGE = 'agent:manage',
  AGENT_VIEW = 'agent:view',

  // Memory permissions
  MEMORY_READ = 'memory:read',
  MEMORY_WRITE = 'memory:write',
  MEMORY_DELETE = 'memory:delete',

  // Swarm permissions
  SWARM_CREATE = 'swarm:create',
  SWARM_MANAGE = 'swarm:manage',
  SWARM_VIEW = 'swarm:view',

  // Config permissions
  CONFIG_READ = 'config:read',
  CONFIG_WRITE = 'config:write',

  // User management
  USER_CREATE = 'user:create',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',
  USER_VIEW = 'user:view',

  // Security
  SECURITY_AUDIT = 'security:audit',
  SECURITY_MANAGE = 'security:manage',

  // System
  SYSTEM_ADMIN = 'system:admin',
}

/**
 * Resource types for permission checks
 */
export enum ResourceType {
  AGENT = 'agent',
  SWARM = 'swarm',
  MEMORY = 'memory',
  CONFIG = 'config',
  USER = 'user',
  SECURITY = 'security',
  SYSTEM = 'system',
}

/**
 * Action types
 */
export enum Action {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  EXECUTE = 'execute',
  MANAGE = 'manage',
}

/**
 * Role definition with permissions
 */
export interface RoleDefinition {
  role: Role;
  permissions: Permission[];
  inherits?: Role[];
}

/**
 * Permission check context
 */
export interface PermissionContext {
  userId: string;
  role: Role;
  resource?: {
    type: ResourceType;
    id: string;
    ownerId?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Permission check result
 */
export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Default role definitions
 */
const DEFAULT_ROLES: Map<Role, RoleDefinition> = new Map([
  [
    Role.ADMIN,
    {
      role: Role.ADMIN,
      permissions: [
        // All permissions
        Permission.AGENT_SPAWN,
        Permission.AGENT_MANAGE,
        Permission.AGENT_VIEW,
        Permission.MEMORY_READ,
        Permission.MEMORY_WRITE,
        Permission.MEMORY_DELETE,
        Permission.SWARM_CREATE,
        Permission.SWARM_MANAGE,
        Permission.SWARM_VIEW,
        Permission.CONFIG_READ,
        Permission.CONFIG_WRITE,
        Permission.USER_CREATE,
        Permission.USER_UPDATE,
        Permission.USER_DELETE,
        Permission.USER_VIEW,
        Permission.SECURITY_AUDIT,
        Permission.SECURITY_MANAGE,
        Permission.SYSTEM_ADMIN,
      ],
    },
  ],
  [
    Role.OPERATOR,
    {
      role: Role.OPERATOR,
      permissions: [
        Permission.AGENT_SPAWN,
        Permission.AGENT_MANAGE,
        Permission.AGENT_VIEW,
        Permission.MEMORY_READ,
        Permission.MEMORY_WRITE,
        Permission.SWARM_CREATE,
        Permission.SWARM_MANAGE,
        Permission.SWARM_VIEW,
        Permission.CONFIG_READ,
        Permission.USER_VIEW,
        Permission.SECURITY_AUDIT,
      ],
    },
  ],
  [
    Role.VIEWER,
    {
      role: Role.VIEWER,
      permissions: [
        Permission.AGENT_VIEW,
        Permission.MEMORY_READ,
        Permission.SWARM_VIEW,
        Permission.CONFIG_READ,
        Permission.USER_VIEW,
      ],
    },
  ],
]);

/**
 * RBAC Manager
 */
export class RBACManager {
  private readonly roles = new Map<Role, RoleDefinition>();
  private readonly userRoles = new Map<string, Role>();
  private readonly customPermissions = new Map<string, Set<Permission>>();

  constructor() {
    // Initialize with default roles
    for (const [role, definition] of DEFAULT_ROLES) {
      this.roles.set(role, definition);
    }
  }

  /**
   * Assign a role to a user
   */
  assignRole(userId: string, role: Role): void {
    this.userRoles.set(userId, role);
  }

  /**
   * Get user role
   */
  getUserRole(userId: string): Role | undefined {
    return this.userRoles.get(userId);
  }

  /**
   * Check if user has a specific permission
   */
  hasPermission(userId: string, permission: Permission): boolean {
    const role = this.userRoles.get(userId);
    if (!role) {
      return false;
    }

    // Check custom permissions first
    const customPerms = this.customPermissions.get(userId);
    if (customPerms?.has(permission)) {
      return true;
    }

    // Check role permissions
    const roleDefinition = this.roles.get(role);
    if (!roleDefinition) {
      return false;
    }

    return this.checkRolePermission(roleDefinition, permission);
  }

  /**
   * Check role permission recursively (including inherited roles)
   */
  private checkRolePermission(roleDefinition: RoleDefinition, permission: Permission): boolean {
    if (roleDefinition.permissions.includes(permission)) {
      return true;
    }

    // Check inherited roles
    if (roleDefinition.inherits) {
      for (const inheritedRole of roleDefinition.inherits) {
        const inherited = this.roles.get(inheritedRole);
        if (inherited && this.checkRolePermission(inherited, permission)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check permission with context
   */
  checkPermission(context: PermissionContext, permission: Permission): PermissionResult {
    const { userId, resource } = context;

    // Check if user has permission
    if (!this.hasPermission(userId, permission)) {
      return {
        allowed: false,
        reason: 'User does not have required permission',
      };
    }

    // Resource-based checks
    if (resource) {
      // Owner bypass for non-admin operations
      if (resource.ownerId === userId && permission !== Permission.SYSTEM_ADMIN) {
        return { allowed: true };
      }

      // Additional resource-specific checks can be added here
    }

    return { allowed: true };
  }

  /**
   * Check resource action permission
   */
  checkResourceAction(
    userId: string,
    resourceType: ResourceType,
    action: Action,
    resourceId?: string,
    ownerId?: string
  ): PermissionResult {
    const permission = this.mapResourceAction(resourceType, action);

    if (!permission) {
      return {
        allowed: false,
        reason: 'Invalid resource action combination',
      };
    }

    const context: PermissionContext = {
      userId,
      role: this.getUserRole(userId) || Role.VIEWER,
      resource: resourceId
        ? {
            type: resourceType,
            id: resourceId,
            ownerId,
          }
        : undefined,
    };

    return this.checkPermission(context, permission);
  }

  /**
   * Map resource type and action to permission
   */
  private mapResourceAction(resourceType: ResourceType, action: Action): Permission | null {
    const mapping: Record<ResourceType, Partial<Record<Action, Permission>>> = {
      [ResourceType.AGENT]: {
        [Action.CREATE]: Permission.AGENT_SPAWN,
        [Action.READ]: Permission.AGENT_VIEW,
        [Action.UPDATE]: Permission.AGENT_MANAGE,
        [Action.DELETE]: Permission.AGENT_MANAGE,
        [Action.MANAGE]: Permission.AGENT_MANAGE,
      },
      [ResourceType.MEMORY]: {
        [Action.READ]: Permission.MEMORY_READ,
        [Action.CREATE]: Permission.MEMORY_WRITE,
        [Action.UPDATE]: Permission.MEMORY_WRITE,
        [Action.DELETE]: Permission.MEMORY_DELETE,
      },
      [ResourceType.SWARM]: {
        [Action.CREATE]: Permission.SWARM_CREATE,
        [Action.READ]: Permission.SWARM_VIEW,
        [Action.UPDATE]: Permission.SWARM_MANAGE,
        [Action.DELETE]: Permission.SWARM_MANAGE,
        [Action.MANAGE]: Permission.SWARM_MANAGE,
      },
      [ResourceType.CONFIG]: {
        [Action.READ]: Permission.CONFIG_READ,
        [Action.UPDATE]: Permission.CONFIG_WRITE,
        [Action.DELETE]: Permission.CONFIG_WRITE,
      },
      [ResourceType.USER]: {
        [Action.CREATE]: Permission.USER_CREATE,
        [Action.READ]: Permission.USER_VIEW,
        [Action.UPDATE]: Permission.USER_UPDATE,
        [Action.DELETE]: Permission.USER_DELETE,
      },
      [ResourceType.SECURITY]: {
        [Action.READ]: Permission.SECURITY_AUDIT,
        [Action.MANAGE]: Permission.SECURITY_MANAGE,
      },
      [ResourceType.SYSTEM]: {
        [Action.MANAGE]: Permission.SYSTEM_ADMIN,
      },
    };

    return mapping[resourceType]?.[action] ?? null;
  }

  /**
   * Grant custom permission to a user
   */
  grantPermission(userId: string, permission: Permission): void {
    if (!this.customPermissions.has(userId)) {
      this.customPermissions.set(userId, new Set());
    }
    this.customPermissions.get(userId)!.add(permission);
  }

  /**
   * Revoke custom permission from a user
   */
  revokePermission(userId: string, permission: Permission): void {
    this.customPermissions.get(userId)?.delete(permission);
  }

  /**
   * Get all permissions for a user
   */
  getUserPermissions(userId: string): Permission[] {
    const role = this.userRoles.get(userId);
    const rolePermissions = role ? this.getRolePermissions(role) : [];
    const customPerms = Array.from(this.customPermissions.get(userId) || []);

    return [...new Set([...rolePermissions, ...customPerms])];
  }

  /**
   * Get all permissions for a role
   */
  getRolePermissions(role: Role): Permission[] {
    const roleDefinition = this.roles.get(role);
    if (!roleDefinition) {
      return [];
    }

    const permissions = new Set(roleDefinition.permissions);

    // Add inherited permissions
    if (roleDefinition.inherits) {
      for (const inheritedRole of roleDefinition.inherits) {
        const inherited = this.getRolePermissions(inheritedRole);
        inherited.forEach((p) => permissions.add(p));
      }
    }

    return Array.from(permissions);
  }

  /**
   * Define or update a role
   */
  defineRole(definition: RoleDefinition): void {
    this.roles.set(definition.role, definition);
  }

  /**
   * Convert Permission to TokenScope
   */
  permissionToScope(permission: Permission): TokenScope | null {
    const mapping: Partial<Record<Permission, TokenScope>> = {
      [Permission.AGENT_SPAWN]: 'agent:spawn',
      [Permission.AGENT_MANAGE]: 'agent:manage',
      [Permission.MEMORY_READ]: 'memory:read',
      [Permission.MEMORY_WRITE]: 'memory:write',
      [Permission.SWARM_MANAGE]: 'swarm:manage',
      [Permission.CONFIG_READ]: 'config:read',
      [Permission.CONFIG_WRITE]: 'config:write',
      [Permission.SYSTEM_ADMIN]: 'admin',
    };

    return mapping[permission] ?? null;
  }

  /**
   * Get scopes for a user (for token generation)
   */
  getUserScopes(userId: string): TokenScope[] {
    const permissions = this.getUserPermissions(userId);
    const scopes: TokenScope[] = [];

    for (const permission of permissions) {
      const scope = this.permissionToScope(permission);
      if (scope) {
        scopes.push(scope);
      }
    }

    // Admin role gets 'admin' scope
    if (this.getUserRole(userId) === Role.ADMIN) {
      scopes.push('admin');
    }

    return [...new Set(scopes)];
  }

  /**
   * Check if a role is higher than another
   */
  isRoleHigher(role1: Role, role2: Role): boolean {
    const hierarchy = [Role.VIEWER, Role.OPERATOR, Role.ADMIN];
    const index1 = hierarchy.indexOf(role1);
    const index2 = hierarchy.indexOf(role2);
    return index1 > index2;
  }

  /**
   * Validate role transition
   */
  canChangeRole(adminUserId: string, targetUserId: string, newRole: Role): PermissionResult {
    const adminRole = this.getUserRole(adminUserId);

    if (!adminRole) {
      return { allowed: false, reason: 'Admin user has no role' };
    }

    if (adminRole !== Role.ADMIN) {
      return { allowed: false, reason: 'Only admins can change roles' };
    }

    const targetRole = this.getUserRole(targetUserId);

    // Cannot demote yourself
    if (adminUserId === targetUserId && targetRole === Role.ADMIN && newRole !== Role.ADMIN) {
      return { allowed: false, reason: 'Cannot demote yourself from admin' };
    }

    return { allowed: true };
  }
}

/**
 * Create an RBAC manager
 */
export function createRBACManager(): RBACManager {
  return new RBACManager();
}

/**
 * Middleware helper for permission checking
 */
export function requirePermission(permission: Permission) {
  return (userId: string, rbac: RBACManager): PermissionResult => {
    if (!rbac.hasPermission(userId, permission)) {
      return {
        allowed: false,
        reason: `Missing required permission: ${permission}`,
      };
    }
    return { allowed: true };
  };
}

/**
 * Middleware helper for role checking
 */
export function requireRole(role: Role) {
  return (userId: string, rbac: RBACManager): PermissionResult => {
    const userRole = rbac.getUserRole(userId);

    if (!userRole) {
      return { allowed: false, reason: 'User has no role assigned' };
    }

    if (!rbac.isRoleHigher(userRole, role) && userRole !== role) {
      return {
        allowed: false,
        reason: `Required role: ${role}, user has: ${userRole}`,
      };
    }

    return { allowed: true };
  };
}
