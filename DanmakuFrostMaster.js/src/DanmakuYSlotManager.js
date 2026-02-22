'use strict';

/**
 * Manages vertical slot allocation to prevent danmaku overlap.
 * Mirrors the C# DanmakuYSlotManager class.
 */
class DanmakuYSlotManager {
    /**
     * @param {number} length - Available height in pixels
     */
    constructor(length) {
        this._slots = new Array(Math.max(0, Math.floor(length))).fill(null).map(() => ({ id: 0, length: 0 }));
    }

    /**
     * Resize the slot array (e.g. on canvas resize)
     * @param {number} newLength
     */
    updateLength(newLength) {
        this._slots = new Array(Math.max(0, Math.floor(newLength))).fill(null).map(() => ({ id: 0, length: 0 }));
    }

    /**
     * Find a free Y position for a danmaku of the given height.
     * @param {number} danmakuId
     * @param {number} height - Height in pixels
     * @param {{value: number}} outY - Output Y position
     * @returns {boolean} true if a free slot was found; false means a random position was chosen
     */
    getY(danmakuId, height, outY) {
        const slots = this._slots;
        const len = slots.length;
        const h = Math.floor(height);

        if (h > len) {
            outY.value = 0;
            return false;
        }

        let index = 0;
        while (index + h <= len) {
            let found = true;
            for (let i = 0; i < h; i++) {
                if (slots[index + i].length > 0) {
                    found = false;
                    index = index + i + slots[index + i].length;
                    break;
                }
            }
            if (found) {
                slots[index].id = danmakuId;
                slots[index].length = h;
                outY.value = index;
                return true;
            }
        }

        // No free slot – pick a random Y
        outY.value = Math.floor(Math.random() * Math.max(1, len - h));
        return false;
    }

    /**
     * Release the slot previously occupied by a danmaku.
     * @param {number} danmakuId
     * @param {number} y
     */
    releaseYSlot(danmakuId, y) {
        const yi = Math.floor(y);
        if (yi < this._slots.length && this._slots[yi].id === danmakuId) {
            this._slots[yi].id = 0;
            this._slots[yi].length = 0;
        }
    }

    /** Clear all slots */
    clear() {
        for (let i = 0; i < this._slots.length; i++) {
            this._slots[i].id = 0;
            this._slots[i].length = 0;
        }
    }
}

module.exports = { DanmakuYSlotManager };
