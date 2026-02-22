/**
 * DanmakuFrostMaster - JavaScript Version
 * AssParser.js - Parser for ASS subtitle files
 */

'use strict';

/* global DanmakuMode, DanmakuAlignmentMode, DanmakuItem */

class AssParser {
    /**
     * Parse an ASS subtitle string into a list of DanmakuItem objects.
     * @param {string} assStr
     * @returns {DanmakuItem[]|null}
     */
    static getDanmakuList(assStr) {
        try {
            const list = [];
            const styleDict = new Map();

            const lines = assStr.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            let videoWidth = 0;
            let videoHeight = 0;
            let dialogueFormatSegmentCount = 10;

            for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                const line = lines[lineIdx];
                if (!line || !line.trim()) continue;

                if (line.startsWith('PlayResX:')) {
                    videoWidth = parseInt(line.substring(9).trim(), 10) || 0;
                } else if (line.startsWith('PlayResY:')) {
                    videoHeight = parseInt(line.substring(9).trim(), 10) || 0;
                } else if (line.startsWith('Style:')) {
                    try {
                        const styleData = line.substring(6).trim();
                        const splitArray = styleData.split(',');
                        if (splitArray.length >= 22) {
                            const styleName = splitArray[0];
                            if (!styleDict.has(styleName)) {
                                styleDict.set(styleName, new AssStyle());
                            }
                            const style = styleDict.get(styleName);

                            style.fontFamilyName = splitArray[1];
                            style.fontSize = parseFloat(splitArray[2]) || style.fontSize;

                            const textColorMatch = splitArray[3].match(/[A-Fa-f0-9]{8}/);
                            if (textColorMatch) {
                                const cs = textColorMatch[0];
                                const a = parseInt(cs.substring(0, 2), 16);
                                const r = parseInt(cs.substring(6, 8), 16);
                                const g = parseInt(cs.substring(4, 6), 16);
                                const b = parseInt(cs.substring(2, 4), 16);
                                style.alpha = 255 - a;
                                style.textColor = { r, g, b, a: 255 };
                            }

                            const outlineColorMatch = splitArray[5].match(/[A-Fa-f0-9]{8}/);
                            if (outlineColorMatch) {
                                const cs = outlineColorMatch[0];
                                const r = parseInt(cs.substring(6, 8), 16);
                                const g = parseInt(cs.substring(4, 6), 16);
                                const b = parseInt(cs.substring(2, 4), 16);
                                style.outlineColor = { r, g, b, a: 255 };
                            }

                            style.isBold = splitArray[7] === '-1';
                            style.hasOutline = splitArray[15] === '1';
                            style.outlineSize = parseFloat(splitArray[16]) || style.outlineSize;

                            const posMode = parseInt(splitArray[18], 10);
                            if (!isNaN(posMode)) style.alignmentMode = posMode;
                            const ml = parseInt(splitArray[19], 10);
                            if (!isNaN(ml)) style.marginLeft = ml;
                            const mr = parseInt(splitArray[20], 10);
                            if (!isNaN(mr)) style.marginRight = mr;
                            const mb = parseInt(splitArray[21], 10);
                            if (!isNaN(mb)) style.marginBottom = mb;
                        }
                    } catch (e) {
                        // Skip invalid style line
                    }
                } else if (line.startsWith('[Events]')) {
                    const nextLine = lines[lineIdx + 1];
                    if (nextLine && nextLine.startsWith('Format:')) {
                        dialogueFormatSegmentCount = nextLine.split(',').length;
                        lineIdx++;
                    }
                } else if (line.startsWith('Dialogue:')) {
                    try {
                        const dlgData = line.substring(8).trim();
                        const splitArray = dlgData.split(',');

                        let subtitleText = splitArray[splitArray.length - 1].trim();
                        if (splitArray.length > dialogueFormatSegmentCount) {
                            subtitleText = splitArray[dialogueFormatSegmentCount - 1];
                            for (let i = dialogueFormatSegmentCount; i < splitArray.length; i++) {
                                subtitleText = subtitleText + ',' + splitArray[i];
                            }
                        }

                        if (!subtitleText || !subtitleText.trim()) continue;

                        const item = new DanmakuItem();
                        item.allowDensityControl = false;
                        item.mode = DanmakuMode.Advanced;

                        const startTime = AssParser._parseTime(splitArray[1]);
                        const endTime = AssParser._parseTime(splitArray[2]);

                        if (startTime === null || endTime === null || endTime <= 0) continue;

                        item.startMs = Math.max(Math.floor(startTime), 0);
                        item.durationMs = Math.floor(endTime) - item.startMs;

                        let styleName = splitArray[3];
                        if (styleName.startsWith('*')) styleName = styleName.substring(1);
                        const style = styleDict.has(styleName) ? styleDict.get(styleName) : new AssStyle();

                        item.startAlpha = style.alpha;
                        item.endAlpha = style.alpha;
                        item.isBold = style.isBold;
                        item.hasOutline = style.hasOutline;
                        item.baseFontSize = style.fontSize;
                        item.outlineSize = style.outlineSize;
                        item.fontFamilyName = style.fontFamilyName;
                        item.textColor = Object.assign({}, style.textColor);
                        item.outlineColor = Object.assign({}, style.outlineColor);
                        item.marginLeft = style.marginLeft;
                        item.marginRight = style.marginRight;
                        item.marginBottom = style.marginBottom;
                        item.alignmentMode = style.alignmentMode;

                        const ml = parseInt(splitArray[5], 10);
                        if (!isNaN(ml) && ml !== 0) item.marginLeft = ml;
                        const mr = parseInt(splitArray[6], 10);
                        if (!isNaN(mr) && mr !== 0) item.marginRight = mr;
                        const mb = parseInt(splitArray[7], 10);
                        if (!isNaN(mb) && mb !== 0) item.marginBottom = mb;

                        if (subtitleText.startsWith('{') && subtitleText.includes('}') && !subtitleText.endsWith('}')) {
                            const fnMatch = subtitleText.match(/\\fn([^\\}]+)/);
                            if (fnMatch) item.fontFamilyName = fnMatch[1];

                            const fsMatch = subtitleText.match(/\\fs(\d+)/);
                            if (fsMatch) item.baseFontSize = parseInt(fsMatch[1], 10);

                            const bordMatch = subtitleText.match(/\\bord(\d+)/);
                            if (bordMatch) {
                                const bord = parseInt(bordMatch[1], 10);
                                item.outlineSize = bord;
                                item.hasOutline = bord > 0;
                            }

                            const colorMatches = [...subtitleText.matchAll(/\\(\d)c.*?([A-Fa-f0-9]{6,8})/g)];
                            for (const cm of colorMatches) {
                                const colorType = parseInt(cm[1], 10);
                                if (colorType === 1 || colorType === 3) {
                                    let cs = cm[2];
                                    if (cs.length > 6) cs = cs.substring(cs.length - 6);
                                    const r = parseInt(cs.substring(4, 6), 16);
                                    const g = parseInt(cs.substring(2, 4), 16);
                                    const b = parseInt(cs.substring(0, 2), 16);
                                    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
                                        if (colorType === 3) {
                                            item.outlineColor = { r, g, b, a: 255 };
                                        } else {
                                            item.textColor = { r, g, b, a: 255 };
                                        }
                                    }
                                }
                            }

                            const fadMatch = subtitleText.match(/\\fad\((\d+),(\d+)\)/);
                            if (fadMatch) {
                                const fadeInMs = parseInt(fadMatch[1], 10);
                                if (fadeInMs > 0) {
                                    item.startAlpha = 0;
                                    item.alphaDurationMs = fadeInMs;
                                } else {
                                    const fadeOutMs = parseInt(fadMatch[2], 10);
                                    if (fadeOutMs > 0) {
                                        item.endAlpha = 0;
                                        item.alphaDurationMs = fadeOutMs;
                                    }
                                }
                            }

                            const moveMatch = subtitleText.match(/\\move\(([\d.,]+?)\)/);
                            if (moveMatch) {
                                item.alignmentMode = DanmakuAlignmentMode.Default;
                                const moveParts = moveMatch[1].split(',');
                                if (moveParts.length >= 4) {
                                    let sx = parseFloat(moveParts[0]);
                                    let sy = parseFloat(moveParts[1]);
                                    let ex = parseFloat(moveParts[2]);
                                    let ey = parseFloat(moveParts[3]);
                                    if (videoWidth > 0 && videoHeight > 0) {
                                        sx = Math.min(sx / videoWidth, 0.99);
                                        sy = Math.min(sy / videoHeight, 0.99);
                                        ex = Math.min(ex / videoWidth, 0.99);
                                        ey = Math.min(ey / videoHeight, 0.99);
                                    }
                                    item.startX = sx; item.endX = ex;
                                    item.startY = sy; item.endY = ey;

                                    if (moveParts.length >= 6) {
                                        const delayMs = parseInt(moveParts[4], 10);
                                        const durMs = parseInt(moveParts[5], 10);
                                        if (!isNaN(delayMs) && !isNaN(durMs)) {
                                            item.translationDelayMs = delayMs;
                                            item.translationDurationMs = durMs;
                                        }
                                    }
                                }
                            } else {
                                const posMatch = subtitleText.match(/\\pos\(([\d.]+),([\d.]+)\)/);
                                if (posMatch) {
                                    item.alignmentMode = DanmakuAlignmentMode.Default;
                                    let x = parseFloat(posMatch[1]);
                                    let y = parseFloat(posMatch[2]);
                                    if (videoWidth > 0 && videoHeight > 0) {
                                        x = Math.min(x / videoWidth, 0.99);
                                        y = Math.min(y / videoHeight, 0.99);
                                    }
                                    item.startX = x; item.endX = x;
                                    item.startY = y; item.endY = y;

                                    const anMatch = subtitleText.match(/\\an(\d+)/);
                                    item.anchorMode = anMatch
                                        ? parseInt(anMatch[1], 10)
                                        : style.alignmentMode;
                                }
                            }

                            const fryMatch = subtitleText.match(/\\fry([\d.]+)/);
                            if (fryMatch) item.rotateY = parseFloat(fryMatch[1]);

                            const frzMatch = subtitleText.match(/\\frz([\d.]+)/);
                            if (frzMatch) item.rotateZ = -parseFloat(frzMatch[1]);

                            subtitleText = subtitleText.replace(/\{.*?\}/g, '');
                            if (/^m \d+/.test(subtitleText)) continue; // Skip drawing commands
                        }

                        item.text = subtitleText.replace(/\\n/g, '\n').replace(/\\N/g, '\n');
                        item.baseFontSize = Math.max(item.baseFontSize * 0.75, 2);
                        item.outlineSize *= 2;

                        if (item.fontFamilyName && item.fontFamilyName.endsWith(' Bold')) {
                            item.fontFamilyName = item.fontFamilyName.substring(0, item.fontFamilyName.length - 5);
                        }
                        if (item.fontFamilyName && item.fontFamilyName.startsWith('@')) {
                            item.fontFamilyName = item.fontFamilyName.substring(1);
                        }

                        if (item.alignmentMode === DanmakuAlignmentMode.LowerCenter && item.alphaDurationMs === 0) {
                            item.mode = DanmakuMode.Bottom;
                        }

                        list.push(item);
                    } catch (e) {
                        // Skip invalid dialogue line
                    }
                }
            }

            list.sort((a, b) => a.startMs - b.startMs);

            // Avoid startMs/endMs overlapping for Bottom mode subtitles
            for (let i = 0; i < list.length - 1; i++) {
                if (list[i].mode === DanmakuMode.Bottom &&
                    list[i + 1].mode === DanmakuMode.Bottom &&
                    list[i].durationMs > 100 &&
                    list[i + 1].startMs - list[i].startMs - list[i].durationMs < 60) {
                    list[i].durationMs = list[i + 1].startMs - list[i].startMs - 60;
                }
            }

            return list;
        } catch (e) {
            return null;
        }
    }

    /**
     * Parse ASS time string (H:MM:SS.cc) to milliseconds.
     * @param {string} timeStr
     * @returns {number|null}
     */
    static _parseTime(timeStr) {
        if (!timeStr) return null;
        timeStr = timeStr.trim();
        const parts = timeStr.split(':');
        if (parts.length !== 3) return null;
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const s = parseFloat(parts[2]);
        if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
        return ((h * 3600) + (m * 60) + s) * 1000;
    }
}

class AssStyle {
    constructor() {
        this.marginLeft = 0;
        this.marginRight = 0;
        this.marginBottom = 20;
        this.alpha = 255;
        this.isBold = true;
        this.hasOutline = true;
        this.fontSize = DanmakuItem.defaultBaseFontSize;
        this.outlineSize = 2;
        this.fontFamilyName = null;
        this.textColor = { r: 255, g: 255, b: 255, a: 255 };
        this.outlineColor = { r: 0, g: 0, b: 0, a: 255 };
        this.alignmentMode = DanmakuAlignmentMode.LowerCenter;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AssParser };
}
