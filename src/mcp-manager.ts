import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { addLog } from "./web-terminal.js";

export interface MCPServerConfig {
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
}

export class MCPManager {
    private clients: Map<string, Client> = new Map();

    async connectToServer(config: MCPServerConfig) {
        try {
            const transport = new StdioClientTransport({
                command: config.command,
                args: config.args,
                env: { ...process.env, ...config.env }
            });

            const client = new Client(
                { name: "Conecta Claw🦞-Client", version: "1.0.0" },
                { capabilities: {} }
            );

            await client.connect(transport);
            this.clients.set(config.name, client);
            addLog(`✅ MCP: Conectado ao servidor ${config.name}`);
        } catch (error: any) {
            addLog(`❌ MCP: Erro ao conectar ao servidor ${config.name}: ${error.message}`);
        }
    }

    async listTools() {
        const allTools = [];
        for (const [name, client] of this.clients) {
            const response = await client.listTools();
            allTools.push(...response.tools.map(t => ({ ...t, serverName: name })));
        }
        return allTools;
    }

    async callTool(serverName: string, toolName: string, args: any) {
        const client = this.clients.get(serverName);
        if (!client) throw new Error(`Servidor MCP ${serverName} não encontrado`);
        
        addLog(`🎯 MCP: Chamando tool ${toolName} no servidor ${serverName}`);
        return await client.callTool({
            name: toolName,
            arguments: args
        });
    }

    async disconnectAll() {
        for (const client of this.clients.values()) {
            // No explicit disconnect in SDK sometimes, but we can close transport if needed
        }
    }
}

export const mcpManager = new MCPManager();
