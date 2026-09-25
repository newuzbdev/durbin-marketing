import { deletedMediaWindow } from './instagram-sync.service.js';

describe('deletedMediaWindow', () => {
  const at = (iso: string) => ({ postedAt: new Date(iso) });

  it('ro‘yxat limitdan kam — hamma qaytgan, qolganlari o‘chirilgan (null = cheklovsiz)', () => {
    expect(deletedMediaWindow([at('2026-09-01T00:00:00Z')], 50)).toBeNull();
    expect(deletedMediaWindow([], 50)).toBeNull();
  });

  it('ro‘yxat to‘la — faqat eng eski qaytgan postdan keyingilar tekshiriladi', () => {
    const items = [at('2026-09-10T00:00:00Z'), at('2026-09-03T00:00:00Z'), at('2026-09-07T00:00:00Z')];
    expect(deletedMediaWindow(items, 3)).toEqual(new Date('2026-09-03T00:00:00Z'));
  });
});
