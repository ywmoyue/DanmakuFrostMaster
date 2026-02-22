'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { BilibiliDanmakuXmlParser } = require('../src/BilibiliDanmakuXmlParser');
const { DanmakuMode } = require('../src/DanmakuTypes');

// ─── Old format ──────────────────────────────────────────────────────────────

const OLD_FORMAT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<i>
<d p="23.826,1,25,16777215,1422201084,0,057075e9,757076900">Hello world</d>
<d p="10.000,4,25,16711680,1422201084,0,12345678,111111111">Bottom danmaku</d>
<d p="5.000,5,25,255,1422201084,0,abcdefab,222222222">Top danmaku</d>
</i>`;

test('getDanmakuList: parses old-format rolling danmaku', () => {
    const stats = {};
    const list = BilibiliDanmakuXmlParser.getDanmakuList(OLD_FORMAT_XML, null, false, stats);
    assert.equal(stats.totalCount, 3);
    const rolling = list.find(i => i.mode === DanmakuMode.Rolling);
    assert.ok(rolling, 'expected a rolling danmaku');
    assert.equal(rolling.text, 'Hello world');
    assert.ok(Math.abs(rolling.startMs - 23826) < 1);
    assert.equal(rolling.textColor, '#ffffff');
});

test('getDanmakuList: parses old-format bottom danmaku', () => {
    const stats = {};
    const list = BilibiliDanmakuXmlParser.getDanmakuList(OLD_FORMAT_XML, null, false, stats);
    const bottom = list.find(i => i.mode === DanmakuMode.Bottom);
    assert.ok(bottom, 'expected a bottom danmaku');
    assert.equal(bottom.text, 'Bottom danmaku');
    assert.equal(bottom.textColor, '#ff0000');
});

test('getDanmakuList: parses old-format top danmaku', () => {
    const stats = {};
    const list = BilibiliDanmakuXmlParser.getDanmakuList(OLD_FORMAT_XML, null, false, stats);
    const top = list.find(i => i.mode === DanmakuMode.Top);
    assert.ok(top, 'expected a top danmaku');
    assert.equal(top.text, 'Top danmaku');
    assert.equal(top.textColor, '#0000ff');
});

test('getDanmakuList: list is sorted by startMs', () => {
    const stats = {};
    const list = BilibiliDanmakuXmlParser.getDanmakuList(OLD_FORMAT_XML, null, false, stats);
    for (let i = 1; i < list.length; i++) {
        assert.ok(list[i].startMs >= list[i - 1].startMs, 'list should be sorted');
    }
});

// ─── New format ───────────────────────────────────────────────────────────────

const NEW_FORMAT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<i><oid>123456</oid>
<d p="111111111111,0,59065,1,25,16777215,1585975807,0,8317333c">新格式弹幕</d>
</i>`;

test('getDanmakuList: parses new-format rolling danmaku', () => {
    const stats = {};
    const list = BilibiliDanmakuXmlParser.getDanmakuList(NEW_FORMAT_XML, null, false, stats);
    assert.equal(stats.totalCount, 1);
    assert.equal(list.length, 1);
    assert.equal(list[0].mode, DanmakuMode.Rolling);
    assert.equal(list[0].text, '新格式弹幕');
});

// ─── Merge duplicate ─────────────────────────────────────────────────────────

const DUPE_XML = `<?xml version="1.0"?>
<i>
<d p="10.000,1,25,16777215,1000,0,aaa,111">同一条弹幕</d>
<d p="10.500,1,25,16777215,1001,0,bbb,222">同一条弹幕</d>
<d p="60.000,1,25,16777215,1002,0,ccc,333">同一条弹幕</d>
</i>`;

test('getDanmakuList: merges near-duplicate danmaku', () => {
    const stats = {};
    const list = BilibiliDanmakuXmlParser.getDanmakuList(DUPE_XML, null, true, stats);
    assert.equal(stats.mergedCount, 1);
    // The surviving item near t=10s should have ×2 suffix
    const dupe = list.find(i => i.text.includes('\u00D72'));
    assert.ok(dupe, 'should annotate duplicate count');
});

// ─── Regex filter ─────────────────────────────────────────────────────────────

const FILTER_XML = `<?xml version="1.0"?>
<i>
<d p="1.000,1,25,16777215,1000,0,aaa,111">keep me</d>
<d p="2.000,1,25,16777215,1001,0,bbb,222">spam spam spam</d>
</i>`;

test('getDanmakuList: filters danmaku matching regex', () => {
    const stats = {};
    const list = BilibiliDanmakuXmlParser.getDanmakuList(FILTER_XML, ['spam'], false, stats);
    assert.equal(stats.filteredCount, 1);
    assert.equal(list.length, 1);
    assert.equal(list[0].text, 'keep me');
});

// ─── Empty / invalid input ────────────────────────────────────────────────────

test('getDanmakuList: returns empty list for empty input', () => {
    const stats = {};
    const list = BilibiliDanmakuXmlParser.getDanmakuList('', null, false, stats);
    assert.equal(list.length, 0);
    assert.equal(stats.totalCount, 0);
});

test('getDanmakuList: returns empty list for null input', () => {
    const stats = {};
    const list = BilibiliDanmakuXmlParser.getDanmakuList(null, null, false, stats);
    assert.equal(list.length, 0);
});

// ─── Subtitle JSON ────────────────────────────────────────────────────────────

const SUBTITLE_JSON = JSON.stringify({
    body: [
        { from: 10.0, to: 13.5, content: 'First subtitle' },
        { from: 5.0,  to: 8.0,  content: 'Second subtitle' },
        { from: 20.0, to: 20.0, content: 'zero-duration should be skipped' },
    ],
});

test('getSubtitleList: parses subtitle JSON', () => {
    const list = BilibiliDanmakuXmlParser.getSubtitleList(SUBTITLE_JSON);
    assert.equal(list.length, 2);
    assert.equal(list[0].mode, DanmakuMode.Subtitle);
});

test('getSubtitleList: list is sorted by startMs', () => {
    const list = BilibiliDanmakuXmlParser.getSubtitleList(SUBTITLE_JSON);
    for (let i = 1; i < list.length; i++) {
        assert.ok(list[i].startMs >= list[i - 1].startMs);
    }
    assert.equal(list[0].text, 'Second subtitle');
    assert.equal(list[1].text, 'First subtitle');
});

test('getSubtitleList: duration is correct', () => {
    const list = BilibiliDanmakuXmlParser.getSubtitleList(SUBTITLE_JSON);
    assert.ok(Math.abs(list[1].durationMs - 3500) < 1);
});

test('getSubtitleList: returns empty for empty string', () => {
    assert.equal(BilibiliDanmakuXmlParser.getSubtitleList('').length, 0);
});

// ─── _parseColor ──────────────────────────────────────────────────────────────

test('_parseColor: white (16777215)', () => {
    assert.equal(BilibiliDanmakuXmlParser._parseColor(16777215), '#ffffff');
});

test('_parseColor: red (16711680)', () => {
    assert.equal(BilibiliDanmakuXmlParser._parseColor(16711680), '#ff0000');
});

test('_parseColor: blue (255)', () => {
    assert.equal(BilibiliDanmakuXmlParser._parseColor(255), '#0000ff');
});
