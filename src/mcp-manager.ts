/**
 * mcp-manager.ts
 * Gerenciador de Model Context Protocol (MCP)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface MCPConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class MCPManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();

  async connect(config: MCPConfig): Promise<Client> {
    if (this.clients.has(config.name)) {
      return this.clients.get(config.name)!;
    }

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args || [],
      env: config.env as { [key: string]: string } | undefined,
    });

    const client = new Client(
      {
        name: config.name,
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);

    this.clients.set(config.name, client);
    this.transports.set(config.name, transport);

    return client;
  }

  async disconnect(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      await client.close();
      this.clients.delete(name);
      this.transports.delete(name);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const [name] of this.clients) {
      await this.disconnect(name);
    }
  }

  getClient(name: string): Client | undefined {
    return this.clients.get(name);
  }

  listClients(): string[] {
    return Array.from(this.clients.keys());
  }
}

export const mcpManager = new MCPManager();
