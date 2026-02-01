# Local Agent Swarm Integration Plan

## Executive Summary

This document outlines a comprehensive plan to extend claude-flow to support **local LLMs** (Qwen, Llama, Gemma, Mistral, etc.) as first-class swarm participants, with advanced **inter-agent compression protocols** for efficient communication.

**Key Integrations:**
- **AISP (AI Symbolic Protocol)** - Unambiguous symbolic communication reducing message ambiguity from 40-65% to <2%
- **C2C (Cache-to-Cache)** - Direct semantic communication via KV-cache fusion for 2x speedup
- **ADOL Protocol** - Token-efficient data layer reducing context bloat
- **Local Providers** - Ollama, ONNX, llama.cpp, vLLM for edge/privacy deployments
- **Gemini-3-Pro** - High-capacity cloud provider (2M tokens/day, no 5-hour windows, 1M+ context) via `gemini` CLI
- **Networked Local Agents** - Distributed swarm across LAN devices (laptops, desktops, servers) with auto-discovery

---

## Part 1: Current Architecture Analysis

### 1.1 Existing Provider Infrastructure

Claude-flow V3 already has a multi-provider abstraction layer with partial local model support:

```
v3/@claude-flow/integration/src/provider-adapter.ts
v3/@claude-flow/integration/src/multi-model-router.ts
```

**Currently Defined Providers:**
| Provider | Status | Models |
|----------|--------|--------|
| Anthropic | ✅ Active | Claude 3.5 Sonnet, Opus, Haiku |
| OpenAI | ✅ Active | GPT-4o, GPT-4 Turbo |
| OpenRouter | ✅ Active | 100+ models |
| Ollama | ⚠️ Stub Only | Llama 3.2 (defined, not connected) |
| ONNX | ⚠️ Stub Only | Phi-4 (defined, not implemented) |
| LiteLLM | ⚠️ Stub Only | Unified API |
| Google | ⚠️ Stub Only | Gemini |
| **Gemini-3-Pro** | 🆕 Planned | Gemini 3 Pro (CLI: `gemini`) |

### 1.2 Key Entry Points for Extension

| File | Purpose | Modification Needed |
|------|---------|---------------------|
| `provider-adapter.ts` | Provider abstraction | Add local provider handlers |
| `multi-model-router.ts` | Intelligent routing | Add local model routing rules |
| `agent-tools.ts` | Agent spawning | Model selection in spawn |
| `queen-coordinator.ts` | Swarm orchestration | Cross-model coordination |
| `message-bus.ts` | Inter-agent communication | Compression layer |

### 1.3 3-Tier Routing System (ADR-026)

The existing routing system provides natural integration points:

```
Tier 1: Agent Booster (WASM) - <1ms, $0 - Simple transforms
     ↓
Tier 2: Haiku / Local Models - ~500ms, low cost - Fast tasks
     ↓
Tier 3: Sonnet/Opus - 2-5s, higher cost - Complex reasoning
```

**Proposed Extension:**
```
Tier 1: Agent Booster (WASM) - <1ms, $0
     ↓
Tier 2A: Local Models (Qwen/Llama) - ~600ms, FREE - Privacy/Offline
Tier 2B: Haiku - ~500ms, $0.0002 - Cloud fallback
     ↓
Tier 3A: Gemini-3-Pro - 1-3s, FREE (2M/day) - High context, long-running
Tier 3B: Sonnet/Opus - 2-5s, $0.003-0.015 - Complex reasoning
```

**Gemini-3-Pro Strategic Advantages:**
| Feature | Value | Swarm Benefit |
|---------|-------|---------------|
| Daily tokens | 2,000,000 | Sustained high-volume work |
| Rate windows | None | Continuous operation |
| Context window | 1M+ tokens | Entire codebases in context |
| CLI access | `gemini` command | Seamless integration |

---

## Part 2: Local Model Integration

### 2.1 Supported Local Model Providers

#### 2.1.1 Ollama Integration

**Repository:** [github.com/ollama/ollama](https://github.com/ollama/ollama)

Ollama provides OpenAI-compatible endpoints for local models:

```typescript
// v3/@claude-flow/providers/src/ollama-provider.ts
import { Ollama } from 'ollama';

export class OllamaProvider implements Provider {
  private client: Ollama;

  constructor(config: OllamaConfig = {}) {
    this.client = new Ollama({
      host: config.host || 'http://localhost:11434'
    });
  }

  async generate(prompt: string, options: GenerateOptions): Promise<Response> {
    return this.client.generate({
      model: options.model || 'qwen2.5:7b',
      prompt,
      stream: options.stream ?? true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_ctx: options.contextLength ?? 8192,
      }
    });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings({
      model: 'nomic-embed-text',
      prompt: text
    });
    return response.embedding;
  }
}
```

**Recommended Models:**
| Model | Size | Context | Use Case |
|-------|------|---------|----------|
| `qwen2.5:0.5b` | 0.5B | 32K | Agent Booster alternative |
| `qwen2.5:3b` | 3B | 32K | Fast local tasks |
| `qwen2.5:7b` | 7B | 128K | General agents |
| `qwen2.5:14b` | 14B | 128K | Complex reasoning |
| `qwen2.5:32b` | 32B | 128K | Near-cloud quality |
| `llama3.2:3b` | 3B | 128K | Tool calling |
| `deepseek-r1:7b` | 7B | 64K | Reasoning chains |
| `codestral:22b` | 22B | 32K | Code generation |

#### 2.1.2 Qwen-Agent Integration

**Reference:** [Qwen-Agent with Ollama](https://medium.com/intel-tech/deploying-ai-agents-locally-with-qwen3-qwen-agent-and-ollama-cad452f20be5)

Qwen-Agent provides native tool calling and agentic workflows:

```typescript
// v3/@claude-flow/providers/src/qwen-agent-provider.ts
export class QwenAgentProvider implements Provider {
  async executeWithTools(
    prompt: string,
    tools: Tool[],
    options: AgentOptions
  ): Promise<AgentResponse> {
    // Qwen-Agent supports:
    // - Function calling
    // - Code execution (code interpreter)
    // - Web browsing
    // - File operations
    return this.agent.run(prompt, { tools, ...options });
  }
}
```

#### 2.1.3 ONNX Runtime (Ultra-Fast Local)

For maximum speed with smaller models:

```typescript
// v3/@claude-flow/providers/src/onnx-provider.ts
import * as ort from 'onnxruntime-node';

export class ONNXProvider implements Provider {
  private session: ort.InferenceSession;

  async initialize(modelPath: string): Promise<void> {
    this.session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cuda', 'cpu'], // GPU-first fallback
      graphOptimizationLevel: 'all'
    });
  }

  // ~100ms latency, 75x faster than cloud
  async generate(tokens: number[]): Promise<number[]> {
    const feeds = { input_ids: new ort.Tensor('int64', tokens, [1, tokens.length]) };
    const results = await this.session.run(feeds);
    return Array.from(results.logits.data);
  }
}
```

#### 2.1.4 vLLM Integration (Production Scale)

For high-throughput deployments:

```typescript
// v3/@claude-flow/providers/src/vllm-provider.ts
export class VLLMProvider implements Provider {
  // vLLM provides:
  // - Paged attention (memory efficient)
  // - Continuous batching
  // - Multi-LoRA serving
  // - OpenAI-compatible API

  constructor(config: VLLMConfig) {
    this.baseUrl = config.baseUrl || 'http://localhost:8000';
  }
}
```

#### 2.1.5 Gemini-3-Pro Integration (High-Capacity Cloud)

**Access:** Command-line via `gemini` (Claude Code equivalent for Gemini)

Gemini-3-Pro provides a high-capacity cloud option with generous token limits:

| Feature | Specification |
|---------|---------------|
| Daily Token Limit | 2,000,000 tokens |
| Rate Limiting | No 5-hour windows |
| Context Window | 1M+ tokens |
| Invocation | CLI: `gemini` command |

```typescript
// v3/@claude-flow/providers/src/gemini-provider.ts
import { spawn } from 'child_process';

export class GeminiProvider implements Provider {
  private dailyTokensUsed: number = 0;
  private dailyLimit: number = 2_000_000;

  constructor(config: GeminiConfig = {}) {
    this.command = config.command || 'gemini';
    this.resetDailyCounterAtMidnight();
  }

  async generate(prompt: string, options: GenerateOptions): Promise<Response> {
    // Check daily token budget
    const estimatedTokens = this.estimateTokens(prompt);
    if (this.dailyTokensUsed + estimatedTokens > this.dailyLimit) {
      throw new TokenBudgetExceededError('Daily 2M token limit reached');
    }

    // Invoke gemini CLI
    const result = await this.invokeGeminiCLI(prompt, options);

    // Track usage
    this.dailyTokensUsed += result.tokensUsed;

    return result;
  }

  private async invokeGeminiCLI(
    prompt: string,
    options: GenerateOptions
  ): Promise<CLIResponse> {
    // Spawn gemini process similar to Claude Code
    return new Promise((resolve, reject) => {
      const gemini = spawn(this.command, ['--prompt', prompt], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      gemini.stdout.on('data', (data) => output += data);
      gemini.on('close', (code) => {
        if (code === 0) {
          resolve({ content: output, tokensUsed: this.countTokens(output) });
        } else {
          reject(new Error(`Gemini exited with code ${code}`));
        }
      });
    });
  }

  getRemainingDailyTokens(): number {
    return this.dailyLimit - this.dailyTokensUsed;
  }
}
```

**Strategic Advantages of Gemini-3-Pro:**

| Advantage | Benefit for Swarms |
|-----------|-------------------|
| 2M daily tokens | Sustained high-volume agent work without rate limits |
| No 5-hour windows | Continuous operation for long-running tasks |
| 1M+ context | Entire codebases in context for research agents |
| CLI parity | Seamless integration with Claude Code patterns |

**Recommended Use Cases:**
- **Research Agents**: Large context for codebase analysis
- **Long-running Tasks**: No rate limit interruptions
- **Burst Workloads**: High daily capacity for intensive periods
- **Fallback Provider**: When Anthropic rate limits are hit

#### 2.1.6 Networked Local Agents (Distributed LAN Swarm)

Run models across multiple machines on your local network - laptops, desktops, servers, even Raspberry Pis - and coordinate them as a unified swarm.

**Architecture Overview:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         YOUR WORKSTATION                                     │
│                    (Coordinator - claude-flow)                               │
│                         192.168.1.100                                        │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
                    Local Network (LAN)
                              │
        ┌─────────────────────┼─────────────────────┬─────────────────────┐
        │                     │                     │                     │
        ▼                     ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  LAPTOP 1     │     │  DESKTOP 2    │     │  SERVER 3     │     │ RASPBERRY PI  │
│  Ubuntu 24.04 │     │  Ubuntu 22.04 │     │  Ubuntu 22.04 │     │  Ubuntu 24.04 │
│  192.168.1.101│     │  192.168.1.102│     │  192.168.1.103│     │  192.168.1.104│
│               │     │               │     │               │     │               │
│  RTX 3080     │     │  RTX 4090     │     │  2x RTX A6000 │     │  CPU only     │
│  12GB VRAM    │     │  24GB VRAM    │     │  96GB VRAM    │     │  8GB RAM      │
│               │     │               │     │               │     │               │
│  Qwen 14B     │     │  Qwen 32B     │     │  Llama 70B    │     │  Qwen 0.5B    │
│  Llama 8B     │     │  DeepSeek 33B │     │  Mixtral 8x22B│     │  Phi-3 mini   │
│               │     │               │     │               │     │               │
│  :11434       │     │  :11434       │     │  :11434       │     │  :11434       │
│  :3456 agent  │     │  :3456 agent  │     │  :3456 agent  │     │  :3456 agent  │
└───────────────┘     └───────────────┘     └───────────────┘     └───────────────┘
```

**Discovery Mechanisms:**

| Method | How It Works | Best For |
|--------|--------------|----------|
| **mDNS/Bonjour** | Zero-config, agents auto-announce on `_claude-flow._tcp.local` | Home labs, small teams |
| **Static Config** | IP addresses listed in config file | Stable infrastructure |
| **Registry** | Central server tracks all agents | Enterprise, multi-site |
| **Gossip** | Agents share peer info with each other | Large, dynamic clusters |

```typescript
// v3/@claude-flow/network/src/discovery.ts
import mdns from 'multicast-dns';

export class AgentDiscovery extends EventEmitter {
  private agents: Map<string, NetworkAgent> = new Map();

  /**
   * Discover agents on the local network using mDNS
   */
  async discoverAgents(): Promise<NetworkAgent[]> {
    return new Promise((resolve) => {
      const discovered: NetworkAgent[] = [];

      this.mdns.query({
        questions: [{ name: '_claude-flow-agent._tcp.local', type: 'PTR' }]
      });

      this.mdns.on('response', (response) => {
        for (const answer of response.answers) {
          if (answer.type === 'SRV') {
            const agent = this.parseAgentRecord(answer);
            discovered.push(agent);
            this.agents.set(agent.id, agent);
            this.emit('agent-discovered', agent);
          }
        }
      });

      // Give network 2 seconds to respond
      setTimeout(() => resolve(discovered), 2000);
    });
  }

  /**
   * Advertise this machine as an available agent
   */
  advertise(config: AgentAdvertisement): void {
    this.mdns.respond({
      answers: [
        {
          name: '_claude-flow-agent._tcp.local',
          type: 'PTR',
          data: `${config.id}._claude-flow-agent._tcp.local`
        },
        {
          name: `${config.id}._claude-flow-agent._tcp.local`,
          type: 'SRV',
          data: { port: config.port, target: config.hostname }
        },
        {
          name: `${config.id}._claude-flow-agent._tcp.local`,
          type: 'TXT',
          data: JSON.stringify({
            models: config.models,
            gpu: config.gpu,
            vram: config.vramGB,
            status: 'available'
          })
        }
      ]
    });
  }
}
```

**Network Agent Provider:**

```typescript
// v3/@claude-flow/network/src/network-provider.ts
export class NetworkAgentProvider implements Provider {
  private discovery: AgentDiscovery;
  private loadBalancer: LoadBalancer;
  private healthChecker: HealthChecker;

  constructor(config: NetworkConfig) {
    this.discovery = new AgentDiscovery(config.discovery);
    this.loadBalancer = new LoadBalancer(config.loadBalancing);
    this.healthChecker = new HealthChecker(config.healthCheck);
  }

  async generate(prompt: string, options: GenerateOptions): Promise<Response> {
    // Find best available agent for this model
    const agent = await this.selectAgent(options.model);

    if (!agent) {
      throw new NoAvailableAgentError(`No agent available for model: ${options.model}`);
    }

    // Forward request to remote Ollama instance
    const client = new Ollama({ host: `http://${agent.host}:${agent.port}` });

    return client.generate({
      model: options.model,
      prompt,
      stream: options.stream
    });
  }

  private async selectAgent(model: string): Promise<NetworkAgent | null> {
    // Get all healthy agents that have this model
    const candidates = Array.from(this.discovery.agents.values())
      .filter(a => a.models.includes(model))
      .filter(a => this.healthChecker.isHealthy(a.id));

    if (candidates.length === 0) return null;

    // Use load balancer to pick the best one
    return this.loadBalancer.select(candidates);
  }
}
```

**Load Balancing Strategies:**

| Strategy | Description | Best For |
|----------|-------------|----------|
| `round-robin` | Rotate through agents sequentially | Equal hardware |
| `least-connections` | Pick agent with fewest active requests | Mixed workloads |
| `weighted` | Assign weights based on GPU power | Heterogeneous hardware |
| `latency-based` | Pick fastest responding agent | Latency-sensitive tasks |
| `capability-match` | Match task requirements to agent specs | Specialized workloads |

```typescript
// v3/@claude-flow/network/src/load-balancer.ts
export class LoadBalancer {
  selectAgent(agents: NetworkAgent[], task?: TaskContext): NetworkAgent {
    switch (this.strategy) {
      case 'weighted':
        // Weight by VRAM (more VRAM = handle bigger models faster)
        const totalWeight = agents.reduce((sum, a) => sum + a.vramGB, 0);
        let random = Math.random() * totalWeight;
        for (const agent of agents) {
          random -= agent.vramGB;
          if (random <= 0) return agent;
        }
        return agents[0];

      case 'capability-match':
        // If task needs 70B model, only agents with 48GB+ VRAM
        const requiredVRAM = this.estimateVRAM(task?.model);
        const capable = agents.filter(a => a.vramGB >= requiredVRAM);
        return capable[0] || agents[0];

      case 'least-connections':
        return agents.reduce((min, a) =>
          a.activeConnections < min.activeConnections ? a : min
        );

      default: // round-robin
        this.currentIndex = (this.currentIndex + 1) % agents.length;
        return agents[this.currentIndex];
    }
  }
}
```

**Security Model:**

```typescript
// v3/@claude-flow/network/src/security.ts
export interface NetworkSecurityConfig {
  // Authentication
  authentication: {
    method: 'none' | 'api-key' | 'mtls';
    apiKey?: string;
    allowedIPs?: string[];  // CIDR notation: ['192.168.1.0/24']
  };

  // Encryption
  tls: {
    enabled: boolean;
    certPath?: string;
    keyPath?: string;
    caCertPath?: string;  // For mTLS
  };

  // Rate limiting per agent
  rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}
```

**Configuration Example:**

```json
{
  "network": {
    "enabled": true,
    "discovery": {
      "method": "mdns",
      "fallbackHosts": [
        { "host": "192.168.1.101", "port": 11434 },
        { "host": "192.168.1.102", "port": 11434 }
      ]
    },
    "loadBalancing": {
      "strategy": "weighted",
      "healthCheckIntervalMs": 10000,
      "unhealthyThreshold": 3
    },
    "security": {
      "authentication": {
        "method": "api-key",
        "apiKey": "${CLAUDE_FLOW_NETWORK_KEY}"
      },
      "tls": {
        "enabled": false
      },
      "allowedNetworks": ["192.168.1.0/24", "10.0.0.0/8"]
    }
  }
}
```

**CLI Commands for Network Agents:**

```bash
# Discover agents on the network
npx claude-flow@v3 network discover
# Output:
# Found 4 agents:
#   laptop-1 (192.168.1.101) - Qwen 14B, Llama 8B [RTX 3080, 12GB]
#   desktop-2 (192.168.1.102) - Qwen 32B [RTX 4090, 24GB]
#   server-3 (192.168.1.103) - Llama 70B, Mixtral [2x A6000, 96GB]
#   rpi-4 (192.168.1.104) - Qwen 0.5B [CPU, 8GB RAM]

# Check network agent health
npx claude-flow@v3 network health
# Output:
# laptop-1: ✅ healthy (latency: 5ms, load: 23%)
# desktop-2: ✅ healthy (latency: 3ms, load: 45%)
# server-3: ✅ healthy (latency: 8ms, load: 12%)
# rpi-4: ⚠️ degraded (latency: 150ms, load: 89%)

# Spawn agent on specific network node
npx claude-flow@v3 agent spawn -t coder --model qwen2.5:32b --node desktop-2

# View network topology
npx claude-flow@v3 network topology

# Add static host
npx claude-flow@v3 network add-host 192.168.1.105 --port 11434

# Test connectivity to all agents
npx claude-flow@v3 network ping-all
```

### 2.2 Provider Selection Algorithm

```typescript
// v3/@claude-flow/integration/src/local-model-router.ts
export async function selectProvider(
  task: TaskContext,
  preferences: RoutingPreferences
): Promise<ProviderSelection> {

  // Check Agent Booster eligibility first
  const boosterIntent = detectAgentBoosterIntent(task.prompt);
  if (boosterIntent) {
    return { provider: 'agent-booster', model: null, tier: 1 };
  }

  // Preference flags
  const preferLocal = preferences.preferLocal ||
                      preferences.offline ||
                      preferences.privacyMode;

  // Calculate task complexity
  const complexity = await analyzeComplexity(task);

  // Local model availability check
  const localAvailable = await checkOllamaHealth();

  if (preferLocal && localAvailable) {
    // Route to appropriate local model based on complexity
    if (complexity < 0.3) {
      return { provider: 'ollama', model: 'qwen2.5:3b', tier: 2 };
    } else if (complexity < 0.6) {
      return { provider: 'ollama', model: 'qwen2.5:7b', tier: 2 };
    } else {
      return { provider: 'ollama', model: 'qwen2.5:32b', tier: 2 };
    }
  }

  // Fallback to cloud (with Gemini-3-Pro option)
  return selectCloudProvider(task, complexity);
}

// v3/@claude-flow/integration/src/cloud-provider-router.ts
export async function selectCloudProvider(
  task: TaskContext,
  complexity: number
): Promise<ProviderSelection> {
  const gemini = getGeminiProvider();
  const anthropic = getAnthropicProvider();

  // Check if this is a high-context task (benefits from Gemini's 1M+ context)
  const isHighContext = task.contextSize > 100_000;

  // Check if we're in a rate-limited state with Anthropic
  const anthropicRateLimited = await checkAnthropicRateLimits();

  // Check Gemini daily budget
  const geminiHasBudget = gemini.getRemainingDailyTokens() > 50_000;

  // Route to Gemini-3-Pro for:
  // 1. High-context tasks (research, codebase analysis)
  // 2. When Anthropic is rate-limited
  // 3. Long-running sustained tasks
  if (geminiHasBudget && (isHighContext || anthropicRateLimited || task.longRunning)) {
    return {
      provider: 'gemini-3-pro',
      model: 'gemini-3-pro',
      tier: 3,
      reason: isHighContext ? 'high-context' :
              anthropicRateLimited ? 'anthropic-rate-limited' : 'long-running'
    };
  }

  // Default to Anthropic based on complexity
  if (complexity < 0.5) {
    return { provider: 'anthropic', model: 'claude-3-5-haiku', tier: 2 };
  } else if (complexity < 0.8) {
    return { provider: 'anthropic', model: 'claude-3-5-sonnet', tier: 3 };
  } else {
    return { provider: 'anthropic', model: 'claude-opus-4-5', tier: 3 };
  }
}
```

### 2.3 Hybrid Swarm Architecture

A swarm can now consist of mixed cloud + local agents:

```
┌─────────────────────────────────────────────────────────────┐
│                    QUEEN COORDINATOR                        │
│              (Claude Sonnet - Cloud)                        │
│         Strategic decisions, complex reasoning              │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│   CODER     │   │ RESEARCHER  │   │  REVIEWER   │
│ (Qwen 7B)   │   │(Qwen 14B)   │   │(Llama 3B)   │
│   LOCAL     │   │   LOCAL     │   │   LOCAL     │
│ Tool Calls  │   │ RAG Search  │   │ Fast Review │
└─────────────┘   └─────────────┘   └─────────────┘
          │               │               │
          └───────────────┴───────────────┘
                          │
                    SHARED MEMORY
                   (HNSW + SQLite)
```

**Extended Multi-Cloud + Local Architecture:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         COORDINATOR LAYER                                │
├─────────────────────────────┬───────────────────────────────────────────┤
│      CLAUDE OPUS 4.5        │           GEMINI-3-PRO                    │
│    (Strategic Planning)     │      (High-Context Research)              │
│    Complex reasoning        │      1M+ context, 2M/day tokens           │
│    5-hour window limits     │      No rate limit windows                │
└──────────────┬──────────────┴──────────────┬────────────────────────────┘
               │                              │
               └──────────────┬───────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ CODER (Local)   │   │ RESEARCHER      │   │ TESTER (Local)  │
│ Qwen 7B/Ollama  │   │ Gemini-3-Pro    │   │ Llama 3B/Ollama │
│ Fast code gen   │   │ Large context   │   │ Fast validation │
│ $0 cost         │   │ Codebase-wide   │   │ $0 cost         │
└─────────────────┘   └─────────────────┘   └─────────────────┘
          │                   │                   │
          └───────────────────┴───────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   SHARED MEMORY   │
                    │  (HNSW + SQLite)  │
                    │  + Token Budget   │
                    │    Tracking       │
                    └───────────────────┘
```

**Provider Load Balancing Strategy:**

| Scenario | Primary Provider | Fallback | Rationale |
|----------|------------------|----------|-----------|
| Complex reasoning | Claude Opus | Gemini-3-Pro | Best capability |
| Large context (>100K) | Gemini-3-Pro | Claude Sonnet | Context window |
| Anthropic rate-limited | Gemini-3-Pro | Local (Qwen) | Availability |
| Privacy/offline | Ollama (local) | None | Data sovereignty |
| Long-running tasks | Gemini-3-Pro | Claude Haiku | No windows |
| Fast operations | Local (Qwen/Llama) | Haiku | Speed + cost |

---

## Part 3: AISP Integration (Symbolic Protocol)

### 3.1 Overview

**Repository:** [github.com/bar181/aisp-open-core](https://github.com/bar181/aisp-open-core)

AISP (AI Symbolic Protocol) provides 512 mathematical symbols for unambiguous inter-agent communication:

| Benefit | Natural Language | AISP |
|---------|------------------|------|
| Ambiguity Rate | 40-65% | <2% |
| Multi-step Success | 59% | 95% |
| Misinterpretation | 25-40% | <1% |

### 3.2 Symbol Categories

AISP defines **Σ₅₁₂** (512 symbols) in 8 categories:

| Category | Symbols | Usage |
|----------|---------|-------|
| Quantifiers | `∀` (for all), `∃` (exists), `∃!` (unique) | Scope definitions |
| Logic | `⇒` (implies), `⇔` (iff), `∧` (and), `∨` (or), `¬` (not) | Conditions |
| Definitions | `≜` (defined as), `≔` (assigned) | Declarations |
| Sets | `∈` (element of), `⊆` (subset), `∪` (union), `∩` (intersection) | Collections |
| Truth | `⊤` (true), `⊥` (false) | Boolean states |
| Functions | `λ` (lambda), `↦` (maps to) | Transformations |
| Topology | Domain and range operators | Structure |
| Evidence | `⟦Ε⟧` (proof block) | Verification |

### 3.3 Implementation Plan

```typescript
// v3/@claude-flow/protocols/src/aisp/parser.ts
import { AISPSymbols } from './symbols';

export class AISPParser {
  /**
   * Convert natural language task to AISP specification
   * Example: "Find all files with errors" → "∀f∈Files: hasError(f) ⇒ collect(f)"
   */
  async toAISP(naturalLanguage: string): Promise<AISPSpec> {
    // Use small local model for conversion
    const spec = await this.converter.convert(naturalLanguage);
    return this.validate(spec);
  }

  /**
   * Parse AISP specification into executable task
   */
  parse(spec: string): ParsedTask {
    const tokens = this.tokenize(spec);
    const ast = this.buildAST(tokens);
    return this.toExecutableTask(ast);
  }

  /**
   * Grade specification quality
   */
  gradeQuality(spec: AISPSpec): QualityTier {
    const density = this.calculateSemanticDensity(spec);
    if (density >= 0.75) return 'platinum'; // ◊⁺⁺
    if (density >= 0.60) return 'gold';     // ◊⁺
    if (density >= 0.40) return 'silver';   // ◊
    if (density >= 0.20) return 'bronze';   // ◊⁻
    return 'reject';                         // ⊘
  }
}
```

### 3.4 Inter-Agent Message Format

```typescript
// v3/@claude-flow/protocols/src/aisp/message.ts
interface AISPMessage {
  // Header
  sender: AgentId;
  receiver: AgentId | 'broadcast';
  timestamp: number;

  // AISP Payload
  spec: {
    // Preconditions (∀, ∃)
    preconditions: string[];    // e.g., ["∀f∈InputFiles: isValid(f)"]

    // Task definition (≜)
    task: string;               // e.g., "transform ≜ λf.compress(f)"

    // Postconditions (⇒)
    postconditions: string[];   // e.g., ["∀r∈Results: size(r) < size(input)"]

    // Evidence block (⟦Ε⟧)
    evidence?: ProofBlock;
  };

  // Quality tier
  tier: 'platinum' | 'gold' | 'silver' | 'bronze';

  // Compressed payload (for efficiency)
  compressed?: CompressedPayload;
}
```

### 3.5 Swarm Task Example

**Natural Language:**
> "Review all TypeScript files in /src, find security issues, fix them, and run tests"

**AISP Specification:**
```
⟦TASK⟧
  ∀f ∈ Glob("/src/**/*.ts"):
    issues ≔ securityScan(f)
    ∃i ∈ issues ⇒ fix(f, i) ∧ validate(f)

  postcondition: testSuite() = ⊤

⟦Ε⟧
  prover: static-analysis
  confidence: 0.95
```

### 3.6 Benefits for Swarm Coordination

| Problem | AISP Solution |
|---------|---------------|
| Goal drift | Formal spec prevents reinterpretation |
| Agent desync | Deterministic parsing across agents |
| Ambiguous handoffs | Pre/post conditions explicit |
| Verification | Evidence blocks enable validation |

---

## Part 4: C2C (Cache-to-Cache) Integration

### 4.1 Overview

**Repository:** [github.com/thu-nics/C2C](https://github.com/thu-nics/C2C)

C2C enables **direct semantic communication** between LLMs by bypassing text generation:

| Metric | Text Communication | C2C |
|--------|-------------------|-----|
| Accuracy | Baseline | +8.5-10.5% |
| Latency | 1x | 0.5x (2x speedup) |
| Semantic Loss | High | Minimal |

### 4.2 How C2C Works

```
┌─────────────────┐                    ┌─────────────────┐
│   SHARER LLM    │                    │  RECEIVER LLM   │
│   (Qwen 7B)     │                    │   (Qwen 14B)    │
│                 │                    │                 │
│  ┌───────────┐  │    C2C Fuser      │  ┌───────────┐  │
│  │ KV-Cache  │──┼─────────────────▶──│  │ KV-Cache  │  │
│  └───────────┘  │   (Projection +   │  └───────────┘  │
│                 │    Gating)        │                 │
└─────────────────┘                    └─────────────────┘
         │                                      │
         │                                      │
         ▼                                      ▼
   No text output!                      Direct semantic
                                        understanding
```

**C2C Fuser Components:**
1. **Projection**: Maps source KV-cache to target semantic space
2. **Dynamic Weighting**: Input-aware modulation
3. **Learnable Gating**: Per-layer fusion control

### 4.3 Supported Model Pairs

Pre-trained fusers available on HuggingFace:

| Sharer | Receiver | Improvement |
|--------|----------|-------------|
| Qwen2.5-0.5B | Qwen2.5-1.5B | +8.7% |
| Qwen2.5-1.5B | Qwen2.5-7B | +9.2% |
| Qwen3-0.6B | Qwen3-1.7B | +10.1% |
| Llama-3.2-1B | Qwen2.5-7B | +8.5% |
| Qwen-Math-7B | Qwen2.5-7B | +12.3% |

### 4.4 Implementation Plan

```typescript
// v3/@claude-flow/protocols/src/c2c/fuser.ts
import { RosettaModel } from './rosetta';

export class C2CFuser {
  private fusers: Map<string, ProjectorConfig>;

  constructor() {
    // Load pre-trained fusers
    this.fusers = new Map([
      ['qwen2.5-0.5b→qwen2.5-7b', loadFuser('c2c-qwen-small-to-large')],
      ['qwen3-1.7b→qwen3-8b', loadFuser('c2c-qwen3-medium-to-large')],
    ]);
  }

  /**
   * Fuse KV-caches from sharer to receiver
   */
  async fuse(
    sharerKVCache: KVCache,
    receiverModel: LocalModel,
    options: FuseOptions
  ): Promise<FusedContext> {
    const fuser = this.getFuser(sharerKVCache.modelId, receiverModel.id);

    // Project sharer's semantic representation
    const projected = await fuser.project(sharerKVCache);

    // Apply dynamic weighting
    const weighted = await fuser.weight(projected, options.query);

    // Gate and fuse with receiver's cache
    return fuser.fuse(weighted, receiverModel.currentCache);
  }
}
```

### 4.5 Swarm Communication Patterns

#### Pattern 1: Hierarchical Knowledge Transfer

```
                    ┌─────────────────┐
                    │  QUEEN (14B)    │
                    │   Receiver      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Coder    │   │Researcher│   │ Tester   │
        │ (3B)     │   │ (3B)     │   │ (3B)     │
        │ Sharer   │   │ Sharer   │   │ Sharer   │
        └──────────┘   └──────────┘   └──────────┘
              │              │              │
              └──────────────┴──────────────┘
                             │
                      KV-Cache Fusion
                      (No text overhead)
```

#### Pattern 2: Multi-Sharer Ensemble

Multiple specialist agents fuse into a generalist:

```typescript
const mathCache = await mathAgent.getKVCache();
const codeCache = await codeAgent.getKVCache();
const reasonCache = await reasonAgent.getKVCache();

// Fuse all into coordinator
const fusedContext = await c2c.multiSharerFuse(
  [mathCache, codeCache, reasonCache],
  coordinatorModel
);

// Coordinator now has combined expertise
const response = await coordinatorModel.generate(query, { context: fusedContext });
```

### 4.6 Integration with Ollama

```typescript
// v3/@claude-flow/protocols/src/c2c/ollama-bridge.ts
export class OllamaC2CBridge {
  /**
   * Extract KV-cache from Ollama model
   * Note: Requires Ollama 0.4+ with cache export API
   */
  async extractKVCache(
    modelName: string,
    prompt: string
  ): Promise<KVCache> {
    // Use Ollama's internal cache mechanism
    const response = await this.ollama.generate({
      model: modelName,
      prompt,
      options: { return_kv_cache: true }
    });

    return {
      modelId: modelName,
      layers: response.kv_cache,
      tokenCount: response.token_count
    };
  }
}
```

---

## Part 5: ADOL Protocol (Token Efficiency)

### 5.1 Overview

**Reference:** [IETF Draft: Agentic Data Optimization Layer](https://datatracker.ietf.org/doc/html/draft-chang-agent-token-efficient-01)

ADOL addresses token bloat in agent protocols (MCP, A2A) through:

| Optimization | Token Reduction |
|--------------|-----------------|
| Schema deduplication | 20-30% |
| Adaptive field inclusion | 15-25% |
| Response verbosity control | 10-20% |
| **Total potential** | **40-60%** |

### 5.2 Key Optimizations

#### 5.2.1 Schema Deduplication

```json
// BEFORE: Repeated schemas in every message
{
  "agent": {"id": "agent-1", "type": "coder", "capabilities": [...]},
  "task": {"id": "task-1", "agent": {"id": "agent-1", "type": "coder", "capabilities": [...]}},
  "result": {"agent": {"id": "agent-1", "type": "coder", "capabilities": [...]}}
}

// AFTER: JSON References
{
  "$defs": {"agent-1": {"id": "agent-1", "type": "coder", "capabilities": [...]}},
  "agent": {"$ref": "#/$defs/agent-1"},
  "task": {"id": "task-1", "agent": {"$ref": "#/$defs/agent-1"}},
  "result": {"agent": {"$ref": "#/$defs/agent-1"}}
}
```

#### 5.2.2 Adaptive Field Inclusion

```typescript
// v3/@claude-flow/protocols/src/adol/optimizer.ts
export class ADOLOptimizer {
  /**
   * Strip optional fields based on context
   */
  optimize(message: AgentMessage, context: OptimizationContext): OptimizedMessage {
    const fields = new Set<string>();

    // Only include fields receiver needs
    if (context.receiverCapabilities.includes('streaming')) {
      fields.add('stream_config');
    }

    // Skip metadata for internal messages
    if (context.isInternal) {
      delete message.metadata;
      delete message.tracing;
    }

    return this.compress(message, fields);
  }
}
```

#### 5.2.3 Verbosity Control

```typescript
// Control response detail level
enum VerbosityLevel {
  MINIMAL = 1,   // Just result
  NORMAL = 2,    // Result + summary
  DETAILED = 3,  // Result + reasoning
  FULL = 4       // Everything + traces
}

// Swarm agents use MINIMAL for internal comms
// User-facing agents use DETAILED
```

### 5.3 Implementation

```typescript
// v3/@claude-flow/protocols/src/adol/layer.ts
export class ADOLLayer {
  private schemaCache: Map<string, Schema> = new Map();

  /**
   * Wrap message with ADOL optimizations
   */
  async send(
    message: AgentMessage,
    options: SendOptions
  ): Promise<void> {
    // 1. Deduplicate schemas
    const deduped = this.deduplicateSchemas(message);

    // 2. Adaptive field inclusion
    const optimized = this.optimizeFields(deduped, options.receiver);

    // 3. Apply verbosity control
    const verbosity = options.internal ? VerbosityLevel.MINIMAL : VerbosityLevel.NORMAL;
    const final = this.applyVerbosity(optimized, verbosity);

    // 4. Compress if beneficial
    if (final.length > 1000) {
      return this.messageBus.send(await this.compress(final));
    }

    return this.messageBus.send(final);
  }
}
```

---

## Part 6: Compressed Reasoning

### 6.1 Latent Chain-of-Thought

Instead of verbose reasoning chains, use compressed thought representations:

| Technique | Token Reduction | Accuracy Impact |
|-----------|-----------------|-----------------|
| HCoT (Compressed Tokens) | 80%+ | -2 to +1% |
| Step Entropy Pruning | 43-80% | 0 to +2% |
| Focused CoT (F-CoT) | 60-70% | -1 to 0% |
| CoDi (Continuous Space) | 90%+ | -3 to -1% |

### 6.2 Implementation

```typescript
// v3/@claude-flow/protocols/src/compression/thought-compressor.ts
export class ThoughtCompressor {
  /**
   * Compress agent's reasoning before sharing
   */
  async compressReasoning(
    fullReasoning: string,
    method: CompressionMethod = 'step-entropy'
  ): Promise<CompressedThought> {
    switch (method) {
      case 'step-entropy':
        // Prune low-entropy steps (80% reduction)
        return this.stepEntropyPrune(fullReasoning);

      case 'focused-cot':
        // Extract essential info only (2-3x reduction)
        return this.extractEssentials(fullReasoning);

      case 'latent':
        // Encode to continuous vectors (90%+ reduction)
        return this.encodeToLatent(fullReasoning);
    }
  }

  private async stepEntropyPrune(reasoning: string): Promise<CompressedThought> {
    const steps = this.splitIntoSteps(reasoning);
    const entropies = await Promise.all(steps.map(s => this.calculateEntropy(s)));

    // Keep only high-entropy (informative) steps
    const threshold = this.calculateThreshold(entropies, 0.2); // Keep top 20%
    const prunedSteps = steps.filter((_, i) => entropies[i] > threshold);

    return {
      compressed: prunedSteps.join('\n'),
      ratio: prunedSteps.length / steps.length,
      method: 'step-entropy'
    };
  }
}
```

### 6.3 Shared Thought Protocol

Agents can share compressed thoughts instead of full conversations:

```typescript
// v3/@claude-flow/protocols/src/compression/shared-thought.ts
interface SharedThought {
  agentId: string;
  taskId: string;

  // Compressed representation (not full text)
  thought: {
    type: 'latent' | 'step-entropy' | 'focused';
    data: Float32Array | string;
    originalTokens: number;
    compressedTokens: number;
  };

  // Key conclusions only
  conclusions: string[];

  // Confidence and evidence
  confidence: number;
  evidence?: AISPProof;
}
```

---

## Part 7: Unified Compression Pipeline

### 7.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMPRESSION PIPELINE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  AISP    │───▶│  ADOL    │───▶│  C2C     │───▶│ Thought  │  │
│  │ Encoding │    │Optimize  │    │ Fusion   │    │Compress  │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│                                                                  │
│  Natural    →  Symbolic  →  Optimized  →  Semantic  →  Latent  │
│  Language      Protocol     Message       Cache        Thought  │
│                                                                  │
│  100 tokens →  40 tokens →  25 tokens  →  Direct   →  5 tokens │
│                             (-60%)        Transfer     (-95%)   │
│                                           (0 tokens)            │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Protocol Selection

```typescript
// v3/@claude-flow/protocols/src/unified/selector.ts
export class ProtocolSelector {
  selectProtocol(
    sender: Agent,
    receiver: Agent,
    message: Message
  ): ProtocolStack {
    const protocols: Protocol[] = [];

    // Always use AISP for task specs
    if (message.type === 'task' || message.type === 'handoff') {
      protocols.push('aisp');
    }

    // Use C2C if both agents are local and compatible
    if (sender.isLocal && receiver.isLocal) {
      const fuser = this.c2c.getFuser(sender.model, receiver.model);
      if (fuser) {
        protocols.push('c2c');
      }
    }

    // Always apply ADOL for efficiency
    protocols.push('adol');

    // Compress reasoning for long chains
    if (message.reasoning && message.reasoning.length > 500) {
      protocols.push('thought-compression');
    }

    return new ProtocolStack(protocols);
  }
}
```

### 7.3 Token Savings Analysis

| Scenario | Baseline | With Compression | Savings |
|----------|----------|------------------|---------|
| Simple task handoff | 150 tokens | 35 tokens | 77% |
| Complex reasoning share | 2000 tokens | 200 tokens | 90% |
| Multi-agent consensus | 5000 tokens | 500 tokens | 90% |
| Local-to-local (C2C) | 1000 tokens | 0 tokens | 100% |

---

## Part 8: Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

**Goal:** Complete local provider infrastructure

| Task | Priority | Owner |
|------|----------|-------|
| Implement Ollama provider client | P0 | Core |
| Add health monitoring for local models | P0 | Core |
| Extend multi-model router for local | P1 | Core |
| Create model download/setup utility | P1 | DevEx |
| Add ONNX provider for edge cases | P2 | Core |

**Deliverables:**
- `npx claude-flow providers add ollama`
- `npx claude-flow agent spawn --model qwen2.5:7b`
- Health check: `npx claude-flow doctor --check-local`

### Phase 2: AISP Protocol (Weeks 3-4)

**Goal:** Symbolic protocol for unambiguous communication

| Task | Priority | Owner |
|------|----------|-------|
| Fork/integrate aisp-open-core | P0 | Protocol |
| Create AISP parser and validator | P0 | Protocol |
| Implement task-to-AISP converter | P1 | Protocol |
| Add quality grading system | P1 | Protocol |
| Integrate with message bus | P0 | Core |

**Deliverables:**
- `npx claude-flow aisp convert "task description"`
- `npx claude-flow aisp validate spec.aisp`
- AISP-encoded task handoffs

### Phase 3: C2C Integration (Weeks 5-6)

**Goal:** Direct semantic communication for local models

| Task | Priority | Owner |
|------|----------|-------|
| Integrate thu-nics/C2C library | P0 | ML |
| Create Ollama KV-cache bridge | P0 | ML |
| Implement multi-sharer fusion | P1 | ML |
| Add swarm topology support | P1 | Core |
| Performance benchmarks | P2 | Perf |

**Deliverables:**
- C2C-enabled agent communication
- 2x latency improvement for local swarms
- Benchmark report

### Phase 4: ADOL & Compression (Weeks 7-8)

**Goal:** Token-efficient message layer

| Task | Priority | Owner |
|------|----------|-------|
| Implement schema deduplication | P0 | Protocol |
| Add adaptive field inclusion | P1 | Protocol |
| Implement verbosity control | P1 | Protocol |
| Add thought compression | P2 | ML |
| Create unified pipeline | P0 | Core |

**Deliverables:**
- 40-60% token reduction
- Compressed reasoning sharing
- Protocol metrics dashboard

### Phase 5: Production Hardening (Weeks 9-10)

**Goal:** Production-ready hybrid swarms

| Task | Priority | Owner |
|------|----------|-------|
| Fallback chains (local → cloud) | P0 | Core |
| Error recovery mechanisms | P0 | Core |
| Performance optimization | P1 | Perf |
| Security audit | P0 | Security |
| Documentation | P1 | DevEx |

**Deliverables:**
- Resilient hybrid swarms
- Security-audited protocols
- Complete documentation

---

## Part 9: Configuration & Usage

### 9.1 Configuration File

```json
{
  "providers": {
    "local": {
      "ollama": {
        "enabled": true,
        "host": "http://localhost:11434",
        "models": ["qwen2.5:7b", "llama3.2:3b"],
        "healthCheckInterval": 30000
      },
      "onnx": {
        "enabled": false,
        "modelPath": "./models/phi-4-mini.onnx"
      }
    },
    "cloud": {
      "anthropic": { "enabled": true },
      "openai": { "enabled": false },
      "gemini": {
        "enabled": true,
        "model": "gemini-3-pro",
        "command": "gemini",
        "dailyTokenLimit": 2000000,
        "preferForHighContext": true,
        "preferForLongRunning": true,
        "fallbackWhenAnthropicRateLimited": true
      }
    }
  },

  "routing": {
    "preferLocal": true,
    "fallbackToCloud": true,
    "complexityThresholds": {
      "local": 0.6,
      "cloud": 1.0
    }
  },

  "protocols": {
    "aisp": {
      "enabled": true,
      "minQuality": "silver",
      "autoConvert": true
    },
    "c2c": {
      "enabled": true,
      "fusers": ["qwen2.5-7b→qwen2.5-14b"]
    },
    "adol": {
      "enabled": true,
      "verbosity": "minimal",
      "schemaDedup": true
    },
    "thoughtCompression": {
      "enabled": true,
      "method": "step-entropy",
      "threshold": 0.2
    }
  }
}
```

### 9.2 CLI Commands

```bash
# Setup local models
npx claude-flow@v3 providers add ollama
npx claude-flow@v3 providers test ollama
npx claude-flow@v3 models pull qwen2.5:7b

# Setup Gemini-3-Pro provider
npx claude-flow@v3 providers add gemini --command gemini --daily-limit 2000000
npx claude-flow@v3 providers test gemini
npx claude-flow@v3 providers status gemini  # Check daily token usage

# Spawn local agents
npx claude-flow@v3 agent spawn -t coder --model qwen2.5:7b --local
npx claude-flow@v3 agent spawn -t researcher --model qwen2.5:14b --local

# Spawn Gemini-powered agents (for high-context tasks)
npx claude-flow@v3 agent spawn -t researcher --provider gemini --model gemini-3-pro
npx claude-flow@v3 agent spawn -t analyzer --provider gemini --long-running

# Initialize hybrid swarm (local + multi-cloud)
npx claude-flow@v3 swarm init --topology hierarchical --local-workers 4 --cloud-queen
npx claude-flow@v3 swarm init --topology hierarchical \
  --queen anthropic:claude-opus-4-5 \
  --workers ollama:qwen2.5:7b,gemini:gemini-3-pro,ollama:llama3.2:3b \
  --fallback gemini:gemini-3-pro

# Protocol tools
npx claude-flow@v3 aisp convert "find all security issues"
npx claude-flow@v3 aisp validate ./task.aisp
npx claude-flow@v3 protocols status

# Compression metrics
npx claude-flow@v3 metrics compression --last-hour

# Token budget management
npx claude-flow@v3 providers budget gemini              # Check remaining tokens
npx claude-flow@v3 providers budget gemini --reset      # Reset daily counter
npx claude-flow@v3 providers budget --all               # All provider budgets
```

### 9.3 Programmatic Usage

```typescript
import { ClaudeFlow } from 'claude-flow';

const flow = new ClaudeFlow({
  providers: {
    local: { ollama: { enabled: true } },
    cloud: {
      anthropic: { enabled: true },
      gemini: { enabled: true, command: 'gemini', dailyTokenLimit: 2_000_000 }
    }
  },
  protocols: {
    aisp: { enabled: true },
    c2c: { enabled: true }
  }
});

// Initialize hybrid swarm with multi-cloud + local
const swarm = await flow.swarm.init({
  topology: 'hierarchical',
  queen: { provider: 'anthropic', model: 'claude-opus-4-5' },
  workers: [
    { type: 'coder', provider: 'ollama', model: 'qwen2.5:7b' },
    { type: 'researcher', provider: 'gemini', model: 'gemini-3-pro' }, // High-context research
    { type: 'tester', provider: 'ollama', model: 'llama3.2:3b' },
    { type: 'reviewer', provider: 'ollama', model: 'qwen2.5:3b' }
  ],
  fallback: {
    // When Anthropic rate-limited, use Gemini for queen tasks
    anthropicRateLimited: { provider: 'gemini', model: 'gemini-3-pro' }
  }
});

// Execute with automatic protocol selection
const result = await swarm.execute({
  task: 'Implement user authentication with tests',
  protocols: ['aisp', 'c2c', 'adol'] // Automatic selection if omitted
});

// Example: Long-running codebase analysis (benefits from Gemini's no-window limits)
const analysisSwarm = await flow.swarm.init({
  topology: 'hierarchical',
  queen: { provider: 'gemini', model: 'gemini-3-pro' }, // No 5-hour windows
  workers: [
    { type: 'analyzer', provider: 'gemini', model: 'gemini-3-pro' },
    { type: 'documenter', provider: 'ollama', model: 'qwen2.5:7b' }
  ]
});

// Check token budget
console.log(`Gemini tokens remaining: ${flow.providers.gemini.getRemainingDailyTokens()}`);
```

---

## Part 10: Performance Targets

### 10.1 Latency Targets

| Operation | Cloud Only | Hybrid | Improvement |
|-----------|------------|--------|-------------|
| Simple task | 2-3s | 0.5-1s | 3-5x |
| Agent handoff | 500ms | 50ms (C2C) | 10x |
| Full reasoning | 5-10s | 2-3s | 3x |
| Swarm consensus | 10s | 2s | 5x |

### 10.2 Token Efficiency Targets

| Scenario | Baseline | Target | Reduction |
|----------|----------|--------|-----------|
| Task specification | 100% | 40% | 60% |
| Agent communication | 100% | 20% | 80% |
| Reasoning sharing | 100% | 10% | 90% |
| Local-to-local | 100% | 0% | 100% (C2C) |

### 10.3 Cost Targets

| Swarm Size | Cloud Cost/hr | Hybrid Cost/hr | Savings |
|------------|---------------|----------------|---------|
| 4 agents | $2.50 | $0.50 | 80% |
| 8 agents | $5.00 | $0.75 | 85% |
| 15 agents | $12.00 | $1.50 | 87% |

---

## Part 11: Security Considerations

### 11.1 Local Model Security

```typescript
// v3/@claude-flow/security/src/local-model-guard.ts
export class LocalModelGuard {
  /**
   * Validate model before use
   */
  async validateModel(modelPath: string): Promise<ValidationResult> {
    return {
      checksumValid: await this.verifyChecksum(modelPath),
      signatureValid: await this.verifySignature(modelPath),
      sandboxReady: await this.checkSandbox(),
      permissions: await this.checkPermissions(modelPath)
    };
  }

  /**
   * Sandbox local model execution
   */
  async sandboxedExecution(
    model: LocalModel,
    input: string
  ): Promise<SandboxedResult> {
    // Run in isolated process
    // Limit file system access
    // Rate limit API calls
    // Monitor resource usage
  }
}
```

### 11.2 Protocol Security

| Protocol | Security Measures |
|----------|-------------------|
| AISP | Proof-carrying specifications, signature verification |
| C2C | Cache encryption, model authentication |
| ADOL | Schema validation, field sanitization |

---

## Part 12: Appendices

### A. Repository References

| Project | URL | Integration |
|---------|-----|-------------|
| AISP Open Core | [github.com/bar181/aisp-open-core](https://github.com/bar181/aisp-open-core) | Symbolic protocol |
| Cache-to-Cache | [github.com/thu-nics/C2C](https://github.com/thu-nics/C2C) | KV-cache fusion |
| Ollama | [github.com/ollama/ollama](https://github.com/ollama/ollama) | Local models |
| Swarms | [github.com/kyegomez/swarms](https://github.com/kyegomez/swarms) | Orchestration reference |
| LMCache | [github.com/LMCache/LMCache](https://github.com/LMCache/LMCache) | KV-cache sharing |
| **Gemini CLI** | CLI command: `gemini` | **Cloud provider (2M tokens/day)** |

### B. Research Papers

- [Cache-to-Cache: Direct Semantic Communication](https://arxiv.org/abs/2510.03215) - Tsinghua/CUHK
- [Compressed Chain-of-Thought](https://arxiv.org/html/2505.16782v1) - Latent reasoning
- [Step Entropy Compression](https://arxiv.org/pdf/2508.03346) - 80% token reduction
- [ADOL Protocol](https://datatracker.ietf.org/doc/html/draft-chang-agent-token-efficient-01) - IETF draft

### C. Model Recommendations by Task

| Task Type | Recommended Model | Provider | Rationale |
|-----------|-------------------|----------|-----------|
| Code generation | Qwen2.5-Coder-7B | Ollama | Optimized for code |
| Reasoning | DeepSeek-R1-7B | Ollama | Long reasoning chains |
| Fast review | Qwen2.5-3B | Ollama | Speed over depth |
| Math/Logic | Qwen-Math-7B | Ollama | Specialized |
| Complex tasks | Claude Sonnet | Anthropic | Highest capability |
| Strategic | Claude Opus | Anthropic | Deep reasoning |
| **Large context research** | **Gemini-3-Pro** | **Gemini CLI** | **1M+ context, entire codebases** |
| **Long-running analysis** | **Gemini-3-Pro** | **Gemini CLI** | **No 5-hour windows, 2M/day** |
| **Burst workloads** | **Gemini-3-Pro** | **Gemini CLI** | **High daily capacity** |
| **Anthropic fallback** | **Gemini-3-Pro** | **Gemini CLI** | **Rate limit bypass** |

### D. Claude vs Gemini-3-Pro Comparison

| Feature | Claude (Opus/Sonnet) | Gemini-3-Pro |
|---------|---------------------|--------------|
| **Daily token limit** | Usage-based (paid) | 2M tokens FREE |
| **Rate limiting** | 5-hour windows | None |
| **Context window** | 200K (Sonnet), 200K (Opus) | 1M+ |
| **Invocation** | `claude` CLI | `gemini` CLI |
| **Best for** | Complex reasoning, code gen | Large context, sustained work |
| **Availability** | May hit rate limits | Always available |
| **Cost** | $0.003-0.015/1K tokens | $0 (within daily limit) |

**Decision Matrix:**

| Use Claude When... | Use Gemini-3-Pro When... |
|-------------------|-------------------------|
| Complex multi-step reasoning | Analyzing entire codebases |
| Code generation with high precision | Long-running batch tasks |
| Security-critical decisions | Rate-limited by Anthropic |
| Tool-intensive workflows | Research requiring 500K+ context |
| Opus-level strategic planning | Continuous operation (no windows) |

### E. Compression Technique Comparison

| Technique | Reduction | Accuracy | Latency | Best For |
|-----------|-----------|----------|---------|----------|
| AISP | 60% | +2% (less ambiguity) | +10ms | Task specs |
| ADOL | 40-60% | 0% | +5ms | All messages |
| C2C | 100% | +8-10% | -50% | Local-to-local |
| Step Entropy | 80% | 0 to +2% | +20ms | Reasoning |
| F-CoT | 60-70% | -1 to 0% | +10ms | Quick tasks |

### F. Multi-Cloud Fallback Strategy

```
Priority Order:
1. Local (Ollama) - If preferLocal && available
2. Claude Opus/Sonnet - For complex reasoning (if not rate-limited)
3. Gemini-3-Pro - High context, long-running, or when Claude rate-limited
4. Claude Haiku - Simple tasks, low latency
5. Local fallback - Privacy mode, offline, or all cloud unavailable

Rate Limit Recovery:
- Anthropic 5-hour window hit → Route to Gemini-3-Pro
- Gemini daily limit hit (2M) → Route to local models
- All cloud unavailable → Local-only mode
```

---

## Appendix G: ELI5 Ubuntu Setup Guide - Deploy Swarm Agents on Your Network

This guide explains how to set up Ubuntu machines (laptops, desktops, servers) as swarm workers. Written for beginners - no prior Linux experience required.

### G.1 What We're Building (The Big Picture)

**Imagine this:** You have a main computer where you work. But you also have:
- An old laptop sitting in the corner
- A desktop PC you use for gaming
- Maybe a server or Raspberry Pi

Instead of those machines sitting idle, we'll turn them into AI workers that help your main computer think faster. It's like having a team of assistants, each running on a different computer in your house/office.

```
    YOUR MAIN COMPUTER (Boss)
           |
    Your WiFi/Network
           |
    ┌──────┼──────┐
    │      │      │
 Laptop  Desktop  Server
 (Worker) (Worker) (Worker)

When you ask Claude to do something complex,
it can send parts of the work to your other computers!
```

**Why would you want this?**
- 🆓 **Free AI** - Run AI models without paying per-token
- 🔒 **Private** - Your data never leaves your network
- ⚡ **Faster** - Multiple computers = parallel processing
- 🎮 **Use idle hardware** - Put that gaming PC to work!

### G.2 What You Need (Prerequisites)

**For each worker machine:**

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Ubuntu Version | 22.04 LTS | 24.04 LTS |
| RAM | 8 GB | 16+ GB |
| Storage | 20 GB free | 100+ GB free |
| Network | Same WiFi/LAN | Ethernet preferred |
| GPU (optional) | - | NVIDIA with 8+ GB VRAM |

**Don't have a GPU?** No problem! CPUs can run smaller models (0.5B-3B parameters) just fine. They're slower but still useful for simple tasks.

**Model Size Guide:**

| Model Size | VRAM Needed | Example Models | Good For |
|------------|-------------|----------------|----------|
| 0.5B-1B | CPU or 2GB | Qwen 0.5B, Phi-3 mini | Simple Q&A, fast responses |
| 3B-7B | 4-8 GB | Qwen 7B, Llama 3.2 | General tasks, coding help |
| 13B-14B | 10-12 GB | Qwen 14B | Better reasoning |
| 32B-34B | 20-24 GB | Qwen 32B, DeepSeek 33B | Near cloud-quality |
| 70B | 40-48 GB | Llama 70B | Best local quality |

### G.3 Step-by-Step Setup for Each Worker Machine

#### Step 1: Install Ubuntu (Skip if already installed)

1. Download Ubuntu from: https://ubuntu.com/download/desktop
2. Create a bootable USB using Rufus (Windows) or Etcher (Mac)
3. Boot from USB and follow the installer
4. Choose "Minimal installation" to save space

#### Step 2: Open Terminal

Press `Ctrl + Alt + T` or search for "Terminal" in your applications.

#### Step 3: Update Your System

Copy and paste this (press Enter after):

```bash
sudo apt update && sudo apt upgrade -y
```

It will ask for your password (the one you created during Ubuntu install). When you type, you won't see anything - that's normal. Just type and press Enter.

#### Step 4: Install Ollama

Copy and paste this one line:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Wait for it to finish. You'll see "Install complete" when done.

#### Step 5: Configure Ollama for Network Access

By default, Ollama only talks to itself. We need to tell it to accept connections from other computers.

```bash
# Create a configuration folder
sudo mkdir -p /etc/systemd/system/ollama.service.d/

# Create the configuration file
sudo tee /etc/systemd/system/ollama.service.d/override.conf << 'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
EOF

# Reload and restart Ollama
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

**What does this do?** `0.0.0.0:11434` tells Ollama to listen on all network interfaces (not just localhost), so other computers can connect.

#### Step 6: Open the Firewall

```bash
# If UFW (firewall) is installed, allow Ollama's port
sudo ufw allow 11434/tcp comment 'Ollama API'
sudo ufw allow 3456/tcp comment 'Claude Flow Agent'

# If UFW isn't active, that's fine - skip this step
```

#### Step 7: Download AI Models

Now let's download some AI models. Choose based on your hardware:

**For CPU-only or low VRAM (< 4GB):**
```bash
ollama pull qwen2.5:0.5b
ollama pull phi3:mini
```

**For 8GB VRAM:**
```bash
ollama pull qwen2.5:7b
ollama pull llama3.2:3b
```

**For 12GB VRAM:**
```bash
ollama pull qwen2.5:14b
ollama pull codestral:22b
```

**For 24GB+ VRAM:**
```bash
ollama pull qwen2.5:32b
ollama pull deepseek-coder:33b
```

💡 **Tip:** You can run `ollama list` to see what models you have installed.

#### Step 8: Test Ollama is Working

```bash
# Test locally first
ollama run qwen2.5:0.5b "Say hello"

# Test it's accessible on the network
curl http://localhost:11434/api/tags
```

You should see a list of your models in JSON format.

#### Step 9: Find Your Machine's IP Address

```bash
hostname -I | awk '{print $1}'
```

Write this down! It will look like `192.168.1.101`. You'll need it to connect from your main computer.

#### Step 10: Install the Claude Flow Agent (Optional but Recommended)

The agent provides better integration, health reporting, and auto-discovery:

```bash
# Install Node.js if you don't have it
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install the claude-flow agent
sudo npm install -g @claude-flow/agent

# Create configuration
mkdir -p ~/.claude-flow
cat > ~/.claude-flow/agent.json << EOF
{
  "agent": {
    "id": "$(hostname)-agent",
    "host": "0.0.0.0",
    "port": 3456,
    "advertise": "$(hostname -I | awk '{print $1}')"
  },
  "ollama": {
    "host": "http://localhost:11434"
  },
  "models": ["qwen2.5:7b"],
  "discovery": {
    "enabled": true,
    "method": "mdns"
  }
}
EOF

echo "Configuration saved to ~/.claude-flow/agent.json"
```

#### Step 11: Set Up Auto-Start (So It Runs After Reboot)

```bash
# Create a service file
sudo tee /etc/systemd/system/claude-flow-agent.service << EOF
[Unit]
Description=Claude Flow Agent
After=network.target ollama.service

[Service]
Type=simple
User=$USER
ExecStart=$(which npx) @claude-flow/agent start
Restart=always
RestartSec=10
Environment=HOME=$HOME

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable claude-flow-agent
sudo systemctl start claude-flow-agent

# Check it's running
sudo systemctl status claude-flow-agent
```

#### Step 12: Verify Everything Works

From another computer on your network:

```bash
# Replace 192.168.1.101 with your worker's IP
curl http://192.168.1.101:11434/api/tags
```

You should see the list of models. If it works, your worker is ready! 🎉

### G.4 Setting Up Your Main Computer (Coordinator)

On your main workstation where you run Claude Code:

#### Option A: Auto-Discovery (Easiest)

If all machines are on the same network, claude-flow can find them automatically:

```bash
# Discover all agents
npx claude-flow@v3 network discover

# You should see something like:
# Found 3 agents:
#   laptop-ubuntu (192.168.1.101) - qwen2.5:7b [RTX 3080, 12GB]
#   desktop-pc (192.168.1.102) - qwen2.5:32b [RTX 4090, 24GB]
#   old-laptop (192.168.1.103) - qwen2.5:0.5b [CPU, 8GB RAM]
```

#### Option B: Manual Configuration

If auto-discovery doesn't work (corporate networks, VLANs), add them manually:

```bash
# Add each worker
npx claude-flow@v3 network add-host 192.168.1.101 --name laptop-worker
npx claude-flow@v3 network add-host 192.168.1.102 --name desktop-worker

# Or edit the config file directly
```

Add to your `claude-flow.config.json`:

```json
{
  "network": {
    "enabled": true,
    "discovery": {
      "method": "static",
      "hosts": [
        { "name": "laptop-worker", "host": "192.168.1.101", "port": 11434 },
        { "name": "desktop-worker", "host": "192.168.1.102", "port": 11434 },
        { "name": "server-worker", "host": "192.168.1.103", "port": 11434 }
      ]
    }
  }
}
```

### G.5 Using Your Network Swarm

Now you can use your distributed swarm:

```bash
# Spawn a coder agent that runs on your desktop's RTX 4090
npx claude-flow@v3 agent spawn -t coder --model qwen2.5:32b --node desktop-worker

# Or let the system auto-select the best node
npx claude-flow@v3 agent spawn -t researcher --model qwen2.5:14b --prefer-network

# Initialize a full swarm using network resources
npx claude-flow@v3 swarm init --topology hierarchical \
  --queen anthropic:claude-opus-4-5 \
  --workers network:qwen2.5:32b,network:qwen2.5:7b,network:llama3.2:3b
```

### G.6 Troubleshooting Common Issues

#### "Connection refused" when connecting to worker

**Problem:** Your main computer can't reach the worker.

**Solutions:**
1. Check the worker's IP: `hostname -I`
2. Make sure Ollama is running: `sudo systemctl status ollama`
3. Check firewall: `sudo ufw status` - port 11434 should be allowed
4. Test locally first: `curl http://localhost:11434/api/tags` on the worker

#### "No models found" on worker

**Problem:** Ollama is running but has no models.

**Solution:**
```bash
# On the worker, download a model
ollama pull qwen2.5:7b

# Verify it's there
ollama list
```

#### Worker is slow or unresponsive

**Problem:** The worker takes forever to respond.

**Solutions:**
1. Check CPU/GPU usage: `htop` or `nvidia-smi`
2. You might be running a model too large for your hardware
3. Try a smaller model: `ollama pull qwen2.5:3b`
4. Use ethernet instead of WiFi for better network performance

#### "Out of memory" errors

**Problem:** Model is too big for your VRAM/RAM.

**Solutions:**
1. Use a smaller model
2. Close other GPU-using applications
3. For NVIDIA: Check usage with `nvidia-smi`
4. Restart Ollama: `sudo systemctl restart ollama`

#### Agent not auto-discovered

**Problem:** mDNS discovery doesn't find your agents.

**Solutions:**
1. Make sure `avahi-daemon` is installed: `sudo apt install avahi-daemon`
2. Both machines must be on the same network subnet
3. Some corporate networks block mDNS - use static configuration instead
4. Check if the agent is advertising: `avahi-browse -a`

### G.7 Quick Reference Card

**On Each Worker:**
```bash
# Start Ollama
sudo systemctl start ollama

# Check Ollama status
sudo systemctl status ollama

# View available models
ollama list

# Download a new model
ollama pull <model-name>

# Check your IP address
hostname -I

# View agent logs
journalctl -u claude-flow-agent -f
```

**On Your Main Computer:**
```bash
# Discover network agents
npx claude-flow@v3 network discover

# Check agent health
npx claude-flow@v3 network health

# Spawn agent on specific node
npx claude-flow@v3 agent spawn -t coder --node <worker-name>

# View network topology
npx claude-flow@v3 network topology
```

### G.8 One-Line Setup Script

For experienced users, here's a complete setup script you can run on each Ubuntu worker:

```bash
curl -fsSL https://raw.githubusercontent.com/your-repo/claude-flow/main/scripts/setup-worker.sh | bash
```

Or manually:

```bash
#!/bin/bash
# Claude Flow Worker Setup Script
# Run on each Ubuntu machine you want to add to your swarm

set -e

echo "🤖 Claude Flow Worker Setup"
echo "=========================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Install Ollama
echo -e "\n${GREEN}[1/6]${NC} Installing Ollama..."
if ! command -v ollama &> /dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
else
    echo "Ollama already installed"
fi

# Step 2: Configure for network
echo -e "\n${GREEN}[2/6]${NC} Configuring network access..."
sudo mkdir -p /etc/systemd/system/ollama.service.d/
sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null << 'CONF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
CONF
sudo systemctl daemon-reload
sudo systemctl restart ollama

# Step 3: Firewall
echo -e "\n${GREEN}[3/6]${NC} Configuring firewall..."
if command -v ufw &> /dev/null; then
    sudo ufw allow 11434/tcp comment 'Ollama' 2>/dev/null || true
    sudo ufw allow 3456/tcp comment 'Claude Flow Agent' 2>/dev/null || true
fi

# Step 4: Detect GPU and pull appropriate model
echo -e "\n${GREEN}[4/6]${NC} Detecting hardware and pulling models..."
if command -v nvidia-smi &> /dev/null; then
    VRAM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
    echo "Detected NVIDIA GPU with ${VRAM}MB VRAM"
    if [ "$VRAM" -ge 20000 ]; then
        ollama pull qwen2.5:32b
    elif [ "$VRAM" -ge 10000 ]; then
        ollama pull qwen2.5:14b
    else
        ollama pull qwen2.5:7b
    fi
else
    echo "No NVIDIA GPU detected, using CPU-friendly model"
    ollama pull qwen2.5:3b
fi

# Step 5: Install Node.js and agent
echo -e "\n${GREEN}[5/6]${NC} Installing Claude Flow agent..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi
sudo npm install -g @claude-flow/agent

# Step 6: Configure and start agent
echo -e "\n${GREEN}[6/6]${NC} Starting agent service..."
MY_IP=$(hostname -I | awk '{print $1}')
mkdir -p ~/.claude-flow
cat > ~/.claude-flow/agent.json << AGENTCONF
{
  "agent": {
    "id": "$(hostname)-agent",
    "host": "0.0.0.0",
    "port": 3456,
    "advertise": "$MY_IP"
  },
  "ollama": { "host": "http://localhost:11434" },
  "discovery": { "enabled": true, "method": "mdns" }
}
AGENTCONF

# Create and start service
sudo tee /etc/systemd/system/claude-flow-agent.service > /dev/null << SVCCONF
[Unit]
Description=Claude Flow Agent
After=network.target ollama.service
[Service]
Type=simple
User=$USER
ExecStart=$(which npx) @claude-flow/agent start
Restart=always
RestartSec=10
Environment=HOME=$HOME
[Install]
WantedBy=multi-user.target
SVCCONF

sudo systemctl daemon-reload
sudo systemctl enable claude-flow-agent
sudo systemctl start claude-flow-agent

# Done!
echo ""
echo "=================================="
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Your worker is available at: $MY_IP"
echo "Ollama API: http://$MY_IP:11434"
echo "Agent API:  http://$MY_IP:3456"
echo ""
echo "Models installed:"
ollama list
echo ""
echo -e "${YELLOW}Next step:${NC} On your main computer, run:"
echo "  npx claude-flow@v3 network discover"
echo "=================================="
```

Save this as `setup-worker.sh`, make it executable (`chmod +x setup-worker.sh`), and run it on each Ubuntu machine.

---

## Conclusion

This plan extends claude-flow to support local LLMs, multi-cloud providers, and **networked distributed agents** as first-class swarm participants with five key innovations:

1. **AISP Protocol**: Eliminates communication ambiguity through mathematical notation
2. **C2C Integration**: Enables direct semantic transfer between local models
3. **ADOL + Compression**: Reduces token overhead by 60-90%
4. **Gemini-3-Pro Integration**: High-capacity cloud fallback with 2M daily tokens and no rate windows
5. **Networked Local Agents**: Distributed swarm across LAN devices with auto-discovery and load balancing

The result is a hybrid swarm architecture that can:
- Run offline with full local models
- Mix cloud intelligence (Claude + Gemini) with local execution
- **Distribute workloads across multiple machines on your network**
- **Leverage heterogeneous hardware (GPUs, CPUs, different VRAM sizes)**
- Seamlessly fallback when rate-limited (Anthropic → Gemini → Local)
- Handle large-context tasks with Gemini's 1M+ context window
- Operate continuously without 5-hour window interruptions
- Communicate with minimal token overhead
- Maintain semantic precision across heterogeneous models
- **Auto-discover and coordinate agents via mDNS/Bonjour**

**Expected Outcomes:**
- 80-87% cost reduction with local workers
- 3-10x latency improvement for local operations
- 60-100% token reduction through compression
- <2% ambiguity rate (vs 40-65% natural language)
- 2M tokens/day additional capacity via Gemini-3-Pro
- Zero downtime from rate limiting (multi-cloud fallback)
- **Utilize idle hardware (laptops, desktops, servers) as swarm workers**
- **Scale horizontally by adding more network nodes**

---

*Document Version: 1.2.0*
*Last Updated: 2026-02-01*
*Author: Claude Code + Swarm Research*
*Revisions:*
- *1.0.0: Initial local agent swarm integration plan*
- *1.1.0: Added Gemini-3-Pro integration (2M tokens/day, no rate windows)*
- *1.2.0: Added networked local agents with LAN distribution and ELI5 Ubuntu setup guide*
