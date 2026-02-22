/**
 * DanmakuFrostMaster JS - Unit Tests
 * Run with: node test/test.js
 */

'use strict';

const {
    DanmakuMode,
    DanmakuAlignmentMode,
    DanmakuItem,
    DanmakuDefaultLayerDef,
    DanmakuYSlotManager,
    BilibiliDanmakuXmlParser,
    AssParser
} = require('../index');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✓ ${message}`);
        passed++;
    } else {
        console.error(`  ✗ FAIL: ${message}`);
        failed++;
    }
}

function assertEqual(actual, expected, message) {
    if (actual === expected) {
        console.log(`  ✓ ${message}`);
        passed++;
    } else {
        console.error(`  ✗ FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        failed++;
    }
}

// ─── DanmakuItem ─────────────────────────────────────────────────────────────
console.log('\n[DanmakuItem]');
{
    const item = new DanmakuItem();
    assertEqual(item.baseFontSize, DanmakuItem.defaultBaseFontSize, 'default baseFontSize = 22');
    assertEqual(item.mode, DanmakuMode.Unknown, 'default mode = Unknown');
    assertEqual(item.textColor.r, 255, 'default textColor is white (r=255)');
    assertEqual(item.startAlpha, 255, 'default startAlpha = 255');
    assertEqual(item.hasOutline, true, 'default hasOutline = true');
    assertEqual(item.allowDensityControl, true, 'default allowDensityControl = true');
}

// ─── DanmakuDefaultLayerDef ──────────────────────────────────────────────────
console.log('\n[DanmakuDefaultLayerDef]');
{
    assertEqual(DanmakuDefaultLayerDef.DefaultLayerCount, 6, 'DefaultLayerCount = 6');
    assertEqual(DanmakuDefaultLayerDef.RollingLayerId, 0, 'RollingLayerId = 0');
    assertEqual(DanmakuDefaultLayerDef.SubtitleLayerId, 5, 'SubtitleLayerId = 5');
}

// ─── DanmakuYSlotManager ─────────────────────────────────────────────────────
console.log('\n[DanmakuYSlotManager]');
{
    const mgr = new DanmakuYSlotManager(100);

    // First allocation should succeed
    const r1 = mgr.getY(1, 20);
    assert(r1.slotFound, 'first getY returns slotFound=true');
    assertEqual(r1.y, 0, 'first allocation starts at y=0');

    // Second allocation should be after first
    const r2 = mgr.getY(2, 20);
    assert(r2.slotFound, 'second getY returns slotFound=true');
    assert(r2.y >= 20, 'second allocation starts after first (y>=20)');

    // Release first slot
    mgr.releaseYSlot(1, r1.y);
    const r3 = mgr.getY(3, 20);
    assert(r3.slotFound, 'after release, slot is available again');
    assertEqual(r3.y, 0, 'released slot is reused (y=0)');

    // Clear - note: height must be strictly less than array length (matches C# behavior)
    mgr.clear();
    const r4 = mgr.getY(4, 99);
    assert(r4.slotFound, 'after clear, near-full height allocation succeeds');
}

// ─── DanmakuYSlotManager overflow ────────────────────────────────────────────
console.log('\n[DanmakuYSlotManager - overflow]');
{
    const mgr = new DanmakuYSlotManager(10);
    mgr.getY(1, 6);
    mgr.getY(2, 6); // fills up
    const r = mgr.getY(3, 6); // overflow → random y
    assert(!r.slotFound, 'overflow returns slotFound=false');
    assert(r.y >= 0 && r.y <= 10, 'overflow y is within bounds');
}

// ─── BilibiliDanmakuXmlParser - old format ───────────────────────────────────
console.log('\n[BilibiliDanmakuXmlParser - old format]');
{
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<i>
  <d p="23.826,1,25,16777215,1422201084,0,057075e9,757076900">Hello World</d>
  <d p="50.0,4,25,16711680,1422201085,0,11223344,123456789">Bottom Danmaku</d>
  <d p="10.5,5,25,255,1422201086,0,aabbccdd,987654321">Top Danmaku</d>
</i>`;
    const { list, totalCount } = BilibiliDanmakuXmlParser.getDanmakuList(xml, null, false);
    assertEqual(totalCount, 3, 'parsed 3 danmaku items');
    assertEqual(list.length, 3, 'list has 3 items');

    // Items should be sorted by startMs
    assert(list[0].startMs <= list[1].startMs, 'list sorted: item[0].startMs <= item[1].startMs');
    assert(list[1].startMs <= list[2].startMs, 'list sorted: item[1].startMs <= item[2].startMs');

    // Check first item (startMs=10500 from 10.5s Top)
    const top = list.find(i => i.mode === DanmakuMode.Top);
    assert(top !== undefined, 'Top mode item found');
    assertEqual(top.startMs, 10500, 'Top item startMs = 10500ms');

    // Check rolling item
    const rolling = list.find(i => i.mode === DanmakuMode.Rolling);
    assert(rolling !== undefined, 'Rolling mode item found');
    assertEqual(rolling.text, 'Hello World', 'Rolling item text correct');

    // Check color parsing (16777215 = 0xFFFFFF = white)
    assertEqual(rolling.textColor.r, 255, 'white color r=255');
    assertEqual(rolling.textColor.g, 255, 'white color g=255');
    assertEqual(rolling.textColor.b, 255, 'white color b=255');

    // Check bottom item (red color: 16711680 = 0xFF0000)
    const bottom = list.find(i => i.mode === DanmakuMode.Bottom);
    assert(bottom !== undefined, 'Bottom mode item found');
    assertEqual(bottom.textColor.r, 255, 'red color r=255');
    assertEqual(bottom.textColor.g, 0, 'red color g=0');
    assertEqual(bottom.textColor.b, 0, 'red color b=0');
}

// ─── BilibiliDanmakuXmlParser - advanced mode ────────────────────────────────
console.log('\n[BilibiliDanmakuXmlParser - advanced mode]');
{
    // Advanced mode uses new format (has <oid> tag): ID,pool,timeMs,mode,fontSize,color,...
    const xml = `<i><oid>12345</oid><d p="3782563342,0,274462,7,20,10027263,1504375326,0,a77032eb">[0,0.5,"1-1",3,"Hello Advanced",0,0,0.99,0.5,3000,0,true,"Consolas",1]</d></i>`;
    const { list } = BilibiliDanmakuXmlParser.getDanmakuList(xml, null, false);
    assertEqual(list.length, 1, 'advanced mode item parsed');
    assertEqual(list[0].mode, DanmakuMode.Advanced, 'mode = Advanced');
    assertEqual(list[0].text, 'Hello Advanced', 'advanced text correct');
    assertEqual(list[0].keepDefinedFontSize, true, 'keepDefinedFontSize = true');
    assertEqual(list[0].fontFamilyName, 'Consolas', 'fontFamilyName = Consolas');
    assert(Math.abs(list[0].startX - 0) < 0.01, 'startX ≈ 0');
    assert(Math.abs(list[0].startY - 0.5) < 0.01, 'startY ≈ 0.5');
}

// ─── BilibiliDanmakuXmlParser - merge duplicate ──────────────────────────────
console.log('\n[BilibiliDanmakuXmlParser - merge duplicate]');
{
    const xml = `<i>
  <d p="10.0,1,25,16777215,1000,0,aaa,111">Same Text</d>
  <d p="10.5,1,25,16777215,1001,0,bbb,222">Same Text</d>
  <d p="50.0,1,25,16777215,1002,0,ccc,333">Different Text</d>
</i>`;
    const { list, mergedCount } = BilibiliDanmakuXmlParser.getDanmakuList(xml, null, true);
    assertEqual(mergedCount, 1, 'one duplicate merged');
    // The merged item should have ×2 appended
    const merged = list.find(i => i.text.includes('\u00D7'));
    assert(merged !== undefined, 'merged item has ×N suffix');
}

// ─── BilibiliDanmakuXmlParser - regex filter ─────────────────────────────────
console.log('\n[BilibiliDanmakuXmlParser - regex filter]');
{
    const xml = `<i>
  <d p="1.0,1,25,16777215,1000,0,aaa,111">spam content</d>
  <d p="2.0,1,25,16777215,1001,0,bbb,222">normal content</d>
</i>`;
    const { list, filteredCount } = BilibiliDanmakuXmlParser.getDanmakuList(xml, ['spam'], false);
    assertEqual(filteredCount, 1, 'one item filtered');
    assertEqual(list.length, 1, 'only 1 item remains');
    assertEqual(list[0].text, 'normal content', 'remaining item is normal content');
}

// ─── BilibiliDanmakuXmlParser - subtitle JSON ────────────────────────────────
console.log('\n[BilibiliDanmakuXmlParser - subtitle JSON]');
{
    const json = JSON.stringify({
        body: [
            { from: 1.0, to: 4.5, content: 'Hello subtitle' },
            { from: 5.0, to: 8.0, content: 'Second line' }
        ]
    });
    const list = BilibiliDanmakuXmlParser.getSubtitleList(json);
    assertEqual(list.length, 2, 'parsed 2 subtitle entries');
    assertEqual(list[0].mode, DanmakuMode.Subtitle, 'mode = Subtitle');
    assertEqual(list[0].startMs, 1000, 'startMs = 1000ms');
    assertEqual(list[0].durationMs, 3500, 'durationMs = 3500ms');
    assertEqual(list[0].text, 'Hello subtitle', 'subtitle text correct');
    assertEqual(list[0].hasOutline, false, 'subtitle hasOutline = false');
    assertEqual(list[0].allowDensityControl, false, 'subtitle allowDensityControl = false');
}

// ─── BilibiliDanmakuXmlParser - HTML decode ──────────────────────────────────
console.log('\n[BilibiliDanmakuXmlParser - HTML decode]');
{
    const xml = `<i><d p="1.0,1,25,16777215,1000,0,aaa,111">Hello &amp; World &lt;3&gt;</d></i>`;
    const { list } = BilibiliDanmakuXmlParser.getDanmakuList(xml, null, false);
    assertEqual(list[0].text, 'Hello & World <3>', 'HTML entities decoded correctly');
}

// ─── BilibiliDanmakuXmlParser - new format ───────────────────────────────────
console.log('\n[BilibiliDanmakuXmlParser - new format]');
{
    const xml = `<i><oid>12345</oid><d p="30845767597424709,0,59065,1,25,16777215,1585975807,0,8317333c">New Format</d></i>`;
    const { list } = BilibiliDanmakuXmlParser.getDanmakuList(xml, null, false);
    assertEqual(list.length, 1, 'new format item parsed');
    assertEqual(list[0].mode, DanmakuMode.Rolling, 'new format rolling mode');
    assertEqual(list[0].startMs, 59065, 'new format startMs = 59065');
    assertEqual(list[0].text, 'New Format', 'new format text correct');
}

// ─── AssParser ───────────────────────────────────────────────────────────────
console.log('\n[AssParser]');
{
    const assStr = `[Script Info]
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,2,20,20,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello ASS subtitle
Dialogue: 0,0:00:05.00,0:00:08.00,Default,,0,0,0,,Second subtitle line`;

    const list = AssParser.getDanmakuList(assStr);
    assert(list !== null, 'AssParser returns non-null list');
    assertEqual(list.length, 2, 'parsed 2 ASS dialogue entries');

    // Check first item is Bottom mode (LowerCenter alignment with no alpha animation)
    const item0 = list[0];
    assert(item0.startMs >= 1000, 'first item startMs >= 1000ms');
    assertEqual(item0.text, 'Hello ASS subtitle', 'first item text correct');
    assert(item0.baseFontSize > 0, 'baseFontSize > 0');
}

// ─── AssParser - time parsing ─────────────────────────────────────────────────
console.log('\n[AssParser - time parsing]');
{
    const t = AssParser._parseTime('1:23:45.67');
    assert(Math.abs(t - (3600 + 23 * 60 + 45.67) * 1000) < 1, 'time parsed correctly');
    assertEqual(AssParser._parseTime(null), null, 'null input returns null');
    assertEqual(AssParser._parseTime('invalid'), null, 'invalid input returns null');
}

// ─── AssParser - inline overrides ─────────────────────────────────────────────
console.log('\n[AssParser - inline overrides]');
{
    const assStr = `[Script Info]
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,5,0,0,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\\pos(640,360)\\an5\\fs36\\1c&H00FF00&}Green center text`;

    const list = AssParser.getDanmakuList(assStr);
    assert(list !== null && list.length > 0, 'parsed item with inline overrides');
    const item = list[0];
    assertEqual(item.text, 'Green center text', 'inline override text stripped');
    // Green color override: \1c&H00FF00& → B=0,G=255,R=0
    assertEqual(item.textColor.g, 255, 'green color override applied (g=255)');
    assertEqual(item.textColor.r, 0, 'green color override applied (r=0)');
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    process.exit(1);
} else {
    console.log('All tests passed! ✓');
}
