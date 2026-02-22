/**
 * DanmakuFrostMaster - JavaScript Version
 * BaseTypeDef.js - Core type definitions and enumerations
 */

'use strict';

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
        // Used to sort danmaku with the same StartMs
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

        // For Advanced mode
        this.startX = 0;
        this.startY = 0;
        this.endX = 0;
        this.endY = 0;

        this.marginLeft = 0;
        this.marginRight = 0;
        this.marginBottom = 0;
        this.alignmentMode = DanmakuAlignmentMode.Default;
        this.anchorMode = DanmakuAlignmentMode.UpperLeft;

        this.startAlpha = 255;
        this.endAlpha = 255;

        this.durationMs = 0;
        this.translationDurationMs = 0;
        this.translationDelayMs = 0;
        this.alphaDurationMs = 0;
        this.alphaDelayMs = 0;

        /** Degree */
        this.rotateZ = 0;
        /** Degree */
        this.rotateY = 0;

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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DanmakuMode, DanmakuPool, DanmakuFontSize, DanmakuAlignmentMode, DanmakuItem, DanmakuDefaultLayerDef };
}
