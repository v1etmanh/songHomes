import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { getFunctionName } from 'convex/server';
import { describe, expect, it, vi } from 'vitest';
import { SongAdminPage } from '../src/pages/SongAdminPage';
import { formatMoney } from '../src/lib/money';
import { MemoryRouter } from 'react-router-dom';

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

function renderCatalog(rateFields: object, url = '/admin/accommodations') {
  const unit = { unitTypeId: 'unit', name: 'Căn biển', slug: 'can-bien', photoUrls: [], highlights: [], amenities: [], comingSoon: false, longStay: false, monthlyPriceCents: null, ...rateFields };
  query.mockImplementation((ref, args) => {
    if (args === 'skip') return undefined;
    switch (getFunctionName(ref)) {
      case 'songHomestay:adminSnapshot': return {};
      case 'songHomestay:managementCatalog': return { property: { currency: 'VND' }, unitTypes: [unit] };
    }
  });
  return renderToString(createElement(MemoryRouter, { initialEntries: [url] }, createElement(SongAdminPage, { section: 'accommodations' })));
}

describe('Quản lý chỗ nghỉ', () => {
  it('lists stays in a table with an edit action and an add button (WEBSITE.pdf p.30)', () => {
    const html = renderCatalog({ rates: [{ id: 'rate', name: 'Giá chuẩn', cents: 65000000 }] });
    expect(html).toContain('Căn biển');
    expect(html).toContain('Chỉnh sửa');
    expect(html).toContain('Thêm căn');
    expect(html).toContain(formatMoney(65000000, 'VND'));
    expect(html).not.toContain('Tải ảnh lên'); // editor only opens on demand
  });

  it('opens the editor from the URL with editable rates and photo upload', () => {
    expect(renderCatalog({ rates: [] }, '/admin/accommodations?edit=can-bien')).toContain('Chưa có bảng giá đang hoạt động');
    const html = renderCatalog({ rates: [{ id: 'rate', name: 'Giá chuẩn', cents: 69000000 }] }, '/admin/accommodations?edit=can-bien');
    expect(html).toContain('Giá chuẩn');
    expect(html).toContain('value="690000"');
    expect(html).toContain('Tải ảnh lên');
    expect(html).toContain('Lưu');
  });

  it('shows a monthly price for long-term rentals', () => {
    const html = renderCatalog({ longStay: true, monthlyPriceCents: 2500000000, rates: [{ id: 'rate', name: 'Giá thuê dài hạn', cents: 83333300 }] });
    expect(html).toContain(formatMoney(2500000000, 'VND') + '/tháng');
  });
});
