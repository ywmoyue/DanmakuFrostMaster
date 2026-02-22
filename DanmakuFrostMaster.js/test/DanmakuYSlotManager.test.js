'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { DanmakuYSlotManager } = require('../src/DanmakuYSlotManager');

test('DanmakuYSlotManager: getY returns slot 0 for empty manager', () => {
    const mgr = new DanmakuYSlotManager(100);
    const outY = { value: -1 };
    const found = mgr.getY(1, 20, outY);
    assert.equal(found, true);
    assert.equal(outY.value, 0);
});

test('DanmakuYSlotManager: second danmaku placed below first', () => {
    const mgr = new DanmakuYSlotManager(100);
    const out1 = { value: -1 };
    const out2 = { value: -1 };
    mgr.getY(1, 20, out1);
    const found2 = mgr.getY(2, 20, out2);
    assert.equal(found2, true);
    assert.equal(out2.value, 20);
});

test('DanmakuYSlotManager: no free slot returns false and a random Y', () => {
    const mgr = new DanmakuYSlotManager(30);
    const out1 = { value: -1 };
    const out2 = { value: -1 };
    mgr.getY(1, 20, out1); // occupies [0..19]
    const found2 = mgr.getY(2, 20, out2); // only 10 px left → cannot fit
    assert.equal(found2, false);
    assert.ok(out2.value >= 0);
});

test('DanmakuYSlotManager: releaseYSlot frees the slot', () => {
    const mgr = new DanmakuYSlotManager(40);
    const out1 = { value: -1 };
    mgr.getY(1, 20, out1);
    mgr.releaseYSlot(1, out1.value);
    const out2 = { value: -1 };
    const found2 = mgr.getY(2, 20, out2);
    assert.equal(found2, true);
    assert.equal(out2.value, 0);
});

test('DanmakuYSlotManager: clear resets all slots', () => {
    const mgr = new DanmakuYSlotManager(40);
    const out = { value: -1 };
    mgr.getY(1, 20, out);
    mgr.clear();
    const out2 = { value: -1 };
    mgr.getY(2, 20, out2);
    assert.equal(out2.value, 0);
});

test('DanmakuYSlotManager: updateLength resets slot array', () => {
    const mgr = new DanmakuYSlotManager(40);
    const out = { value: -1 };
    mgr.getY(1, 10, out);
    mgr.updateLength(60);
    const out2 = { value: -1 };
    const found2 = mgr.getY(2, 10, out2);
    assert.equal(found2, true);
    assert.equal(out2.value, 0);
});
