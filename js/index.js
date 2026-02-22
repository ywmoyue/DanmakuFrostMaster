/**
 * DanmakuFrostMaster - JavaScript Version
 * index.js - Library entry point (browser & Node.js compatible)
 *
 * Usage (browser, script tag):
 *   <script src="dist/danmaku-frost-master.js"></script>
 *   const controller = new DanmakuFrostMaster(canvasElement);
 *
 * Usage (ES module / Node.js):
 *   const { DanmakuFrostMaster, BilibiliDanmakuXmlParser, AssParser, DanmakuItem, DanmakuMode } = require('./index');
 */

'use strict';

// ─── BaseTypeDef ─────────────────────────────────────────────────────────────

const DanmakuMode = Object.freeze({
    Unknown: 0,
    Rolling: 1,
    Bottom: 4,
    Top: 5,
    ReverseRolling: 6,
    Advanced: 7,
    Subtitle: 9
});

const DanmakuPool = Object.freeze({
    Normal: 0,
    Subtitle: 1,
    Special: 2
});

const DanmakuFontSize = Object.freeze({
    Smallest: 1,
    Smaller: 2,
    Normal: 3,
    Larger: 4,
    Largest: 5
});

const DanmakuAlignmentMode = Object.freeze({
    Default: 0,
    LowerLeft: 1,
    LowerCenter: 2,
    LowerRight: 3,
    MiddleLeft: 4,
    MiddleCenter: 5,
    MiddleRight: 6,
    UpperLeft: 7,
    UpperCenter: 8,
    UpperRight: 9
});

class DanmakuItem {
    constructor() {
        this.id = 0;
        this.startMs = 0;
        this.hasBorder = false;
        this.hasOutline = true;
        this.allowDensityControl = true;
        this.isRealtime = false;
        this.baseFontSize = DanmakuItem.defaultBaseFontSize;
        this.outlineSize = 2;
        this.fontFamilyName = null;
        this.text = '';
        this.isBold = null;
        this.mode = DanmakuMode.Unknown;
        this.textColor = { r: 255, g: 255, b: 255, a: 255 };
        this.outlineColor = { r: 0, g: 0, b: 0, a: 255 };
        this.weight = 0;
        this.midHash = null;
        // Advanced mode
        this.startX = 0; this.startY = 0; this.endX = 0; this.endY = 0;
        this.marginLeft = 0; this.marginRight = 0; this.marginBottom = 0;
        this.alignmentMode = DanmakuAlignmentMode.Default;
        this.anchorMode = DanmakuAlignmentMode.UpperLeft;
        this.startAlpha = 255; this.endAlpha = 255;
        this.durationMs = 0; this.translationDurationMs = 0; this.translationDelayMs = 0;
        this.alphaDurationMs = 0; this.alphaDelayMs = 0;
        this.rotateZ = 0; this.rotateY = 0;
        this.keepDefinedFontSize = false;
    }
}
DanmakuItem.defaultBaseFontSize = 22;

const DanmakuDefaultLayerDef = Object.freeze({
    DefaultLayerId: 0,
    RollingLayerId: 0,
    ReverseRollingLayerId: 1,
    TopLayerId: 2,
    BottomLayerId: 3,
    AdvancedLayerId: 4,
    SubtitleLayerId: 5,
    DefaultLayerCount: 6
});

// ─── DanmakuYSlotManager ─────────────────────────────────────────────────────

class DanmakuYSlotManager {
    constructor(length) {
        this._ySlotArray = DanmakuYSlotManager._makeSlots(length);
    }

    static _makeSlots(len) {
        return Array.from({ length: len }, () => ({ id: 0, length: 0 }));
    }

    updateLength(newLength) {
        this._ySlotArray = DanmakuYSlotManager._makeSlots(newLength);
    }

    getY(danmakuId, height) {
        const arr = this._ySlotArray;
        if (height > arr.length) return { slotFound: false, y: 0 };

        let index = 0;
        while (index + height < arr.length) {
            let found = true;
            for (let i = 0; i < height; i++) {
                if (arr[index + i].length > 0) {
                    found = false;
                    index = index + i + arr[index + i].length;
                    break;
                }
            }
            if (found) {
                arr[index].id = danmakuId;
                arr[index].length = height;
                return { slotFound: true, y: index };
            }
        }
        return { slotFound: false, y: Math.floor(Math.random() * Math.max(1, arr.length - height)) };
    }

    releaseYSlot(danmakuId, y) {
        const arr = this._ySlotArray;
        if (y < arr.length && arr[y].id === danmakuId) {
            arr[y].id = 0; arr[y].length = 0;
        }
    }

    clear() {
        for (const slot of this._ySlotArray) { slot.id = 0; slot.length = 0; }
    }
}

// ─── BilibiliDanmakuXmlParser ────────────────────────────────────────────────

class BilibiliDanmakuXmlParser {
    static getDanmakuList(xmlStr, regexFilterList, mergeDuplicate) {
        let totalCount = 0, filteredCount = 0, mergedCount = 0;
        const list = [];
        const dupDict = new Map();

        if (!xmlStr || !xmlStr.trim()) return { list, totalCount, filteredCount, mergedCount };

        const isNewFormat = xmlStr.includes('<oid>');
        const regex = /<d p="([^"]+)">([\s\S]*?)<\/d>/g;
        let match;

        while ((match = regex.exec(xmlStr)) !== null) {
            totalCount++;
            const tagStr = match[1];
            let contentStr = match[2];
            if (!tagStr || !contentStr || !contentStr.trim()) { filteredCount++; continue; }
            contentStr = BilibiliDanmakuXmlParser._htmlDecode(contentStr)
                .replace(/\/n/g, '\n').replace(/\\n/g, '\n').trim();

            let danmakuMode = DanmakuMode.Unknown;

            if (mergeDuplicate) {
                const pArr = tagStr.split(',');
                if (pArr.length >= 4) {
                    const mode = parseInt(pArr[isNewFormat ? 3 : 1], 10);
                    const time = parseFloat(pArr[isNewFormat ? 2 : 0]);
                    if (!isNaN(mode) && !isNaN(time)) {
                        danmakuMode = mode;
                        if ((danmakuMode === DanmakuMode.Rolling || danmakuMode === DanmakuMode.Top || danmakuMode === DanmakuMode.Bottom) && time >= 0) {
                            const startMs = isNewFormat ? time : time * 1000;
                            if (!dupDict.has(contentStr)) {
                                dupDict.set(contentStr, [{ startMs, count: 1 }]);
                            } else {
                                let merged = false;
                                for (const d of dupDict.get(contentStr)) {
                                    if (Math.abs(startMs - d.startMs) <= 20000) { merged = true; d.count++; break; }
                                }
                                if (merged) { mergedCount++; continue; }
                                else { dupDict.get(contentStr).push({ startMs, count: 1 }); }
                            }
                        }
                    }
                }
            }

            if (danmakuMode !== DanmakuMode.Advanced && danmakuMode !== DanmakuMode.Subtitle &&
                regexFilterList && regexFilterList.length > 0) {
                let filtered = false;
                for (const rf of regexFilterList) {
                    if (new RegExp(rf).test(contentStr)) { filtered = true; filteredCount++; break; }
                }
                if (filtered) continue;
            }

            const item = BilibiliDanmakuXmlParser._parseItem(tagStr, contentStr, isNewFormat);
            if (item) list.push(item);
        }

        if (dupDict.size > 0) {
            for (const item of list) {
                if (item.mode === DanmakuMode.Rolling || item.mode === DanmakuMode.Top || item.mode === DanmakuMode.Bottom) {
                    if (dupDict.has(item.text)) {
                        for (const d of dupDict.get(item.text)) {
                            if (d.count > 1 && item.startMs === d.startMs) { item.text = `${item.text}\u00D7${d.count}`; break; }
                        }
                    }
                }
            }
        }

        BilibiliDanmakuXmlParser._sort(list);
        return { list, totalCount, filteredCount, mergedCount };
    }

    static getSubtitleList(jsonArrayStr) {
        const list = [];
        if (!jsonArrayStr || !jsonArrayStr.trim()) return list;
        try {
            const body = JSON.parse(jsonArrayStr).body;
            if (Array.isArray(body)) {
                for (const e of body) {
                    try {
                        const fromMs = parseFloat(e.from) * 1000, toMs = parseFloat(e.to) * 1000;
                        if (toMs > fromMs && e.content && e.content.trim()) {
                            const item = new DanmakuItem();
                            item.mode = DanmakuMode.Subtitle;
                            item.startMs = Math.floor(fromMs);
                            item.durationMs = Math.floor(toMs - fromMs);
                            item.text = e.content.split('\n').map(s => s.trim()).join('\n');
                            item.textColor = { r: 255, g: 255, b: 255, a: 255 };
                            item.baseFontSize = DanmakuItem.defaultBaseFontSize;
                            item.hasOutline = false; item.allowDensityControl = false;
                            list.push(item);
                        }
                    } catch (e2) { /* skip */ }
                }
            }
        } catch (e) { /* skip */ }
        BilibiliDanmakuXmlParser._sort(list);
        return list;
    }

    static _parseItem(tagStr, content, isNewFormat) {
        const pArr = tagStr.split(',');
        if (pArr.length < 8) return null;
        try {
            const item = new DanmakuItem();
            item.id = isNewFormat ? parseInt(pArr[0], 10) : 0;
            item.text = content;
            item.textColor = BilibiliDanmakuXmlParser._parseColor(parseInt(pArr[isNewFormat ? 5 : 3], 10));
            let startMs = isNewFormat ? parseFloat(pArr[2]) : parseFloat(pArr[0]) * 1000;
            item.startMs = Math.floor(Math.max(startMs, 0));
            const mode = parseInt(pArr[isNewFormat ? 3 : 1], 10);
            const modeMap = { 1: DanmakuMode.Rolling, 4: DanmakuMode.Bottom, 5: DanmakuMode.Top, 6: DanmakuMode.ReverseRolling, 7: DanmakuMode.Advanced };
            if (!(mode in modeMap)) return null;
            item.mode = modeMap[mode];

            let fontSize = parseInt(pArr[isNewFormat ? 4 : 2], 10);
            if (item.mode === DanmakuMode.Advanced) fontSize += 4;
            else fontSize -= fontSize % 2 === 1 ? 3 : 2;
            item.baseFontSize = Math.max(fontSize, 2);

            if (item.mode === DanmakuMode.Advanced) {
                if (!content.startsWith('[') || !content.endsWith(']')) return null;
                item.allowDensityControl = false;
                let vals;
                try { vals = JSON.parse(content).map(v => v == null ? '' : String(v)); } catch (e) { return null; }
                if (vals.length < 5) return null;
                item.text = BilibiliDanmakuXmlParser._htmlDecode(vals[4]).replace(/\/n/g, '\n').replace(/\\n/g, '\n');
                if (!item.text.trim()) return null;
                item.startX = vals[0] ? parseFloat(vals[0]) : 0;
                item.startY = vals[1] ? parseFloat(vals[1]) : 0;
                item.endX = item.startX; item.endY = item.startY;
                const oSplit = vals[2].split('-');
                item.startAlpha = Math.round(Math.max(parseFloat(oSplit[0]), 0) * 255);
                item.endAlpha = oSplit.length > 1 ? Math.round(Math.max(parseFloat(oSplit[1]), 0) * 255) : item.startAlpha;
                item.durationMs = Math.floor(parseFloat(vals[3]) * 1000);
                item.translationDurationMs = item.durationMs; item.alphaDurationMs = item.durationMs;
                if (vals.length >= 7) { item.rotateZ = vals[5] ? parseFloat(vals[5]) : 0; item.rotateY = vals[6] ? parseFloat(vals[6]) : 0; }
                if (vals.length >= 11) {
                    item.endX = vals[7] ? parseFloat(vals[7]) : 0;
                    item.endY = vals[8] ? parseFloat(vals[8]) : 0;
                    if (vals[9]) item.translationDurationMs = Math.floor(parseFloat(vals[9]));
                    if (vals[10]) item.translationDelayMs = vals[10] === '\uFF10' ? 0 : Math.floor(parseFloat(vals[10]));
                }
                item.hasOutline = false;
                item.fontFamilyName = 'Consolas';
                item.keepDefinedFontSize = true;
            }
            return item;
        } catch (e) { return null; }
    }

    static _parseColor(v) {
        v = v & 0xFFFFFF;
        return { r: (v >> 16) & 0xFF, g: (v >> 8) & 0xFF, b: v & 0xFF, a: 255 };
    }

    static _htmlDecode(str) {
        return str
            .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
            .replace(/&quot;/g, '"')
            .replace(/&gt;/g, '>')
            .replace(/&lt;/g, '<')
            .replace(/&amp;/g, '&');
    }

    static _sort(list) {
        // Stable merge sort
        function merge(arr, p, r) {
            if (p >= r) return;
            const mid = (p + r) >> 1;
            merge(arr, p, mid); merge(arr, mid + 1, r);
            const tmp = []; let i = p, j = mid + 1;
            while (i <= mid && j <= r) {
                const a = arr[i], b = arr[j];
                if (a.startMs < b.startMs) tmp.push(arr[i++]);
                else if (a.startMs > b.startMs) tmp.push(arr[j++]);
                else if (a.mode === DanmakuMode.Advanced && a.id <= b.id) tmp.push(arr[i++]);
                else tmp.push(arr[i++]);
            }
            while (i <= mid) tmp.push(arr[i++]);
            while (j <= r) tmp.push(arr[j++]);
            for (let k = 0; k < tmp.length; k++) arr[p + k] = tmp[k];
        }
        merge(list, 0, list.length - 1);
    }
}

// ─── AssParser ───────────────────────────────────────────────────────────────

class AssParser {
    static getDanmakuList(assStr) {
        try {
            const list = [];
            const styleDict = new Map();
            const lines = assStr.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            let videoWidth = 0, videoHeight = 0, dialogueFmtCount = 10;

            for (let li = 0; li < lines.length; li++) {
                const line = lines[li];
                if (!line || !line.trim()) continue;

                if (line.startsWith('PlayResX:')) {
                    videoWidth = parseInt(line.substring(9).trim(), 10) || 0;
                } else if (line.startsWith('PlayResY:')) {
                    videoHeight = parseInt(line.substring(9).trim(), 10) || 0;
                } else if (line.startsWith('Style:')) {
                    try {
                        const sp = line.substring(6).trim().split(',');
                        if (sp.length >= 22) {
                            const name = sp[0];
                            if (!styleDict.has(name)) styleDict.set(name, new _AssStyle());
                            const s = styleDict.get(name);
                            s.fontFamilyName = sp[1];
                            s.fontSize = parseFloat(sp[2]) || s.fontSize;
                            const tcm = sp[3].match(/[A-Fa-f0-9]{8}/);
                            if (tcm) {
                                const cs = tcm[0];
                                s.alpha = 255 - parseInt(cs.substring(0, 2), 16);
                                s.textColor = { r: parseInt(cs.substring(6, 8), 16), g: parseInt(cs.substring(4, 6), 16), b: parseInt(cs.substring(2, 4), 16), a: 255 };
                            }
                            const ocm = sp[5].match(/[A-Fa-f0-9]{8}/);
                            if (ocm) {
                                const cs = ocm[0];
                                s.outlineColor = { r: parseInt(cs.substring(6, 8), 16), g: parseInt(cs.substring(4, 6), 16), b: parseInt(cs.substring(2, 4), 16), a: 255 };
                            }
                            s.isBold = sp[7] === '-1';
                            s.hasOutline = sp[15] === '1';
                            s.outlineSize = parseFloat(sp[16]) || s.outlineSize;
                            const pm = parseInt(sp[18], 10); if (!isNaN(pm)) s.alignmentMode = pm;
                            const ml = parseInt(sp[19], 10); if (!isNaN(ml)) s.marginLeft = ml;
                            const mr = parseInt(sp[20], 10); if (!isNaN(mr)) s.marginRight = mr;
                            const mb = parseInt(sp[21], 10); if (!isNaN(mb)) s.marginBottom = mb;
                        }
                    } catch (e) { /* skip */ }
                } else if (line.startsWith('[Events]')) {
                    const nl = lines[li + 1];
                    if (nl && nl.startsWith('Format:')) { dialogueFmtCount = nl.split(',').length; li++; }
                } else if (line.startsWith('Dialogue:')) {
                    try {
                        const sp = line.substring(8).trim().split(',');
                        let txt = sp.length > dialogueFmtCount
                            ? sp.slice(dialogueFmtCount - 1).join(',')
                            : sp[sp.length - 1].trim();
                        if (!txt || !txt.trim()) continue;

                        const item = new DanmakuItem();
                        item.allowDensityControl = false;
                        item.mode = DanmakuMode.Advanced;
                        const st = AssParser._parseTime(sp[1]), et = AssParser._parseTime(sp[2]);
                        if (st === null || et === null || et <= 0) continue;
                        item.startMs = Math.max(Math.floor(st), 0);
                        item.durationMs = Math.floor(et) - item.startMs;

                        let sName = sp[3]; if (sName.startsWith('*')) sName = sName.substring(1);
                        const style = styleDict.has(sName) ? styleDict.get(sName) : new _AssStyle();
                        item.startAlpha = style.alpha; item.endAlpha = style.alpha;
                        item.isBold = style.isBold; item.hasOutline = style.hasOutline;
                        item.baseFontSize = style.fontSize; item.outlineSize = style.outlineSize;
                        item.fontFamilyName = style.fontFamilyName;
                        item.textColor = Object.assign({}, style.textColor);
                        item.outlineColor = Object.assign({}, style.outlineColor);
                        item.marginLeft = style.marginLeft; item.marginRight = style.marginRight;
                        item.marginBottom = style.marginBottom; item.alignmentMode = style.alignmentMode;

                        const ml2 = parseInt(sp[5], 10); if (!isNaN(ml2) && ml2 !== 0) item.marginLeft = ml2;
                        const mr2 = parseInt(sp[6], 10); if (!isNaN(mr2) && mr2 !== 0) item.marginRight = mr2;
                        const mb2 = parseInt(sp[7], 10); if (!isNaN(mb2) && mb2 !== 0) item.marginBottom = mb2;

                        if (txt.startsWith('{') && txt.includes('}') && !txt.endsWith('}')) {
                            const fnm = txt.match(/\\fn([^\\}]+)/); if (fnm) item.fontFamilyName = fnm[1];
                            const fsm = txt.match(/\\fs(\d+)/); if (fsm) item.baseFontSize = parseInt(fsm[1], 10);
                            const bm = txt.match(/\\bord(\d+)/); if (bm) { item.outlineSize = parseInt(bm[1], 10); item.hasOutline = item.outlineSize > 0; }

                            for (const cm of [...txt.matchAll(/\\(\d)c.*?([A-Fa-f0-9]{6,8})/g)]) {
                                const ct = parseInt(cm[1], 10);
                                if (ct === 1 || ct === 3) {
                                    let cs = cm[2]; if (cs.length > 6) cs = cs.substring(cs.length - 6);
                                    const r = parseInt(cs.substring(4, 6), 16), g = parseInt(cs.substring(2, 4), 16), b = parseInt(cs.substring(0, 2), 16);
                                    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
                                        if (ct === 3) item.outlineColor = { r, g, b, a: 255 };
                                        else item.textColor = { r, g, b, a: 255 };
                                    }
                                }
                            }

                            const fadm = txt.match(/\\fad\((\d+),(\d+)\)/);
                            if (fadm) {
                                const fi = parseInt(fadm[1], 10);
                                if (fi > 0) { item.startAlpha = 0; item.alphaDurationMs = fi; }
                                else { const fo = parseInt(fadm[2], 10); if (fo > 0) { item.endAlpha = 0; item.alphaDurationMs = fo; } }
                            }

                            const movm = txt.match(/\\move\(([\d.,]+?)\)/);
                            if (movm) {
                                item.alignmentMode = DanmakuAlignmentMode.Default;
                                const mp = movm[1].split(',');
                                if (mp.length >= 4) {
                                    let sx = parseFloat(mp[0]), sy = parseFloat(mp[1]), ex = parseFloat(mp[2]), ey = parseFloat(mp[3]);
                                    if (videoWidth > 0 && videoHeight > 0) { sx = Math.min(sx / videoWidth, 0.99); sy = Math.min(sy / videoHeight, 0.99); ex = Math.min(ex / videoWidth, 0.99); ey = Math.min(ey / videoHeight, 0.99); }
                                    item.startX = sx; item.endX = ex; item.startY = sy; item.endY = ey;
                                    if (mp.length >= 6) { const d = parseInt(mp[4], 10), dur = parseInt(mp[5], 10); if (!isNaN(d) && !isNaN(dur)) { item.translationDelayMs = d; item.translationDurationMs = dur; } }
                                }
                            } else {
                                const posm = txt.match(/\\pos\(([\d.]+),([\d.]+)\)/);
                                if (posm) {
                                    item.alignmentMode = DanmakuAlignmentMode.Default;
                                    let x = parseFloat(posm[1]), y = parseFloat(posm[2]);
                                    if (videoWidth > 0 && videoHeight > 0) { x = Math.min(x / videoWidth, 0.99); y = Math.min(y / videoHeight, 0.99); }
                                    item.startX = x; item.endX = x; item.startY = y; item.endY = y;
                                    const anm = txt.match(/\\an(\d+)/);
                                    item.anchorMode = anm ? parseInt(anm[1], 10) : style.alignmentMode;
                                }
                            }

                            const frym = txt.match(/\\fry([\d.]+)/); if (frym) item.rotateY = parseFloat(frym[1]);
                            const frzm = txt.match(/\\frz([\d.]+)/); if (frzm) item.rotateZ = -parseFloat(frzm[1]);

                            txt = txt.replace(/\{.*?\}/g, '');
                            if (/^m \d+/.test(txt)) continue;
                        }

                        item.text = txt.replace(/\\n/g, '\n').replace(/\\N/g, '\n');
                        item.baseFontSize = Math.max(item.baseFontSize * 0.75, 2);
                        item.outlineSize *= 2;
                        if (item.fontFamilyName) {
                            if (item.fontFamilyName.endsWith(' Bold')) item.fontFamilyName = item.fontFamilyName.slice(0, -5);
                            if (item.fontFamilyName.startsWith('@')) item.fontFamilyName = item.fontFamilyName.substring(1);
                        }
                        if (item.alignmentMode === DanmakuAlignmentMode.LowerCenter && item.alphaDurationMs === 0) item.mode = DanmakuMode.Bottom;
                        list.push(item);
                    } catch (e) { /* skip */ }
                }
            }

            list.sort((a, b) => a.startMs - b.startMs);
            for (let i = 0; i < list.length - 1; i++) {
                if (list[i].mode === DanmakuMode.Bottom && list[i + 1].mode === DanmakuMode.Bottom &&
                    list[i].durationMs > 100 && list[i + 1].startMs - list[i].startMs - list[i].durationMs < 60) {
                    list[i].durationMs = list[i + 1].startMs - list[i].startMs - 60;
                }
            }
            return list;
        } catch (e) { return null; }
    }

    static _parseTime(s) {
        if (!s) return null;
        s = s.trim();
        const p = s.split(':');
        if (p.length !== 3) return null;
        const h = parseInt(p[0], 10), m = parseInt(p[1], 10), sec = parseFloat(p[2]);
        if (isNaN(h) || isNaN(m) || isNaN(sec)) return null;
        return ((h * 3600) + (m * 60) + sec) * 1000;
    }
}

class _AssStyle {
    constructor() {
        this.marginLeft = 0; this.marginRight = 0; this.marginBottom = 20;
        this.alpha = 255; this.isBold = true; this.hasOutline = true;
        this.fontSize = DanmakuItem.defaultBaseFontSize; this.outlineSize = 2;
        this.fontFamilyName = null;
        this.textColor = { r: 255, g: 255, b: 255, a: 255 };
        this.outlineColor = { r: 0, g: 0, b: 0, a: 255 };
        this.alignmentMode = DanmakuAlignmentMode.LowerCenter;
    }
}

// ─── DanmakuRender ───────────────────────────────────────────────────────────

class _RenderLayer {
    constructor(layerId, requireStrictOrder) {
        this._id = layerId;
        this.requireStrictRenderOrder = requireStrictOrder;
        this.renderList = [];
        this.ySlotManager = new DanmakuYSlotManager(0);
        this.isEnabled = true;
        this.isSubtitleLayer = (layerId === DanmakuDefaultLayerDef.SubtitleLayerId);
    }

    updateYSlotManagerLength(h, ratio) {
        const id = this._id;
        if (id === DanmakuDefaultLayerDef.RollingLayerId || id === DanmakuDefaultLayerDef.ReverseRollingLayerId)
            this.ySlotManager.updateLength(Math.floor(h * ratio));
        else if (id === DanmakuDefaultLayerDef.TopLayerId)
            this.ySlotManager.updateLength(Math.floor(h * 0.75));
        else if (id === DanmakuDefaultLayerDef.BottomLayerId)
            this.ySlotManager.updateLength(Math.floor(h / 2));
        else
            this.ySlotManager.updateLength(Math.floor(h));
    }

    clear() { this.renderList.length = 0; this.ySlotManager.clear(); }
    setSubtitleLayer(v) { this.isSubtitleLayer = v; }
}

class _DanmakuRenderItem {
    constructor(di, id) {
        this.id = id;
        this.hasBorder = di.hasBorder; this.hasOutline = di.hasOutline;
        this.allowDensityControl = di.allowDensityControl;
        this.fontSize = di.baseFontSize; this.outlineSize = di.outlineSize;
        this.fontFamilyName = di.fontFamilyName; this.text = di.text;
        this.isBold = di.isBold; this.mode = di.mode;
        this.textColor = Object.assign({}, di.textColor);
        this.outlineColor = Object.assign({}, di.outlineColor);
        this.computedFontSize = this.fontSize; this.computedFontFamily = null; this.computedIsBold = false;
        this.isFirstRenderTimeSet = false; this.firstRenderTime = 0;
        this.width = 0; this.height = 0;
        this.x = 0; this.y = 0; this.startX = 0; this.startY = 0; this.endX = 0; this.endY = 0;
        this.needToReleaseYSlot = false;
        this.marginLeft = 0; this.marginRight = 0; this.marginBottom = 0;
        this.definedDurationMs = 0;

        if (di.mode === DanmakuMode.Top || di.mode === DanmakuMode.Bottom || di.mode === DanmakuMode.Advanced) {
            this.marginBottom = di.marginBottom || 0;
            this.definedDurationMs = di.durationMs || 0;
        }
        if (di.mode === DanmakuMode.Subtitle) this.definedDurationMs = di.durationMs || 0;

        if (di.mode === DanmakuMode.Advanced) {
            this.definedStartX = di.startX || 0; this.definedStartY = di.startY || 0;
            this.definedEndX = di.endX || 0; this.definedEndY = di.endY || 0;
            this.marginLeft = di.marginLeft || 0; this.marginRight = di.marginRight || 0;
            this.alignmentMode = di.alignmentMode; this.anchorMode = di.anchorMode;
            this.definedStartAlpha = di.startAlpha != null ? di.startAlpha : 255;
            this.definedEndAlpha = di.endAlpha != null ? di.endAlpha : 255;
            this.textColor.a = 255; this.alpha = this.definedStartAlpha;
            this.definedTranslationDurationMs = di.translationDurationMs || 0;
            this.definedTranslationDelayMs = di.translationDelayMs || 0;
            this.definedAlphaDurationMs = di.alphaDurationMs || 0;
            this.definedAlphaDelayMs = di.alphaDelayMs || 0;
            this.definedRotateZ = di.rotateZ || 0; this.definedRotateY = di.rotateY || 0;
            this.translationSpeedX = 0; this.translationSpeedY = 0;
        } else {
            this.definedStartX = 0; this.definedStartY = 0; this.definedEndX = 0; this.definedEndY = 0;
            this.alignmentMode = DanmakuAlignmentMode.Default; this.anchorMode = DanmakuAlignmentMode.UpperLeft;
            this.definedStartAlpha = 255; this.definedEndAlpha = 255; this.alpha = 255;
            this.definedTranslationDurationMs = 0; this.definedTranslationDelayMs = 0;
            this.definedAlphaDurationMs = 0; this.definedAlphaDelayMs = 0;
            this.definedRotateZ = 0; this.definedRotateY = 0;
            this.translationSpeedX = 0; this.translationSpeedY = 0;
        }
    }
}

class DanmakuRender {
    static get STANDARD_CANVAS_WIDTH() { return 800; }
    static get DEFAULT_ROLLING_SPEED() { return 0.1; }
    static get DEFAULT_BOTTOM_AND_TOP_DURATION_MS() { return 3800; }
    static get SUBTITLE_START_Y() { return 24; }
    static get DEFAULT_FONT_FAMILY_NAME() { return 'Microsoft YaHei, SimHei, sans-serif'; }

    constructor(canvas) {
        if (!canvas) throw new Error('canvas is required');
        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');
        this._renderLayerList = [];
        this._isStopped = false; this._isPaused = false;
        this._isDanmakuEnabled = true; this._isSubtitleEnabled = true;
        this._autoControlDensity = true; this._textBold = true; this._noOverlapSubtitle = false;
        this._rollingDensity = -1;
        this._danmakuFontSizeOffset = DanmakuFontSize.Normal;
        this._subtitleFontSizeOffset = DanmakuFontSize.Normal;
        this._rollingAreaRatio = 0.8;
        this._rollingSpeed = DanmakuRender.DEFAULT_ROLLING_SPEED;
        this._textOpacity = 1.0; this._borderColor = 'blue';
        this._defaultFontFamilyName = DanmakuRender.DEFAULT_FONT_FAMILY_NAME;
        this.debugMode = false;
        this._animFrameId = null; this._lastFrameTime = null; this._nextId = 1;

        for (let i = 0; i < DanmakuDefaultLayerDef.DefaultLayerCount; i++) {
            const special = (i === DanmakuDefaultLayerDef.AdvancedLayerId || i === DanmakuDefaultLayerDef.SubtitleLayerId);
            this._renderLayerList.push(new _RenderLayer(i, special));
        }
        this._updateSize();
        if (typeof ResizeObserver !== 'undefined') {
            this._ro = new ResizeObserver(() => this._updateSize());
            this._ro.observe(canvas);
        }
        this._scheduleFrame();
    }

    get canvasWidth() { return this._cw; }
    get canvasHeight() { return this._ch; }

    _updateSize() {
        this._cw = this._canvas.width || this._canvas.clientWidth || 800;
        this._ch = this._canvas.height || this._canvas.clientHeight || 600;
        for (const l of this._renderLayerList) l.updateYSlotManagerLength(this._ch, this._rollingAreaRatio);
    }

    setAutoControlDensity(v) { this._autoControlDensity = v; }
    setRollingDensity(v) { this._rollingDensity = v; }
    setRollingAreaRatio(v) { if (v > 0 && v <= 10) { this._rollingAreaRatio = v / 10; for (const l of this._renderLayerList) l.updateYSlotManagerLength(this._ch, this._rollingAreaRatio); } }
    setRollingSpeed(v) { if (v >= 1 && v <= 10) this._rollingSpeed = v * 0.02; }
    setOpacity(v) { if (v > 0 && v <= 1.0) this._textOpacity = v; }
    setIsTextBold(v) { this._textBold = v; }
    setDanmakuFontSizeOffset(v) { if (typeof v === 'number') this._danmakuFontSizeOffset = v; }
    setSubtitleFontSizeOffset(v) { if (v >= DanmakuFontSize.Smallest && v <= DanmakuFontSize.Largest) this._subtitleFontSizeOffset = v; }
    setDefaultFontFamilyName(v) { this._defaultFontFamilyName = v || DanmakuRender.DEFAULT_FONT_FAMILY_NAME; }
    setBorderColor(c) { this._borderColor = c; }
    setSubtitleEnabled(v) { this._isSubtitleEnabled = v; }
    setNoOverlapSubtitle(v) { this._noOverlapSubtitle = v; }
    setRenderState(rd, rs) {
        this._isDanmakuEnabled = rd; this._isSubtitleEnabled = rs;
        if (!rd) for (const l of this._renderLayerList) { if (!l.isSubtitleLayer) l.clear(); }
        if (!rs) for (const l of this._renderLayerList) { if (l.isSubtitleLayer) l.clear(); }
    }
    setLayerRenderState(id, v) { this._renderLayerList[id].isEnabled = v; }
    setSubtitleLayer(id) { this._renderLayerList[id].setSubtitleLayer(true); }
    clearLayer(id) { this._renderLayerList[id].clear(); }
    clear() { for (const l of this._renderLayerList) l.clear(); }
    start() { this._isStopped = false; this._isPaused = false; this._scheduleFrame(); }
    pause() { this._isPaused = true; }
    stop() { this._isStopped = true; this.clear(); if (this._animFrameId) { cancelAnimationFrame(this._animFrameId); this._animFrameId = null; } this._clearCanvas(); }
    close() { this.stop(); if (this._ro) { this._ro.disconnect(); this._ro = null; } this._canvas = null; this._ctx = null; }

    renderDanmakuItem(layerId, di) {
        if (layerId >= this._renderLayerList.length) throw new Error('layerId out of range');
        if (this._isStopped) return;
        if (!this._isDanmakuEnabled && di.mode !== DanmakuMode.Subtitle) return;
        if (!this._isSubtitleEnabled && di.mode === DanmakuMode.Subtitle) return;

        const layer = this._renderLayerList[layerId];
        if (di.mode !== DanmakuMode.Advanced && di.mode !== DanmakuMode.Subtitle) {
            di.textColor = { ...di.textColor, a: Math.round(this._textOpacity * 255) };
        }

        const item = new _DanmakuRenderItem(di, this._nextId === 0 ? (this._nextId = 1) : this._nextId++);
        if (item.mode === DanmakuMode.Unknown) return;
        if (!this._autoControlDensity && this._rollingDensity > 0 && item.mode === DanmakuMode.Rolling && layer.renderList.length >= this._rollingDensity) return;

        let fs = item.fontSize;
        if (!di.keepDefinedFontSize) {
            const off = item.mode !== DanmakuMode.Subtitle ? this._danmakuFontSizeOffset : this._subtitleFontSizeOffset;
            fs += (off - 3) * (off > 3 ? 6 : 3);
            if (this._cw < DanmakuRender.STANDARD_CANVAS_WIDTH) {
                fs = fs * this._cw / DanmakuRender.STANDARD_CANVAS_WIDTH;
                if (fs >= 30) fs *= 0.75;
                item.marginBottom = Math.floor(item.marginBottom * this._cw * 0.75 / DanmakuRender.STANDARD_CANVAS_WIDTH);
            }
        }
        fs = Math.max(Math.floor(fs), 2);
        item.computedFontSize = fs;
        item.computedFontFamily = item.fontFamilyName || (item.mode === DanmakuMode.Advanced ? DanmakuRender.DEFAULT_FONT_FAMILY_NAME : this._defaultFontFamilyName);
        item.computedIsBold = item.isBold == null ? this._textBold : item.isBold;

        const fontStr = `${item.computedIsBold ? 'bold ' : ''}${fs}px ${item.computedFontFamily}`;
        this._ctx.save(); this._ctx.font = fontStr;
        const mw = (item.mode === DanmakuMode.Top || item.mode === DanmakuMode.Bottom || item.mode === DanmakuMode.Subtitle) ? this._cw - 24 : undefined;
        const measured = this._measure(item.text, fontStr, mw);
        this._ctx.restore();

        item.width = measured.width + 8;
        item.height = measured.height + (item.hasOutline ? item.outlineSize : 0);
        if (item.width <= 0 || item.height <= 0) return;

        const ysm = layer.ySlotManager;

        switch (item.mode) {
            case DanmakuMode.Rolling: { const r = ysm.getY(item.id, Math.ceil(item.height)); item.needToReleaseYSlot = r.slotFound; item.startX = this._cw; item.startY = r.y; break; }
            case DanmakuMode.Bottom: case DanmakuMode.Top: { const r = ysm.getY(item.id, Math.ceil(item.height)); item.needToReleaseYSlot = r.slotFound; item.startY = r.y; break; }
            case DanmakuMode.ReverseRolling: { const r = ysm.getY(item.id, Math.ceil(item.height)); item.needToReleaseYSlot = r.slotFound; item.startX = -item.width; item.startY = r.y; break; }
            case DanmakuMode.Advanced: {
                if (item.alignmentMode === DanmakuAlignmentMode.Default) {
                    const toAbs = (v, dim) => v > 1.0 ? v : v * dim;
                    item.startX = toAbs(item.definedStartX, this._cw); item.startY = toAbs(item.definedStartY, this._ch);
                    item.endX = toAbs(item.definedEndX, this._cw); item.endY = toAbs(item.definedEndY, this._ch);
                    if (item.endX > item.startX && item.endX < this._cw && item.endX + item.width > this._cw)
                        item.endX = (item.endX + item.width * 0.2 <= this._cw) ? this._cw - item.width : this._cw;
                    if (item.endY > item.startY && item.endY < this._ch && item.endY + item.height > this._ch)
                        item.endY = (item.endY + item.height * 0.2 <= this._ch) ? this._ch - item.height : this._ch;

                    const am = item.anchorMode;
                    if (am !== DanmakuAlignmentMode.UpperLeft) {
                        if ([DanmakuAlignmentMode.LowerCenter, DanmakuAlignmentMode.MiddleCenter, DanmakuAlignmentMode.UpperCenter].includes(am)) { item.startX -= item.width / 2; item.endX -= item.width / 2; }
                        else if ([DanmakuAlignmentMode.LowerRight, DanmakuAlignmentMode.MiddleRight, DanmakuAlignmentMode.UpperRight].includes(am)) { item.startX -= item.width; item.endX -= item.width; }
                        if ([DanmakuAlignmentMode.LowerLeft, DanmakuAlignmentMode.LowerCenter, DanmakuAlignmentMode.LowerRight].includes(am)) { item.startY -= item.height; item.endY -= item.height; }
                        else if ([DanmakuAlignmentMode.MiddleLeft, DanmakuAlignmentMode.MiddleCenter, DanmakuAlignmentMode.MiddleRight].includes(am)) { item.startY -= item.height / 2; item.endY -= item.height / 2; }
                    }
                } else {
                    const am = item.alignmentMode;
                    if ([DanmakuAlignmentMode.LowerLeft, DanmakuAlignmentMode.MiddleLeft, DanmakuAlignmentMode.UpperLeft].includes(am)) item.startX = item.marginLeft;
                    else if ([DanmakuAlignmentMode.LowerCenter, DanmakuAlignmentMode.MiddleCenter, DanmakuAlignmentMode.UpperCenter].includes(am)) item.startX = (this._cw - item.width) / 2;
                    else item.startX = this._cw - item.width - item.marginRight;

                    if ([DanmakuAlignmentMode.LowerLeft, DanmakuAlignmentMode.LowerCenter, DanmakuAlignmentMode.LowerRight].includes(am)) item.startY = this._ch - item.height - item.marginBottom;
                    else if ([DanmakuAlignmentMode.MiddleLeft, DanmakuAlignmentMode.MiddleCenter, DanmakuAlignmentMode.MiddleRight].includes(am)) item.startY = (this._ch - item.height) / 2;
                    else item.startY = 0;
                    item.endX = item.startX; item.endY = item.startY;
                }
                item.translationSpeedX = item.definedTranslationDurationMs > 0 ? (item.endX - item.startX) / item.definedTranslationDurationMs : 0;
                item.translationSpeedY = item.definedTranslationDurationMs > 0 ? (item.endY - item.startY) / item.definedTranslationDurationMs : 0;
                break;
            }
            case DanmakuMode.Subtitle: { item.startY = DanmakuRender.SUBTITLE_START_Y; break; }
        }

        item.x = item.startX;
        if (this._autoControlDensity && item.allowDensityControl && !item.needToReleaseYSlot) return;

        layer.renderList.push(item);
        this._scheduleFrame();
    }

    _scheduleFrame() {
        if (this._animFrameId || this._isStopped) return;
        this._animFrameId = requestAnimationFrame(ts => this._onFrame(ts));
    }

    _onFrame(ts) {
        this._animFrameId = null;
        if (this._isStopped || !this._ctx) return;
        const elapsed = this._lastFrameTime !== null ? ts - this._lastFrameTime : 16;
        this._lastFrameTime = ts;
        if (!this._isPaused) this._update(elapsed, ts);
        this._draw();
        if (this._renderLayerList.some(l => l.renderList.length > 0)) this._scheduleFrame();
    }

    _update(elapsed, total) {
        for (const layer of this._renderLayerList) {
            const ysm = layer.ySlotManager, list = layer.renderList;
            for (let i = list.length - 1; i >= 0; i--) {
                if (this._isStopped) return;
                const item = list[i];
                if (!item.isFirstRenderTimeSet) { item.firstRenderTime = total; item.isFirstRenderTimeSet = true; }
                const dur = total - item.firstRenderTime;
                let remove = false;

                switch (item.mode) {
                    case DanmakuMode.Rolling:
                        item.x -= elapsed * DanmakuRender._adjSpeed(this._rollingSpeed, item.width);
                        if (item.needToReleaseYSlot && item.x < this._cw - item.width - 48) { ysm.releaseYSlot(item.id, Math.floor(item.startY)); item.needToReleaseYSlot = false; }
                        if (item.x < -item.width) remove = true;
                        break;
                    case DanmakuMode.Bottom: case DanmakuMode.Top:
                        item.x = (this._cw - item.width) / 2;
                        if (dur > (item.definedDurationMs || DanmakuRender.DEFAULT_BOTTOM_AND_TOP_DURATION_MS)) {
                            remove = true; if (item.needToReleaseYSlot) ysm.releaseYSlot(item.id, Math.floor(item.startY));
                        }
                        break;
                    case DanmakuMode.ReverseRolling:
                        item.x += elapsed * DanmakuRender._adjSpeed(this._rollingSpeed, item.width);
                        if (item.needToReleaseYSlot && item.x > 48) { ysm.releaseYSlot(item.id, Math.floor(item.startY)); item.needToReleaseYSlot = false; }
                        if (item.x >= this._cw) remove = true;
                        break;
                    case DanmakuMode.Advanced:
                        if (dur <= item.definedDurationMs) {
                            if (dur >= item.definedTranslationDelayMs) {
                                if (dur < item.definedTranslationDelayMs + item.definedTranslationDurationMs) { item.x = item.startX + item.translationSpeedX * (dur - item.definedTranslationDelayMs); item.y = item.startY + item.translationSpeedY * (dur - item.definedTranslationDelayMs); }
                                else { item.x = item.endX; item.y = item.endY; }
                            }
                            if (dur >= item.definedAlphaDelayMs && item.definedEndAlpha !== item.definedStartAlpha) {
                                if (dur < item.definedAlphaDelayMs + item.definedAlphaDurationMs) item.alpha = Math.round(item.definedStartAlpha + (item.definedEndAlpha - item.definedStartAlpha) * (dur - item.definedAlphaDelayMs) / item.definedAlphaDurationMs);
                                else item.alpha = item.definedEndAlpha;
                            }
                        } else remove = true;
                        break;
                    case DanmakuMode.Subtitle:
                        if ((list.length > 1 && i < list.length - 1) || dur > item.definedDurationMs) remove = true;
                        else item.x = (this._cw - item.width) / 2;
                        break;
                }
                if (remove) list.splice(i, 1);
            }
        }
    }

    _draw() {
        if (!this._ctx || !this._canvas) return;
        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        let count = 0;

        for (const layer of this._renderLayerList) {
            if (!layer.isEnabled || layer.renderList.length === 0) continue;
            for (const item of layer.renderList) {
                if (this._isStopped) return;
                if (!item.isFirstRenderTimeSet) continue;
                count++;
                this._drawItem(item);
            }
        }

        if (this.debugMode) {
            this._ctx.fillStyle = 'rgba(64,64,64,0.8)';
            this._ctx.fillRect(0, 0, 320, 24);
            this._ctx.fillStyle = '#90EE90';
            this._ctx.font = '14px monospace';
            this._ctx.fillText(`count:${count} ${Math.floor(this._cw)}x${Math.floor(this._ch)}`, 4, 17);
        }
    }

    _drawItem(item) {
        const ctx = this._ctx;
        ctx.save();
        const font = `${item.computedIsBold ? 'bold ' : ''}${item.computedFontSize}px ${item.computedFontFamily}`;
        ctx.font = font;

        switch (item.mode) {
            case DanmakuMode.Rolling: case DanmakuMode.ReverseRolling: case DanmakuMode.Top:
                this._drawTextAt(ctx, item, item.x, item.startY); break;
            case DanmakuMode.Bottom: {
                const base = this._noOverlapSubtitle ? Math.max(this._ch - 100, this._ch * 0.8) : this._ch;
                this._drawTextAt(ctx, item, item.x, Math.max(base - item.height - item.startY, 0) - item.marginBottom); break;
            }
            case DanmakuMode.Advanced: {
                ctx.globalAlpha = item.alpha / 255;
                if (item.definedRotateY !== 0 || item.definedRotateZ !== 0) {
                    ctx.translate(item.x + item.width / 2, item.y + item.height / 2);
                    if (item.definedRotateY !== 0) ctx.scale(Math.cos(item.definedRotateY * Math.PI / 180), 1);
                    if (item.definedRotateZ !== 0) ctx.rotate(item.definedRotateZ * Math.PI / 180);
                    this._drawTextAt(ctx, item, -item.width / 2, -item.height / 2);
                } else {
                    this._drawTextAt(ctx, item, item.x, item.y);
                }
                break;
            }
            case DanmakuMode.Subtitle: {
                const y = this._ch - item.height - item.startY;
                ctx.globalAlpha = 0.7; ctx.fillStyle = 'black';
                ctx.fillRect(item.x - 4, y - 4, item.width + 8, item.height + 8);
                ctx.globalAlpha = 1;
                this._drawTextAt(ctx, item, item.x, y); break;
            }
        }
        ctx.restore();
    }

    _drawTextAt(ctx, item, x, y) {
        if (item.hasBorder || this.debugMode) { ctx.strokeStyle = this._borderColor; ctx.lineWidth = 4; ctx.strokeRect(x, y, item.width, item.height); }
        const lines = item.text.split('\n');
        const lh = item.computedFontSize * 1.2;
        for (let i = 0; i < lines.length; i++) {
            const ly = y + item.computedFontSize + i * lh, lx = x + 4;
            if (item.hasOutline) {
                const oc = (item.textColor.r + item.textColor.g + item.textColor.b < 32)
                    ? `rgba(255,255,255,${item.textColor.a / 255})`
                    : `rgba(${item.outlineColor.r},${item.outlineColor.g},${item.outlineColor.b},${item.textColor.a / 255})`;
                ctx.strokeStyle = oc; ctx.lineWidth = item.outlineSize * 2; ctx.lineJoin = 'round';
                ctx.strokeText(lines[i], lx, ly);
            }
            ctx.fillStyle = `rgba(${item.textColor.r},${item.textColor.g},${item.textColor.b},${item.textColor.a / 255})`;
            ctx.fillText(lines[i], lx, ly);
        }
    }

    _measure(text, font, maxWidth) {
        this._ctx.font = font;
        const fs = parseInt(font, 10) || 22;
        const lh = fs * 1.2;
        const lines = text.split('\n');
        let w = 0;
        for (const l of lines) { const m = this._ctx.measureText(l).width; if (m > w) w = m; }
        if (maxWidth && w > maxWidth) w = maxWidth;
        return { width: w, height: lines.length * lh };
    }

    _clearCanvas() { if (this._ctx && this._canvas) this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height); }

    static _adjSpeed(speed, width) { return speed * (Math.min(width * 0.0015, 0.2) + 1); }
}

// ─── DanmakuFrostMaster ──────────────────────────────────────────────────────

class DanmakuFrostMaster {
    static get DEFAULT_DANMAKU_LAYER_COUNT() { return DanmakuDefaultLayerDef.DefaultLayerCount; }

    constructor(canvas) {
        this._render = new DanmakuRender(canvas);
        this._danmakuList = [];
        this._hasSubtitle = false;
        this._isRenderEnabled = true;
        this._isSeeking = false;
        this._isClosing = false;
        this._lastIndex = 0;
        this._lastTimeMs = 0;
        this._subtitleIndexAfterSeek = -1;
    }

    get debugMode() { return this._render.debugMode; }
    set debugMode(v) { this._render.debugMode = v; }

    setAutoControlDensity(v) { this._render.setAutoControlDensity(v); }
    setRollingDensity(v) { this._render.setRollingDensity(v); }
    setRollingAreaRatio(v) { this._render.setRollingAreaRatio(v); }
    setRollingSpeed(v) { this._render.setRollingSpeed(v); }
    setOpacity(v) { this._render.setOpacity(v); }
    setIsTextBold(v) { this._render.setIsTextBold(v); }
    setDanmakuFontSizeOffset(v) { this._render.setDanmakuFontSizeOffset(v); }
    setSubtitleFontSize(v) { this._render.setSubtitleFontSizeOffset(v); }
    setFontFamilyName(v) { this._render.setDefaultFontFamilyName(v); }
    setBorderColor(c) { this._render.setBorderColor(c); }
    setNoOverlapSubtitle(v) { this._render.setNoOverlapSubtitle(v); }

    updateTime(currentMs) {
        if (this._isClosing || this._isSeeking) return;
        if (currentMs < this._lastTimeMs || currentMs - this._lastTimeMs > 5000) { this.seek(currentMs); return; }
        this._lastTimeMs = currentMs;
        let subtitleRendered = false;

        while (currentMs > 0 && this._lastIndex < this._danmakuList.length && this._danmakuList[this._lastIndex].startMs <= currentMs) {
            if (this._isClosing) return;
            const di = this._danmakuList[this._lastIndex];
            if (di.isRealtime) { di.isRealtime = false; this._lastIndex++; continue; }
            if (this._isRenderEnabled) {
                let lid;
                switch (di.mode) {
                    case DanmakuMode.Bottom: lid = DanmakuDefaultLayerDef.BottomLayerId; break;
                    case DanmakuMode.Top: lid = DanmakuDefaultLayerDef.TopLayerId; break;
                    case DanmakuMode.ReverseRolling: lid = DanmakuDefaultLayerDef.ReverseRollingLayerId; break;
                    case DanmakuMode.Advanced: lid = DanmakuDefaultLayerDef.AdvancedLayerId; break;
                    case DanmakuMode.Subtitle: subtitleRendered = true; lid = DanmakuDefaultLayerDef.SubtitleLayerId; break;
                    default: lid = DanmakuDefaultLayerDef.RollingLayerId; break;
                }
                this._render.renderDanmakuItem(lid, di);
            }
            this._lastIndex++;
        }

        if (this._subtitleIndexAfterSeek >= 0 && this._subtitleIndexAfterSeek < this._danmakuList.length) {
            if (!subtitleRendered) this._render.renderDanmakuItem(DanmakuDefaultLayerDef.SubtitleLayerId, this._danmakuList[this._subtitleIndexAfterSeek]);
            this._subtitleIndexAfterSeek = -1;
        }
    }

    pause() { if (!this._isClosing) this._render.pause(); }
    resume() { this._render.start(); }
    stop() { this.pause(); this._render.stop(); }
    restart() { this.seek(0); }

    setRenderState(rd, rs) { this._isRenderEnabled = rd || rs; this._render.setRenderState(rd, rs); }
    setLayerRenderState(id, v) { this._render.setLayerRenderState(id, v); }
    setSubtitleLayer(id) { this._render.setSubtitleLayer(id); }

    seek(targetMs) {
        this._isSeeking = true;
        this.stop();
        this._lastIndex = 0;
        if (this._danmakuList.length > 0) {
            while (this._danmakuList[this._lastIndex] && this._danmakuList[this._lastIndex].startMs < targetMs) this._lastIndex++;
            if (this._hasSubtitle) {
                this._render.clearLayer(DanmakuDefaultLayerDef.SubtitleLayerId);
                let idx = this._lastIndex - 1;
                while (idx >= 0 && this._danmakuList[idx].mode !== DanmakuMode.Subtitle) idx--;
                if (idx >= 0 && idx !== this._lastIndex) {
                    const sub = this._danmakuList[idx];
                    if (sub.startMs + sub.durationMs > targetMs) this._subtitleIndexAfterSeek = idx;
                }
            }
        }
        this._lastTimeMs = targetMs;
        this.resume();
        this._isSeeking = false;
    }

    clear() { this._danmakuList = []; }

    close() {
        if (!this._isClosing) {
            this._isRenderEnabled = false; this._isClosing = true;
            this._render.close();
        }
    }

    addRealtimeDanmaku(item, insertToList, layerId = DanmakuDefaultLayerDef.DefaultLayerId) {
        item.allowDensityControl = false; item.isRealtime = true;
        this._render.renderDanmakuItem(layerId, item);
        if (insertToList) {
            let added = false;
            for (let i = 0; i < this._danmakuList.length; i++) {
                if (this._danmakuList[i].startMs > item.startMs) { this._danmakuList.splice(i, 0, item); added = true; break; }
            }
            if (!added) this._danmakuList.push(item);
        }
    }

    setDanmakuList(list) { this.clear(); this._lastIndex = 0; this._danmakuList = list || []; }

    setSubtitleList(subtitleList) {
        this._render.clearLayer(DanmakuDefaultLayerDef.SubtitleLayerId);
        this._danmakuList = this._danmakuList.filter(i => i.mode !== DanmakuMode.Subtitle);
        if (subtitleList && subtitleList.length > 0) {
            this._hasSubtitle = true;
            let i1 = 0, i2 = 0;
            const merged = [];
            while (i1 < this._danmakuList.length && i2 < subtitleList.length) {
                if (this._danmakuList[i1].startMs <= subtitleList[i2].startMs) { merged.push(this._danmakuList[i1++]); }
                else {
                    const sub = subtitleList[i2++]; merged.push(sub);
                    if (this._lastTimeMs > 0 && sub.startMs < this._lastTimeMs && sub.startMs + sub.durationMs > this._lastTimeMs)
                        this._render.renderDanmakuItem(DanmakuDefaultLayerDef.SubtitleLayerId, sub);
                }
            }
            while (i1 < this._danmakuList.length) merged.push(this._danmakuList[i1++]);
            while (i2 < subtitleList.length) {
                const sub = subtitleList[i2++]; merged.push(sub);
                if (this._lastTimeMs > 0 && sub.startMs < this._lastTimeMs && sub.startMs + sub.durationMs > this._lastTimeMs)
                    this._render.renderDanmakuItem(DanmakuDefaultLayerDef.SubtitleLayerId, sub);
            }
            this._danmakuList = merged;
            if (this._lastIndex >= this._danmakuList.length) this._lastIndex = Math.max(this._danmakuList.length - 1, 0);
        }
    }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DanmakuMode, DanmakuPool, DanmakuFontSize, DanmakuAlignmentMode,
        DanmakuItem, DanmakuDefaultLayerDef,
        DanmakuYSlotManager,
        BilibiliDanmakuXmlParser,
        AssParser,
        DanmakuRender,
        DanmakuFrostMaster
    };
}
