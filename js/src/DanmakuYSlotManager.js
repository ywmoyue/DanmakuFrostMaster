/**
 * DanmakuFrostMaster - JavaScript Version
 * DanmakuYSlotManager.js - Y-axis slot manager for track allocation
 */

'use strict';

class DanmakuYSlotManager {
    constructor(length) {
        this._ySlotArray = new Array(length).fill(null).map(() => ({ id: 0, length: 0 }));
    }

    updateLength(newLength) {
        this._ySlotArray = new Array(newLength).fill(null).map(() => ({ id: 0, length: 0 }));
    }

    /**
     * Get an available Y position for a danmaku item.
     * @param {number} danmakuId
     * @param {number} height
     * @returns {{ slotFound: boolean, y: number }}
     */
    getY(danmakuId, height) {
        const arr = this._ySlotArray;
        if (height > arr.length) {
            return { slotFound: false, y: 0 };
        }

        let index = 0;
        while (index + height < arr.length) {
            let found = true;
            for (let i = 0; i < height; i++) {
                if (arr[index + i].length > 0) {
                    found = false;
                    index = index + i + arr[index + i].length;
                    break;
                }
            }
            if (found) {
                arr[index].id = danmakuId;
                arr[index].length = height;
                return { slotFound: true, y: index };
            }
        }

        // Can't find available slot; return a random Y
        const y = Math.floor(Math.random() * (arr.length - height));
        return { slotFound: false, y };
    }

    /**
     * Release a previously occupied Y slot.
     * @param {number} danmakuId
     * @param {number} y
     */
    releaseYSlot(danmakuId, y) {
        const arr = this._ySlotArray;
        if (y < arr.length && arr[y].id === danmakuId) {
            arr[y].id = 0;
            arr[y].length = 0;
        }
    }

    clear() {
        for (let i = 0; i < this._ySlotArray.length; i++) {
            this._ySlotArray[i].id = 0;
            this._ySlotArray[i].length = 0;
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DanmakuYSlotManager };
}
