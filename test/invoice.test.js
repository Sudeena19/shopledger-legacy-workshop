const test = require('node:test');
const assert = require('node:assert/strict');

const pricing = require('../lib/pricing');
const invoice = require('../lib/invoice');
const reports = require('../lib/reports');

test('order pricing uses the HSN GST slab and taxes the discounted taxable value', () => {
  const items = [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }];

  assert.deepEqual(pricing.computeTotals(items, ''), {
    subtotal: 100,
    discount: 0,
    taxable: 100,
    tax: 5,
    cgst: 2.5,
    sgst: 2.5,
    total: 105,
    lines: [{
      id: 1, name: 'Rice', hsn: '1006', gstPercent: 5,
      gross: 100, discount: 0, taxable: 100, tax: 5, net: 105
    }]
  });
});

test('invoice GST and total match the HSN slab used when the customer was billed', () => {
  const order = {
    items: [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }],
    coupon: '', total: 105
  };

  assert.deepEqual(invoice.computeInvoiceFigures(order), {
    subtotal: 100, discount: 0, tax: 5, cgst: 2.5, sgst: 2.5,
    total: 105,
    rows: [{ name: 'Rice', sku: '-', hsn: '1006', qty: 1, price: 100,
      gstPercent: 5, line: 100, lineTax: 5 }]
  });
  assert.doesNotMatch(invoice.render(order), /differs from Order Ledger recorded total/);
});

test('invoice taxes the post-discount value for a flat coupon', () => {
  const order = {
    items: [{ name: 'Staples', hsn: '1006', price: 1000, qty: 1 }],
    coupon: 'FLAT50', subtotal: 1000, discount: 50, tax: 47.5, total: 997.5
  };
  const billed = pricing.computeTotals(order.items, order.coupon);

  assert.deepEqual({ subtotal: billed.subtotal, discount: billed.discount,
    tax: billed.tax, total: billed.total },
  { subtotal: 1000, discount: 50, tax: 47.5, total: 997.5 });
  assert.deepEqual(invoice.computeInvoiceFigures(order), {
    subtotal: 1000, discount: 50, tax: 47.5, cgst: 23.75, sgst: 23.75,
    total: 997.5,
    rows: [{ name: 'Staples', sku: '-', hsn: '1006', qty: 1, price: 1000,
      gstPercent: 5, line: 1000, lineTax: 47.5 }]
  });
});

test('invoice percentage coupon uses the same discount as customer billing', () => {
  const order = {
    items: [{ name: 'Bulk goods', hsn: '0902', price: 3000, qty: 1 }],
    coupon: 'WHOLESALE15', subtotal: 3000
  };
  const billed = pricing.computeTotals(order.items, order.coupon);
  const invoiceFigures = invoice.computeInvoiceFigures(order);

  assert.equal(billed.discount, 400);
  assert.equal(invoiceFigures.discount, billed.discount);
  assert.equal(invoiceFigures.tax, billed.tax);
  assert.equal(invoiceFigures.total, billed.total);
});

test('GST reconciliation marks matching in-memory ledger and invoice figures balanced', () => {
  const db = { orders: [{
    id: 7, date: '2026-01-02', customer: 'Test customer', coupon: '',
    subtotal: 100, discount: 0, tax: 5, total: 105,
    items: [{ name: 'Rice', hsn: '1006', price: 100, qty: 1 }]
  }, {
    id: 8, status: 'cancelled', subtotal: 100, discount: 0, tax: 5, total: 105,
    items: [{ name: 'Rice', hsn: '1006', price: 100, qty: 1 }]
  }] };

  assert.deepEqual(reports.getGstReconciliation(db), {
    totalChecked: 1, mismatchCount: 0, totalDelta: 0,
    rows: [{ orderId: 7, date: '2026-01-02', customer: 'Test customer', coupon: '',
      ledgerSubtotal: 100, ledgerDiscount: 0, ledgerTax: 5, ledgerTotal: 105,
      invoiceDiscount: 0, invoiceTax: 5, invoiceTotal: 105,
      delta: 0, matched: true }]
  });
});
