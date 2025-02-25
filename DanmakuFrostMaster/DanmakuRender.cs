﻿using Microsoft.Graphics.Canvas;
using Microsoft.Graphics.Canvas.Effects;
using Microsoft.Graphics.Canvas.Geometry;
using Microsoft.Graphics.Canvas.Text;
using Microsoft.Graphics.Canvas.UI;
using Microsoft.Graphics.Canvas.UI.Xaml;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Numerics;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using Windows.Foundation;
using Windows.System;
using Windows.UI;
using Windows.UI.Core;
using Windows.UI.Text;
using Windows.UI.Xaml;

namespace Atelier39
{
    internal class DanmakuRender
    {
        private const float Standard_Canvas_Width = 800;
        private const float Default_Rolling_Speed = 0.1f; // pixel per millisecond
        private const float Default_BottomAndTop_Duration_Ms = 3800f;
        private const float Subtitle_StartY = 24f;
        private const string Default_Font_Family_Name = "Microsoft YaHei";

        private CanvasAnimatedControl _canvas;
        private CanvasDevice _device;
        private readonly RenderLayer[] _renderLayerList;
        private volatile bool _isStopped;
        private volatile bool _isDanmakuEnabled = true;
        private volatile bool _isSubtitleEnabled = true;
        private readonly float _dpi;
        private readonly double _appMemoryLimitMb;

        private volatile bool _autoControlDensity = true;
        private volatile bool _textBold = true;
        private volatile bool _noOverlapSubtitle = false;
        private volatile int _maxDanmakuSize = 0;
        private volatile int _rollingDensity = -1;
        private volatile int _danmakuFontSizeOffset = (int)DanmakuFontSize.Normal;
        private volatile int _subtitleFontSizeOffset = (int)DanmakuFontSize.Normal;
        private volatile float _rollingAreaRatio = 0.8f;
        private volatile float _rollingSpeed = Default_Rolling_Speed; // 1 to 10
        private double _textOpacity = 1.0;
        private Color _borderColor = Colors.Blue;
        private string _defaultFontFamilyName = Default_Font_Family_Name;

        public float CanvasWidth
        {
            private set; get;
        }

        public float CanvasHeight
        {
            private set; get;
        }

        public bool DebugMode
        {
            get; set;
        }

        /// <exception cref="System.ArgumentNullException">canvas is null</exception>
        public DanmakuRender(CanvasAnimatedControl canvas)
        {
            _canvas = canvas ?? throw new ArgumentNullException("canvas");

            _canvas.IsFixedTimeStep = false;
            _dpi = _canvas.Dpi;
            CanvasWidth = (float)_canvas.ActualWidth;
            CanvasHeight = (float)_canvas.ActualHeight;

            _canvas.SizeChanged += CanvasAnimatedControl_SizeChanged;
            _canvas.CreateResources += CanvasAnimatedControl_CreateResources;
            _canvas.Update += CanvasAnimatedControl_Update;
            _canvas.Draw += CanvasAnimatedControl_Draw;

            _canvas.Paused = false;

            uint layerCount = DanmakuDefaultLayerDef.DefaultLayerCount;
            _renderLayerList = new RenderLayer[layerCount];
            for (uint i = 0; i < layerCount; i++)
            {
                _renderLayerList[i] = new RenderLayer(i, i == DanmakuDefaultLayerDef.AdvancedLayerId || i == DanmakuDefaultLayerDef.SubtitleLayerId);
                if (CanvasHeight >= 1f)
                {
                    _renderLayerList[i].UpdateYSlotManagerLength((uint)CanvasHeight, _rollingAreaRatio);
                }
            }

            _appMemoryLimitMb = (double)MemoryManager.AppMemoryUsageLimit / (1024 * 1024);

            Logger.Log("DanmakuRender is created");
        }

        public void SetAutoControlDensity(bool value)
        {
            _autoControlDensity = value;
        }

        public void SetRollingDensity(int value)
        {
            _rollingDensity = value;
        }

        public void SetRollingAreaRatio(int value)
        {
            if (value > 0 && value <= 10)
            {
                _rollingAreaRatio = (float)value / 10;
                for (int i = 0; i < _renderLayerList.Length; i++)
                {
                    _renderLayerList[i].UpdateYSlotManagerLength((uint)CanvasHeight, _rollingAreaRatio);
                }
            }
        }

        public void SetRollingSpeed(int value)
        {
            if (value >= 1 && value <= 10)
            {
                _rollingSpeed = value * 0.02f;
            }
        }

        public void SetOpacity(double value)
        {
            if (value > 0 && value <= 1.0)
            {
                _textOpacity = value;
            }
        }

        public void SetIsTextBold(bool value)
        {
            _textBold = value;
        }

        public void SetDanmakuFontSizeOffset(int value)
        { 
            _danmakuFontSizeOffset = value;
        }

        public void SetDanmakuFontSizeOffset(DanmakuFontSize value)
        {
            if (value >= DanmakuFontSize.Smallest && value <= DanmakuFontSize.Largest)
            {
                _danmakuFontSizeOffset = (int)value;
            }
        }

        public void SetSubtitleFontSizeOffset(DanmakuFontSize value)
        {
            if (value >= DanmakuFontSize.Smallest && value <= DanmakuFontSize.Largest)
            {
                _subtitleFontSizeOffset = (int)value;
            }
        }

        public void SetDefaultFontFamilyName(string value)
        {
            _defaultFontFamilyName = value ?? Default_Font_Family_Name;
        }

        public void SetBorderColor(Color color)
        {
            _borderColor = color;
        }

        public void SetSubtitleEnabled(bool enable)
        {
            _isSubtitleEnabled = enable;
        }

        public void SetNoOverlapSubtitle(bool value)
        {
            _noOverlapSubtitle = value;
        }

        /// <exception cref="System.ArgumentOutOfRangeException">layerId >= max layer count</exception>
        /// <exception cref="System.ArgumentNullException">device is null</exception>
        public void RenderDanmakuItem(uint layerId, DanmakuItem danmakuItem)
        {
            if (layerId >= _renderLayerList.Length)
            {
                throw new ArgumentOutOfRangeException("layer", $"Max layer count: {_renderLayerList.Length}");
            }

            if (_device == null || _isStopped)
            {
                return;
            }
            if ((!_isDanmakuEnabled && danmakuItem.Mode != DanmakuMode.Subtitle) || (!_isSubtitleEnabled && danmakuItem.Mode == DanmakuMode.Subtitle))
            {
                return;
            }

            DanmakuYSlotManager ySlotManager = _renderLayerList[layerId].YSlotManager;

            try
            {
                if (danmakuItem.Mode != DanmakuMode.Advanced && danmakuItem.Mode != DanmakuMode.Subtitle)
                {
                    danmakuItem.TextColor = Color.FromArgb((byte)(_textOpacity * byte.MaxValue), danmakuItem.TextColor.R, danmakuItem.TextColor.G, danmakuItem.TextColor.B);
                }
                DanmakuRenderItem renderItem = new DanmakuRenderItem(danmakuItem);
                if (renderItem.Mode == DanmakuMode.Unknown)
                {
                    Logger.Log($"Ignore unknown danmaku type ({renderItem.Mode}): {renderItem.Text}");
                    return;
                }

                if (!_autoControlDensity && _rollingDensity > 0 && renderItem.Mode == DanmakuMode.Rolling && _renderLayerList[layerId].RenderList.Count >= _rollingDensity)
                {
                    // Skip rendering due to _rollingDensity
                    renderItem.Dispose();
                    return;
                }

                using (CanvasTextFormat textFormat = new CanvasTextFormat())
                {
                    textFormat.LocaleName = "zh-CN";
                    bool isBold = renderItem.IsBold == null ? _textBold : renderItem.IsBold.Value;
                    textFormat.FontWeight = isBold ? FontWeights.Bold : FontWeights.Normal;
                    textFormat.WordWrapping = CanvasWordWrapping.NoWrap;
                    textFormat.HorizontalAlignment = CanvasHorizontalAlignment.Center;
                    textFormat.VerticalAlignment = CanvasVerticalAlignment.Center;
                    textFormat.TrimmingGranularity = CanvasTextTrimmingGranularity.None;
                    textFormat.TrimmingSign = CanvasTrimmingSign.None;
                    if (renderItem.Mode == DanmakuMode.Top || renderItem.Mode == DanmakuMode.Bottom || renderItem.Mode == DanmakuMode.Subtitle)
                    {
                        textFormat.WordWrapping = CanvasWordWrapping.Wrap;
                    }

                    textFormat.FontSize = renderItem.FontSize;
                    if (!danmakuItem.KeepDefinedFontSize)
                    {
                        int fontSizeOffset = renderItem.Mode != DanmakuMode.Subtitle ? _danmakuFontSizeOffset : _subtitleFontSizeOffset;
                        textFormat.FontSize += (fontSizeOffset - 3) * (fontSizeOffset > 3 ? 6 : 3);

                        if (CanvasWidth < Standard_Canvas_Width)
                        {
                            textFormat.FontSize = textFormat.FontSize * CanvasWidth / Standard_Canvas_Width;
                            if (textFormat.FontSize >= 30f)
                            {
                                textFormat.FontSize *= 0.75f;
                            }
                            renderItem.MarginBottom = (int)(renderItem.MarginBottom * CanvasWidth * 0.75f / Standard_Canvas_Width);
                        }
                    }
                    textFormat.FontSize = (int)Math.Max(textFormat.FontSize, 2f);

                    if (!string.IsNullOrWhiteSpace(renderItem.FontFamilyName))
                    {
                        textFormat.FontFamily = renderItem.FontFamilyName;
                    }
                    else if (renderItem.Mode == DanmakuMode.Advanced)
                    {
                        textFormat.FontFamily = Default_Font_Family_Name;
                    }
                    else
                    {
                        textFormat.FontFamily = _defaultFontFamilyName;
                    }

                    string danmakuText = renderItem.Text;

                    // Measure text size
                    using (CanvasRenderTarget tempRenderTarget = new CanvasRenderTarget(_device, 0, 0, _dpi))
                    {
                        using (CanvasDrawingSession drawingSession = tempRenderTarget.CreateDrawingSession())
                        {
                            using (CanvasTextLayout textLayout = new CanvasTextLayout(drawingSession, danmakuText, textFormat, CanvasWidth - 24f, 0))
                            {
                                // Leave padding space for border
                                renderItem.Width = (float)textLayout.LayoutBounds.Width + 8f;
                                renderItem.Height = (float)textLayout.LayoutBounds.Height;
                                if (renderItem.HasOutline)
                                {
                                    renderItem.Height += renderItem.OutlineSize;
                                }

                                if (renderItem.Width <= 0 || renderItem.Height <= 0)
                                {
                                    return;
                                }
                                if (_maxDanmakuSize > 0 && (renderItem.Width >= _maxDanmakuSize || renderItem.Height >= _maxDanmakuSize))
                                {
                                    return;
                                }
                            }
                        }
                    }

                    // Do initial rendering
                    renderItem.RenderTarget = new CanvasRenderTarget(_device, renderItem.Width, renderItem.Height, _dpi);
                    using (CanvasDrawingSession drawingSession = renderItem.RenderTarget.CreateDrawingSession())
                    {
                        using (CanvasTextLayout textLayout = new CanvasTextLayout(drawingSession, danmakuText, textFormat, renderItem.Width, renderItem.Height))
                        {
                            // Calculate initial position
                            switch (renderItem.Mode)
                            {
                                case DanmakuMode.Rolling:
                                    {
                                        renderItem.NeedToReleaseYSlot = ySlotManager.GetY(renderItem.Id, (uint)renderItem.Height, out uint y);
                                        renderItem.StartX = CanvasWidth;
                                        renderItem.StartY = y;
                                        break;
                                    }
                                case DanmakuMode.Bottom:
                                    {
                                        renderItem.NeedToReleaseYSlot = ySlotManager.GetY(renderItem.Id, (uint)renderItem.Height, out uint y);
                                        renderItem.StartY = y;
                                        break;
                                    }
                                case DanmakuMode.Top:
                                    {
                                        renderItem.NeedToReleaseYSlot = ySlotManager.GetY(renderItem.Id, (uint)renderItem.Height, out uint y);
                                        renderItem.StartY = y;
                                        break;
                                    }
                                case DanmakuMode.ReverseRolling:
                                    {
                                        renderItem.NeedToReleaseYSlot = ySlotManager.GetY(renderItem.Id, (uint)renderItem.Height, out uint y);
                                        renderItem.StartX = -renderItem.Width;
                                        renderItem.StartY = y;
                                        break;
                                    }
                                case DanmakuMode.Advanced:
                                    {
                                        if (renderItem.AlignmentMode == DanmakuAlignmentMode.Default)
                                        {
                                            renderItem.StartX = renderItem.DefinedStartX > 1.0f ? renderItem.DefinedStartX : renderItem.DefinedStartX * CanvasWidth;
                                            renderItem.StartY = renderItem.DefinedStartY > 1.0f ? renderItem.DefinedStartY : renderItem.DefinedStartY * CanvasHeight;
                                            renderItem.EndX = renderItem.DefinedEndX > 1.0f ? renderItem.DefinedEndX : renderItem.DefinedEndX * CanvasWidth;
                                            if (renderItem.EndX > renderItem.StartX && renderItem.EndX < CanvasWidth && renderItem.EndX + renderItem.Width > CanvasWidth)
                                            {
                                                renderItem.EndX = renderItem.EndX + renderItem.Width * 0.2f <= CanvasWidth ? CanvasWidth - renderItem.Width : CanvasWidth;
                                            }
                                            renderItem.EndY = renderItem.DefinedEndY > 1.0f ? renderItem.DefinedEndY : renderItem.DefinedEndY * CanvasHeight;
                                            if (renderItem.EndY > renderItem.StartY && renderItem.EndY < CanvasHeight && renderItem.EndY + renderItem.Height > CanvasHeight)
                                            {
                                                renderItem.EndY = renderItem.EndY + renderItem.Height * 0.2f <= CanvasHeight ? CanvasHeight - renderItem.Height : CanvasHeight;
                                            }

                                            if (renderItem.AnchorMode != DanmakuAlignmentMode.UpperLeft)
                                            {
                                                switch (renderItem.AnchorMode)
                                                {
                                                    case DanmakuAlignmentMode.LowerCenter:
                                                    case DanmakuAlignmentMode.MiddleCenter:
                                                    case DanmakuAlignmentMode.UpperCenter:
                                                        {
                                                            renderItem.StartX -= renderItem.Width / 2;
                                                            renderItem.EndX -= renderItem.Width / 2;
                                                            break;
                                                        }
                                                    case DanmakuAlignmentMode.LowerRight:
                                                    case DanmakuAlignmentMode.MiddleRight:
                                                    case DanmakuAlignmentMode.UpperRight:
                                                        {
                                                            renderItem.StartX -= renderItem.Width;
                                                            renderItem.EndX -= renderItem.Width;
                                                            break;
                                                        }
                                                }

                                                switch (renderItem.AnchorMode)
                                                {
                                                    case DanmakuAlignmentMode.LowerLeft:
                                                    case DanmakuAlignmentMode.LowerCenter:
                                                    case DanmakuAlignmentMode.LowerRight:
                                                        {
                                                            renderItem.StartY -= renderItem.Height;
                                                            renderItem.EndY -= renderItem.Height;
                                                            break;
                                                        }
                                                    case DanmakuAlignmentMode.MiddleLeft:
                                                    case DanmakuAlignmentMode.MiddleCenter:
                                                    case DanmakuAlignmentMode.MiddleRight:
                                                        {
                                                            renderItem.StartY -= renderItem.Height / 2;
                                                            renderItem.EndY -= renderItem.Height / 2;
                                                            break;
                                                        }
                                                }
                                            }
                                        }
                                        else
                                        {
                                            if (renderItem.AlignmentMode == DanmakuAlignmentMode.LowerLeft
                                                || renderItem.AlignmentMode == DanmakuAlignmentMode.MiddleLeft
                                                || renderItem.AlignmentMode == DanmakuAlignmentMode.UpperLeft)
                                            {
                                                renderItem.StartX = renderItem.MarginLeft;
                                            }
                                            else if (renderItem.AlignmentMode == DanmakuAlignmentMode.LowerCenter
                                                || renderItem.AlignmentMode == DanmakuAlignmentMode.MiddleCenter
                                                || renderItem.AlignmentMode == DanmakuAlignmentMode.UpperCenter)
                                            {
                                                renderItem.StartX = (CanvasWidth - renderItem.Width) / 2;
                                            }
                                            else if (renderItem.AlignmentMode == DanmakuAlignmentMode.LowerRight
                                                || renderItem.AlignmentMode == DanmakuAlignmentMode.MiddleRight
                                                || renderItem.AlignmentMode == DanmakuAlignmentMode.UpperRight)
                                            {
                                                renderItem.StartX = CanvasWidth - renderItem.Width - renderItem.MarginRight;
                                            }

                                            if (renderItem.AlignmentMode == DanmakuAlignmentMode.LowerLeft
                                                || renderItem.AlignmentMode == DanmakuAlignmentMode.LowerCenter
                                                || renderItem.AlignmentMode == DanmakuAlignmentMode.LowerRight)
                                            {
                                                renderItem.StartY = CanvasHeight - renderItem.Height - renderItem.MarginBottom;
                                            }
                                            else if (renderItem.AlignmentMode == DanmakuAlignmentMode.MiddleLeft
                                                || renderItem.AlignmentMode == DanmakuAlignmentMode.MiddleCenter
                                                || renderItem.AlignmentMode == DanmakuAlignmentMode.MiddleRight)
                                            {
                                                renderItem.StartY = (CanvasHeight - renderItem.Width) / 2;
                                            }
                                            else if (renderItem.AlignmentMode == DanmakuAlignmentMode.UpperLeft
                                                || renderItem.AlignmentMode == DanmakuAlignmentMode.UpperCenter
                                                || renderItem.AlignmentMode == DanmakuAlignmentMode.UpperRight)
                                            {
                                                renderItem.StartY = 0;
                                            }

                                            renderItem.EndX = renderItem.StartX;
                                            renderItem.EndY = renderItem.StartY;
                                        }
                                        renderItem.TranslationSpeedX = renderItem.DefinedTranslationDurationMs > 0 ? (renderItem.EndX - renderItem.StartX) / renderItem.DefinedTranslationDurationMs : 0;
                                        renderItem.TranslationSpeedY = renderItem.DefinedTranslationDurationMs > 0 ? (renderItem.EndY - renderItem.StartY) / renderItem.DefinedTranslationDurationMs : 0;

                                        break;
                                    }
                                case DanmakuMode.Subtitle:
                                    {
                                        renderItem.StartY = Subtitle_StartY;
                                        break;
                                    }
                            }
                            renderItem.X = renderItem.StartX;

                            if (_autoControlDensity && renderItem.AllowDensityControl && !renderItem.NeedToReleaseYSlot)
                            {
                                // Skip rendering due to _autoControlDensity
                                renderItem.Dispose();
                                return;
                            }

                            using (CanvasGeometry geometry = CanvasGeometry.CreateText(textLayout))
                            {
                                drawingSession.Clear(Colors.Transparent);

                                if (renderItem.HasBorder || DebugMode)
                                {
                                    drawingSession.DrawRectangle(0, 0, renderItem.Width, renderItem.Height, _borderColor, 4f);
                                }
                                if (renderItem.HasOutline)
                                {
                                    Color outlineColor = renderItem.TextColor.R + renderItem.TextColor.G + renderItem.TextColor.B < 0x20 ? Colors.White : renderItem.OutlineColor;
                                    outlineColor.A = renderItem.TextColor.A;

                                    drawingSession.DrawGeometry(geometry, 0, 0, outlineColor, renderItem.OutlineSize);
                                }
                                drawingSession.FillGeometry(geometry, 0, 0, renderItem.TextColor);

                                if (renderItem.Mode == DanmakuMode.Advanced && (renderItem.DefinedRotateY >= 0.01f || renderItem.DefinedRotateY <= -0.01f))
                                {
                                    renderItem.TransformEffect = new Transform3DEffect();
                                    Matrix4x4 matrix1 = Matrix4x4.CreateTranslation(-renderItem.Width / 2, -renderItem.Height / 2, 0); // Set origin of coordinate to center
                                    Matrix4x4 matrix2 = Matrix4x4.Identity;
                                    if (renderItem.DefinedRotateZ >= 0.01f || renderItem.DefinedRotateZ <= -0.01f)
                                    {
                                        float radianZ = DegreeToRadian(renderItem.DefinedRotateZ);
                                        matrix2 = Matrix4x4.CreateRotationZ(radianZ);
                                    }
                                    float radianY = DegreeToRadian(renderItem.DefinedRotateY);
                                    matrix2 *= Matrix4x4.CreateRotationY(radianY);
                                    matrix2.M14 = (float)-((1 / renderItem.Width) * Math.Sin(radianY)); // Perspective transform
                                    Matrix4x4 matrix3 = Matrix4x4.CreateTranslation(renderItem.Width / 2, renderItem.Height / 2, 0); // Move back to original position
                                    renderItem.TransformEffect.TransformMatrix = matrix1 * matrix2 * matrix3;
                                    renderItem.TransformEffect.Source = renderItem.RenderTarget;
                                    renderItem.SourceRect = renderItem.TransformEffect.GetBounds(renderItem.RenderTarget);
                                }
                            }
                        }
                    }
                }

                lock (_renderLayerList[layerId].RenderList)
                {
                    _renderLayerList[layerId].RenderList.Add(renderItem);
                }
            }
            catch (Exception ex)
            {
                Logger.Log(ex.Message);
                if (_device.IsDeviceLost(ex.HResult))
                {
                    _device.RaiseDeviceLost();
                    // Remove all item referencing old device
                    for (uint i = 0; i < _renderLayerList.Length; i++)
                    {
                        _renderLayerList[i].Clear();
                    }
                }
            }
        }

        public void SetRenderState(bool renderDanmaku, bool renderSubtitle)
        {
            _isDanmakuEnabled = renderDanmaku;
            _isSubtitleEnabled = renderSubtitle;
            if (!renderDanmaku)
            {
                for (uint layerId = 0; layerId < _renderLayerList.Length; layerId++)
                {
                    if (!_renderLayerList[layerId].IsSubtitleLayer)
                    {
                        _renderLayerList[layerId].Clear();
                    }
                }
            }
            if (!renderSubtitle)
            {
                for (uint layerId = 0; layerId < _renderLayerList.Length; layerId++)
                {
                    if (_renderLayerList[layerId].IsSubtitleLayer)
                    {
                        _renderLayerList[layerId].Clear();
                    }
                }
            }
            if (_canvas != null)
            {
                bool startRender = renderDanmaku || renderSubtitle;
                if (!startRender)
                {
                    Pause();
                    Stop();
                }
                else if (startRender && (!renderDanmaku || !renderSubtitle) && _canvas.Paused)
                {
                    Start();
                }
            }
        }

        public void SetLayerRenderState(uint layerId, bool render)
        {
            _renderLayerList[layerId].IsEnabled = render;
        }

        public void SetSubtitleLayer(uint layerId)
        {
            _renderLayerList[layerId].SetSubtitleLayer(true);
        }

        public void ClearLayer(uint layerId)
        {
            _renderLayerList[layerId].Clear();
        }

        public void Clear()
        {
            for (int i = 0; i < _renderLayerList.Length; i++)
            {
                _renderLayerList[i].Clear();
            }

            Debug.WriteLine("DanmakuRender is cleared");
        }

        public void Start()
        {
            if (_isDanmakuEnabled || _isSubtitleEnabled)
            {
                Debug.WriteLine("DanmakuRender is started");

                if (_canvas != null)
                {
                    _canvas.Paused = false;
                    _canvas.Dispatcher?.RunAsync(CoreDispatcherPriority.Normal, async () =>
                    {
                        await Task.Delay(50); // Wait for CanvasAnimatedControl_Draw is called at least once to clear canvas first 
                        if (_canvas != null && !_isStopped)
                        {
                            _canvas.Visibility = Visibility.Visible;
                        }
                    });
                }
                _isStopped = false;
            }
        }

        public void Pause()
        {
            if (_canvas != null)
            {
                _canvas.Paused = true;
            }

            Debug.WriteLine("DanmakuRender is paused");
        }

        public void Stop()
        {
            _isStopped = true;
            Clear();
            if (_canvas != null)
            {
                _canvas.Dispatcher?.RunAsync(CoreDispatcherPriority.Normal, () =>
                {
                    if (_canvas != null)
                    {
                        _canvas.Visibility = Visibility.Collapsed;
                    }
                });
            }

            Logger.Log("DanmakuRender is stopped");
        }

        public void Close()
        {
            Stop();
            if (_canvas != null)
            {
                _canvas.Paused = true;
                _canvas.SizeChanged -= CanvasAnimatedControl_SizeChanged;
                _canvas.CreateResources -= CanvasAnimatedControl_CreateResources;
                _canvas.Update -= CanvasAnimatedControl_Update;
                _canvas.Draw -= CanvasAnimatedControl_Draw;
                _canvas = null;
            }

            Logger.Log("DanmakuRender is closed");
        }

        private void CanvasAnimatedControl_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            CanvasWidth = (float)e.NewSize.Width;
            CanvasHeight = (float)e.NewSize.Height;
            for (int i = 0; i < _renderLayerList.Length; i++)
            {
                _renderLayerList[i].UpdateYSlotManagerLength((uint)e.NewSize.Height, _rollingAreaRatio);
            }
            Logger.Log($"Update canvas size: {CanvasWidth}x{CanvasHeight}");
        }

        private void CanvasAnimatedControl_CreateResources(CanvasAnimatedControl sender, CanvasCreateResourcesEventArgs args)
        {
            Logger.Log(args.Reason.ToString());
            if (args.Reason == CanvasCreateResourcesReason.NewDevice)
            {
                try
                {
                    _device?.RaiseDeviceLost();
                }
                catch (Exception ex)
                {
                    Logger.Log($"RaiseDeviceLost() failed: {ex.Message}");
                }
            }
            _device = sender.Device;
            _maxDanmakuSize = sender.Dpi > 0 ? (int)(_device.MaximumBitmapSizeInPixels / (sender.Dpi / 96)) : 0; // https://microsoft.github.io/Win2D/html/DPI.htm
        }

        private void CanvasAnimatedControl_Update(ICanvasAnimatedControl sender, CanvasAnimatedUpdateEventArgs args)
        {
            for (uint layerId = 0; layerId < _renderLayerList.Length; layerId++)
            {
                DanmakuYSlotManager ySlotManager = _renderLayerList[layerId].YSlotManager;

                List<DanmakuRenderItem> renderList = _renderLayerList[layerId].RenderList;
                lock (renderList)
                {
                    for (int i = renderList.Count - 1; i >= 0; i--)
                    {
                        if (_isStopped)
                        {
                            return;
                        }

                        DanmakuRenderItem renderItem = renderList[i];
                        if (!renderItem.IsFirstRenderTimeSet)
                        {
                            renderItem.FirstRenderTime = args.Timing.TotalTime;
                            renderItem.IsFirstRenderTimeSet = true;
                        }
                        float elapsedMs = (float)args.Timing.ElapsedTime.TotalMilliseconds;
                        float durationMs = (float)(args.Timing.TotalTime - renderItem.FirstRenderTime).TotalMilliseconds;
                        bool removeItem = false;

                        // Do layout and rendering
                        switch (renderItem.Mode)
                        {
                            case DanmakuMode.Rolling:
                                {
                                    if (!sender.Paused)
                                    {
                                        renderItem.X -= elapsedMs * AdjustRollingSpeedByWidth(_rollingSpeed, renderItem.Width);
                                    }
                                    if (renderItem.NeedToReleaseYSlot && renderItem.X < CanvasWidth - renderItem.Width - 48)
                                    {
                                        ySlotManager.ReleaseYSlot(renderItem.Id, (uint)renderItem.StartY);
                                        renderItem.NeedToReleaseYSlot = false;
                                    }
                                    if (renderItem.X < -renderItem.Width)
                                    {
                                        removeItem = true;
                                    }

                                    break;
                                }
                            case DanmakuMode.Bottom:
                            case DanmakuMode.Top:
                                {
                                    renderItem.X = (CanvasWidth - renderItem.Width) / 2;
                                    float maxDurationMs = renderItem.DefinedDurationMs > 0 ? renderItem.DefinedDurationMs : Default_BottomAndTop_Duration_Ms;
                                    if (durationMs > maxDurationMs)
                                    {
                                        removeItem = true;
                                        if (renderItem.NeedToReleaseYSlot)
                                        {
                                            ySlotManager.ReleaseYSlot(renderItem.Id, (uint)renderItem.StartY);
                                        }
                                    }

                                    break;
                                }
                            case DanmakuMode.ReverseRolling:
                                {
                                    if (!sender.Paused)
                                    {
                                        renderItem.X += elapsedMs * AdjustRollingSpeedByWidth(_rollingSpeed, renderItem.Width);
                                    }
                                    if (renderItem.NeedToReleaseYSlot && renderItem.X > 48f)
                                    {
                                        ySlotManager.ReleaseYSlot(renderItem.Id, (uint)renderItem.StartY);
                                        renderItem.NeedToReleaseYSlot = false;
                                    }
                                    if (renderItem.X >= CanvasWidth)
                                    {
                                        removeItem = true;
                                    }

                                    break;
                                }
                            case DanmakuMode.Advanced:
                                {
                                    if (durationMs <= renderItem.DefinedDurationMs)
                                    {
                                        if (durationMs >= renderItem.DefinedTranslationDelayMs)
                                        {
                                            if (durationMs < renderItem.DefinedTranslationDelayMs + renderItem.DefinedTranslationDurationMs)
                                            {
                                                renderItem.X = renderItem.StartX + renderItem.TranslationSpeedX * (durationMs - renderItem.DefinedTranslationDelayMs);
                                                renderItem.Y = renderItem.StartY + renderItem.TranslationSpeedY * (durationMs - renderItem.DefinedTranslationDelayMs);
                                            }
                                            else
                                            {
                                                renderItem.X = renderItem.EndX;
                                                renderItem.Y = renderItem.EndY;
                                            }
                                        }

                                        if (durationMs >= renderItem.DefinedAlphaDelayMs)
                                        {
                                            if (renderItem.DefinedEndAlpha != renderItem.DefinedStartAlpha)
                                            {
                                                if (durationMs < renderItem.DefinedAlphaDelayMs + renderItem.DefinedAlphaDurationMs)
                                                {
                                                    renderItem.Alpha = (byte)(renderItem.DefinedStartAlpha + (renderItem.DefinedEndAlpha - renderItem.DefinedStartAlpha) * (durationMs - renderItem.DefinedAlphaDelayMs) / renderItem.DefinedAlphaDurationMs);
                                                }
                                                else
                                                {
                                                    renderItem.Alpha = renderItem.DefinedEndAlpha;
                                                }
                                            }
                                        }
                                    }
                                    else
                                    {
                                        removeItem = true;
                                    }

                                    break;
                                }
                            case DanmakuMode.Subtitle:
                                {
                                    // Allow only one subtitle in render list
                                    if ((renderList.Count > 1 && i < renderList.Count - 1) || durationMs > renderItem.DefinedDurationMs)
                                    {
                                        removeItem = true;
                                    }
                                    else
                                    {
                                        renderItem.X = (CanvasWidth - renderItem.Width) / 2;
                                    }

                                    break;
                                }
                        }

                        if (removeItem)
                        {
                            renderItem.Dispose();
                            renderList.RemoveAt(i);
                        }
                    }
                }
            }
        }

        private void CanvasAnimatedControl_Draw(ICanvasAnimatedControl sender, CanvasAnimatedDrawEventArgs args)
        {
            try
            {
                int totalCount = 0;

                for (uint layerId = 0; layerId < _renderLayerList.Length; layerId++)
                {
                    if (!_renderLayerList[layerId].IsEnabled)
                    {
                        continue;
                    }

                    List<DanmakuRenderItem> renderList = _renderLayerList[layerId].RenderList;
                    if (renderList.Count == 0)
                    {
                        continue;
                    }

                    // https://microsoft.github.io/Win2D/html/T_Microsoft_Graphics_Canvas_CanvasSpriteSortMode.htm
                    CanvasSpriteSortMode spriteSortMode = !_renderLayerList[layerId].RequireStrictRenderOrder ? CanvasSpriteSortMode.Bitmap : CanvasSpriteSortMode.None;
                    using (CanvasSpriteBatch spriteBatch = args.DrawingSession.CreateSpriteBatch(spriteSortMode))
                    {
                        lock (renderList)
                        {
                            // First come first render
                            for (int i = 0; i < renderList.Count; i++)
                            {
                                if (_isStopped)
                                {
                                    return;
                                }

                                DanmakuRenderItem renderItem = renderList[i];
                                totalCount++;

                                if (!renderItem.IsFirstRenderTimeSet)
                                {
                                    // Wait for Update event for this item before rendering
                                    continue;
                                }

                                switch (renderItem.Mode)
                                {
                                    case DanmakuMode.Rolling:
                                    case DanmakuMode.ReverseRolling:
                                        {
                                            spriteBatch.Draw(renderItem.RenderTarget, new Vector2(renderItem.X, renderItem.StartY));

                                            break;
                                        }
                                    case DanmakuMode.Bottom:
                                        {
                                            float y = Math.Max((_noOverlapSubtitle ? Math.Max(CanvasHeight - 100f, CanvasHeight * 0.8f) : CanvasHeight) - renderItem.Height - renderItem.StartY, 0);
                                            y -= renderItem.MarginBottom;

                                            spriteBatch.Draw(renderItem.RenderTarget, new Vector2(renderItem.X, y));

                                            break;
                                        }
                                    case DanmakuMode.Top:
                                        {
                                            spriteBatch.Draw(renderItem.RenderTarget, new Vector2(renderItem.X, renderItem.StartY));

                                            break;
                                        }
                                    case DanmakuMode.Advanced:
                                        {
                                            float opacity = (float)renderItem.Alpha / byte.MaxValue;

                                            if (renderItem.TransformEffect != null)
                                            {
                                                Rect targetRect = renderItem.SourceRect;
                                                targetRect.X += renderItem.X;
                                                targetRect.Y += renderItem.Y;

                                                // Draw Transform3DEffect directly in the DrawingSession since CanvasSpriteBatch.Draw() doesn't support Matrix4x4 transform matrix yet.
                                                // This may cause rendering order issue since this object is rendered prior to the spriteBatch.
                                                args.DrawingSession.DrawImage(renderItem.TransformEffect, targetRect, renderItem.SourceRect, opacity);
                                            }
                                            else
                                            {
                                                Vector4 tintVector = Vector4.One;
                                                tintVector.W = opacity;

                                                if (renderItem.DefinedRotateZ >= 0.01f || renderItem.DefinedRotateZ <= -0.01f)
                                                {
                                                    //Rotation on Z-axis only
                                                    Vector2 posVector = new Vector2(renderItem.X + renderItem.Width / 2, renderItem.Y + renderItem.Height / 2);
                                                    Vector2 originVector = new Vector2(renderItem.Width / 2, renderItem.Height / 2);
                                                    float radianZ = DegreeToRadian(renderItem.DefinedRotateZ);

                                                    spriteBatch.Draw(renderItem.RenderTarget, posVector, tintVector, originVector, radianZ, Vector2.One, CanvasSpriteFlip.None);
                                                }
                                                else
                                                {
                                                    spriteBatch.Draw(renderItem.RenderTarget, new Vector2(renderItem.X, renderItem.Y), tintVector);
                                                }
                                            }

                                            break;
                                        }
                                    case DanmakuMode.Subtitle:
                                        {
                                            float y = CanvasHeight - renderItem.Height - renderItem.StartY;

                                            using (args.DrawingSession.CreateLayer(0.7f))
                                            {
                                                args.DrawingSession.FillRectangle(renderItem.X - 4, y - 4, renderItem.Width + 8, renderItem.Height + 8, Colors.Black);
                                            }

                                            spriteBatch.Draw(renderItem.RenderTarget, new Vector2(renderItem.X, y));

                                            break;
                                        }
                                }
                            }
                        }
                    }
                }

                if (DebugMode)
                {
                    if (args.Timing.ElapsedTime.TotalMilliseconds > 0)
                    {
                        int fps = (int)(1000 / args.Timing.ElapsedTime.TotalMilliseconds);
                        args.DrawingSession.FillRectangle(0, 0, 410, 30, fps >= 30 ? Colors.Gray : Colors.Red);
                        ulong memoryUsage = MemoryManager.AppMemoryUsage / (1024 * 1024);
                        string debugText = $"fps:{fps} count:{totalCount} {(int)CanvasWidth}x{(int)CanvasHeight} {memoryUsage:D}MB/{(ulong)_appMemoryLimitMb:D}MB";
                        args.DrawingSession.DrawText(debugText, 0, 0, Colors.LightGreen);
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Log(ex.Message);
                if (_device.IsDeviceLost(ex.HResult))
                {
                    Logger.Log("Device is lost!");
                }
            }
            finally
            {
                args.DrawingSession?.Dispose();
            }
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static float DegreeToRadian(float degree)
        {
            return degree * (float)Math.PI / 180f;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static float AdjustRollingSpeedByWidth(float rollingSpeed, float width)
        {
            return rollingSpeed * (Math.Min(width * 0.0015f, 0.2f) + 1f);
        }

        [DebuggerDisplay("{Text} at {FirstRenderTime.TotalMilliseconds}")]
        private class DanmakuRenderItem
        {
            public readonly uint Id;
            public readonly bool HasBorder;
            public readonly bool HasOutline;
            public readonly bool AllowDensityControl;
            public readonly float FontSize;
            public readonly float OutlineSize;
            public readonly string FontFamilyName;
            public readonly string Text;
            public readonly bool? IsBold;
            public readonly DanmakuMode Mode;
            public readonly Color TextColor;
            public readonly Color OutlineColor;

            public volatile bool IsFirstRenderTimeSet;
            public TimeSpan FirstRenderTime;
            public CanvasRenderTarget RenderTarget;
            public Transform3DEffect TransformEffect;
            public Rect SourceRect;

            public volatile float Width;
            public volatile float Height;
            public volatile float X;
            public volatile float Y;
            public volatile bool NeedToReleaseYSlot;

            #region For Advanced mode

            public readonly float DefinedStartX;
            public readonly float DefinedStartY;
            public readonly float DefinedEndX;
            public readonly float DefinedEndY;

            public int MarginLeft;
            public int MarginRight;
            public int MarginBottom;
            public readonly DanmakuAlignmentMode AlignmentMode;
            public readonly DanmakuAlignmentMode AnchorMode;

            public readonly byte DefinedStartAlpha;
            public readonly byte DefinedEndAlpha;

            public readonly ulong DefinedDurationMs;
            public readonly ulong DefinedTranslationDurationMs;
            public readonly ulong DefinedTranslationDelayMs;
            public readonly ulong DefinedAlphaDurationMs;
            public readonly ulong DefinedAlphaDelayMs;

            /// <summary>
            /// Degree
            /// </summary>
            public readonly float DefinedRotateZ;
            /// <summary>
            /// Degree
            /// </summary>
            public readonly float DefinedRotateY;

            public volatile float StartX;
            /// <summary>
            /// Starting Y position of which direction is according to mode
            /// </summary>
            public volatile float StartY;
            public volatile float EndX;
            public volatile float EndY;
            public volatile float TranslationSpeedX;
            public volatile float TranslationSpeedY;
            public volatile byte Alpha;

            #endregion

            private static uint _nextId = 1;

            public DanmakuRenderItem(DanmakuItem danmakuItem)
            {
                Id = GetNextId();
                HasBorder = danmakuItem.HasBorder;
                HasOutline = danmakuItem.HasOutline;
                AllowDensityControl = danmakuItem.AllowDensityControl;
                FontSize = danmakuItem.BaseFontSize;
                OutlineSize = danmakuItem.OutlineSize;
                FontFamilyName = danmakuItem.FontFamilyName;
                Text = danmakuItem.Text;
                IsBold = danmakuItem.IsBold;
                Mode = danmakuItem.Mode;
                TextColor = danmakuItem.TextColor;
                OutlineColor = danmakuItem.OutlineColor;

                if (Mode == DanmakuMode.Top
                    || Mode == DanmakuMode.Bottom
                    || Mode == DanmakuMode.Advanced)
                {
                    MarginBottom = danmakuItem.MarginBottom;
                    DefinedDurationMs = danmakuItem.DurationMs;
                }

                if (Mode == DanmakuMode.Advanced)
                {
                    DefinedStartX = danmakuItem.StartX;
                    DefinedStartY = danmakuItem.StartY;
                    DefinedEndX = danmakuItem.EndX;
                    DefinedEndY = danmakuItem.EndY;
                    MarginLeft = danmakuItem.MarginLeft;
                    MarginRight = danmakuItem.MarginRight;
                    AlignmentMode = danmakuItem.AlignmentMode;
                    AnchorMode = danmakuItem.AnchorMode;
                    DefinedStartAlpha = danmakuItem.StartAlpha;
                    DefinedEndAlpha = danmakuItem.EndAlpha;
                    TextColor.A = byte.MaxValue; // Always draw initial advanced danmaku at full opacity and use Alpha to control the rendering opacity
                    Alpha = DefinedStartAlpha;
                    DefinedTranslationDurationMs = danmakuItem.TranslationDurationMs;
                    DefinedTranslationDelayMs = danmakuItem.TranslationDelayMs;
                    DefinedAlphaDurationMs = danmakuItem.AlphaDurationMs;
                    DefinedAlphaDelayMs = danmakuItem.AlphaDelayMs;
                    DefinedRotateZ = danmakuItem.RotateZ;
                    DefinedRotateY = danmakuItem.RotateY;
                }
                else if (Mode == DanmakuMode.Subtitle)
                {
                    DefinedDurationMs = danmakuItem.DurationMs;
                }
            }

            public void Dispose()
            {
                if (RenderTarget != null)
                {
                    RenderTarget.Dispose();
                    RenderTarget = null;
                }
                if (TransformEffect != null)
                {
                    TransformEffect.Dispose();
                    TransformEffect = null;
                }
            }

            private static uint GetNextId()
            {
                if (_nextId == 0)
                {
                    // Avoid 0 as id value
                    _nextId = 1;
                }
                return _nextId++;
            }
        }

        [DebuggerDisplay("IsEnabled:{IsEnabled} Count:{RenderList.Count}")]
        private class RenderLayer
        {
            /// <summary>
            /// 0 (lowest) --> higher (topmost)
            /// </summary>
            private readonly uint LayerId;

            public readonly List<DanmakuRenderItem> RenderList = new List<DanmakuRenderItem>();
            public readonly DanmakuYSlotManager YSlotManager = new DanmakuYSlotManager(0);
            public readonly bool RequireStrictRenderOrder;
            public bool IsEnabled = true;

            public bool IsSubtitleLayer
            {
                get; private set;
            }

            public RenderLayer(uint layerId, bool requireStrictRenderOrder)
            {
                LayerId = layerId;
                RequireStrictRenderOrder = requireStrictRenderOrder;
            }

            public void UpdateYSlotManagerLength(uint newLength, float rollingLayerAreaRatio)
            {
                if (LayerId == DanmakuDefaultLayerDef.RollingLayerId || LayerId == DanmakuDefaultLayerDef.ReverseRollingLayerId)
                {
                    YSlotManager.UpdateLength((uint)(newLength * rollingLayerAreaRatio));
                }
                else if (LayerId == DanmakuDefaultLayerDef.TopLayerId)
                {
                    YSlotManager.UpdateLength((uint)(newLength * 0.75));
                }
                else if (LayerId == DanmakuDefaultLayerDef.BottomLayerId)
                {
                    YSlotManager.UpdateLength(newLength / 2);
                }
                else
                {
                    YSlotManager.UpdateLength(newLength);
                }
            }

            /// <summary>
            /// Thread safe
            /// </summary>
            public void Clear()
            {
                lock (RenderList)
                {
                    for (int i = 0; i < RenderList.Count; i++)
                    {
                        RenderList[i].Dispose();
                    }
                    RenderList.Clear();
                }
                YSlotManager.Clear();
            }

            public void SetSubtitleLayer(bool isSubtitleLayer)
            {
                IsSubtitleLayer = isSubtitleLayer;
            }
        }
    }
}
