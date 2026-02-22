/**
 * DanmakuFrostMaster - JavaScript Version
 * DanmakuRender.js - HTML5 Canvas-based danmaku renderer
 */

'use strict';

/* global DanmakuMode, DanmakuAlignmentMode, DanmakuDefaultLayerDef, DanmakuFontSize, DanmakuYSlotManager */

class DanmakuRender {
    static get STANDARD_CANVAS_WIDTH() { return 800; }
    static get DEFAULT_ROLLING_SPEED() { return 0.1; } // pixels per millisecond
    static get DEFAULT_BOTTOM_AND_TOP_DURATION_MS() { return 3800; }
    static get SUBTITLE_START_Y() { return 24; }
    static get DEFAULT_FONT_FAMILY_NAME() { return 'Microsoft YaHei, SimHei, sans-serif'; }

    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        if (!canvas) throw new Error('canvas is required');

        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');
        this._renderLayerList = [];
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
        this._rollingSpeed = DanmakuRender.DEFAULT_ROLLING_SPEED;
        this._textOpacity = 1.0;
        this._borderColor = 'blue';
        this._defaultFontFamilyName = DanmakuRender.DEFAULT_FONT_FAMILY_NAME;
        this.debugMode = false;

        this._animFrameId = null;
        this._lastFrameTime = null;
        this._nextRenderItemId = 1;

        const layerCount = DanmakuDefaultLayerDef.DefaultLayerCount;
        for (let i = 0; i < layerCount; i++) {
            const isSpecial = (i === DanmakuDefaultLayerDef.AdvancedLayerId || i === DanmakuDefaultLayerDef.SubtitleLayerId);
            this._renderLayerList.push(new RenderLayer(i, isSpecial));
        }

        this._updateCanvasSize();
        this._resizeObserver = null;
        this._setupResizeObserver();

        this._scheduleFrame();
    }

    get canvasWidth() { return this._canvasWidth; }
    get canvasHeight() { return this._canvasHeight; }

    _updateCanvasSize() {
        this._canvasWidth = this._canvas.width || this._canvas.clientWidth || 800;
        this._canvasHeight = this._canvas.height || this._canvas.clientHeight || 600;
        for (const layer of this._renderLayerList) {
            layer.updateYSlotManagerLength(this._canvasHeight, this._rollingAreaRatio);
        }
    }

    _setupResizeObserver() {
        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(() => {
                this._updateCanvasSize();
            });
            this._resizeObserver.observe(this._canvas);
        }
    }

    setAutoControlDensity(value) { this._autoControlDensity = value; }
    setRollingDensity(value) { this._rollingDensity = value; }

    setRollingAreaRatio(value) {
        if (value > 0 && value <= 10) {
            this._rollingAreaRatio = value / 10;
            for (const layer of this._renderLayerList) {
                layer.updateYSlotManagerLength(this._canvasHeight, this._rollingAreaRatio);
            }
        }
    }

    setRollingSpeed(value) {
        if (value >= 1 && value <= 10) {
            this._rollingSpeed = value * 0.02;
        }
    }

    setOpacity(value) {
        if (value > 0 && value <= 1.0) {
            this._textOpacity = value;
        }
    }

    setIsTextBold(value) { this._textBold = value; }

    setDanmakuFontSizeOffset(value) {
        if (typeof value === 'number') {
            this._danmakuFontSizeOffset = value;
        }
    }

    setSubtitleFontSizeOffset(value) {
        if (value >= DanmakuFontSize.Smallest && value <= DanmakuFontSize.Largest) {
            this._subtitleFontSizeOffset = value;
        }
    }

    setDefaultFontFamilyName(value) {
        this._defaultFontFamilyName = value || DanmakuRender.DEFAULT_FONT_FAMILY_NAME;
    }

    setBorderColor(color) { this._borderColor = color; }
    setSubtitleEnabled(enable) { this._isSubtitleEnabled = enable; }
    setNoOverlapSubtitle(value) { this._noOverlapSubtitle = value; }

    setRenderState(renderDanmaku, renderSubtitle) {
        this._isDanmakuEnabled = renderDanmaku;
        this._isSubtitleEnabled = renderSubtitle;
        if (!renderDanmaku) {
            for (const layer of this._renderLayerList) {
                if (!layer.isSubtitleLayer) layer.clear();
            }
        }
        if (!renderSubtitle) {
            for (const layer of this._renderLayerList) {
                if (layer.isSubtitleLayer) layer.clear();
            }
        }
    }

    setLayerRenderState(layerId, render) {
        this._renderLayerList[layerId].isEnabled = render;
    }

    setSubtitleLayer(layerId) {
        this._renderLayerList[layerId].setSubtitleLayer(true);
    }

    clearLayer(layerId) {
        this._renderLayerList[layerId].clear();
    }

    clear() {
        for (const layer of this._renderLayerList) {
            layer.clear();
        }
    }

    start() {
        this._isStopped = false;
        this._isPaused = false;
        this._scheduleFrame();
    }

    pause() {
        this._isPaused = true;
    }

    stop() {
        this._isStopped = true;
        this.clear();
        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
            this._animFrameId = null;
        }
        this._clearCanvas();
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

    /**
     * Add a danmaku item to the specified layer for rendering.
     * @param {number} layerId
     * @param {object} danmakuItem
     */
    renderDanmakuItem(layerId, danmakuItem) {
        if (layerId >= this._renderLayerList.length) {
            throw new Error(`Max layer count: ${this._renderLayerList.length}`);
        }
        if (this._isStopped) return;
        if (!this._isDanmakuEnabled && danmakuItem.mode !== DanmakuMode.Subtitle) return;
        if (!this._isSubtitleEnabled && danmakuItem.mode === DanmakuMode.Subtitle) return;

        const layer = this._renderLayerList[layerId];
        const ySlotManager = layer.ySlotManager;

        // Apply opacity to non-advanced, non-subtitle danmaku
        if (danmakuItem.mode !== DanmakuMode.Advanced && danmakuItem.mode !== DanmakuMode.Subtitle) {
            danmakuItem.textColor = {
                r: danmakuItem.textColor.r,
                g: danmakuItem.textColor.g,
                b: danmakuItem.textColor.b,
                a: Math.round(this._textOpacity * 255)
            };
        }

        const renderItem = new DanmakuRenderItem(danmakuItem, this._getNextRenderItemId());
        if (renderItem.mode === DanmakuMode.Unknown) return;

        if (!this._autoControlDensity && this._rollingDensity > 0 &&
            renderItem.mode === DanmakuMode.Rolling &&
            layer.renderList.length >= this._rollingDensity) {
            return;
        }

        // Compute font size
        let fontSize = renderItem.fontSize;
        if (!danmakuItem.keepDefinedFontSize) {
            const fontSizeOffset = renderItem.mode !== DanmakuMode.Subtitle
                ? this._danmakuFontSizeOffset
                : this._subtitleFontSizeOffset;
            fontSize += (fontSizeOffset - 3) * (fontSizeOffset > 3 ? 6 : 3);

            if (this._canvasWidth < DanmakuRender.STANDARD_CANVAS_WIDTH) {
                fontSize = fontSize * this._canvasWidth / DanmakuRender.STANDARD_CANVAS_WIDTH;
                if (fontSize >= 30) fontSize *= 0.75;
                renderItem.marginBottom = Math.floor(renderItem.marginBottom * this._canvasWidth * 0.75 / DanmakuRender.STANDARD_CANVAS_WIDTH);
            }
        }
        fontSize = Math.max(Math.floor(fontSize), 2);
        renderItem.computedFontSize = fontSize;

        // Determine font family
        let fontFamily;
        if (renderItem.fontFamilyName) {
            fontFamily = renderItem.fontFamilyName;
        } else if (renderItem.mode === DanmakuMode.Advanced) {
            fontFamily = DanmakuRender.DEFAULT_FONT_FAMILY_NAME;
        } else {
            fontFamily = this._defaultFontFamilyName;
        }
        renderItem.computedFontFamily = fontFamily;

        const isBold = renderItem.isBold == null ? this._textBold : renderItem.isBold;
        renderItem.computedIsBold = isBold;

        // Measure text
        const fontStr = this._buildFontString(isBold, fontSize, fontFamily);
        this._ctx.save();
        this._ctx.font = fontStr;
        const isWrappable = (renderItem.mode === DanmakuMode.Top ||
            renderItem.mode === DanmakuMode.Bottom ||
            renderItem.mode === DanmakuMode.Subtitle);
        const maxWidth = isWrappable ? (this._canvasWidth - 24) : undefined;
        const measured = this._measureText(renderItem.text, fontStr, maxWidth);
        this._ctx.restore();

        renderItem.width = measured.width + 8; // padding for border
        renderItem.height = measured.height;
        if (renderItem.hasOutline) {
            renderItem.height += renderItem.outlineSize;
        }

        if (renderItem.width <= 0 || renderItem.height <= 0) return;

        // Calculate initial position
        switch (renderItem.mode) {
            case DanmakuMode.Rolling: {
                const { slotFound, y } = ySlotManager.getY(renderItem.id, Math.ceil(renderItem.height));
                renderItem.needToReleaseYSlot = slotFound;
                renderItem.startX = this._canvasWidth;
                renderItem.startY = y;
                break;
            }
            case DanmakuMode.Bottom:
            case DanmakuMode.Top: {
                const { slotFound, y } = ySlotManager.getY(renderItem.id, Math.ceil(renderItem.height));
                renderItem.needToReleaseYSlot = slotFound;
                renderItem.startY = y;
                break;
            }
            case DanmakuMode.ReverseRolling: {
                const { slotFound, y } = ySlotManager.getY(renderItem.id, Math.ceil(renderItem.height));
                renderItem.needToReleaseYSlot = slotFound;
                renderItem.startX = -renderItem.width;
                renderItem.startY = y;
                break;
            }
            case DanmakuMode.Advanced: {
                if (renderItem.alignmentMode === DanmakuAlignmentMode.Default) {
                    renderItem.startX = renderItem.definedStartX > 1.0
                        ? renderItem.definedStartX
                        : renderItem.definedStartX * this._canvasWidth;
                    renderItem.startY = renderItem.definedStartY > 1.0
                        ? renderItem.definedStartY
                        : renderItem.definedStartY * this._canvasHeight;
                    renderItem.endX = renderItem.definedEndX > 1.0
                        ? renderItem.definedEndX
                        : renderItem.definedEndX * this._canvasWidth;
                    if (renderItem.endX > renderItem.startX && renderItem.endX < this._canvasWidth &&
                        renderItem.endX + renderItem.width > this._canvasWidth) {
                        renderItem.endX = renderItem.endX + renderItem.width * 0.2 <= this._canvasWidth
                            ? this._canvasWidth - renderItem.width
                            : this._canvasWidth;
                    }
                    renderItem.endY = renderItem.definedEndY > 1.0
                        ? renderItem.definedEndY
                        : renderItem.definedEndY * this._canvasHeight;
                    if (renderItem.endY > renderItem.startY && renderItem.endY < this._canvasHeight &&
                        renderItem.endY + renderItem.height > this._canvasHeight) {
                        renderItem.endY = renderItem.endY + renderItem.height * 0.2 <= this._canvasHeight
                            ? this._canvasHeight - renderItem.height
                            : this._canvasHeight;
                    }

                    if (renderItem.anchorMode !== DanmakuAlignmentMode.UpperLeft) {
                        const am = renderItem.anchorMode;
                        if (am === DanmakuAlignmentMode.LowerCenter ||
                            am === DanmakuAlignmentMode.MiddleCenter ||
                            am === DanmakuAlignmentMode.UpperCenter) {
                            renderItem.startX -= renderItem.width / 2;
                            renderItem.endX -= renderItem.width / 2;
                        } else if (am === DanmakuAlignmentMode.LowerRight ||
                            am === DanmakuAlignmentMode.MiddleRight ||
                            am === DanmakuAlignmentMode.UpperRight) {
                            renderItem.startX -= renderItem.width;
                            renderItem.endX -= renderItem.width;
                        }

                        if (am === DanmakuAlignmentMode.LowerLeft ||
                            am === DanmakuAlignmentMode.LowerCenter ||
                            am === DanmakuAlignmentMode.LowerRight) {
                            renderItem.startY -= renderItem.height;
                            renderItem.endY -= renderItem.height;
                        } else if (am === DanmakuAlignmentMode.MiddleLeft ||
                            am === DanmakuAlignmentMode.MiddleCenter ||
                            am === DanmakuAlignmentMode.MiddleRight) {
                            renderItem.startY -= renderItem.height / 2;
                            renderItem.endY -= renderItem.height / 2;
                        }
                    }
                } else {
                    const am = renderItem.alignmentMode;
                    if (am === DanmakuAlignmentMode.LowerLeft ||
                        am === DanmakuAlignmentMode.MiddleLeft ||
                        am === DanmakuAlignmentMode.UpperLeft) {
                        renderItem.startX = renderItem.marginLeft;
                    } else if (am === DanmakuAlignmentMode.LowerCenter ||
                        am === DanmakuAlignmentMode.MiddleCenter ||
                        am === DanmakuAlignmentMode.UpperCenter) {
                        renderItem.startX = (this._canvasWidth - renderItem.width) / 2;
                    } else if (am === DanmakuAlignmentMode.LowerRight ||
                        am === DanmakuAlignmentMode.MiddleRight ||
                        am === DanmakuAlignmentMode.UpperRight) {
                        renderItem.startX = this._canvasWidth - renderItem.width - renderItem.marginRight;
                    }

                    if (am === DanmakuAlignmentMode.LowerLeft ||
                        am === DanmakuAlignmentMode.LowerCenter ||
                        am === DanmakuAlignmentMode.LowerRight) {
                        renderItem.startY = this._canvasHeight - renderItem.height - renderItem.marginBottom;
                    } else if (am === DanmakuAlignmentMode.MiddleLeft ||
                        am === DanmakuAlignmentMode.MiddleCenter ||
                        am === DanmakuAlignmentMode.MiddleRight) {
                        renderItem.startY = (this._canvasHeight - renderItem.height) / 2;
                    } else if (am === DanmakuAlignmentMode.UpperLeft ||
                        am === DanmakuAlignmentMode.UpperCenter ||
                        am === DanmakuAlignmentMode.UpperRight) {
                        renderItem.startY = 0;
                    }

                    renderItem.endX = renderItem.startX;
                    renderItem.endY = renderItem.startY;
                }

                renderItem.translationSpeedX = renderItem.definedTranslationDurationMs > 0
                    ? (renderItem.endX - renderItem.startX) / renderItem.definedTranslationDurationMs
                    : 0;
                renderItem.translationSpeedY = renderItem.definedTranslationDurationMs > 0
                    ? (renderItem.endY - renderItem.startY) / renderItem.definedTranslationDurationMs
                    : 0;
                break;
            }
            case DanmakuMode.Subtitle: {
                renderItem.startY = DanmakuRender.SUBTITLE_START_Y;
                break;
            }
        }

        renderItem.x = renderItem.startX;

        if (this._autoControlDensity && renderItem.allowDensityControl && !renderItem.needToReleaseYSlot) {
            return; // Skip due to density control
        }

        layer.renderList.push(renderItem);

        if (!this._isStopped) {
            this._scheduleFrame();
        }
    }

    _scheduleFrame() {
        if (this._animFrameId || this._isStopped) return;
        this._animFrameId = requestAnimationFrame((ts) => this._onAnimationFrame(ts));
    }

    _onAnimationFrame(timestamp) {
        this._animFrameId = null;
        if (this._isStopped || !this._ctx) return;

        const elapsedMs = this._lastFrameTime !== null ? timestamp - this._lastFrameTime : 16;
        this._lastFrameTime = timestamp;

        if (!this._isPaused) {
            this._update(elapsedMs, timestamp);
        }
        this._draw();

        const hasItems = this._renderLayerList.some(l => l.renderList.length > 0);
        if (hasItems || !this._isPaused) {
            this._scheduleFrame();
        }
    }

    /**
     * Update positions and remove expired items.
     */
    _update(elapsedMs, totalTimeMs) {
        for (const layer of this._renderLayerList) {
            const ySlotManager = layer.ySlotManager;
            const renderList = layer.renderList;

            for (let i = renderList.length - 1; i >= 0; i--) {
                if (this._isStopped) return;

                const item = renderList[i];

                if (!item.isFirstRenderTimeSet) {
                    item.firstRenderTime = totalTimeMs;
                    item.isFirstRenderTimeSet = true;
                }

                const durationMs = totalTimeMs - item.firstRenderTime;
                let removeItem = false;

                switch (item.mode) {
                    case DanmakuMode.Rolling: {
                        item.x -= elapsedMs * DanmakuRender._adjustRollingSpeedByWidth(this._rollingSpeed, item.width);
                        if (item.needToReleaseYSlot && item.x < this._canvasWidth - item.width - 48) {
                            ySlotManager.releaseYSlot(item.id, Math.floor(item.startY));
                            item.needToReleaseYSlot = false;
                        }
                        if (item.x < -item.width) removeItem = true;
                        break;
                    }
                    case DanmakuMode.Bottom:
                    case DanmakuMode.Top: {
                        item.x = (this._canvasWidth - item.width) / 2;
                        const maxDur = item.definedDurationMs > 0 ? item.definedDurationMs : DanmakuRender.DEFAULT_BOTTOM_AND_TOP_DURATION_MS;
                        if (durationMs > maxDur) {
                            removeItem = true;
                            if (item.needToReleaseYSlot) {
                                ySlotManager.releaseYSlot(item.id, Math.floor(item.startY));
                            }
                        }
                        break;
                    }
                    case DanmakuMode.ReverseRolling: {
                        item.x += elapsedMs * DanmakuRender._adjustRollingSpeedByWidth(this._rollingSpeed, item.width);
                        if (item.needToReleaseYSlot && item.x > 48) {
                            ySlotManager.releaseYSlot(item.id, Math.floor(item.startY));
                            item.needToReleaseYSlot = false;
                        }
                        if (item.x >= this._canvasWidth) removeItem = true;
                        break;
                    }
                    case DanmakuMode.Advanced: {
                        if (durationMs <= item.definedDurationMs) {
                            if (durationMs >= item.definedTranslationDelayMs) {
                                if (durationMs < item.definedTranslationDelayMs + item.definedTranslationDurationMs) {
                                    item.x = item.startX + item.translationSpeedX * (durationMs - item.definedTranslationDelayMs);
                                    item.y = item.startY + item.translationSpeedY * (durationMs - item.definedTranslationDelayMs);
                                } else {
                                    item.x = item.endX;
                                    item.y = item.endY;
                                }
                            }

                            if (durationMs >= item.definedAlphaDelayMs) {
                                if (item.definedEndAlpha !== item.definedStartAlpha) {
                                    if (durationMs < item.definedAlphaDelayMs + item.definedAlphaDurationMs) {
                                        item.alpha = Math.round(item.definedStartAlpha +
                                            (item.definedEndAlpha - item.definedStartAlpha) *
                                            (durationMs - item.definedAlphaDelayMs) / item.definedAlphaDurationMs);
                                    } else {
                                        item.alpha = item.definedEndAlpha;
                                    }
                                }
                            }
                        } else {
                            removeItem = true;
                        }
                        break;
                    }
                    case DanmakuMode.Subtitle: {
                        if ((renderList.length > 1 && i < renderList.length - 1) || durationMs > item.definedDurationMs) {
                            removeItem = true;
                        } else {
                            item.x = (this._canvasWidth - item.width) / 2;
                        }
                        break;
                    }
                }

                if (removeItem) {
                    renderList.splice(i, 1);
                }
            }
        }
    }

    /**
     * Draw all active danmaku items to the canvas.
     */
    _draw() {
        if (!this._ctx || !this._canvas) return;

        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

        let totalCount = 0;
        const startTime = this.debugMode ? performance.now() : 0;

        for (const layer of this._renderLayerList) {
            if (!layer.isEnabled) continue;
            const renderList = layer.renderList;
            if (renderList.length === 0) continue;

            for (const item of renderList) {
                if (this._isStopped) return;
                if (!item.isFirstRenderTimeSet) continue;

                totalCount++;
                this._drawItem(item);
            }
        }

        if (this.debugMode) {
            const elapsed = performance.now() - startTime;
            const fps = elapsed > 0 ? Math.floor(1000 / (elapsed || 1)) : 60;
            this._ctx.fillStyle = fps >= 30 ? 'rgba(128,128,128,0.8)' : 'rgba(255,0,0,0.8)';
            this._ctx.fillRect(0, 0, 410, 30);
            this._ctx.fillStyle = '#90EE90';
            this._ctx.font = '14px monospace';
            this._ctx.fillText(
                `fps:~${fps} count:${totalCount} ${Math.floor(this._canvasWidth)}x${Math.floor(this._canvasHeight)}`,
                4, 20
            );
        }
    }

    /**
     * Draw a single DanmakuRenderItem.
     * @param {DanmakuRenderItem} item
     */
    _drawItem(item) {
        const ctx = this._ctx;
        const fontStr = this._buildFontString(item.computedIsBold, item.computedFontSize, item.computedFontFamily);
        ctx.save();

        switch (item.mode) {
            case DanmakuMode.Rolling: {
                ctx.font = fontStr;
                this._drawText(ctx, item, item.x, item.startY);
                break;
            }
            case DanmakuMode.ReverseRolling: {
                ctx.font = fontStr;
                this._drawText(ctx, item, item.x, item.startY);
                break;
            }
            case DanmakuMode.Top: {
                ctx.font = fontStr;
                this._drawText(ctx, item, item.x, item.startY);
                break;
            }
            case DanmakuMode.Bottom: {
                const baseY = this._noOverlapSubtitle
                    ? Math.max(this._canvasHeight - 100, this._canvasHeight * 0.8)
                    : this._canvasHeight;
                const y = Math.max(baseY - item.height - item.startY, 0) - item.marginBottom;
                ctx.font = fontStr;
                this._drawText(ctx, item, item.x, y);
                break;
            }
            case DanmakuMode.Advanced: {
                const opacity = item.alpha / 255;
                ctx.globalAlpha = opacity;

                if (item.definedRotateY !== 0 || item.definedRotateZ !== 0) {
                    const cx = item.x + item.width / 2;
                    const cy = item.y + item.height / 2;
                    ctx.translate(cx, cy);
                    if (item.definedRotateY !== 0) {
                        // Approximate Y-rotation with scaleX
                        const radY = item.definedRotateY * Math.PI / 180;
                        ctx.scale(Math.cos(radY), 1);
                    }
                    if (item.definedRotateZ !== 0) {
                        ctx.rotate(item.definedRotateZ * Math.PI / 180);
                    }
                    ctx.font = fontStr;
                    this._drawText(ctx, item, -item.width / 2, -item.height / 2);
                } else {
                    ctx.font = fontStr;
                    this._drawText(ctx, item, item.x, item.y);
                }
                break;
            }
            case DanmakuMode.Subtitle: {
                const y = this._canvasHeight - item.height - item.startY;
                // Draw background
                ctx.globalAlpha = 0.7;
                ctx.fillStyle = 'black';
                ctx.fillRect(item.x - 4, y - 4, item.width + 8, item.height + 8);
                ctx.globalAlpha = 1.0;
                ctx.font = fontStr;
                this._drawText(ctx, item, item.x, y);
                break;
            }
        }

        ctx.restore();
    }

    /**
     * Draw text (with optional outline and border) at the given position.
     */
    _drawText(ctx, item, x, y) {
        const textColor = DanmakuRender._colorToString(item.textColor);

        if (item.hasBorder || this.debugMode) {
            ctx.strokeStyle = this._borderColor;
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, item.width, item.height);
        }

        const lines = item.text.split('\n');
        const lineHeight = item.computedFontSize * 1.2;

        for (let i = 0; i < lines.length; i++) {
            const lineY = y + item.computedFontSize + i * lineHeight;
            const lineX = x + 4; // left padding

            if (item.hasOutline) {
                const outlineColor = (item.textColor.r + item.textColor.g + item.textColor.b < 32)
                    ? `rgba(255,255,255,${item.textColor.a / 255})`
                    : DanmakuRender._colorToString({ ...item.outlineColor, a: item.textColor.a });

                ctx.strokeStyle = outlineColor;
                ctx.lineWidth = item.outlineSize * 2;
                ctx.lineJoin = 'round';
                ctx.strokeText(lines[i], lineX, lineY);
            }

            ctx.fillStyle = textColor;
            ctx.fillText(lines[i], lineX, lineY);
        }
    }

    _buildFontString(isBold, fontSize, fontFamily) {
        return `${isBold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
    }

    /**
     * Measure multi-line text dimensions.
     * @param {string} text
     * @param {string} fontStr
     * @param {number|undefined} maxWidth
     * @returns {{ width: number, height: number }}
     */
    _measureText(text, fontStr, maxWidth) {
        const ctx = this._ctx;
        ctx.font = fontStr;
        const lines = text.split('\n');
        let totalWidth = 0;
        const fontSize = parseInt(fontStr, 10) || 22;
        const lineHeight = fontSize * 1.2;

        for (const line of lines) {
            const m = ctx.measureText(line);
            const w = maxWidth ? Math.min(m.width, maxWidth) : m.width;
            if (w > totalWidth) totalWidth = w;
        }

        const totalHeight = lines.length * lineHeight;
        return { width: totalWidth, height: totalHeight };
    }

    _clearCanvas() {
        if (this._ctx && this._canvas) {
            this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        }
    }

    _getNextRenderItemId() {
        if (this._nextRenderItemId === 0) this._nextRenderItemId = 1;
        return this._nextRenderItemId++;
    }

    static _adjustRollingSpeedByWidth(rollingSpeed, width) {
        return rollingSpeed * (Math.min(width * 0.0015, 0.2) + 1);
    }

    static _colorToString(color) {
        return `rgba(${color.r},${color.g},${color.b},${color.a / 255})`;
    }
}

class DanmakuRenderItem {
    constructor(danmakuItem, id) {
        this.id = id;
        this.hasBorder = danmakuItem.hasBorder;
        this.hasOutline = danmakuItem.hasOutline;
        this.allowDensityControl = danmakuItem.allowDensityControl;
        this.fontSize = danmakuItem.baseFontSize;
        this.outlineSize = danmakuItem.outlineSize;
        this.fontFamilyName = danmakuItem.fontFamilyName;
        this.text = danmakuItem.text;
        this.isBold = danmakuItem.isBold;
        this.mode = danmakuItem.mode;
        this.textColor = Object.assign({}, danmakuItem.textColor);
        this.outlineColor = Object.assign({}, danmakuItem.outlineColor);

        // Computed during renderDanmakuItem
        this.computedFontSize = this.fontSize;
        this.computedFontFamily = null;
        this.computedIsBold = false;

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

        this.marginLeft = 0;
        this.marginRight = 0;
        this.marginBottom = 0;

        if (danmakuItem.mode === DanmakuMode.Top ||
            danmakuItem.mode === DanmakuMode.Bottom ||
            danmakuItem.mode === DanmakuMode.Advanced) {
            this.marginBottom = danmakuItem.marginBottom || 0;
            this.definedDurationMs = danmakuItem.durationMs || 0;
        } else {
            this.definedDurationMs = 0;
        }

        if (danmakuItem.mode === DanmakuMode.Advanced) {
            this.definedStartX = danmakuItem.startX || 0;
            this.definedStartY = danmakuItem.startY || 0;
            this.definedEndX = danmakuItem.endX || 0;
            this.definedEndY = danmakuItem.endY || 0;
            this.marginLeft = danmakuItem.marginLeft || 0;
            this.marginRight = danmakuItem.marginRight || 0;
            this.alignmentMode = danmakuItem.alignmentMode;
            this.anchorMode = danmakuItem.anchorMode;
            this.definedStartAlpha = danmakuItem.startAlpha != null ? danmakuItem.startAlpha : 255;
            this.definedEndAlpha = danmakuItem.endAlpha != null ? danmakuItem.endAlpha : 255;
            this.textColor.a = 255; // controlled via alpha
            this.alpha = this.definedStartAlpha;
            this.definedTranslationDurationMs = danmakuItem.translationDurationMs || 0;
            this.definedTranslationDelayMs = danmakuItem.translationDelayMs || 0;
            this.definedAlphaDurationMs = danmakuItem.alphaDurationMs || 0;
            this.definedAlphaDelayMs = danmakuItem.alphaDelayMs || 0;
            this.definedRotateZ = danmakuItem.rotateZ || 0;
            this.definedRotateY = danmakuItem.rotateY || 0;
            this.translationSpeedX = 0;
            this.translationSpeedY = 0;
        } else {
            this.definedStartX = 0;
            this.definedStartY = 0;
            this.definedEndX = 0;
            this.definedEndY = 0;
            this.alignmentMode = DanmakuAlignmentMode.Default;
            this.anchorMode = DanmakuAlignmentMode.UpperLeft;
            this.definedStartAlpha = 255;
            this.definedEndAlpha = 255;
            this.alpha = 255;
            this.definedTranslationDurationMs = 0;
            this.definedTranslationDelayMs = 0;
            this.definedAlphaDurationMs = 0;
            this.definedAlphaDelayMs = 0;
            this.definedRotateZ = 0;
            this.definedRotateY = 0;
            this.translationSpeedX = 0;
            this.translationSpeedY = 0;
        }

        if (danmakuItem.mode === DanmakuMode.Subtitle) {
            this.definedDurationMs = danmakuItem.durationMs || 0;
        }
    }
}

class RenderLayer {
    constructor(layerId, requireStrictRenderOrder) {
        this._layerId = layerId;
        this.requireStrictRenderOrder = requireStrictRenderOrder;
        this.renderList = [];
        this.ySlotManager = new DanmakuYSlotManager(0);
        this.isEnabled = true;
        this.isSubtitleLayer = (layerId === DanmakuDefaultLayerDef.SubtitleLayerId);
    }

    updateYSlotManagerLength(canvasHeight, rollingAreaRatio) {
        const id = this._layerId;
        if (id === DanmakuDefaultLayerDef.RollingLayerId || id === DanmakuDefaultLayerDef.ReverseRollingLayerId) {
            this.ySlotManager.updateLength(Math.floor(canvasHeight * rollingAreaRatio));
        } else if (id === DanmakuDefaultLayerDef.TopLayerId) {
            this.ySlotManager.updateLength(Math.floor(canvasHeight * 0.75));
        } else if (id === DanmakuDefaultLayerDef.BottomLayerId) {
            this.ySlotManager.updateLength(Math.floor(canvasHeight / 2));
        } else {
            this.ySlotManager.updateLength(Math.floor(canvasHeight));
        }
    }

    clear() {
        this.renderList.length = 0;
        this.ySlotManager.clear();
    }

    setSubtitleLayer(isSubtitleLayer) {
        this.isSubtitleLayer = isSubtitleLayer;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DanmakuRender, DanmakuRenderItem, RenderLayer };
}
