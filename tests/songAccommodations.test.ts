import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { getFunctionName } from 'convex/server';
import { describe, expect, it, vi } from 'vitest';
import { SongAdminPage } from '../src/pages/SongAdminPage';
import { formatMoney } from '../src/lib/money';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('convex/react', async (load) => ({
  ...(await load<typeof import('convex/react')>()),
  useQuery: query,
  useMutation: () => vi.fn(),
}));
vi.mock('../src/components/AdminShell', () => ({
  useAdminProperty: () => ({
    property: { propertyId: 'property', slug: 'song-homestay', timezone: 'Asia/Ho_Chi_Minh' },
  }),
}));

function renderCatalog(rateFields: object) {
  const unit = { unitTypeId: 'unit', name: 'Căn biển', photoUrls: [], highlights: [], amenities: [], ...rateFields };
  query.mockImplementation((ref, args) => {
    if (args === 'skip') return undefined;
    switch (getFunctionName(ref)) {
      case 'songHomestay:adminSnapshot': return {};
      case 'songHomestay:managementCatalog': return { property: { currency: 'VND' }, unitTypes: [unit] };
      case 'properties:bySlug': return { unitTypes: [{ unitTypeId: 'unit', fromPriceCents: 65000000 }] };
    }
  });
  return renderToString(createElement(SongAdminPage, { section: 'accommodations' }));
}

describe('Quản lý chỗ nghỉ', () => {
  it('renders the published price and room editor with a legacy catalog', () => {
    const html = renderCatalog({});
    expect(html).toContain('Căn biển');
    expect(html).toContain('Lưu');
    expect(html).toContain(formatMoney(65000000, 'VND'));
  });

  it('distinguishes an empty rate list from editable active rates', () => {
    expect(renderCatalog({ rates: [] })).toContain('Chưa có bảng giá đang hoạt động');
    const html = renderCatalog({ rates: [{ id: 'rate', name: 'Giá chuẩn', cents: 69000000 }] });
    expect(html).toContain('Giá chuẩn');
    expect(html).toContain('value="690000"');
  });
});
