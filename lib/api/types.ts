export interface PaginationQuery {
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
}

export interface MessageQuery extends PaginationQuery {
  topic?: string;
  type?: 'publish' | 'query' | 'response';
}

export interface PeerQuery {
  status?: 'online' | 'offline';
  limit?: number;
}
