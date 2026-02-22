'use strict';

const { DanmakuMode, DanmakuDefaultLayerDef, DanmakuItem } = require('./DanmakuTypes');
const { DanmakuRender } = require('./DanmakuRender');

/**
 * Main danmaku controller.
 * Mirrors the C# DanmakuFrostMaster class.
 *
 * Usage:
 * ```js
 * const controller = new DanmakuFrostMaster(canvasElement);
 * controller.setDanmakuList(parsedList);
 * controller.start();
 *
 * // In your media player time-update callback:
 * controller.updateTime(videoElement.currentTime * 1000);
 * ```
 */
class DanmakuFrostMaster {
    static get DefaultDanmakuLayerCount() {
        return DanmakuDefaultLayerDef.DefaultLayerCount;
    }

    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this._render = new DanmakuRender(canvas);

        /** @type {DanmakuItem[]} Pre-sorted by startMs */
        this._danmakuList = [];
        this._lastIndex = 0;
        this._lastTimeMs = 0;
        this._hasSubtitle = false;
        this._isRenderEnabled = false;
        this._isSeeking = false;
        this._isClosing = false;
        this._isPaused = false;
        this._subtitleIndexAfterSeek = -1;
    }

    get debugMode() { return this._render.debugMode; }
    set debugMode(v) { this._render.debugMode = v; }

    // ── configuration ─────────────────────────────────────────────────────

    setAutoControlDensity(value) { this._render.setAutoControlDensity(value); }
    /** Default: -1. 1→10 2→20 3→30 4→50 -1→unlimited */
    setRollingDensity(value) { this._render.setRollingDensity(value); }
    /** Default: 9. value ∈ (0, 10] */
    setRollingAreaRatio(value) { this._render.setRollingAreaRatio(value); }
    /** Default: 5. speed = value × 0.02. value ∈ [1, 10] */
    setRollingSpeed(value) { this._render.setRollingSpeed(value); }
    /** value ∈ (0, 1] */
    setOpacity(value) { this._render.setOpacity(value); }
    setIsTextBold(value) { this._render.setIsTextBold(value); }
    setDanmakuFontSizeOffset(value) { this._render.setDanmakuFontSizeOffset(value); }
    setSubtitleFontSize(value) { this._render.setSubtitleFontSizeOffset(value); }
    /** Pass null or empty string to use the default font */
    setFontFamily(value) { this._render.setDefaultFontFamily(value); }
    setBorderColor(color) { this._render.setBorderColor(color); }
    setNoOverlapSubtitle(value) { this._render.setNoOverlapSubtitle(value); }

    // ── playback control ──────────────────────────────────────────────────

    /**
     * Call this whenever the media player time changes.
     * @param {number} currentMs - Current playback position in milliseconds
     */
    updateTime(currentMs) {
        if (this._isClosing || this._isPaused) return;
        this._processTime(currentMs);
    }

    start() {
        this._isRenderEnabled = true;
        this._isPaused = false;
        this._render.start();
    }

    pause() {
        if (!this._isClosing) {
            this._isPaused = true;
            this._render.pause();
        }
    }

    resume() {
        this._isPaused = false;
        this._isRenderEnabled = true;
        this._render.resume();
    }

    stop() {
        this._isPaused = true;
        this._render.stop();
    }

    restart() {
        this.seek(0);
    }

    /** @param {number} targetMs */
    seek(targetMs) {
        this._isSeeking = true;
        this.stop();

        this._lastIndex = 0;
        if (this._danmakuList.length > 0) {
            while (this._lastIndex < this._danmakuList.length &&
                   this._danmakuList[this._lastIndex].startMs < targetMs) {
                this._lastIndex++;
            }
            if (this._hasSubtitle) {
                this._render.clearLayer(DanmakuDefaultLayerDef.SubtitleLayerId);
                let index = this._lastIndex - 1;
                while (index >= 0 && this._danmakuList[index].mode !== DanmakuMode.Subtitle) {
                    index--;
                }
                if (index >= 0 && index !== this._lastIndex &&
                    this._danmakuList[index].startMs + this._danmakuList[index].durationMs > targetMs) {
                    this._subtitleIndexAfterSeek = index;
                }
            }
        }
        this._lastTimeMs = targetMs;
        this._isSeeking = false;
        this.resume();
    }

    setRenderState(renderDanmaku, renderSubtitle) {
        this._isRenderEnabled = renderDanmaku || renderSubtitle;
        this._render.setRenderState(renderDanmaku, renderSubtitle);
    }

    setLayerRenderState(layerId, render) {
        this._render.setLayerRenderState(layerId, render);
    }

    setSubtitleLayer(layerId) {
        this._render.setSubtitleLayer(layerId);
    }

    clear() {
        this._danmakuList = [];
    }

    close() {
        if (!this._isClosing) {
            this._isRenderEnabled = false;
            this._isClosing = true;
            this._render.close();
        }
    }

    // ── danmaku list management ───────────────────────────────────────────

    /**
     * Add a real-time (live) danmaku to the canvas immediately.
     * @param {DanmakuItem} item
     * @param {boolean} insertToList - Also insert into the timeline list for seek support
     * @param {number} [layerId]
     */
    addRealtimeDanmaku(item, insertToList, layerId = DanmakuDefaultLayerDef.DefaultLayerId) {
        item.allowDensityControl = false;
        item.isRealtime = true;
        this._render.renderDanmakuItem(layerId, item);
        if (insertToList) {
            let added = false;
            for (let i = 0; i < this._danmakuList.length; i++) {
                if (this._danmakuList[i].startMs > item.startMs) {
                    this._danmakuList.splice(i, 0, item);
                    added = true;
                    break;
                }
            }
            if (!added) this._danmakuList.push(item);
        }
    }

    /**
     * Replace the danmaku timeline. The list must be pre-sorted by startMs.
     * @param {DanmakuItem[]} danmakuList
     */
    setDanmakuList(danmakuList) {
        this.clear();
        this._lastIndex = 0;
        this._danmakuList = danmakuList || [];
    }

    /**
     * Merge a subtitle list into the danmaku timeline.
     * The subtitle list must be pre-sorted by startMs.
     * @param {DanmakuItem[]} subtitleList
     */
    setSubtitleList(subtitleList) {
        this._render.clearLayer(DanmakuDefaultLayerDef.SubtitleLayerId);

        // Remove existing subtitle items
        for (let i = this._danmakuList.length - 1; i >= 0; i--) {
            if (this._danmakuList[i].mode === DanmakuMode.Subtitle) {
                this._danmakuList.splice(i, 1);
            }
        }

        if (!subtitleList || subtitleList.length === 0) return;

        this._hasSubtitle = true;

        // Merge-insert subtitles (both lists are already sorted)
        let i1 = 0, i2 = 0;
        while (i1 < this._danmakuList.length && i2 < subtitleList.length) {
            if (this._danmakuList[i1].startMs > subtitleList[i2].startMs) {
                this._danmakuList.splice(i1, 0, subtitleList[i2]);
                if (this._lastTimeMs > 0 &&
                    subtitleList[i2].startMs < this._lastTimeMs &&
                    subtitleList[i2].startMs + subtitleList[i2].durationMs > this._lastTimeMs) {
                    this._render.renderDanmakuItem(DanmakuDefaultLayerDef.SubtitleLayerId, subtitleList[i2]);
                }
                i2++;
            }
            i1++;
        }
        while (i2 < subtitleList.length) {
            this._danmakuList.push(subtitleList[i2]);
            if (this._lastTimeMs > 0 &&
                subtitleList[i2].startMs < this._lastTimeMs &&
                subtitleList[i2].startMs + subtitleList[i2].durationMs > this._lastTimeMs) {
                this._render.renderDanmakuItem(DanmakuDefaultLayerDef.SubtitleLayerId, subtitleList[i2]);
            }
            i2++;
        }

        if (this._lastIndex >= this._danmakuList.length) {
            this._lastIndex = this._danmakuList.length - 1;
        }
    }

    // ── private ───────────────────────────────────────────────────────────

    _processTime(currentMs) {
        // Re-seek if time jumped backward or more than 5 s forward
        if (currentMs < this._lastTimeMs || currentMs - this._lastTimeMs > 5000) {
            this.seek(currentMs);
            return;
        }
        this._lastTimeMs = currentMs;

        let subtitleRendered = false;
        while (currentMs > 0 &&
               this._lastIndex < this._danmakuList.length &&
               this._danmakuList[this._lastIndex].startMs <= currentMs) {
            if (this._isClosing || this._isSeeking) break;

            const item = this._danmakuList[this._lastIndex];

            let skip = false;
            if (item.isRealtime) {
                item.isRealtime = false;
                skip = true;
            }

            if (!skip && this._isRenderEnabled) {
                let layerId;
                switch (item.mode) {
                    case DanmakuMode.Bottom:    layerId = DanmakuDefaultLayerDef.BottomLayerId; break;
                    case DanmakuMode.Top:       layerId = DanmakuDefaultLayerDef.TopLayerId;    break;
                    case DanmakuMode.ReverseRolling: layerId = DanmakuDefaultLayerDef.ReverseRollingLayerId; break;
                    case DanmakuMode.Advanced:  layerId = DanmakuDefaultLayerDef.AdvancedLayerId; break;
                    case DanmakuMode.Subtitle:
                        subtitleRendered = true;
                        layerId = DanmakuDefaultLayerDef.SubtitleLayerId;
                        break;
                    default:
                        layerId = DanmakuDefaultLayerDef.RollingLayerId;
                }
                this._render.renderDanmakuItem(layerId, item);
            }

            this._lastIndex++;
        }

        if (this._subtitleIndexAfterSeek >= 0 && this._subtitleIndexAfterSeek < this._danmakuList.length) {
            if (!subtitleRendered) {
                this._render.renderDanmakuItem(
                    DanmakuDefaultLayerDef.SubtitleLayerId,
                    this._danmakuList[this._subtitleIndexAfterSeek]
                );
            }
            this._subtitleIndexAfterSeek = -1;
        }
    }
}

module.exports = { DanmakuFrostMaster };
