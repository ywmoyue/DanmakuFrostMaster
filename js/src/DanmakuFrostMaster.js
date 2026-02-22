/**
 * DanmakuFrostMaster - JavaScript Version
 * DanmakuFrostMaster.js - Main controller class
 */

'use strict';

/* global DanmakuMode, DanmakuDefaultLayerDef, DanmakuFontSize, DanmakuRender */

class DanmakuFrostMaster {
    static get DEFAULT_DANMAKU_LAYER_COUNT() {
        return DanmakuDefaultLayerDef.DefaultLayerCount;
    }

    /**
     * @param {HTMLCanvasElement} canvas
     */
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
    set debugMode(value) { this._render.debugMode = value; }

    setAutoControlDensity(value) { this._render.setAutoControlDensity(value); }

    /**
     * Default: -1 (unlimited). 1->10, 2->20, 3->30, 4->50, -1->unlimited
     */
    setRollingDensity(value) { this._render.setRollingDensity(value); }

    /**
     * Default: 9. Value in (0,10]
     */
    setRollingAreaRatio(value) { this._render.setRollingAreaRatio(value); }

    /**
     * Default: 5. speed = value * 0.02. Value in [1,10]
     */
    setRollingSpeed(value) { this._render.setRollingSpeed(value); }

    /** @param {number} value in [0,1] */
    setOpacity(value) { this._render.setOpacity(value); }

    setIsTextBold(value) { this._render.setIsTextBold(value); }

    setDanmakuFontSizeOffset(value) { this._render.setDanmakuFontSizeOffset(value); }

    setSubtitleFontSize(value) { this._render.setSubtitleFontSizeOffset(value); }

    /** Null or empty string to use default font */
    setFontFamilyName(value) { this._render.setDefaultFontFamilyName(value); }

    setBorderColor(color) { this._render.setBorderColor(color); }

    setNoOverlapSubtitle(value) { this._render.setNoOverlapSubtitle(value); }

    /**
     * Update the current playback time. Call this from your video timeupdate handler.
     * @param {number} currentMs - current playback position in milliseconds
     */
    updateTime(currentMs) {
        if (this._isClosing || this._isSeeking) return;

        // Check for long-time suspension or rewind
        if (currentMs < this._lastTimeMs || currentMs - this._lastTimeMs > 5000) {
            this.seek(currentMs);
            return;
        }

        this._lastTimeMs = currentMs;

        let subtitleRendered = false;

        while (currentMs > 0 &&
            this._lastIndex < this._danmakuList.length &&
            this._danmakuList[this._lastIndex].startMs <= currentMs) {

            if (this._isClosing) return;

            const danmakuItem = this._danmakuList[this._lastIndex];

            if (danmakuItem.isRealtime) {
                danmakuItem.isRealtime = false;
                this._lastIndex++;
                continue;
            }

            if (this._isRenderEnabled) {
                let layerId;
                switch (danmakuItem.mode) {
                    case DanmakuMode.Bottom:
                        layerId = DanmakuDefaultLayerDef.BottomLayerId;
                        break;
                    case DanmakuMode.Top:
                        layerId = DanmakuDefaultLayerDef.TopLayerId;
                        break;
                    case DanmakuMode.ReverseRolling:
                        layerId = DanmakuDefaultLayerDef.ReverseRollingLayerId;
                        break;
                    case DanmakuMode.Advanced:
                        layerId = DanmakuDefaultLayerDef.AdvancedLayerId;
                        break;
                    case DanmakuMode.Subtitle:
                        subtitleRendered = true;
                        layerId = DanmakuDefaultLayerDef.SubtitleLayerId;
                        break;
                    default:
                        layerId = DanmakuDefaultLayerDef.RollingLayerId;
                        break;
                }
                this._render.renderDanmakuItem(layerId, danmakuItem);
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

    pause() {
        if (!this._isClosing) {
            this._render.pause();
        }
    }

    resume() {
        this._render.start();
    }

    stop() {
        this.pause();
        this._render.stop();
    }

    restart() {
        this.seek(0);
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

    /**
     * Seek to a specific time position.
     * @param {number} targetMs
     */
    seek(targetMs) {
        this._isSeeking = true;
        this.stop();

        this._lastIndex = 0;
        if (this._danmakuList.length > 0) {
            while (this._danmakuList[this._lastIndex] &&
                this._danmakuList[this._lastIndex].startMs < targetMs) {
                this._lastIndex++;
            }

            if (this._hasSubtitle) {
                this._render.clearLayer(DanmakuDefaultLayerDef.SubtitleLayerId);
                let index = this._lastIndex - 1;
                while (index >= 0 && this._danmakuList[index].mode !== DanmakuMode.Subtitle) {
                    index--;
                }
                if (index >= 0 && index !== this._lastIndex) {
                    const sub = this._danmakuList[index];
                    if (sub.startMs + sub.durationMs > targetMs) {
                        this._subtitleIndexAfterSeek = index;
                    }
                }
            }
        }

        this._lastTimeMs = targetMs;
        this.resume();
        this._isSeeking = false;
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

    /**
     * Add a real-time danmaku item (e.g., user-sent danmaku).
     * @param {object} item - DanmakuItem
     * @param {boolean} insertToList - whether to insert into the timeline list
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
            if (!added) {
                this._danmakuList.push(item);
            }
        }
    }

    /**
     * Set the main danmaku list. Must be pre-sorted by startMs.
     * @param {object[]} danmakuList
     */
    setDanmakuList(danmakuList) {
        this.clear();
        this._lastIndex = 0;
        this._danmakuList = danmakuList || [];
    }

    /**
     * Set/merge a subtitle list into the danmaku timeline.
     * @param {object[]} subtitleList - Must be pre-sorted by startMs
     */
    setSubtitleList(subtitleList) {
        this._render.clearLayer(DanmakuDefaultLayerDef.SubtitleLayerId);

        // Remove existing subtitle entries
        this._danmakuList = this._danmakuList.filter(item => item.mode !== DanmakuMode.Subtitle);

        if (subtitleList && subtitleList.length > 0) {
            this._hasSubtitle = true;

            // Merge-insert subtitle items maintaining sort order
            let i1 = 0, i2 = 0;
            const merged = [];
            while (i1 < this._danmakuList.length && i2 < subtitleList.length) {
                if (this._danmakuList[i1].startMs <= subtitleList[i2].startMs) {
                    merged.push(this._danmakuList[i1++]);
                } else {
                    const sub = subtitleList[i2++];
                    merged.push(sub);
                    if (this._lastTimeMs > 0 &&
                        sub.startMs < this._lastTimeMs &&
                        sub.startMs + sub.durationMs > this._lastTimeMs) {
                        this._render.renderDanmakuItem(DanmakuDefaultLayerDef.SubtitleLayerId, sub);
                    }
                }
            }
            while (i1 < this._danmakuList.length) merged.push(this._danmakuList[i1++]);
            while (i2 < subtitleList.length) {
                const sub = subtitleList[i2++];
                merged.push(sub);
                if (this._lastTimeMs > 0 &&
                    sub.startMs < this._lastTimeMs &&
                    sub.startMs + sub.durationMs > this._lastTimeMs) {
                    this._render.renderDanmakuItem(DanmakuDefaultLayerDef.SubtitleLayerId, sub);
                }
            }
            this._danmakuList = merged;

            if (this._lastIndex >= this._danmakuList.length) {
                this._lastIndex = Math.max(this._danmakuList.length - 1, 0);
            }
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DanmakuFrostMaster };
}
