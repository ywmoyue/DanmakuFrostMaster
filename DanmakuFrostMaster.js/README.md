# DanmakuFrostMaster.js

JavaScript port of [DanmakuFrostMaster](https://github.com/ywmoyue/DanmakuFrostMaster) — an open-source danmaku (bullet comment) parsing and rendering engine for web browsers using the **HTML5 Canvas 2D API**.

## Features

- 🚀 High-performance danmaku rendering on HTML5 Canvas
- 🎯 Rolling, top, bottom, reverse-rolling, advanced (Mode 7) and subtitle modes
- 📺 Built-in Bilibili XML danmaku and CC subtitle (JSON) parser
- 🔄 Collision-avoidance Y-slot manager (no overlapping danmaku)
- 🎛️ Rich real-time controls: speed, opacity, font size, density, area ratio, layer visibility
- 🔌 Zero runtime dependencies

## Quick Start

### Browser

```html
<canvas id="danmakuCanvas" width="800" height="450" style="position:absolute;top:0;left:0;pointer-events:none;"></canvas>

<script type="module">
import { DanmakuFrostMaster, BilibiliDanmakuXmlParser } from './DanmakuFrostMaster.js/index.js';

const canvas = document.getElementById('danmakuCanvas');
const controller = new DanmakuFrostMaster(canvas);

// Parse a Bilibili danmaku XML file
const stats = {};
const danmakuList = BilibiliDanmakuXmlParser.getDanmakuList(xmlString, null, true, stats);
controller.setDanmakuList(danmakuList);

controller.start();

// Sync with a video element
video.addEventListener('timeupdate', () => {
    controller.updateTime(video.currentTime * 1000);
});
video.addEventListener('pause',  () => controller.pause());
video.addEventListener('play',   () => controller.resume());
video.addEventListener('seeked', () => controller.seek(video.currentTime * 1000));
</script>
```

### Node.js (parser / tests only)

The parser and Y-slot manager are pure JavaScript and work in Node.js without a DOM:

```js
const { BilibiliDanmakuXmlParser } = require('./DanmakuFrostMaster.js');
const stats = {};
const list = BilibiliDanmakuXmlParser.getDanmakuList(xmlStr, null, true, stats);
console.log(`Loaded ${list.length} danmaku (${stats.mergedCount} merged)`);
```

## API

### `DanmakuFrostMaster`

| Method | Description |
|---|---|
| `new DanmakuFrostMaster(canvas)` | Create a controller bound to a `<canvas>` element |
| `setDanmakuList(list)` | Set the timeline danmaku list (pre-sorted by `startMs`) |
| `setSubtitleList(list)` | Merge a subtitle list into the timeline |
| `addRealtimeDanmaku(item, insertToList)` | Render a live danmaku immediately |
| `updateTime(currentMs)` | Advance the timeline to `currentMs` (call on every `timeupdate`) |
| `start()` | Start the render loop |
| `pause()` | Pause rendering (canvas stays visible) |
| `resume()` | Resume rendering |
| `stop()` | Stop rendering and clear the canvas |
| `seek(targetMs)` | Jump to a specific time |
| `restart()` | Seek to 0 |
| `close()` | Destroy the controller |
| `setRollingSpeed(value)` | `value` ∈ [1, 10], default 5 |
| `setRollingAreaRatio(value)` | `value` ∈ (0, 10], default 9 |
| `setRollingDensity(value)` | Max rolling count; -1 = unlimited |
| `setOpacity(value)` | `value` ∈ (0, 1] |
| `setIsTextBold(value)` | Bold text, default `true` |
| `setDanmakuFontSizeOffset(value)` | `DanmakuFontSize` enum or integer |
| `setFontFamily(name)` | Override default font family |
| `setNoOverlapSubtitle(value)` | Keep bottom danmaku away from subtitle area |
| `setRenderState(danmaku, subtitle)` | Enable/disable danmaku and/or subtitle layer |
| `setLayerRenderState(layerId, render)` | Enable/disable a specific layer |
| `debugMode` | Set `true` to show FPS and count overlay |

### `BilibiliDanmakuXmlParser`

| Method | Description |
|---|---|
| `getDanmakuList(xml, filterList, mergeDuplicate, stats)` | Parse Bilibili XML into `DanmakuItem[]` |
| `getSubtitleList(json)` | Parse Bilibili CC subtitle JSON into `DanmakuItem[]` |

### `DanmakuItem` properties

| Property | Type | Description |
|---|---|---|
| `text` | `string` | Danmaku text |
| `startMs` | `number` | Start time in milliseconds |
| `mode` | `DanmakuMode` | Display mode |
| `textColor` | `string` | CSS color (`#rrggbb`) |
| `baseFontSize` | `number` | Font size in pixels |
| `isBold` | `boolean\|null` | `null` = use global setting |
| `hasOutline` | `boolean` | Stroke/outline effect |
| `durationMs` | `number` | For fixed-position & subtitle modes |

## Running Tests

Requires Node.js 18+.

```bash
cd DanmakuFrostMaster.js
npm test
```

## Architecture

```
DanmakuFrostMaster.js/
├── index.js                     # Public API entry point
├── src/
│   ├── DanmakuTypes.js          # Enums and DanmakuItem class
│   ├── DanmakuYSlotManager.js   # Vertical slot collision avoidance
│   ├── BilibiliDanmakuXmlParser.js  # XML/JSON parser
│   ├── DanmakuRender.js         # Canvas 2D rendering engine
│   └── DanmakuFrostMaster.js    # Main controller / timeline driver
└── test/
    ├── DanmakuYSlotManager.test.js
    └── BilibiliDanmakuXmlParser.test.js
```

## Differences from the C# version

| C# (UWP / Win2D) | JavaScript (Browser / Canvas 2D) |
|---|---|
| `CanvasAnimatedControl` | `requestAnimationFrame` loop |
| `Win2D` GPU rendering | HTML5 Canvas 2D API |
| `ThreadPool.RunAsync` | Single-threaded; `updateTime()` is synchronous |
| `Windows.UI.Color` | CSS `#rrggbb` / `rgba(...)` strings |
| `ResizeObserver` not needed (XAML layout) | `ResizeObserver` automatically tracks canvas resize |
| `Transform3DEffect` (GPU) | CSS transform approximation on 2D canvas |
