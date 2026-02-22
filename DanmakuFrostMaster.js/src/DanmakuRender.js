'use strict';

const {
    DanmakuMode,
    DanmakuFontSize,
    DanmakuAlignmentMode,
    DanmakuDefaultLayerDef,
} = require('./DanmakuTypes');
const { DanmakuYSlotManager } = require('./DanmakuYSlotManager');

const STANDARD_CANVAS_WIDTH = 800;
const DEFAULT_ROLLING_SPEED = 0.1; // pixels per millisecond
const DEFAULT_BOTTOM_AND_TOP_DURATION_MS = 3800;
const SUBTITLE_START_Y = 24;
const DEFAULT_FONT_FAMILY = 'Microsoft YaHei, SimHei, sans-serif';

let _nextItemId = 1;
function _getNextId() {
    if (_nextItemId === 0) _nextItemId = 1;
    return _nextItemId++;
}

// ─── RenderLayer ────────────────────────────────────────────────────────────

class RenderLayer {
    constructor(layerId, requireStrictOrder) {
        this.layerId = layerId;
        this.requireStrictOrder = requireStrictOrder;
        /** @type {DanmakuRenderItem[]} */
        this.renderList = [];
        this.ySlotManager = new DanmakuYSlotManager(0);
        this.isEnabled = true;
        this.isSubtitleLayer = false;
    }

    updateYSlotManagerLength(canvasHeight, rollingAreaRatio) {
        const h = canvasHeight;
        const id = this.layerId;
        if (id === DanmakuDefaultLayerDef.RollingLayerId || id === DanmakuDefaultLayerDef.ReverseRollingLayerId) {
            this.ySlotManager.updateLength(h * rollingAreaRatio);
        } else if (id === DanmakuDefaultLayerDef.TopLayerId) {
            this.ySlotManager.updateLength(h * 0.75);
        } else if (id === DanmakuDefaultLayerDef.BottomLayerId) {
            this.ySlotManager.updateLength(h / 2);
        } else {
            this.ySlotManager.updateLength(h);
        }
    }

    clear() {
        this.renderList = [];
        this.ySlotManager.clear();
    }

    setSubtitleLayer(value) {
        this.isSubtitleLayer = value;
    }
}

// ─── DanmakuRenderItem ───────────────────────────────────────────────────────

class DanmakuRenderItem {
    constructor(danmakuItem) {
        this.id = _getNextId();
        this.hasBorder = danmakuItem.hasBorder;
        this.hasOutline = danmakuItem.hasOutline;
        this.allowDensityControl = danmakuItem.allowDensityControl;
        this.fontSize = danmakuItem.baseFontSize;
        this.outlineSize = danmakuItem.outlineSize;
        this.fontFamilyName = danmakuItem.fontFamilyName;
        this.text = danmakuItem.text;
        this.isBold = danmakuItem.isBold;
        this.mode = danmakuItem.mode;
        this.textColor = danmakuItem.textColor;
        this.outlineColor = danmakuItem.outlineColor;

        this.isFirstRenderTimeSet = false;
        this.firstRenderTime = 0;

        this.width = 0;
        this.height = 0;
        this.x = 0;
        this.y = 0;
        this.startX = 0;
        this.startY = 0;
        this.endX = 0;
        this.endY = 0;
        this.needToReleaseYSlot = false;

        // Advanced mode
        this.definedStartX = danmakuItem.startX;
        this.definedStartY = danmakuItem.startY;
        this.definedEndX = danmakuItem.endX;
        this.definedEndY = danmakuItem.endY;
        this.marginLeft = danmakuItem.marginLeft;
        this.marginRight = danmakuItem.marginRight;
        this.marginBottom = danmakuItem.marginBottom;
        this.alignmentMode = danmakuItem.alignmentMode;
        this.anchorMode = danmakuItem.anchorMode;
        this.definedStartAlpha = danmakuItem.startAlpha;
        this.definedEndAlpha = danmakuItem.endAlpha;
        this.alpha = danmakuItem.startAlpha;
        this.definedDurationMs = danmakuItem.durationMs;
        this.definedTranslationDurationMs = danmakuItem.translationDurationMs;
        this.definedTranslationDelayMs = danmakuItem.translationDelayMs;
        this.definedAlphaDurationMs = danmakuItem.alphaDurationMs;
        this.definedAlphaDelayMs = danmakuItem.alphaDelayMs;
        this.definedRotateZ = danmakuItem.rotateZ;
        this.definedRotateY = danmakuItem.rotateY;
        this.translationSpeedX = 0;
        this.translationSpeedY = 0;
    }
}

// ─── DanmakuRender ───────────────────────────────────────────────────────────

/**
 * Core rendering engine. Uses HTML5 Canvas 2D API.
 * Mirrors the C# DanmakuRender class.
 */
class DanmakuRender {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        if (!canvas) throw new Error('canvas is required');

        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');

        this.canvasWidth = canvas.width;
        this.canvasHeight = canvas.height;

        this._isStopped = false;
        this._isPaused = false;
        this._isDanmakuEnabled = true;
        this._isSubtitleEnabled = true;

        this._autoControlDensity = true;
        this._textBold = true;
        this._noOverlapSubtitle = false;
        this._rollingDensity = -1;
        this._danmakuFontSizeOffset = DanmakuFontSize.Normal;
        this._subtitleFontSizeOffset = DanmakuFontSize.Normal;
        this._rollingAreaRatio = 0.8;
        this._rollingSpeed = DEFAULT_ROLLING_SPEED;
        this._textOpacity = 1.0;
        this._borderColor = '#0000ff';
        this._defaultFontFamily = DEFAULT_FONT_FAMILY;

        this.debugMode = false;

        const layerCount = DanmakuDefaultLayerDef.DefaultLayerCount;
        this._layers = [];
        for (let i = 0; i < layerCount; i++) {
            const layer = new RenderLayer(
                i,
                i === DanmakuDefaultLayerDef.AdvancedLayerId || i === DanmakuDefaultLayerDef.SubtitleLayerId
            );
            if (canvas.height >= 1) {
                layer.updateYSlotManagerLength(canvas.height, this._rollingAreaRatio);
            }
            this._layers.push(layer);
        }

        this._lastFrameTime = null;
        this._rafHandle = null;

        this._boundOnResize = this._onResize.bind(this);
        this._resizeObserver = null;
        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(this._boundOnResize);
            this._resizeObserver.observe(canvas);
        }

        // Bind the animation loop
        this._boundLoop = this._loop.bind(this);
    }

    // ── public configuration ──────────────────────────────────────────────

    setAutoControlDensity(value) { this._autoControlDensity = value; }
    setRollingDensity(value) { this._rollingDensity = value; }

    setRollingAreaRatio(value) {
        if (value > 0 && value <= 10) {
            this._rollingAreaRatio = value / 10;
            this._layers.forEach(l => l.updateYSlotManagerLength(this.canvasHeight, this._rollingAreaRatio));
        }
    }

    setRollingSpeed(value) {
        if (value >= 1 && value <= 10) {
            this._rollingSpeed = value * 0.02;
        }
    }

    setOpacity(value) {
        if (value > 0 && value <= 1) this._textOpacity = value;
    }

    setIsTextBold(value) { this._textBold = value; }

    setDanmakuFontSizeOffset(value) {
        if (Number.isInteger(value)) {
            this._danmakuFontSizeOffset = value;
        } else if (value >= DanmakuFontSize.Smallest && value <= DanmakuFontSize.Largest) {
            this._danmakuFontSizeOffset = value;
        }
    }

    setSubtitleFontSizeOffset(value) {
        if (value >= DanmakuFontSize.Smallest && value <= DanmakuFontSize.Largest) {
            this._subtitleFontSizeOffset = value;
        }
    }

    setDefaultFontFamily(value) {
        this._defaultFontFamily = value || DEFAULT_FONT_FAMILY;
    }

    setBorderColor(color) { this._borderColor = color; }

    setNoOverlapSubtitle(value) { this._noOverlapSubtitle = value; }

    setRenderState(renderDanmaku, renderSubtitle) {
        this._isDanmakuEnabled = renderDanmaku;
        this._isSubtitleEnabled = renderSubtitle;
        if (!renderDanmaku) {
            this._layers.forEach(l => { if (!l.isSubtitleLayer) l.clear(); });
        }
        if (!renderSubtitle) {
            this._layers.forEach(l => { if (l.isSubtitleLayer) l.clear(); });
        }
        if (!renderDanmaku && !renderSubtitle) {
            this.pause();
            this.stop();
        } else if (this._isPaused) {
            this.start();
        }
    }

    setLayerRenderState(layerId, render) {
        this._layers[layerId].isEnabled = render;
    }

    setSubtitleLayer(layerId) {
        this._layers[layerId].setSubtitleLayer(true);
    }

    clearLayer(layerId) {
        this._layers[layerId].clear();
    }

    // ── lifecycle ─────────────────────────────────────────────────────────

    start() {
        if (this._isDanmakuEnabled || this._isSubtitleEnabled) {
            this._isStopped = false;
            this._isPaused = false;
            if (!this._rafHandle) {
                this._lastFrameTime = null;
                this._rafHandle = requestAnimationFrame(this._boundLoop);
            }
        }
    }

    pause() {
        this._isPaused = true;
    }

    resume() {
        this._isPaused = false;
        if (!this._rafHandle && !this._isStopped) {
            this._lastFrameTime = null;
            this._rafHandle = requestAnimationFrame(this._boundLoop);
        }
    }

    stop() {
        this._isStopped = true;
        if (this._rafHandle) {
            cancelAnimationFrame(this._rafHandle);
            this._rafHandle = null;
        }
        this.clear();
        this._ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    }

    close() {
        this.stop();
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        this._canvas = null;
        this._ctx = null;
    }

    clear() {
        this._layers.forEach(l => l.clear());
    }

    // ── render a danmaku item ─────────────────────────────────────────────

    /**
     * @param {number} layerId
     * @param {import('./DanmakuTypes').DanmakuItem} danmakuItem
     */
    renderDanmakuItem(layerId, danmakuItem) {
        if (layerId >= this._layers.length) throw new Error(`Invalid layerId: ${layerId}`);
        if (!this._ctx || this._isStopped) return;
        if (!this._isDanmakuEnabled && danmakuItem.mode !== DanmakuMode.Subtitle) return;
        if (!this._isSubtitleEnabled && danmakuItem.mode === DanmakuMode.Subtitle) return;

        const layer = this._layers[layerId];
        const ySlotManager = layer.ySlotManager;

        // Apply global opacity to normal danmaku
        if (danmakuItem.mode !== DanmakuMode.Advanced && danmakuItem.mode !== DanmakuMode.Subtitle) {
            danmakuItem.textColor = this._applyOpacity(danmakuItem.textColor, this._textOpacity);
        }

        const ri = new DanmakuRenderItem(danmakuItem);

        if (ri.mode === DanmakuMode.Unknown) return;

        if (!this._autoControlDensity && this._rollingDensity > 0 &&
            ri.mode === DanmakuMode.Rolling && layer.renderList.length >= this._rollingDensity) {
            return;
        }

        // Calculate effective font size
        let effectiveFontSize = ri.fontSize;
        if (!danmakuItem.keepDefinedFontSize) {
            const offset = ri.mode !== DanmakuMode.Subtitle ? this._danmakuFontSizeOffset : this._subtitleFontSizeOffset;
            effectiveFontSize += (offset - 3) * (offset > 3 ? 6 : 3);
            if (this.canvasWidth < STANDARD_CANVAS_WIDTH) {
                effectiveFontSize = effectiveFontSize * this.canvasWidth / STANDARD_CANVAS_WIDTH;
                if (effectiveFontSize >= 30) effectiveFontSize *= 0.75;
                ri.marginBottom = Math.floor(ri.marginBottom * this.canvasWidth * 0.75 / STANDARD_CANVAS_WIDTH);
            }
        }
        effectiveFontSize = Math.max(Math.floor(effectiveFontSize), 2);
        ri._effectiveFontSize = effectiveFontSize;

        // Determine font family
        let fontFamily;
        if (ri.fontFamilyName) {
            fontFamily = ri.fontFamilyName;
        } else if (ri.mode === DanmakuMode.Advanced) {
            fontFamily = DEFAULT_FONT_FAMILY;
        } else {
            fontFamily = this._defaultFontFamily;
        }
        ri._fontFamily = fontFamily;

        const isBold = ri.isBold === null ? this._textBold : ri.isBold;
        const fontStr = `${isBold ? 'bold ' : ''}${effectiveFontSize}px ${fontFamily}`;
        ri._fontStr = fontStr;

        // Measure text
        this._ctx.save();
        this._ctx.font = fontStr;
        const maxWidth = this.canvasWidth - 24;
        const lines = this._wrapText(ri.text, maxWidth, ri.mode);
        const lineHeight = effectiveFontSize * 1.2;
        let measuredWidth = 0;
        for (const line of lines) {
            const m = this._ctx.measureText(line);
            if (m.width > measuredWidth) measuredWidth = m.width;
        }
        this._ctx.restore();

        ri.width = measuredWidth + 8; // padding for border
        ri.height = lineHeight * lines.length + (ri.hasOutline ? ri.outlineSize : 0);
        ri._lines = lines;
        ri._lineHeight = lineHeight;

        if (ri.width <= 0 || ri.height <= 0) return;

        // Determine initial position
        switch (ri.mode) {
            case DanmakuMode.Rolling: {
                const outY = { value: 0 };
                ri.needToReleaseYSlot = ySlotManager.getY(ri.id, ri.height, outY);
                ri.startX = this.canvasWidth;
                ri.startY = outY.value;
                break;
            }
            case DanmakuMode.Bottom:
            case DanmakuMode.Top: {
                const outY = { value: 0 };
                ri.needToReleaseYSlot = ySlotManager.getY(ri.id, ri.height, outY);
                ri.startY = outY.value;
                break;
            }
            case DanmakuMode.ReverseRolling: {
                const outY = { value: 0 };
                ri.needToReleaseYSlot = ySlotManager.getY(ri.id, ri.height, outY);
                ri.startX = -ri.width;
                ri.startY = outY.value;
                break;
            }
            case DanmakuMode.Advanced: {
                this._initAdvancedPosition(ri);
                ri.translationSpeedX = ri.definedTranslationDurationMs > 0
                    ? (ri.endX - ri.startX) / ri.definedTranslationDurationMs : 0;
                ri.translationSpeedY = ri.definedTranslationDurationMs > 0
                    ? (ri.endY - ri.startY) / ri.definedTranslationDurationMs : 0;
                break;
            }
            case DanmakuMode.Subtitle: {
                ri.startY = SUBTITLE_START_Y;
                break;
            }
        }

        ri.x = ri.startX;

        if (this._autoControlDensity && ri.allowDensityControl && !ri.needToReleaseYSlot) {
            return; // skip due to density control
        }

        layer.renderList.push(ri);
    }

    // ── animation loop ────────────────────────────────────────────────────

    _loop(timestamp) {
        if (this._isStopped || !this._canvas) {
            this._rafHandle = null;
            return;
        }
        this._rafHandle = requestAnimationFrame(this._boundLoop);

        const now = timestamp;
        if (this._lastFrameTime === null) this._lastFrameTime = now;
        const elapsedMs = this._isPaused ? 0 : now - this._lastFrameTime;
        this._lastFrameTime = now;

        this._update(now, elapsedMs);
        this._draw(now, elapsedMs);
    }

    _update(now, elapsedMs) {
        for (const layer of this._layers) {
            const list = layer.renderList;
            const ySlotManager = layer.ySlotManager;

            for (let i = list.length - 1; i >= 0; i--) {
                const ri = list[i];
                if (!ri.isFirstRenderTimeSet) {
                    ri.firstRenderTime = now;
                    ri.isFirstRenderTimeSet = true;
                }
                const durationMs = now - ri.firstRenderTime;
                let remove = false;

                switch (ri.mode) {
                    case DanmakuMode.Rolling: {
                        if (!this._isPaused) {
                            ri.x -= elapsedMs * _adjustRollingSpeed(this._rollingSpeed, ri.width);
                        }
                        if (ri.needToReleaseYSlot && ri.x < this.canvasWidth - ri.width - 48) {
                            ySlotManager.releaseYSlot(ri.id, ri.startY);
                            ri.needToReleaseYSlot = false;
                        }
                        if (ri.x < -ri.width) remove = true;
                        break;
                    }
                    case DanmakuMode.Bottom:
                    case DanmakuMode.Top: {
                        ri.x = (this.canvasWidth - ri.width) / 2;
                        const maxDur = ri.definedDurationMs > 0 ? ri.definedDurationMs : DEFAULT_BOTTOM_AND_TOP_DURATION_MS;
                        if (durationMs > maxDur) {
                            remove = true;
                            if (ri.needToReleaseYSlot) ySlotManager.releaseYSlot(ri.id, ri.startY);
                        }
                        break;
                    }
                    case DanmakuMode.ReverseRolling: {
                        if (!this._isPaused) {
                            ri.x += elapsedMs * _adjustRollingSpeed(this._rollingSpeed, ri.width);
                        }
                        if (ri.needToReleaseYSlot && ri.x > 48) {
                            ySlotManager.releaseYSlot(ri.id, ri.startY);
                            ri.needToReleaseYSlot = false;
                        }
                        if (ri.x >= this.canvasWidth) remove = true;
                        break;
                    }
                    case DanmakuMode.Advanced: {
                        if (durationMs <= ri.definedDurationMs) {
                            if (durationMs >= ri.definedTranslationDelayMs) {
                                const td = durationMs - ri.definedTranslationDelayMs;
                                if (td < ri.definedTranslationDurationMs) {
                                    ri.x = ri.startX + ri.translationSpeedX * td;
                                    ri.y = ri.startY + ri.translationSpeedY * td;
                                } else {
                                    ri.x = ri.endX;
                                    ri.y = ri.endY;
                                }
                            }
                            if (durationMs >= ri.definedAlphaDelayMs && ri.definedEndAlpha !== ri.definedStartAlpha) {
                                const ad = durationMs - ri.definedAlphaDelayMs;
                                if (ad < ri.definedAlphaDurationMs) {
                                    ri.alpha = Math.round(ri.definedStartAlpha +
                                        (ri.definedEndAlpha - ri.definedStartAlpha) * ad / ri.definedAlphaDurationMs);
                                } else {
                                    ri.alpha = ri.definedEndAlpha;
                                }
                            }
                        } else {
                            remove = true;
                        }
                        break;
                    }
                    case DanmakuMode.Subtitle: {
                        if ((list.length > 1 && i < list.length - 1) || durationMs > ri.definedDurationMs) {
                            remove = true;
                        } else {
                            ri.x = (this.canvasWidth - ri.width) / 2;
                        }
                        break;
                    }
                }

                if (remove) list.splice(i, 1);
            }
        }
    }

    _draw(now, elapsedMs) {
        const ctx = this._ctx;
        ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

        let totalCount = 0;

        for (const layer of this._layers) {
            if (!layer.isEnabled) continue;
            const list = layer.renderList;
            if (list.length === 0) continue;

            for (const ri of list) {
                if (!ri.isFirstRenderTimeSet) continue;
                totalCount++;
                this._drawItem(ctx, ri);
            }
        }

        if (this.debugMode) {
            const fps = elapsedMs > 0 ? Math.round(1000 / elapsedMs) : 0;
            ctx.fillStyle = fps >= 30 ? 'rgba(128,128,128,0.7)' : 'rgba(255,0,0,0.7)';
            ctx.fillRect(0, 0, 360, 24);
            ctx.fillStyle = '#90ee90';
            ctx.font = '14px monospace';
            ctx.fillText(`fps:${fps} count:${totalCount} ${this.canvasWidth}x${this.canvasHeight}`, 4, 16);
        }
    }

    _drawItem(ctx, ri) {
        ctx.save();

        const lines = ri._lines;
        const lineHeight = ri._lineHeight;

        switch (ri.mode) {
            case DanmakuMode.Rolling:
            case DanmakuMode.ReverseRolling:
                this._drawText(ctx, ri, ri.x, ri.startY);
                break;

            case DanmakuMode.Top:
                this._drawText(ctx, ri, ri.x, ri.startY);
                break;

            case DanmakuMode.Bottom: {
                const limit = this._noOverlapSubtitle
                    ? Math.max(this.canvasHeight - 100, this.canvasHeight * 0.8)
                    : this.canvasHeight;
                const y = Math.max(limit - ri.height - ri.startY - ri.marginBottom, 0);
                this._drawText(ctx, ri, ri.x, y);
                break;
            }

            case DanmakuMode.Advanced: {
                const opacity = ri.alpha / 255;
                ctx.globalAlpha = opacity;

                if (ri.definedRotateZ !== 0 || ri.definedRotateY !== 0) {
                    const cx = ri.x + ri.width / 2;
                    const cy = ri.y + ri.height / 2;
                    ctx.translate(cx, cy);
                    if (ri.definedRotateZ !== 0) {
                        ctx.rotate(ri.definedRotateZ * Math.PI / 180);
                    }
                    if (ri.definedRotateY !== 0) {
                        // Approximate Y-axis rotation with horizontal scale
                        const scale = Math.cos(ri.definedRotateY * Math.PI / 180);
                        ctx.scale(scale, 1);
                    }
                    this._drawText(ctx, ri, -ri.width / 2, -ri.height / 2);
                } else {
                    this._drawText(ctx, ri, ri.x, ri.y);
                }
                break;
            }

            case DanmakuMode.Subtitle: {
                const y = this.canvasHeight - ri.height - ri.startY;
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.fillRect(ri.x - 4, y - 4, ri.width + 8, ri.height + 8);
                this._drawText(ctx, ri, ri.x, y);
                break;
            }
        }

        ctx.restore();
    }

    _drawText(ctx, ri, x, y) {
        ctx.font = ri._fontStr;
        const lineHeight = ri._lineHeight;

        if (ri.hasBorder || this.debugMode) {
            ctx.strokeStyle = this._borderColor;
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, ri.width, ri.height);
        }

        for (let i = 0; i < ri._lines.length; i++) {
            const line = ri._lines[i];
            const lx = x + ri.width / 2;
            const ly = y + (i + 0.8) * lineHeight;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (ri.hasOutline) {
                const r = parseInt(ri.textColor.slice(1, 3), 16);
                const g = parseInt(ri.textColor.slice(3, 5), 16);
                const b = parseInt(ri.textColor.slice(5, 7), 16);
                const isVeryDark = r + g + b < 0x20;
                const outlineColor = isVeryDark ? '#ffffff' : ri.outlineColor;
                ctx.lineWidth = ri.outlineSize * 2;
                ctx.strokeStyle = outlineColor;
                ctx.lineJoin = 'round';
                ctx.strokeText(line, lx, ly);
            }

            ctx.fillStyle = ri.textColor;
            ctx.fillText(line, lx, ly);
        }
    }

    // ── helpers ───────────────────────────────────────────────────────────

    _initAdvancedPosition(ri) {
        if (ri.alignmentMode === DanmakuAlignmentMode.Default) {
            ri.startX = ri.definedStartX > 1.0 ? ri.definedStartX : ri.definedStartX * this.canvasWidth;
            ri.startY = ri.definedStartY > 1.0 ? ri.definedStartY : ri.definedStartY * this.canvasHeight;
            ri.endX = ri.definedEndX > 1.0 ? ri.definedEndX : ri.definedEndX * this.canvasWidth;
            if (ri.endX > ri.startX && ri.endX < this.canvasWidth && ri.endX + ri.width > this.canvasWidth) {
                ri.endX = ri.endX + ri.width * 0.2 <= this.canvasWidth ? this.canvasWidth - ri.width : this.canvasWidth;
            }
            ri.endY = ri.definedEndY > 1.0 ? ri.definedEndY : ri.definedEndY * this.canvasHeight;
            if (ri.endY > ri.startY && ri.endY < this.canvasHeight && ri.endY + ri.height > this.canvasHeight) {
                ri.endY = ri.endY + ri.height * 0.2 <= this.canvasHeight ? this.canvasHeight - ri.height : this.canvasHeight;
            }

            if (ri.anchorMode !== DanmakuAlignmentMode.UpperLeft) {
                const am = ri.anchorMode;
                if (am === DanmakuAlignmentMode.LowerCenter || am === DanmakuAlignmentMode.MiddleCenter || am === DanmakuAlignmentMode.UpperCenter) {
                    ri.startX -= ri.width / 2; ri.endX -= ri.width / 2;
                } else if (am === DanmakuAlignmentMode.LowerRight || am === DanmakuAlignmentMode.MiddleRight || am === DanmakuAlignmentMode.UpperRight) {
                    ri.startX -= ri.width; ri.endX -= ri.width;
                }
                if (am === DanmakuAlignmentMode.LowerLeft || am === DanmakuAlignmentMode.LowerCenter || am === DanmakuAlignmentMode.LowerRight) {
                    ri.startY -= ri.height; ri.endY -= ri.height;
                } else if (am === DanmakuAlignmentMode.MiddleLeft || am === DanmakuAlignmentMode.MiddleCenter || am === DanmakuAlignmentMode.MiddleRight) {
                    ri.startY -= ri.height / 2; ri.endY -= ri.height / 2;
                }
            }
        } else {
            const align = ri.alignmentMode;
            if (align === DanmakuAlignmentMode.LowerLeft || align === DanmakuAlignmentMode.MiddleLeft || align === DanmakuAlignmentMode.UpperLeft) {
                ri.startX = ri.marginLeft;
            } else if (align === DanmakuAlignmentMode.LowerCenter || align === DanmakuAlignmentMode.MiddleCenter || align === DanmakuAlignmentMode.UpperCenter) {
                ri.startX = (this.canvasWidth - ri.width) / 2;
            } else {
                ri.startX = this.canvasWidth - ri.width - ri.marginRight;
            }
            if (align === DanmakuAlignmentMode.LowerLeft || align === DanmakuAlignmentMode.LowerCenter || align === DanmakuAlignmentMode.LowerRight) {
                ri.startY = this.canvasHeight - ri.height - ri.marginBottom;
            } else if (align === DanmakuAlignmentMode.MiddleLeft || align === DanmakuAlignmentMode.MiddleCenter || align === DanmakuAlignmentMode.MiddleRight) {
                ri.startY = (this.canvasHeight - ri.height) / 2;
            } else {
                ri.startY = 0;
            }
            ri.endX = ri.startX;
            ri.endY = ri.startY;
        }
    }

    /**
     * Wrap text into lines respecting maxWidth (only for top/bottom/subtitle modes that enable wrap).
     * @param {string} text
     * @param {number} maxWidth
     * @param {number} mode
     * @returns {string[]}
     */
    _wrapText(text, maxWidth, mode) {
        const rawLines = text.split('\n');
        const shouldWrap = mode === DanmakuMode.Top || mode === DanmakuMode.Bottom || mode === DanmakuMode.Subtitle;
        if (!shouldWrap) return rawLines;

        const result = [];
        for (const raw of rawLines) {
            const words = raw.split('');
            let current = '';
            for (const ch of words) {
                const test = current + ch;
                if (this._ctx.measureText(test).width > maxWidth && current !== '') {
                    result.push(current);
                    current = ch;
                } else {
                    current = test;
                }
            }
            if (current) result.push(current);
        }
        return result;
    }

    /**
     * Apply opacity to a `#rrggbb` or `rgba(...)` CSS color string.
     * @param {string} color
     * @param {number} opacity 0-1
     * @returns {string}
     */
    _applyOpacity(color, opacity) {
        if (opacity >= 1) return color;
        if (color.startsWith('#') && color.length === 7) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r},${g},${b},${opacity})`;
        }
        return color;
    }

    _onResize(entries) {
        for (const entry of entries) {
            const { width, height } = entry.contentRect;
            this.canvasWidth = width;
            this.canvasHeight = height;
            this._canvas.width = width;
            this._canvas.height = height;
            this._layers.forEach(l => l.updateYSlotManagerLength(height, this._rollingAreaRatio));
        }
    }
}

function _adjustRollingSpeed(rollingSpeed, width) {
    return rollingSpeed * (Math.min(width * 0.0015, 0.2) + 1);
}

module.exports = { DanmakuRender };
