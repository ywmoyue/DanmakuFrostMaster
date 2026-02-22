'use strict';

const { DanmakuMode, DanmakuItem, DanmakuAlignmentMode } = require('./DanmakuTypes');

/**
 * Parse Bilibili danmaku XML and subtitle JSON.
 * Mirrors the C# BilibiliDanmakuXmlParser class.
 */
class BilibiliDanmakuXmlParser {
    /**
     * Parse a Bilibili danmaku XML string into a sorted list of DanmakuItem objects.
     *
     * Supported formats
     * - Old: `<d p="23.826,1,25,16777215,1422201084,0,057075e9,757076900">text</d>`
     * - New: `<d p="30845767597424709,0,59065,1,25,16777215,...">text</d>`
     * - Mode 7 (advanced): content is a JSON array
     *
     * @param {string} xmlStr
     * @param {string[]|null} regexFilterList
     * @param {boolean} mergeDuplicate
     * @param {{totalCount:number, filteredCount:number, mergedCount:number}} stats - output stats object
     * @returns {DanmakuItem[]}
     */
    static getDanmakuList(xmlStr, regexFilterList, mergeDuplicate, stats) {
        stats = stats || {};
        stats.totalCount = 0;
        stats.filteredCount = 0;
        stats.mergedCount = 0;

        const list = [];
        const duplicatedDanmakuDict = new Map();

        if (!xmlStr || !xmlStr.trim()) {
            return list;
        }

        const isNewFormat = xmlStr.includes('<oid>');

        const regex = /<d p="(?<tag>[^"]+)">(?<content>[\s\S]*?)<\/d>/g;
        let match;

        while ((match = regex.exec(xmlStr)) !== null) {
            stats.totalCount++;

            const tagStr = match.groups ? match.groups.tag : match[1];
            let contentStr = match.groups ? match.groups.content : match[2];

            if (!tagStr || !tagStr.trim() || !contentStr || !contentStr.trim()) {
                stats.filteredCount++;
                continue;
            }

            contentStr = BilibiliDanmakuXmlParser._htmlDecode(contentStr)
                .replace(/\/n/g, '\n')
                .replace(/\\n/g, '\n')
                .trim();

            let danmakuMode = DanmakuMode.Unknown;

            if (mergeDuplicate) {
                const pArray = tagStr.split(',');
                if (pArray.length >= 4) {
                    const modeIdx = isNewFormat ? 3 : 1;
                    const timeIdx = isNewFormat ? 2 : 0;
                    const mode = parseInt(pArray[modeIdx], 10);
                    const time = parseFloat(pArray[timeIdx]);
                    if (!isNaN(mode) && !isNaN(time)) {
                        danmakuMode = mode;
                        if ((danmakuMode === DanmakuMode.Rolling ||
                             danmakuMode === DanmakuMode.Top ||
                             danmakuMode === DanmakuMode.Bottom) && time >= 0) {
                            const startMs = isNewFormat ? time : time * 1000;
                            if (!duplicatedDanmakuDict.has(contentStr)) {
                                duplicatedDanmakuDict.set(contentStr, [{ startMs, count: 1 }]);
                            } else {
                                const dupeList = duplicatedDanmakuDict.get(contentStr);
                                let merged = false;
                                for (const dupe of dupeList) {
                                    if (Math.abs(startMs - dupe.startMs) <= 20000) {
                                        merged = true;
                                        dupe.count++;
                                        break;
                                    }
                                }
                                if (merged) {
                                    stats.mergedCount++;
                                    continue;
                                }
                                dupeList.push({ startMs, count: 1 });
                            }
                        }
                    }
                }
            }

            if (danmakuMode !== DanmakuMode.Advanced && danmakuMode !== DanmakuMode.Subtitle &&
                regexFilterList && regexFilterList.length > 0) {
                let filtered = false;
                for (const pattern of regexFilterList) {
                    if (new RegExp(pattern).test(contentStr)) {
                        filtered = true;
                        stats.filteredCount++;
                        break;
                    }
                }
                if (filtered) continue;
            }

            const item = BilibiliDanmakuXmlParser._parseDanmakuItem(tagStr, contentStr, isNewFormat);
            if (item) {
                list.push(item);
            }
        }

        // Annotate duplicates
        if (duplicatedDanmakuDict.size > 0) {
            for (const item of list) {
                if (item.mode === DanmakuMode.Rolling || item.mode === DanmakuMode.Top || item.mode === DanmakuMode.Bottom) {
                    const dupeList = duplicatedDanmakuDict.get(item.text);
                    if (dupeList) {
                        for (const dupe of dupeList) {
                            if (dupe.count > 1 && item.startMs === dupe.startMs) {
                                item.text = `${item.text}\u00D7${dupe.count}`;
                                break;
                            }
                        }
                    }
                }
            }
        }

        BilibiliDanmakuXmlParser._sort(list);
        return list;
    }

    /**
     * Parse a Bilibili CC subtitle JSON string.
     * @param {string} jsonStr
     * @returns {DanmakuItem[]}
     */
    static getSubtitleList(jsonStr) {
        const list = [];
        if (!jsonStr || !jsonStr.trim()) return list;

        let root;
        try {
            root = JSON.parse(jsonStr);
        } catch (e) {
            return list;
        }

        const bodyArray = root.body;
        if (!Array.isArray(bodyArray)) return list;

        for (const entry of bodyArray) {
            try {
                const fromMs = parseFloat(entry.from) * 1000;
                const toMs = parseFloat(entry.to) * 1000;
                if (toMs <= fromMs) continue;
                const content = (entry.content || '').trim();
                if (!content) continue;

                const item = new DanmakuItem();
                item.mode = DanmakuMode.Subtitle;
                item.startMs = fromMs;
                item.durationMs = toMs - fromMs;
                item.text = content.split('\n').map(s => s.trim()).join('\n');
                item.textColor = '#ffffff';
                item.baseFontSize = DanmakuItem.defaultBaseFontSize;
                item.hasOutline = false;
                item.allowDensityControl = false;
                list.push(item);
            } catch (e) {
                // skip malformed entry
            }
        }

        BilibiliDanmakuXmlParser._sort(list);
        return list;
    }

    /**
     * @param {string} tagStr
     * @param {string} content
     * @param {boolean} isNewFormat
     * @returns {DanmakuItem|null}
     */
    static _parseDanmakuItem(tagStr, content, isNewFormat) {
        const pArray = tagStr.split(',');
        if (pArray.length < 8) return null;

        try {
            const item = new DanmakuItem();
            item.id = isNewFormat ? parseInt(pArray[0], 10) : 0;
            item.hasBorder = false;
            item.text = content;
            item.textColor = BilibiliDanmakuXmlParser._parseColor(
                parseInt(pArray[isNewFormat ? 5 : 3], 10)
            );

            let startMs = isNewFormat
                ? parseFloat(pArray[2])
                : parseFloat(pArray[0]) * 1000;
            if (startMs < 0) startMs = 0;
            item.startMs = startMs;

            const mode = parseInt(pArray[isNewFormat ? 3 : 1], 10);
            switch (mode) {
                case DanmakuMode.Rolling: item.mode = DanmakuMode.Rolling; break;
                case DanmakuMode.Bottom:  item.mode = DanmakuMode.Bottom;  break;
                case DanmakuMode.Top:     item.mode = DanmakuMode.Top;     break;
                case DanmakuMode.ReverseRolling: item.mode = DanmakuMode.ReverseRolling; break;
                case DanmakuMode.Advanced: item.mode = DanmakuMode.Advanced; break;
                default: return null;
            }

            let fontSize = parseInt(pArray[isNewFormat ? 4 : 2], 10);
            if (item.mode !== DanmakuMode.Advanced) {
                fontSize -= fontSize % 2 === 1 ? 3 : 2;
            } else {
                fontSize += 4; // experimental adjustment
            }
            if (fontSize < 2) fontSize = 2;
            item.baseFontSize = fontSize;

            if (item.mode === DanmakuMode.Advanced) {
                if (!content.startsWith('[') || !content.endsWith(']')) return null;

                item.allowDensityControl = false;

                let valueArray;
                try {
                    valueArray = JSON.parse(content);
                    if (!Array.isArray(valueArray)) return null;
                } catch (e) {
                    return null;
                }

                if (valueArray.length < 5) return null;

                item.text = String(valueArray[4])
                    .replace(/\/n/g, '\n')
                    .replace(/\\n/g, '\n');
                if (!item.text.trim()) return null;

                item.startX = parseFloat(valueArray[0]) || 0;
                item.startY = parseFloat(valueArray[1]) || 0;
                item.endX = item.startX;
                item.endY = item.startY;

                const opacityStr = String(valueArray[2]);
                const opacitySplit = opacityStr.split('-');
                item.startAlpha = Math.round(Math.max(parseFloat(opacitySplit[0]), 0) * 255);
                item.endAlpha = opacitySplit.length > 1
                    ? Math.round(Math.max(parseFloat(opacitySplit[1]), 0) * 255)
                    : item.startAlpha;

                item.durationMs = parseFloat(valueArray[3]) * 1000;
                item.translationDurationMs = item.durationMs;
                item.translationDelayMs = 0;
                item.alphaDurationMs = item.durationMs;
                item.alphaDelayMs = 0;

                if (valueArray.length >= 7) {
                    item.rotateZ = parseFloat(valueArray[5]) || 0;
                    item.rotateY = parseFloat(valueArray[6]) || 0;
                }

                if (valueArray.length >= 11) {
                    item.endX = parseFloat(valueArray[7]) || 0;
                    item.endY = parseFloat(valueArray[8]) || 0;
                    if (valueArray[9] !== '' && valueArray[9] != null) {
                        item.translationDurationMs = parseFloat(valueArray[9]);
                    }
                    if (valueArray[10] !== '' && valueArray[10] != null) {
                        const tdStr = String(valueArray[10]);
                        item.translationDelayMs = tdStr === '\uff10' ? 0 : parseFloat(tdStr);
                    }
                }

                item.hasOutline = false;
                item.fontFamilyName = 'Consolas';
                item.keepDefinedFontSize = true;
            }

            return item;
        } catch (e) {
            return null;
        }
    }

    /**
     * Convert a 24-bit integer color value to a CSS `#rrggbb` string.
     * @param {number} colorValue
     * @returns {string}
     */
    static _parseColor(colorValue) {
        const v = (colorValue & 0xFFFFFF) >>> 0;
        return '#' + v.toString(16).padStart(6, '0');
    }

    /** Decode HTML entities (single-pass to avoid double-unescaping) */
    static _htmlDecode(str) {
        return str.replace(/&(?:amp|lt|gt|quot|#39|#(\d+));/g, (match, dec) => {
            if (dec) return String.fromCharCode(parseInt(dec, 10));
            switch (match) {
                case '&amp;':  return '&';
                case '&lt;':   return '<';
                case '&gt;':   return '>';
                case '&quot;': return '"';
                case '&#39;':  return "'";
                default:       return match;
            }
        });
    }

    /**
     * Stable merge sort by startMs (advanced danmaku also sorted by id).
     * @param {DanmakuItem[]} list
     */
    static _sort(list) {
        BilibiliDanmakuXmlParser._mergeSort(list, 0, list.length - 1);
    }

    static _mergeSort(list, p, r) {
        if (p < r) {
            const mid = Math.floor((p + r) / 2);
            BilibiliDanmakuXmlParser._mergeSort(list, p, mid);
            BilibiliDanmakuXmlParser._mergeSort(list, mid + 1, r);
            BilibiliDanmakuXmlParser._mergeArray(list, p, mid, r);
        }
    }

    static _mergeArray(list, p, mid, r) {
        const tmp = new Array(r - p + 1);
        let i = p, j = mid + 1, k = 0;
        while (i <= mid && j <= r) {
            if (list[i].startMs < list[j].startMs) {
                tmp[k++] = list[i++];
            } else if (list[i].startMs > list[j].startMs) {
                tmp[k++] = list[j++];
            } else if (list[i].mode === DanmakuMode.Advanced) {
                if (list[i].id <= list[j].id) tmp[k++] = list[i++];
                else tmp[k++] = list[j++];
            } else {
                tmp[k++] = list[i++];
            }
        }
        while (i <= mid) tmp[k++] = list[i++];
        while (j <= r)   tmp[k++] = list[j++];
        for (let x = 0; x < tmp.length; x++) list[p + x] = tmp[x];
    }
}

module.exports = { BilibiliDanmakuXmlParser };
