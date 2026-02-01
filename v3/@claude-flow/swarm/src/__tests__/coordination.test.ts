/**
 * Coordination Engine Tests
 * Comprehensive tests for multi-agent coordination, messaging, and consensus
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CoordinationSession,
  SessionId,
  SessionState,
} from '../domain/models/coordination-session.js';
import {
  Message,
  MessageType,
  MessagePriority,
} from '../domain/models/message.js';
import {
  Proposal,
  Vote,
  ConsensusAlgorithm,
  ProposalStatus,
} from '../domain/models/consensus.js';
import {
  CoordinationService,
  createCoordinationService,
} from '../application/services/coordination-service.js';
import {
  ConsensusService,
  createConsensusService,
} from '../application/services/consensus-service.js';
import {
  EventMessageBus,
  createEventMessageBus,
} from '../infrastructure/messaging/event-message-bus.js';
import {
  Mailbox,
  createMailbox,
} from '../infrastructure/messaging/mailbox.js';

// ===== COORDINATION SESSION TESTS =====

describe('CoordinationSession', () => {
  describe('Session Lifecycle', () => {
    it('should create a new session', () => {
      const session = CoordinationSession.create('test');

      expect(session.id).toBeDefined();
      expect(session.state).toBe(SessionState.INITIALIZING);
      expect(session.createdAt).toBeInstanceOf(Date);
    });

    it('should start a session', () => {
      const session = CoordinationSession.create();
      session.start();

      expect(session.state).toBe(SessionState.ACTIVE);
    });

    it('should pause and resume a session', () => {
      const session = CoordinationSession.create();
      session.start();
      session.pause();

      expect(session.state).toBe(SessionState.PAUSED);

      session.resume();
      expect(session.state).toBe(SessionState.ACTIVE);
    });

    it('should complete a session', () => {
      const session = CoordinationSession.create();
      session.start();
      session.complete();

      expect(session.state).toBe(SessionState.COMPLETED);
      expect(session.completedAt).toBeInstanceOf(Date);
    });

    it('should fail a session with reason', () => {
      const session = CoordinationSession.create();
      session.start();
      session.fail('Test failure');

      expect(session.state).toBe(SessionState.FAILED);
      expect(session.metadata.failureReason).toBe('Test failure');
    });

    it('should throw error on invalid state transitions', () => {
      const session = CoordinationSession.create();

      expect(() => session.pause()).toThrow();
      expect(() => session.resume()).toThrow();
    });
  });

  describe('Participant Management', () => {
    let session: CoordinationSession;

    beforeEach(() => {
      session = CoordinationSession.create();
    });

    it('should add participants', () => {
      session.addParticipant('agent-1', 'coordinator');
      session.addParticipant('agent-2', 'worker');

      expect(session.getParticipantCount()).toBe(2);
      expect(session.hasParticipant('agent-1')).toBe(true);
    });

    it('should remove participants', () => {
      session.addParticipant('agent-1', 'coordinator');
      session.removeParticipant('agent-1');

      expect(session.getParticipantCount()).toBe(0);
      expect(session.hasParticipant('agent-1')).toBe(false);
    });

    it('should update participant heartbeat', () => {
      session.addParticipant('agent-1', 'worker');
      const before = session.getParticipant('agent-1')!.lastHeartbeat;

      setTimeout(() => {
        session.updateParticipantHeartbeat('agent-1');
        const after = session.getParticipant('agent-1')!.lastHeartbeat;

        expect(after.getTime()).toBeGreaterThan(before.getTime());
      }, 10);
    });

    it('should update participant status', () => {
      session.addParticipant('agent-1', 'worker');
      session.updateParticipantStatus('agent-1', 'idle');

      expect(session.getParticipant('agent-1')!.status).toBe('idle');
    });

    it('should get active participants only', () => {
      session.addParticipant('agent-1', 'worker');
      session.addParticipant('agent-2', 'worker');
      session.updateParticipantStatus('agent-2', 'disconnected');

      const active = session.getActiveParticipants();
      expect(active).toHaveLength(1);
      expect(active[0].agentId).toBe('agent-1');
    });

    it('should throw when adding duplicate participant', () => {
      session.addParticipant('agent-1', 'worker');
      expect(() => session.addParticipant('agent-1', 'worker')).toThrow();
    });
  });

  describe('Metrics Tracking', () => {
    let session: CoordinationSession;

    beforeEach(() => {
      session = CoordinationSession.create();
    });

    it('should track message count', () => {
      session.incrementMessagesExchanged();
      session.incrementMessagesExchanged();

      expect(session.metrics.messagesExchanged).toBe(2);
    });

    it('should track consensus results', () => {
      session.recordConsensusReached();
      session.recordConsensusReached();
      session.recordConsensusFailed();

      expect(session.metrics.consensusReached).toBe(2);
      expect(session.metrics.consensusFailed).toBe(1);
    });

    it('should track average response time', () => {
      session.updateAverageResponseTime(100);
      session.updateAverageResponseTime(200);

      expect(session.metrics.averageResponseTime).toBeGreaterThan(0);
    });

    it('should track participation rate', () => {
      session.addParticipant('agent-1', 'worker');
      session.addParticipant('agent-2', 'worker');
      session.addParticipant('agent-3', 'worker');

      // All active initially
      expect(session.metrics.participationRate).toBe(1.0);

      // Update statuses to reduce active count
      session.updateParticipantStatus('agent-2', 'idle');
      session.updateParticipantStatus('agent-3', 'disconnected');

      // Only agent-1 is active out of 3 participants
      expect(session.metrics.participationRate).toBeCloseTo(0.333, 1);
    });
  });

  describe('Serialization', () => {
    it('should create snapshot', () => {
      const session = CoordinationSession.create('test');
      session.addParticipant('agent-1', 'coordinator');

      const snapshot = session.toSnapshot();

      expect(snapshot.id).toBeDefined();
      expect(snapshot.state).toBe(SessionState.INITIALIZING);
      expect(snapshot.participants['agent-1']).toBeDefined();
    });

    it('should restore from snapshot', () => {
      const session1 = CoordinationSession.create('test');
      session1.addParticipant('agent-1', 'coordinator');
      session1.start();

      const snapshot = session1.toSnapshot();
      const session2 = CoordinationSession.fromSnapshot(snapshot);

      expect(session2.id.toString()).toBe(session1.id.toString());
      expect(session2.state).toBe(session1.state);
      expect(session2.getParticipantCount()).toBe(1);
    });
  });
});

// ===== MESSAGE TESTS =====

describe('Message', () => {
  describe('Message Creation', () => {
    it('should create a message', () => {
      const message = Message.create({
        from: 'agent-1',
        to: 'agent-2',
        type: MessageType.REQUEST,
        payload: { data: 'test' },
      });

      expect(message.id).toBeDefined();
      expect(message.from).toBe('agent-1');
      expect(message.to).toBe('agent-2');
      expect(message.timestamp).toBeInstanceOf(Date);
    });

    it('should create with default priority and TTL', () => {
      const message = Message.create({
        from: 'agent-1',
        to: 'agent-2',
        type: MessageType.NOTIFICATION,
        payload: {},
      });

      expect(message.priority).toBe(MessagePriority.NORMAL);
      expect(message.ttlMs).toBe(60000);
    });

    it('should create with custom priority', () => {
      const message = Message.create({
        from: 'agent-1',
        to: 'agent-2',
        type: MessageType.REQUEST,
        payload: {},
        priority: MessagePriority.CRITICAL,
      });

      expect(message.priority).toBe(MessagePriority.CRITICAL);
    });
  });

  describe('Message Types', () => {
    it('should identify broadcast messages', () => {
      const message = Message.create({
        from: 'agent-1',
        to: ['agent-2', 'agent-3'],
        type: MessageType.BROADCAST,
        payload: {},
      });

      expect(message.isBroadcast()).toBe(true);
      expect(message.isDirectMessage()).toBe(false);
    });

    it('should identify direct messages', () => {
      const message = Message.create({
        from: 'agent-1',
        to: 'agent-2',
        type: MessageType.REQUEST,
        payload: {},
      });

      expect(message.isDirectMessage()).toBe(true);
      expect(message.isBroadcast()).toBe(false);
    });

    it('should identify request messages', () => {
      const message = Message.create({
        from: 'agent-1',
        to: 'agent-2',
        type: MessageType.REQUEST,
        payload: {},
      });

      expect(message.isRequest()).toBe(true);
      expect(message.isResponse()).toBe(false);
    });
  });

  describe('Message Expiration', () => {
    it('should detect expired messages', async () => {
      const message = Message.create({
        from: 'agent-1',
        to: 'agent-2',
        type: MessageType.NOTIFICATION,
        payload: {},
        ttlMs: 10,
      });

      expect(message.isExpired()).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(message.isExpired()).toBe(true);
    });
  });

  describe('Response Creation', () => {
    it('should create response to request', () => {
      const request = Message.create({
        from: 'agent-1',
        to: 'agent-2',
        type: MessageType.REQUEST,
        payload: { question: 'test' },
        replyTo: 'agent-1',
      });

      const response = request.createResponse({ answer: 'response' });

      expect(response.type).toBe(MessageType.RESPONSE);
      expect(response.to).toBe(request.replyTo);
      expect(response.correlationId).toBe(request.id.toString());
    });

    it('should throw when creating response without replyTo', () => {
      const message = Message.create({
        from: 'agent-1',
        to: 'agent-2',
        type: MessageType.NOTIFICATION,
        payload: {},
      });

      expect(() => message.createResponse({})).toThrow();
    });
  });
});

// ===== CONSENSUS TESTS =====

describe('Consensus', () => {
  describe('Proposal Management', () => {
    it('should create a proposal', () => {
      const proposal = Proposal.create({
        proposerId: 'agent-1',
        value: { decision: 'approve' },
      });

      expect(proposal.id).toBeDefined();
      expect(proposal.proposerId).toBe('agent-1');
      expect(proposal.status).toBe(ProposalStatus.PENDING);
    });

    it('should add votes to proposal', () => {
      const proposal = Proposal.create({
        proposerId: 'agent-1',
        value: {},
      });

      const vote = Vote.create({
        voterId: 'agent-2',
        approve: true,
      });

      proposal.addVote(vote);

      expect(proposal.getVoteCount()).toBe(1);
      expect(proposal.hasVote('agent-2')).toBe(true);
    });

    it('should calculate approval rate', () => {
      const proposal = Proposal.create({
        proposerId: 'agent-1',
        value: {},
      });

      proposal.addVote(Vote.create({ voterId: 'agent-2', approve: true }));
      proposal.addVote(Vote.create({ voterId: 'agent-3', approve: true }));
      proposal.addVote(Vote.create({ voterId: 'agent-4', approve: false }));

      expect(proposal.getApprovalRate()).toBeCloseTo(0.666, 2);
      expect(proposal.getApprovalCount()).toBe(2);
      expect(proposal.getRejectionCount()).toBe(1);
    });

    it('should calculate weighted approval rate', () => {
      const proposal = Proposal.create({
        proposerId: 'agent-1',
        value: {},
      });

      proposal.addVote(Vote.create({ voterId: 'agent-2', approve: true, confidence: 1.0 }));
      proposal.addVote(Vote.create({ voterId: 'agent-3', approve: true, confidence: 0.8 }));
      proposal.addVote(Vote.create({ voterId: 'agent-4', approve: false, confidence: 0.5 }));

      const weightedRate = proposal.getWeightedApprovalRate();
      expect(weightedRate).toBeGreaterThan(0.7);
    });

    it('should accept proposal', () => {
      const proposal = Proposal.create({
        proposerId: 'agent-1',
        value: {},
      });

      proposal.accept();

      expect(proposal.status).toBe(ProposalStatus.ACCEPTED);
      expect(proposal.isAccepted()).toBe(true);
    });

    it('should reject proposal', () => {
      const proposal = Proposal.create({
        proposerId: 'agent-1',
        value: {},
      });

      proposal.reject();

      expect(proposal.status).toBe(ProposalStatus.REJECTED);
      expect(proposal.isRejected()).toBe(true);
    });

    it('should expire proposal after timeout', async () => {
      const proposal = Proposal.create({
        proposerId: 'agent-1',
        value: {},
        timeoutMs: 10,
      });

      expect(proposal.isExpired()).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(proposal.isExpired()).toBe(true);
    });
  });
});

// ===== MESSAGE BUS TESTS =====

describe('EventMessageBus', () => {
  let messageBus: EventMessageBus;

  beforeEach(() => {
    messageBus = createEventMessageBus();
  });

  afterEach(async () => {
    await messageBus.shutdown();
  });

  describe('Topic-Based Routing', () => {
    it('should publish and deliver messages to subscribers', async () => {
      const received: Message[] = [];

      messageBus.subscribe('test-topic', 'agent-1', (msg) => {
        received.push(msg);
        return undefined;
      });

      await messageBus.publish('test-topic', {
        from: 'agent-2',
        to: 'agent-1',
        type: MessageType.NOTIFICATION,
        payload: { data: 'test' },
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(received).toHaveLength(1);
      expect(received[0].payload).toEqual({ data: 'test' });
    });

    it('should deliver to multiple subscribers', async () => {
      const received1: Message[] = [];
      const received2: Message[] = [];

      messageBus.subscribe('test-topic', 'agent-1', (msg) => { received1.push(msg); });
      messageBus.subscribe('test-topic', 'agent-2', (msg) => { received2.push(msg); });

      await messageBus.publish('test-topic', {
        from: 'agent-3',
        to: 'broadcast',
        type: MessageType.BROADCAST,
        payload: {},
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });

    it('should unsubscribe from topics', async () => {
      const received: Message[] = [];

      messageBus.subscribe('test-topic', 'agent-1', (msg) => received.push(msg));
      messageBus.unsubscribe('test-topic', 'agent-1');

      await messageBus.publish('test-topic', {
        from: 'agent-2',
        to: 'agent-1',
        type: MessageType.NOTIFICATION,
        payload: {},
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(received).toHaveLength(0);
    });
  });

  describe('Direct Messaging', () => {
    it('should send direct messages', async () => {
      const messageId = await messageBus.sendDirect({
        from: 'agent-1',
        to: 'agent-2',
        type: MessageType.REQUEST,
        payload: {},
      });

      expect(messageId).toBeDefined();

      const pending = messageBus.getPendingMessages('agent-2');
      expect(pending).toHaveLength(1);
    });

    it('should retrieve pending messages', async () => {
      await messageBus.sendDirect({
        from: 'agent-1',
        to: 'agent-2',
        type: MessageType.NOTIFICATION,
        payload: { msg: 1 },
      });

      await messageBus.sendDirect({
        from: 'agent-1',
        to: 'agent-2',
        type: MessageType.NOTIFICATION,
        payload: { msg: 2 },
      });

      const pending = messageBus.getPendingMessages('agent-2');
      expect(pending).toHaveLength(2);

      // Should clear after retrieval
      const pending2 = messageBus.getPendingMessages('agent-2');
      expect(pending2).toHaveLength(0);
    });
  });

  describe('Broadcast', () => {
    it('should broadcast to all agents', async () => {
      await messageBus.sendDirect({
        from: 'agent-1',
        to: 'agent-1',
        type: MessageType.NOTIFICATION,
        payload: {},
      });

      await messageBus.sendDirect({
        from: 'agent-2',
        to: 'agent-2',
        type: MessageType.NOTIFICATION,
        payload: {},
      });

      await messageBus.broadcast({
        from: 'system',
        type: MessageType.BROADCAST,
        payload: { announcement: 'test' },
      });

      const pending1 = messageBus.getPendingMessages('agent-1');
      const pending2 = messageBus.getPendingMessages('agent-2');

      expect(pending1.length).toBeGreaterThan(0);
      expect(pending2.length).toBeGreaterThan(0);
    });
  });

  describe('Request-Response Pattern', () => {
    it('should handle request-response with manual response', async () => {
      // Manually simulate request-response pattern
      const requestId = await messageBus.sendDirect({
        from: 'agent-1',
        to: 'agent-2',
        type: MessageType.REQUEST,
        payload: { query: 'test' },
        replyTo: 'agent-1',
      });

      // Get the request
      const requests = messageBus.getPendingMessages('agent-2');
      expect(requests).toHaveLength(1);
      expect(requests[0].isRequest()).toBe(true);

      // Send response
      await messageBus.sendDirect({
        from: 'agent-2',
        to: 'agent-1',
        type: MessageType.RESPONSE,
        payload: { result: 'success' },
        correlationId: requests[0].id.toString(),
      });

      // Verify response
      const responses = messageBus.getPendingMessages('agent-1');
      expect(responses).toHaveLength(1);
      expect(responses[0].isResponse()).toBe(true);
      expect(responses[0].payload).toEqual({ result: 'success' });
    });

    it('should timeout on no response', async () => {
      const promise = messageBus.request({
        from: 'agent-1',
        to: 'agent-2',
        type: MessageType.REQUEST,
        payload: {},
      }, { timeout: 100, retries: 1 });

      await expect(promise).rejects.toThrow();
    });
  });

  describe('Statistics', () => {
    it('should track message statistics', async () => {
      await messageBus.sendDirect({
        from: 'agent-1',
        to: 'agent-2',
        type: MessageType.NOTIFICATION,
        payload: {},
      });

      const stats = messageBus.getStats();
      expect(stats.totalMessages).toBeGreaterThan(0);
    });
  });
});

// ===== MAILBOX TESTS =====

describe('Mailbox', () => {
  let mailbox: Mailbox;

  beforeEach(() => {
    mailbox = createMailbox('agent-1');
  });

  afterEach(() => {
    mailbox.shutdown();
  });

  describe('Priority Ordering', () => {
    it('should dequeue messages by priority', () => {
      const msg1 = Message.create({
        from: 'agent-2',
        to: 'agent-1',
        type: MessageType.NOTIFICATION,
        payload: { priority: 'low' },
        priority: MessagePriority.LOW,
      });

      const msg2 = Message.create({
        from: 'agent-2',
        to: 'agent-1',
        type: MessageType.NOTIFICATION,
        payload: { priority: 'critical' },
        priority: MessagePriority.CRITICAL,
      });

      const msg3 = Message.create({
        from: 'agent-2',
        to: 'agent-1',
        type: MessageType.NOTIFICATION,
        payload: { priority: 'normal' },
        priority: MessagePriority.NORMAL,
      });

      mailbox.enqueue(msg1);
      mailbox.enqueue(msg2);
      mailbox.enqueue(msg3);

      const first = mailbox.dequeue();
      expect(first?.priority).toBe(MessagePriority.CRITICAL);

      const second = mailbox.dequeue();
      expect(second?.priority).toBe(MessagePriority.NORMAL);

      const third = mailbox.dequeue();
      expect(third?.priority).toBe(MessagePriority.LOW);
    });
  });

  describe('Capacity Management', () => {
    it('should enforce max size', () => {
      const smallMailbox = createMailbox('agent-1', { maxSize: 2 });

      const msg1 = Message.create({
        from: 'agent-2',
        to: 'agent-1',
        type: MessageType.NOTIFICATION,
        payload: {},
      });

      const msg2 = Message.create({
        from: 'agent-2',
        to: 'agent-1',
        type: MessageType.NOTIFICATION,
        payload: {},
      });

      const msg3 = Message.create({
        from: 'agent-2',
        to: 'agent-1',
        type: MessageType.NOTIFICATION,
        payload: {},
      });

      expect(smallMailbox.enqueue(msg1)).toBe(true);
      expect(smallMailbox.enqueue(msg2)).toBe(true);
      expect(smallMailbox.enqueue(msg3)).toBe(false);
      expect(smallMailbox.isFull()).toBe(true);

      smallMailbox.shutdown();
    });
  });

  describe('Acknowledgment', () => {
    it('should acknowledge messages', () => {
      const msg = Message.create({
        from: 'agent-2',
        to: 'agent-1',
        type: MessageType.REQUEST,
        payload: {},
      });

      mailbox.enqueue(msg);
      const dequeued = mailbox.dequeue();

      mailbox.acknowledge(dequeued!.id.toString());

      // Should not trigger retry
      expect(mailbox.getSize()).toBe(0);
    });
  });

  describe('Batch Operations', () => {
    it('should dequeue batch of messages', () => {
      for (let i = 0; i < 5; i++) {
        mailbox.enqueue(Message.create({
          from: 'agent-2',
          to: 'agent-1',
          type: MessageType.NOTIFICATION,
          payload: { index: i },
        }));
      }

      const batch = mailbox.dequeueBatch(3);
      expect(batch).toHaveLength(3);
      expect(mailbox.getSize()).toBe(2);
    });

    it('should peek batch without removing', () => {
      for (let i = 0; i < 5; i++) {
        mailbox.enqueue(Message.create({
          from: 'agent-2',
          to: 'agent-1',
          type: MessageType.NOTIFICATION,
          payload: { index: i },
        }));
      }

      const batch = mailbox.peekBatch(3);
      expect(batch).toHaveLength(3);
      expect(mailbox.getSize()).toBe(5);
    });
  });

  describe('Statistics', () => {
    it('should track mailbox statistics', () => {
      mailbox.enqueue(Message.create({
        from: 'agent-2',
        to: 'agent-1',
        type: MessageType.NOTIFICATION,
        payload: {},
      }));

      mailbox.dequeue();

      const stats = mailbox.getStats();
      expect(stats.totalReceived).toBe(1);
      expect(stats.totalDelivered).toBe(1);
    });
  });
});

// ===== COORDINATION SERVICE TESTS =====

describe('CoordinationService', () => {
  let service: CoordinationService;
  let messageBus: EventMessageBus;
  let consensusService: ConsensusService;

  beforeEach(() => {
    messageBus = createEventMessageBus();
    consensusService = createConsensusService();
    service = createCoordinationService({
      messageBus,
      consensusService,
    });
  });

  afterEach(async () => {
    await service.shutdown();
    await messageBus.shutdown();
    await consensusService.shutdown();
  });

  describe('Session Management', () => {
    it('should create a new session', async () => {
      const sessionId = await service.createSession({
        namespace: 'test',
      });

      expect(sessionId).toBeDefined();
      expect(service.hasSession(sessionId)).toBe(true);
    });

    it('should join session', async () => {
      const sessionId = await service.createSession();
      await service.joinSession(sessionId, 'agent-1', 'coordinator');

      const session = service.getSession(sessionId);
      expect(session?.hasParticipant('agent-1')).toBe(true);
    });

    it('should leave session', async () => {
      const sessionId = await service.createSession();
      await service.joinSession(sessionId, 'agent-1', 'worker');

      // Give time for join message to be processed
      await new Promise(resolve => setTimeout(resolve, 10));

      await service.leaveSession(sessionId, 'agent-1');

      const session = service.getSession(sessionId);
      expect(session?.hasParticipant('agent-1')).toBe(false);
    });

    it('should start, pause, and resume session', async () => {
      const sessionId = await service.createSession();

      // Add a participant first
      await service.joinSession(sessionId, 'agent-1', 'coordinator');

      await service.startSession(sessionId);

      let session = service.getSession(sessionId);
      expect(session?.state).toBe(SessionState.ACTIVE);

      await service.pauseSession(sessionId);
      session = service.getSession(sessionId);
      expect(session?.state).toBe(SessionState.PAUSED);

      await service.resumeSession(sessionId);
      session = service.getSession(sessionId);
      expect(session?.state).toBe(SessionState.ACTIVE);
    });
  });

  describe('Multi-Agent Coordination', () => {
    it('should coordinate multiple agents', async () => {
      const sessionId = await service.createSession();

      await service.joinSession(sessionId, 'agent-1', 'coordinator');
      await service.joinSession(sessionId, 'agent-2', 'worker');
      await service.joinSession(sessionId, 'agent-3', 'worker');

      await service.startSession(sessionId);

      const session = service.getSession(sessionId);
      expect(session?.getActiveParticipantCount()).toBe(3);
    });

    it('should broadcast messages to all participants', async () => {
      const sessionId = await service.createSession();

      await service.joinSession(sessionId, 'agent-1', 'coordinator');
      await service.joinSession(sessionId, 'agent-2', 'worker');

      await service.startSession(sessionId);

      await service.broadcastMessage(sessionId, {
        from: 'agent-1',
        type: MessageType.NOTIFICATION,
        payload: { announcement: 'test' },
      });

      const session = service.getSession(sessionId);
      expect(session?.metrics.messagesExchanged).toBeGreaterThan(0);
    });

    it('should send direct messages between participants', async () => {
      const sessionId = await service.createSession();

      await service.joinSession(sessionId, 'agent-1', 'coordinator');
      await service.joinSession(sessionId, 'agent-2', 'worker');

      await service.startSession(sessionId);

      await service.sendDirectMessage(sessionId, 'agent-1', 'agent-2', {
        type: MessageType.REQUEST,
        payload: { task: 'process' },
      });

      const session = service.getSession(sessionId);
      expect(session?.metrics.messagesExchanged).toBeGreaterThan(0);
    });
  });

  describe('Consensus Requests', () => {
    it('should request and achieve consensus', async () => {
      const sessionId = await service.createSession();

      await service.joinSession(sessionId, 'agent-1', 'coordinator');
      await service.joinSession(sessionId, 'agent-2', 'worker');
      await service.joinSession(sessionId, 'agent-3', 'worker');

      await service.startSession(sessionId);

      const result = await service.requestConsensus(
        sessionId,
        'agent-1',
        { decision: 'approve' },
        ConsensusAlgorithm.QUORUM
      );

      expect(result).toBeDefined();
      expect(result.proposalId).toBeDefined();
    });
  });
});

// ===== CONSENSUS SERVICE TESTS =====

describe('ConsensusService', () => {
  let service: ConsensusService;

  beforeEach(() => {
    service = createConsensusService();
  });

  afterEach(async () => {
    await service.shutdown();
  });

  describe('Raft Consensus', () => {
    it('should achieve Raft consensus', async () => {
      const result = await service.requestConsensus({
        sessionId: 'test-session',
        proposerId: 'agent-1',
        value: { decision: 'approve' },
        participants: ['agent-1', 'agent-2', 'agent-3'],
        algorithm: ConsensusAlgorithm.RAFT,
        timeoutMs: 5000,
      });

      expect(result.algorithm).toBe(ConsensusAlgorithm.RAFT);
      expect(result.proposalId).toBeDefined();
    });
  });

  describe('Quorum Consensus', () => {
    it('should achieve quorum consensus', async () => {
      const result = await service.requestConsensus({
        sessionId: 'test-session',
        proposerId: 'agent-1',
        value: { decision: 'approve' },
        participants: ['agent-1', 'agent-2', 'agent-3', 'agent-4'],
        algorithm: ConsensusAlgorithm.QUORUM,
        timeoutMs: 5000,
      });

      expect(result.algorithm).toBe(ConsensusAlgorithm.QUORUM);
      expect(result.approved).toBeDefined();
    });
  });

  describe('Byzantine Consensus', () => {
    it('should achieve Byzantine consensus', async () => {
      const result = await service.requestConsensus({
        sessionId: 'test-session',
        proposerId: 'agent-1',
        value: { decision: 'approve' },
        participants: ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'],
        algorithm: ConsensusAlgorithm.BYZANTINE,
        timeoutMs: 5000,
      });

      expect(result.algorithm).toBe(ConsensusAlgorithm.BYZANTINE);
      expect(result.rounds).toBeGreaterThan(0);
    });
  });

  describe('Gossip Protocol', () => {
    it('should achieve gossip consensus', async () => {
      const result = await service.requestConsensus({
        sessionId: 'test-session',
        proposerId: 'agent-1',
        value: { decision: 'approve' },
        participants: ['agent-1', 'agent-2', 'agent-3', 'agent-4'],
        algorithm: ConsensusAlgorithm.GOSSIP,
        timeoutMs: 5000,
      });

      expect(result.algorithm).toBe(ConsensusAlgorithm.GOSSIP);
      expect(result.rounds).toBeGreaterThan(0);
    });
  });
});

// ===== FAILURE HANDLING TESTS =====

describe('Failure Handling', () => {
  describe('Network Partitions', () => {
    it('should handle participant disconnection gracefully', async () => {
      const messageBus = createEventMessageBus();
      const consensusService = createConsensusService();
      const service = createCoordinationService({
        messageBus,
        consensusService,
      });

      const sessionId = await service.createSession();

      await service.joinSession(sessionId, 'agent-1', 'coordinator');
      await service.joinSession(sessionId, 'agent-2', 'worker');

      await service.startSession(sessionId);

      const session = service.getSession(sessionId);
      session?.updateParticipantStatus('agent-2', 'disconnected');

      expect(session?.getActiveParticipantCount()).toBe(1);

      await service.shutdown();
      await messageBus.shutdown();
      await consensusService.shutdown();
    });
  });

  describe('Message Timeouts', () => {
    it('should handle message expiration', async () => {
      const mailbox = createMailbox('agent-1');

      const expiredMsg = Message.create({
        from: 'agent-2',
        to: 'agent-1',
        type: MessageType.NOTIFICATION,
        payload: {},
        ttlMs: 10,
      });

      mailbox.enqueue(expiredMsg);

      await new Promise(resolve => setTimeout(resolve, 50));

      const stats = mailbox.getStats();

      mailbox.shutdown();
    });
  });

  describe('Consensus Failures', () => {
    it('should handle consensus timeout', async () => {
      const service = createConsensusService();

      // This should eventually timeout or complete
      const result = await service.requestConsensus({
        sessionId: 'test-session',
        proposerId: 'agent-1',
        value: { decision: 'approve' },
        participants: ['agent-1', 'agent-2'],
        algorithm: ConsensusAlgorithm.QUORUM,
        timeoutMs: 1000,
      });

      expect(result).toBeDefined();

      await service.shutdown();
    });
  });
});
