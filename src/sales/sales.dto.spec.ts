import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import 'reflect-metadata';
import { SalesQueryDto } from './dto/sales-query.dto';
import { salesRange } from './sales.utils';
describe('销售统计北京时间边界', () => {
  it.each([
    [
      'today',
      '2026-10-10T15:59:59.999Z',
      '2026-10-09T16:00:00.000Z',
      '2026-10-10T16:00:00.000Z',
    ],
    [
      'today',
      '2026-10-10T16:00:00.000Z',
      '2026-10-10T16:00:00.000Z',
      '2026-10-11T16:00:00.000Z',
    ],
    [
      'week',
      '2026-01-01T00:00:00Z',
      '2025-12-25T16:00:00.000Z',
      '2026-01-01T16:00:00.000Z',
    ],
    [
      'month',
      '2024-02-29T12:00:00Z',
      '2024-01-31T16:00:00.000Z',
      '2024-02-29T16:00:00.000Z',
    ],
    [
      'month',
      '2026-02-28T16:00:00Z',
      '2026-02-28T16:00:00.000Z',
      '2026-03-01T16:00:00.000Z',
    ],
  ])('%s %s', (period, now, start, end) => {
    const range = salesRange(period as SalesQueryDto['period'], new Date(now));
    expect(range.start.toISOString()).toBe(start);
    expect(range.end.toISOString()).toBe(end);
  });
  it.each([
    {},
    { storeId: '0', period: 'today' },
    { storeId: '-1', period: 'today' },
    { storeId: '1.5', period: 'today' },
    { storeId: '2147483648', period: 'today' },
    { storeId: '1', period: 'year' },
    { storeId: 'bad', period: 'month' },
  ])('拒绝无效筛选 %j', async (query) => {
    expect(
      (await validate(plainToInstance(SalesQueryDto, query))).length,
    ).toBeGreaterThan(0);
  });
  it('接受门店和全部已有时间筛选', async () => {
    for (const period of ['today', 'week', 'month']) {
      const query = plainToInstance(SalesQueryDto, { storeId: '42', period });
      expect(await validate(query)).toEqual([]);
      expect(query.storeId).toBe(42);
    }
  });
});
