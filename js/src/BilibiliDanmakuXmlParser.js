/**
 * DanmakuFrostMaster - JavaScript Version
 * BilibiliDanmakuXmlParser.js - Parser for Bilibili danmaku XML and CC subtitle JSON
 */

'use strict';

/* global DanmakuMode, DanmakuItem */

class BilibiliDanmakuXmlParser {
    /**
     * Parse a Bilibili danmaku XML string into a sorted list of DanmakuItem objects.
     * @param {string} xmlStr
     * @param {string[]|null} regexFilterList
     * @param {boolean} mergeDuplicate
     * @returns {{ list: DanmakuItem[], totalCount: number, filteredCount: number, mergedCount: number }}
     */
    static getDanmakuList(xmlStr, regexFilterList, mergeDuplicate) {
        let totalCount = 0;
        let filteredCount = 0;
        let mergedCount = 0;
        const list = [];
        const duplicatedDanmakuDict = new Map();

        if (!xmlStr || !xmlStr.trim()) {
            return { list, totalCount, filteredCount, mergedCount };
        }

        const isNewFormat = xmlStr.includes('<oid>');

        // Old format: <d p="23.826,1,25,16777215,...">text</d>
        // New format: <d p="id,0,59065,1,25,16777215,...">text</d>
        const regex = /<d p="([^"]+)">([\s\S]*?)<\/d>/g;
        let match;

        while ((match = regex.exec(xmlStr)) !== null) {
            totalCount++;

            const tagStr = match[1];
            let contentStr = match[2];

            if (!tagStr || !contentStr || !contentStr.trim()) {
                filteredCount++;
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
                                let merged = false;
                                const duplicatedList = duplicatedDanmakuDict.get(contentStr);
                                for (const dup of duplicatedList) {
                                    if (Math.abs(startMs - dup.startMs) <= 20000) {
                                        merged = true;
                                        dup.count++;
                                        break;
                                    }
                                }
                                if (merged) {
                                    mergedCount++;
                                    continue;
                                } else {
                                    duplicatedList.push({ startMs, count: 1 });
                                }
                            }
                        }
                    }
                }
            }

            if (danmakuMode !== DanmakuMode.Advanced &&
                danmakuMode !== DanmakuMode.Subtitle &&
                regexFilterList && regexFilterList.length > 0) {
                let filtered = false;
                for (const regexFilter of regexFilterList) {
                    if (new RegExp(regexFilter).test(contentStr)) {
                        filtered = true;
                        filteredCount++;
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

        if (duplicatedDanmakuDict.size > 0) {
            for (const item of list) {
                if (item.mode === DanmakuMode.Rolling ||
                    item.mode === DanmakuMode.Top ||
                    item.mode === DanmakuMode.Bottom) {
                    if (duplicatedDanmakuDict.has(item.text)) {
                        const dupList = duplicatedDanmakuDict.get(item.text);
                        for (const dup of dupList) {
                            if (dup.count > 1 && item.startMs === dup.startMs) {
                                item.text = `${item.text}\u00D7${dup.count}`;
                                break;
                            }
                        }
                    }
                }
            }
        }

        BilibiliDanmakuXmlParser._sortDanmakuList(list);
        return { list, totalCount, filteredCount, mergedCount };
    }

    /**
     * Parse a Bilibili CC subtitle JSON string into a sorted list of DanmakuItem objects.
     * @param {string} jsonArrayStr
     * @returns {DanmakuItem[]}
     */
    static getSubtitleList(jsonArrayStr) {
        const list = [];
        if (!jsonArrayStr || !jsonArrayStr.trim()) {
            return list;
        }

        try {
            const jObject = JSON.parse(jsonArrayStr);
            const bodyArray = jObject.body;
            if (Array.isArray(bodyArray)) {
                for (const entry of bodyArray) {
                    try {
                        const fromMs = parseFloat(entry.from) * 1000;
                        const toMs = parseFloat(entry.to) * 1000;
                        if (toMs > fromMs) {
                            const content = entry.content;
                            if (content && content.trim()) {
                                const item = new DanmakuItem();
                                item.mode = DanmakuMode.Subtitle;
                                item.startMs = Math.floor(fromMs);
                                item.durationMs = Math.floor(toMs - fromMs);
                                item.text = content.split('\n').map(s => s.trim()).join('\n');
                                item.textColor = { r: 255, g: 255, b: 255, a: 255 };
                                item.baseFontSize = DanmakuItem.defaultBaseFontSize;
                                item.hasOutline = false;
                                item.allowDensityControl = false;
                                list.push(item);
                            }
                        }
                    } catch (e) {
                        // Skip invalid entry
                    }
                }
            }
        } catch (e) {
            // Skip invalid JSON
        }

        BilibiliDanmakuXmlParser._sortDanmakuList(list);
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
            item.textColor = BilibiliDanmakuXmlParser._parseColor(parseInt(pArray[isNewFormat ? 5 : 3], 10));

            let startMs = isNewFormat ? parseFloat(pArray[2]) : parseFloat(pArray[0]) * 1000;
            if (startMs < 0) startMs = 0;
            item.startMs = Math.floor(startMs);

            const mode = parseInt(pArray[isNewFormat ? 3 : 1], 10);
            switch (mode) {
                case DanmakuMode.Rolling:
                    item.mode = DanmakuMode.Rolling;
                    break;
                case DanmakuMode.Bottom:
                    item.mode = DanmakuMode.Bottom;
                    break;
                case DanmakuMode.Top:
                    item.mode = DanmakuMode.Top;
                    break;
                case DanmakuMode.ReverseRolling:
                    item.mode = DanmakuMode.ReverseRolling;
                    break;
                case DanmakuMode.Advanced:
                    item.mode = DanmakuMode.Advanced;
                    break;
                default:
                    return null;
            }

            let fontSize = parseInt(pArray[isNewFormat ? 4 : 2], 10);
            switch (item.mode) {
                case DanmakuMode.Rolling:
                case DanmakuMode.Bottom:
                case DanmakuMode.Top:
                case DanmakuMode.ReverseRolling:
                    fontSize -= fontSize % 2 === 1 ? 3 : 2;
                    break;
                case DanmakuMode.Advanced:
                    fontSize += 4;
                    break;
            }
            if (fontSize < 2) fontSize = 2;
            item.baseFontSize = fontSize;

            if (item.mode === DanmakuMode.Advanced) {
                if (!content.startsWith('[') || !content.endsWith(']')) {
                    return null;
                }

                item.allowDensityControl = false;

                let valueArray;
                try {
                    valueArray = JSON.parse(content);
                    valueArray = valueArray.map(v => v == null ? '' : String(v));
                } catch (e) {
                    return null;
                }

                if (valueArray.length < 5) return null;

                item.text = BilibiliDanmakuXmlParser._htmlDecode(valueArray[4])
                    .replace(/\/n/g, '\n')
                    .replace(/\\n/g, '\n');
                if (!item.text || !item.text.trim()) return null;

                item.startX = !valueArray[0] ? 0 : parseFloat(valueArray[0]);
                item.startY = !valueArray[1] ? 0 : parseFloat(valueArray[1]);
                item.endX = item.startX;
                item.endY = item.startY;

                const opacitySplit = valueArray[2].split('-');
                item.startAlpha = Math.round(Math.max(parseFloat(opacitySplit[0]), 0) * 255);
                item.endAlpha = opacitySplit.length > 1
                    ? Math.round(Math.max(parseFloat(opacitySplit[1]), 0) * 255)
                    : item.startAlpha;

                item.durationMs = Math.floor(parseFloat(valueArray[3]) * 1000);
                item.translationDurationMs = item.durationMs;
                item.translationDelayMs = 0;
                item.alphaDurationMs = item.durationMs;
                item.alphaDelayMs = 0;

                if (valueArray.length >= 7) {
                    item.rotateZ = !valueArray[5] ? 0 : parseFloat(valueArray[5]);
                    item.rotateY = !valueArray[6] ? 0 : parseFloat(valueArray[6]);
                }

                if (valueArray.length >= 11) {
                    item.endX = !valueArray[7] ? 0 : parseFloat(valueArray[7]);
                    item.endY = !valueArray[8] ? 0 : parseFloat(valueArray[8]);
                    if (valueArray[9]) {
                        item.translationDurationMs = Math.floor(parseFloat(valueArray[9]));
                    }
                    if (valueArray[10]) {
                        const delayVal = valueArray[10];
                        item.translationDelayMs = delayVal === '\uFF10' ? 0 : Math.floor(parseFloat(delayVal));
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
     * @param {number} colorValue
     * @returns {{ r: number, g: number, b: number, a: number }}
     */
    static _parseColor(colorValue) {
        colorValue = colorValue & 0xFFFFFF;
        const b = colorValue & 0xFF;
        const g = (colorValue >> 8) & 0xFF;
        const r = (colorValue >> 16) & 0xFF;
        return { r, g, b, a: 255 };
    }

    /**
     * HTML-decode a string (handles &amp; &lt; &gt; &quot; &#NN; &#xNN;)
     * @param {string} str
     * @returns {string}
     */
    static _htmlDecode(str) {
        return str
            .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
            .replace(/&quot;/g, '"')
            .replace(/&gt;/g, '>')
            .replace(/&lt;/g, '<')
            .replace(/&amp;/g, '&');
    }

    /**
     * Stable merge-sort by startMs, with advanced mode tiebreaking by id.
     * @param {DanmakuItem[]} list
     */
    static _sortDanmakuList(list) {
        BilibiliDanmakuXmlParser._mergeSort(list, 0, list.length - 1);
    }

    static _mergeSort(list, p, r) {
        if (p < r) {
            const mid = Math.floor((p + r) / 2);
            BilibiliDanmakuXmlParser._mergeSort(list, p, mid);
            BilibiliDanmakuXmlParser._mergeSort(list, mid + 1, r);
            BilibiliDanmakuXmlParser._mergeSortMerge(list, p, mid, r);
        }
    }

    static _mergeSortMerge(list, p, mid, r) {
        const tmp = [];
        let i = p, j = mid + 1;

        while (i <= mid && j <= r) {
            const a = list[i], b = list[j];
            if (a.startMs < b.startMs) {
                tmp.push(list[i++]);
            } else if (a.startMs > b.startMs) {
                tmp.push(list[j++]);
            } else if (a.mode === DanmakuMode.Advanced) {
                if (a.id <= b.id) {
                    tmp.push(list[i++]);
                } else {
                    tmp.push(list[j++]);
                }
            } else {
                tmp.push(list[i++]);
            }
        }

        while (i <= mid) tmp.push(list[i++]);
        while (j <= r) tmp.push(list[j++]);

        for (let k = 0; k < tmp.length; k++) {
            list[p + k] = tmp[k];
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BilibiliDanmakuXmlParser };
}
