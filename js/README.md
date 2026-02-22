# DanmakuFrostMaster - JavaScript Version

A JavaScript port of the [DanmakuFrostMaster](https://github.com/ywmoyue/DanmakuFrostMaster) danmaku (bullet comment) rendering engine, using the HTML5 Canvas API.

## Features

- **HTML5 Canvas rendering** — works in any modern browser, no external dependencies
- **Multiple danmaku modes** — Rolling, ReverseRolling, Top, Bottom, Advanced (mode 7), Subtitle
- **Bilibili XML parser** — parses both old and new Bilibili danmaku XML formats
- **Bilibili CC subtitle parser** — parses Bilibili CC subtitle JSON
- **ASS subtitle parser** — supports major ASS subtitle features (positions, colors, fade, move, rotation)
- **Density control** — automatic and manual danmaku density limiting
- **Real-time danmaku** — add user-sent danmaku at runtime
- **Configurable display** — font size, speed, opacity, bold, area ratio, etc.

## Quick Start

### Browser (script tag)

```html
<canvas id="danmakuCanvas" width="800" height="600"></canvas>
<script src="js/index.js"></script>
<script>
  const canvas = document.getElementById('danmakuCanvas');
  const controller = new DanmakuFrostMaster(canvas);

  // Load danmaku from Bilibili XML
  const { list } = BilibiliDanmakuXmlParser.getDanmakuList(xmlString, null, true);
  controller.setDanmakuList(list);

  // Connect to a video element
  const video = document.getElementById('myVideo');
  video.addEventListener('timeupdate', () => {
    controller.updateTime(video.currentTime * 1000);
  });
  video.addEventListener('pause', () => controller.pause());
  video.addEventListener('play', () => controller.resume());
  video.addEventListener('seeking', () => controller.seek(video.currentTime * 1000));
</script>
```

### Node.js / CommonJS

```js
const { DanmakuFrostMaster, BilibiliDanmakuXmlParser, DanmakuItem, DanmakuMode } = require('./js/index');
```

## API Reference

### `DanmakuFrostMaster`

Main controller class.

```js
const controller = new DanmakuFrostMaster(canvasElement);
```

| Method | Description |
|--------|-------------|
| `setDanmakuList(list)` | Set the danmaku timeline. List must be pre-sorted by `startMs`. |
| `setSubtitleList(list)` | Merge subtitle items into the timeline. |
| `updateTime(currentMs)` | Call from your video `timeupdate` handler. |
| `addRealtimeDanmaku(item, insertToList)` | Send a real-time danmaku (e.g., user comment). |
| `pause()` | Pause rendering. |
| `resume()` | Resume rendering. |
| `seek(targetMs)` | Seek to a time position. |
| `restart()` | Restart from beginning. |
| `stop()` | Stop and clear all danmaku. |
| `close()` | Destroy the controller and release resources. |
| `setRollingSpeed(value)` | Rolling speed (1–10, default 5). |
| `setRollingAreaRatio(value)` | Rolling area ratio (1–10, default 9). |
| `setRollingDensity(value)` | Max simultaneous rolling danmaku (-1 = unlimited). |
| `setAutoControlDensity(value)` | Enable automatic density control. |
| `setOpacity(value)` | Global danmaku opacity (0–1). |
| `setIsTextBold(value)` | Enable bold text. |
| `setDanmakuFontSizeOffset(value)` | Font size offset (use `DanmakuFontSize` enum). |
| `setFontFamilyName(value)` | Custom font family. |
| `setNoOverlapSubtitle(value)` | Prevent danmaku from overlapping subtitles. |
| `setRenderState(danmaku, subtitle)` | Enable/disable danmaku and/or subtitle rendering. |
| `debugMode` | Set to `true` to show debug overlay. |

### `BilibiliDanmakuXmlParser`

```js
// Parse danmaku XML
const { list, totalCount, filteredCount, mergedCount } =
    BilibiliDanmakuXmlParser.getDanmakuList(xmlString, regexFilterList, mergeDuplicate);

// Parse CC subtitle JSON
const subtitleList = BilibiliDanmakuXmlParser.getSubtitleList(jsonString);
```

### `AssParser`

```js
const list = AssParser.getDanmakuList(assString);
```

### `DanmakuItem`

```js
const item = new DanmakuItem();
item.text = 'Hello!';
item.mode = DanmakuMode.Rolling;
item.startMs = 5000;
item.baseFontSize = 22;
item.textColor = { r: 255, g: 255, b: 0, a: 255 }; // yellow
```

### Enumerations

```js
DanmakuMode.Rolling        // 1 - scrolling from right to left
DanmakuMode.Bottom         // 4 - centered at bottom
DanmakuMode.Top            // 5 - centered at top
DanmakuMode.ReverseRolling // 6 - scrolling from left to right
DanmakuMode.Advanced       // 7 - advanced mode (Bilibili mode 7)
DanmakuMode.Subtitle       // 9 - subtitle display at bottom

DanmakuFontSize.Smallest   // 1
DanmakuFontSize.Smaller    // 2
DanmakuFontSize.Normal     // 3
DanmakuFontSize.Larger     // 4
DanmakuFontSize.Largest    // 5

DanmakuDefaultLayerDef.RollingLayerId        // 0
DanmakuDefaultLayerDef.ReverseRollingLayerId // 1
DanmakuDefaultLayerDef.TopLayerId            // 2
DanmakuDefaultLayerDef.BottomLayerId         // 3
DanmakuDefaultLayerDef.AdvancedLayerId       // 4
DanmakuDefaultLayerDef.SubtitleLayerId       // 5
```

## Running Tests

```bash
cd js
node test/test.js
```

## Differences from the C# Version

| Feature | C# (UWP) | JavaScript |
|---------|-----------|------------|
| Rendering API | Win2D (DirectX) | HTML5 Canvas 2D |
| Platform | UWP / Windows | Any browser / Node.js |
| Threading | ThreadPool + AutoResetEvent | `requestAnimationFrame` |
| Text layout | `CanvasTextLayout` | `ctx.measureText()` |
| 3D rotation (RotateY) | `Transform3DEffect` / `Matrix4x4` | CSS-approximated via `ctx.scale(cos, 1)` |
| Memory management | IDisposable / GC | Garbage collected automatically |

## File Structure

```
js/
├── index.js           # Single-file bundle (all classes)
├── package.json
├── src/               # Individual source modules (for reference)
│   ├── BaseTypeDef.js
│   ├── DanmakuYSlotManager.js
│   ├── BilibiliDanmakuXmlParser.js
│   ├── AssParser.js
│   ├── DanmakuRender.js
│   └── DanmakuFrostMaster.js
└── test/
    └── test.js        # Unit tests (Node.js)
```
