import { Injectable } from '@nestjs/common';
import { DEMO, DemoBudget } from '../../domain/demo';
import { RateLimitedError } from '../../domain/errors';

@Injectable()
export class DemoLimits {
  private readonly budget = new DemoBudget();

  request(ip: string | undefined): void {
    this.consume(`requests:${ip ?? 'unknown'}`, DEMO.REQUESTS_PER_MINUTE, 60_000);
    this.consume('requests:global', DEMO.GLOBAL_REQUESTS_PER_MINUTE, 60_000);
  }

  start(ip: string | undefined): void {
    this.consume(`starts:${ip ?? 'unknown'}`, DEMO.STARTS_PER_HOUR, 3_600_000);
    this.consume('starts:global', DEMO.GLOBAL_STARTS_PER_HOUR, 3_600_000);
  }

  compile(ip: string | undefined): void {
    this.consume(`compiles:${ip ?? 'unknown'}`, DEMO.COMPILES_PER_MINUTE, 60_000);
    this.consume('compiles:global', DEMO.GLOBAL_COMPILES_PER_HOUR, 3_600_000);
  }

  private consume(key: string, limit: number, windowMs: number): void {
    const retry = this.budget.consume(key, limit, windowMs);
    if (retry !== null) throw new RateLimitedError(retry, 'demo_rate_limited', 'La demo ha alcanzado su límite temporal. Vuelve a intentarlo más tarde.');
  }
}
