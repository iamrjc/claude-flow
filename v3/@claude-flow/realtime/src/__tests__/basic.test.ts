/**
 * Basic WebSocket Tests
 * Simple tests to verify core functionality
 */

import { describe, it, expect } from 'vitest';
import {
  MessageSerializer,
  VersionNegotiator,
  MessageValidator,
} from '../protocol/message-types.js';

describe('Protocol Layer - Basic Tests', () => {
  it('should serialize and deserialize messages', () => {
    const msg = MessageSerializer.create('ping', {});
    const serialized = MessageSerializer.serialize(msg);
    const deserialized = MessageSerializer.deserialize(serialized);

    expect(deserialized).toEqual(msg);
  });

  it('should generate unique message IDs', () => {
    const id1 = MessageSerializer.generateId();
    const id2 = MessageSerializer.generateId();

    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe('string');
    expect(typeof id2).toBe('string');
  });

  it('should create messages with defaults', () => {
    const msg = MessageSerializer.create('subscribe', {
      topics: ['test'],
    });

    expect(msg.id).toBeDefined();
    expect(msg.type).toBe('subscribe');
    expect(msg.version).toBeDefined();
    expect(msg.timestamp).toBeDefined();
    expect(msg.topics).toEqual(['test']);
  });

  it('should check if version is supported', () => {
    expect(VersionNegotiator.isSupported('1.0.0')).toBe(true);
    expect(VersionNegotiator.isSupported('0.0.1')).toBe(false);
  });

  it('should select best version', () => {
    const version = VersionNegotiator.selectVersion(['1.0.0', '0.9.0']);
    expect(version).toBe('1.0.0');
  });

  it('should return null for no compatible versions', () => {
    const version = VersionNegotiator.selectVersion(['0.0.1']);
    expect(version).toBeNull();
  });

  it('should validate valid messages', () => {
    const msg = MessageSerializer.create('ping', {});
    expect(MessageValidator.validate(msg)).toBe(true);
  });

  it('should reject invalid messages', () => {
    expect(MessageValidator.validate(null)).toBe(false);
    expect(MessageValidator.validate({})).toBe(false);
    expect(MessageValidator.validate({ id: 'test' })).toBe(false);
  });

  it('should validate subscribe messages', () => {
    const subMsg = MessageSerializer.create('subscribe', {
      topics: ['test'],
    });
    expect(MessageValidator.validate(subMsg)).toBe(true);
  });

  it('should validate publish messages', () => {
    const pubMsg = MessageSerializer.create('publish', {
      topic: 'test.topic',
      data: { hello: 'world' },
    });
    expect(MessageValidator.validate(pubMsg)).toBe(true);
  });
});
