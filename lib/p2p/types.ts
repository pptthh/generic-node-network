export interface RpcRequest {
  queryId: string;
  action: string;
  params?: Record<string, unknown>;
  sender: string;
  timestamp: number;
  target?: string;
}

export interface RpcResponse {
  queryId: string;
  status: 'success' | 'error';
  response?: unknown;
  error?: string;
  sender: string;
  timestamp: number;
}

export const GNN_RPC_PROTOCOL = '/gnn/rpc/1.0.0';
