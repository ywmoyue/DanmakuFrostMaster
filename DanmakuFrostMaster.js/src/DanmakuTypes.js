'use strict';

/**
 * Danmaku display mode
 */
const DanmakuMode = Object.freeze({
    Unknown: 0,
    Rolling: 1,
    Bottom: 4,
    Top: 5,
    ReverseRolling: 6,
    Advanced: 7,
    Subtitle: 9,
});

/**
 * Danmaku pool type
 */
const DanmakuPool = Object.freeze({
    Normal: 0,
    Subtitle: 1,
    Special: 2,
});

/**
 * Font size presets
 */
const DanmakuFontSize = Object.freeze({
    Smallest: 1,
    Smaller: 2,
    Normal: 3,
    Larger: 4,
    Largest: 5,
});

/**
 * Alignment modes for advanced danmaku
 */
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
    UpperRight: 9,
});

/**
 * Default layer IDs
 */
const DanmakuDefaultLayerDef = Object.freeze({
    DefaultLayerId: 0,
    RollingLayerId: 0,
    ReverseRollingLayerId: 1,
    TopLayerId: 2,
    BottomLayerId: 3,
    AdvancedLayerId: 4,
    SubtitleLayerId: 5,
    DefaultLayerCount: 6,
});

/**
 * A single danmaku item
 */
class DanmakuItem {
    constructor() {
        /** @type {number} Used to sort danmaku with the same startMs */
        this.id = 0;
        /** @type {number} Start time in milliseconds */
        this.startMs = 0;
        this.hasBorder = false;
        this.hasOutline = true;
        this.allowDensityControl = true;
        this.isRealtime = false;
        /** @type {number} Base font size in pixels */
        this.baseFontSize = DanmakuItem.defaultBaseFontSize;
        this.outlineSize = 2;
        /** @type {string|null} */
        this.fontFamilyName = null;
        /** @type {string} */
        this.text = '';
        /** @type {boolean|null} null = use global setting */
        this.isBold = null;
        /** @type {number} DanmakuMode value */
        this.mode = DanmakuMode.Unknown;
        /** @type {string} CSS color string */
        this.textColor = '#ffffff';
        /** @type {string} CSS color string */
        this.outlineColor = '#000000';

        this.weight = 0;
        this.midHash = null;

        // Advanced mode fields
        this.startX = 0;
        this.startY = 0;
        this.endX = 0;
        this.endY = 0;
        this.marginLeft = 0;
        this.marginRight = 0;
        this.marginBottom = 0;
        /** @type {number} DanmakuAlignmentMode value */
        this.alignmentMode = DanmakuAlignmentMode.Default;
        /** @type {number} DanmakuAlignmentMode value */
        this.anchorMode = DanmakuAlignmentMode.UpperLeft;
        /** @type {number} 0-255 */
        this.startAlpha = 255;
        /** @type {number} 0-255 */
        this.endAlpha = 255;
        /** @type {number} Duration in milliseconds */
        this.durationMs = 0;
        this.translationDurationMs = 0;
        this.translationDelayMs = 0;
        this.alphaDurationMs = 0;
        this.alphaDelayMs = 0;
        /** @type {number} Rotation in degrees */
        this.rotateZ = 0;
        /** @type {number} Rotation in degrees */
        this.rotateY = 0;
        this.keepDefinedFontSize = false;
    }
}

DanmakuItem.defaultBaseFontSize = 22;

module.exports = {
    DanmakuMode,
    DanmakuPool,
    DanmakuFontSize,
    DanmakuAlignmentMode,
    DanmakuDefaultLayerDef,
    DanmakuItem,
};
