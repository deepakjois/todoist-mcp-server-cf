// Generated by Wrangler by running `wrangler types`

interface Env {
	OAUTH_KV: KVNamespace;
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	MCP_OBJECT: DurableObjectNamespace<import("./src/index").MyMCP>;
	AI: Ai;
}
