> 本仓库为Fork仓库
> - 原版本 https://github.com/cotaku/DanmakuFrostMaster
> - 原作者 https://github.com/cotaku

# DanmakuFrostMaster
UWP开源弹幕引擎·寒霜弹幕使 ～

一个UWP上基于Win2D渲染API的开源弹幕解析和绘制引擎项目/An open-source project of danmaku parsing/rendering engine based on Win2D API on UWP

## 主要特性/Key Features
- 高效GPU弹幕渲染/High-performance danmaku rendering on GPU
- 强大而简洁的弹幕实时控制/Powerful and simplified real-time danmaku manipulation
- 丰富的渲染效果/Rich rendering effects
- 支持多层渲染/Support for multi-layered rendering
- 快速项目集成/Quick integration to your project
- 高可扩展性和可定制性/High scalability and customizability
- 内置哔哩哔哩弹幕和字幕兼容/Built-in compatibility with Bilibili danmaku and subtitle
- 内置ASS字幕大部分特性支持/Built-in support for major styles of ASS subtitle

## 快速开始/Quick Start
*Prerequisite*

Install Win2D from https://www.nuget.org/packages/Microsoft.Graphics.Win2D

*Page.xaml*

`xmlns:canvas="using:Microsoft.Graphics.Canvas.UI.Xaml"`

`<canvas:CanvasAnimatedControl x:Name="_canvasDanmaku"/>`

*Page.xaml.cs*

```
using Atelier39;
private DanmakuFrostMaster _danmakuController;
_danmakuController = new DanmakuFrostMaster(_canvasDanmaku);
```

`_danmakuController.AddRealtimeDanmaku(danmakuItem, false);`

```
List<DanmakuItem> danmakuList = BilibiliDanmakuXmlParser.GetDanmakuList(danmakuXml, null, true, out _, out _, out _);
_danmakuController.SetDanmakuList(danmakuList);
```

`_danmakuController.UpdateTime((uint)playTime.TotalMilliseconds);`

## 效果演示/Demo
### Demo for real-time danmaku sending
![demo1](https://github.com/cotaku/DanmakuFrostMaster/blob/main/DanmakuFrostMasterDemo/DemoScreenshots/demo1.png?raw=true)

### Demo for Bilibili video (Video: BV1Js411o76u)
![demo2-1](https://github.com/cotaku/DanmakuFrostMaster/blob/main/DanmakuFrostMasterDemo/DemoScreenshots/demo2-1.png?raw=true)
### Demo for Bilibili mode7 danmaku (Video: BV1Js411o76u)
![demo2-2](https://github.com/cotaku/DanmakuFrostMaster/blob/main/DanmakuFrostMasterDemo/DemoScreenshots/demo2-2.png?raw=true)

### Demo for Bilibili CC subtitle (Video: BV1Ws411m7VY)
![demo3](https://github.com/cotaku/DanmakuFrostMaster/blob/main/DanmakuFrostMasterDemo/DemoScreenshots/demo3.png?raw=true)

### Demo for ASS subtitle (Video: ?)
![demo4](https://github.com/cotaku/DanmakuFrostMaster/blob/main/DanmakuFrostMasterDemo/DemoScreenshots/demo4.png?raw=true)
