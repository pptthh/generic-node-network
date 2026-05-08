import { Level } from 'level';
import { join } from 'path';
import { mkdirSync } from 'fs';

export interface ScanOptions {
  gte?: string;
  lte?: string;
  limit?: number;
  reverse?: boolean;
}

export interface BatchOperation {
  type: 'put' | 'del';
  key: string;
  value?: unknown;
}

export class Database {
  private db: Level<string, string> | null = null;
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath === ':memory:' ? dbPath : join(process.cwd(), dbPath.replace(/^\.\//, ''));
  }

  async open(): Promise<void> {
    if (this.db) return;
    if (this.dbPath !== ':memory:') {
      mkdirSync(this.dbPath, { recursive: true });
    }
    this.db = new Level<string, string>(this.dbPath, { valueEncoding: 'utf8' });
    await this.db.open();
  }

  private ensureOpen(): Level<string, string> {
    if (!this.db) throw new Error('Database not open. Call open() first.');
    return this.db;
  }

  async put(key: string, value: unknown): Promise<void> {
    await this.ensureOpen().put(key, JSON.stringify(value));
  }

  async get(key: string): Promise<unknown> {
    const raw = await this.ensureOpen().get(key);
    return JSON.parse(raw);
  }

  async del(key: string): Promise<void> {
    await this.ensureOpen().del(key);
  }

  async *scan(options: ScanOptions = {}): AsyncGenerator<[string, unknown]> {
    const db = this.ensureOpen();
    const iterOptions: Record<string, unknown> = {};
    if (options.gte) iterOptions.gte = options.gte;
    if (options.lte) iterOptions.lte = options.lte;
    if (options.limit) iterOptions.limit = options.limit;
    if (options.reverse) iterOptions.reverse = options.reverse;

    for await (const [key, raw] of db.iterator(iterOptions)) {
      yield [key, JSON.parse(raw as string)];
    }
  }

  async batch(operations: BatchOperation[]): Promise<void> {
    const db = this.ensureOpen();
    const ops = operations.map(op => {
      if (op.type === 'put') {
        return { type: 'put' as const, key: op.key, value: JSON.stringify(op.value) };
      }
      return { type: 'del' as const, key: op.key };
    });
    await db.batch(ops);
  }

  async getSize(): Promise<number> {
    let size = 0;
    for await (const [key, val] of this.ensureOpen().iterator()) {
      size += (key as string).length + (val as string).length;
    }
    return size;
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}
