﻿using Microsoft.Graphics.Canvas.Text;
using Microsoft.Graphics.Canvas.UI.Xaml;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using Windows.Foundation;
using Windows.Foundation.Diagnostics;
using Windows.UI;

namespace Atelier39
{
    public class DanmakuFrostMaster
    {
        public const uint DefaultDanmakuLayerCount = DanmakuDefaultLayerDef.DefaultLayerCount;

        private readonly DanmakuRender _render;
        private readonly Queue<uint> _updateTimeQueue = new Queue<uint>();
        private readonly AutoResetEvent _updateEvent = new AutoResetEvent(false);
        private readonly ManualResetEventSlim _pauseEvent = new ManualResetEventSlim(true);
        private List<DanmakuItem> _danmakuList = new List<DanmakuItem>();
        private volatile bool _hasSubtitle;
        private volatile bool _isRenderEnabled;
        private volatile bool _isSeeking;
        private volatile bool _isClosing;
        private volatile int _lastIndex;
        private volatile uint _lastTimeMs;
        private volatile int _subtitleIndexAfterSeek = -1;

        public bool DebugMode
        {
            get => _render.DebugMode;
            set => _render.DebugMode = value;
        }

        /// <summary>
        /// Must be called in UI thread
        /// </summary>
        /// <param name="rollingAreaRatio">Rolling area ratio = value * 0.1 (value: 1 to 10)</param>
        public DanmakuFrostMaster(CanvasAnimatedControl canvas, LoggingChannel loggingChannel = null)
        {
            Logger.SetLogger(loggingChannel);

            _render = new DanmakuRender(canvas);

            Windows.System.Threading.ThreadPool.RunAsync(Updater_DoWork).AsTask();
            _isRenderEnabled = true;

            Logger.Log("DanmakuFrostMaster is created");
        }

        public void SetAutoControlDensity(bool value)
        {
            _render.SetAutoControlDensity(value);
        }

        /// <summary>
        /// Default: -1
        /// 1->10 2->20 3->30 4-50 -1->unlimited
        /// </summary>
        public void SetRollingDensity(int value)
        {
            _render.SetRollingDensity(value);
        }

        /// <summary>
        /// Default: 9
        /// </summary>
        /// <param name="value">in (0,10]</param>
        public void SetRollingAreaRatio(int value)
        {
            _render.SetRollingAreaRatio(value);
        }

        /// <summary>
        /// Default: 5
        /// speed = value * 0.02
        /// </summary>
        /// <param name="value">in [1,10]</param>
        public void SetRollingSpeed(int value)
        {
            _render.SetRollingSpeed(value);
        }

        /// <param name="value">in [0,1]</param>
        public void SetOpacity(double value)
        {
            _render.SetOpacity(value);
        }

        public void SetIsTextBold(bool value)
        {
            _render.SetIsTextBold(value);
        }

        public void SetDanmakuFontSizeOffset(int value)
        {
            _render.SetDanmakuFontSizeOffset(value);
        }
        
        public void SetDanmakuFontSizeOffset(DanmakuFontSize value)
        {
            _render.SetDanmakuFontSizeOffset(value);
        }

        public void SetSubtitleFontSize(DanmakuFontSize value)
        {
            _render.SetSubtitleFontSizeOffset(value);
        }

        /// <summary>
        /// Null or empty to use system default
        /// </summary>
        public void SetFontFamilyName(string value)
        {
            _render.SetDefaultFontFamilyName(value);
        }

        public void SetBorderColor(Color borderColor)
        {
            _render.SetBorderColor(borderColor);
        }

        public void SetNoOverlapSubtitle(bool value)
        {
            _render.SetNoOverlapSubtitle(value);
        }

        public void UpdateTime(uint currentMs)
        {
            lock (_updateTimeQueue)
            {
                _updateTimeQueue.Enqueue(currentMs);
            }
            _updateEvent.Set();
        }

        public void Pause()
        {
            if (!_isClosing)
            {
                _pauseEvent.Reset();
                _render.Pause();
            }
        }

        public void Resume()
        {
            _render.Start();
            _pauseEvent.Set();
        }

        public void Stop()
        {
            Pause();
            _render.Stop();
            lock (_updateTimeQueue)
            {
                _updateTimeQueue.Clear();
            }
        }

        public void Restart()
        {
            Seek(0);
        }

        public void SetRenderState(bool renderDanmaku, bool renderSubtitle)
        {
            _isRenderEnabled = renderDanmaku || renderSubtitle;
            _render.SetRenderState(renderDanmaku, renderSubtitle);
        }

        public void SetLayerRenderState(uint layerId, bool render)
        {
            _render.SetLayerRenderState(layerId, render);
        }

        public void SetSubtitleLayer(uint layerId)
        {
            _render.SetSubtitleLayer(layerId);
        }

        public void Seek(uint targetMs)
        {
            _isSeeking = true;
            Stop();
            lock (_danmakuList)
            {
                _lastIndex = 0;
                if (_danmakuList.Count > 0)
                {
                    while (_danmakuList[_lastIndex].StartMs < targetMs)
                    {
                        _lastIndex++;
                        if (_lastIndex >= _danmakuList.Count)
                        {
                            break;
                        }
                    }
                    if (_hasSubtitle)
                    {
                        _render.ClearLayer(DanmakuDefaultLayerDef.SubtitleLayerId);
                        int index = _lastIndex - 1;
                        while (index >= 0 && _danmakuList[index].Mode != DanmakuMode.Subtitle)
                        {
                            index--;
                        }
                        if (index >= 0 && index != _lastIndex && _danmakuList[index].StartMs + _danmakuList[index].DurationMs > targetMs)
                        {
                            _subtitleIndexAfterSeek = index;
                        }
                    }
                }
                _lastTimeMs = targetMs;
                Resume();
                _isSeeking = false;
            }
        }

        public void Clear()
        {
            _danmakuList?.Clear();
        }

        public void Close()
        {
            if (!_isClosing)
            {
                _isRenderEnabled = false;
                _isClosing = true;

                _pauseEvent.Set();
                _updateEvent.Set();
                _render.Close();

                Logger.Log("DanmakuFrostMaster is closed");
            }
        }

        public void AddRealtimeDanmaku(DanmakuItem item, bool insertToList, uint layerId = DanmakuDefaultLayerDef.DefaultLayerId)
        {
            item.AllowDensityControl = false;
            item.IsRealtime = true;
            _render.RenderDanmakuItem(layerId, item);
            if (insertToList)
            {
                lock (_danmakuList)
                {
                    bool added = false;
                    for (int i = 0; i < _danmakuList.Count; i++)
                    {
                        if (_danmakuList[i].StartMs > item.StartMs)
                        {
                            _danmakuList.Insert(i, item);
                            added = true;
                            break;
                        }
                    }
                    if (!added)
                    {
                        // No danmaku in current list
                        _danmakuList.Add(item);
                    }
                }
            }
        }

        /// <param name="danmakuList">Must be pre-ordered by StartMs</param>
        public void SetDanmakuList(List<DanmakuItem> danmakuList)
        {
            Clear();
            _lastIndex = 0;
            _danmakuList = danmakuList ?? new List<DanmakuItem>();
        }

        /// <param name="subtitleList">Must be pre-ordered by StartMs</param>
        public void SetSubtitleList(IList<DanmakuItem> subtitleList)
        {
            _render.ClearLayer(DanmakuDefaultLayerDef.SubtitleLayerId);
            lock (_danmakuList)
            {
                for (int i = _danmakuList.Count - 1; i >= 0; i--)
                {
                    if (_danmakuList[i].Mode == DanmakuMode.Subtitle)
                    {
                        _danmakuList.RemoveAt(i);
                    }
                }

                if (subtitleList.Count > 0)
                {
                    _hasSubtitle = true;

                    int index1 = 0, index2 = 0;
                    while (index1 < _danmakuList.Count && index2 < subtitleList.Count)
                    {
                        if (_danmakuList[index1].StartMs > subtitleList[index2].StartMs)
                        {
                            _danmakuList.Insert(index1, subtitleList[index2]);
                            if (_lastTimeMs > 0 && subtitleList[index2].StartMs < _lastTimeMs && subtitleList[index2].StartMs + subtitleList[index2].DurationMs > _lastTimeMs)
                            {
                                _render.RenderDanmakuItem(DanmakuDefaultLayerDef.SubtitleLayerId, subtitleList[index2]);
                            }
                            index2++;
                        }
                        index1++;
                    }
                    if (index1 == _danmakuList.Count && index2 < subtitleList.Count)
                    {
                        for (; index2 < subtitleList.Count; index2++)
                        {
                            _danmakuList.Add(subtitleList[index2]);
                            if (_lastTimeMs > 0 && subtitleList[index2].StartMs < _lastTimeMs && subtitleList[index2].StartMs + subtitleList[index2].DurationMs > _lastTimeMs)
                            {
                                _render.RenderDanmakuItem(DanmakuDefaultLayerDef.SubtitleLayerId, subtitleList[index2]);
                            }
                        }
                    }

                    if (_lastIndex >= _danmakuList.Count)
                    {
                        _lastIndex = _danmakuList.Count - 1;
                    }
                }
            }
        }

        public static List<string> GetSystemFontFamilyList()
        {
            List<string> fontList = CanvasTextFormat.GetSystemFontFamilies(new[] { "zh-CN" }).ToList();
            fontList.Sort();
            return fontList;
        }

        private void Updater_DoWork(IAsyncAction action)
        {
            try
            {
                while (!_isClosing)
                {
                    _updateEvent.WaitOne();
                    _pauseEvent.Wait();

                    uint currentTimeMs = 0;
                    lock (_updateTimeQueue)
                    {
                        if (_updateTimeQueue.Count > 0)
                        {
                            currentTimeMs = _updateTimeQueue.Dequeue();
                        }
                    }
                    if (currentTimeMs == 0)
                    {
                        continue;
                    }

                    lock (_danmakuList)
                    {
                        // Check if app/thread has been suspended for a while or danmaku engine has been restarted
                        if (currentTimeMs < _lastTimeMs || currentTimeMs - _lastTimeMs > 5000)
                        {
                            Logger.Log("Reseek after a long time suspension");
                            Seek(currentTimeMs);
                        }
                        else
                        {
                            _lastTimeMs = currentTimeMs;
                        }

                        bool subtitleRendered = false;
                        while (currentTimeMs > 0 && _lastIndex < _danmakuList.Count && _danmakuList[_lastIndex].StartMs <= currentTimeMs)
                        {
                            if (_isClosing)
                            {
                                return;
                            }
                            if (_isSeeking)
                            {
                                break;
                            }

                            bool skip = false;

                            if (_danmakuList[_lastIndex].IsRealtime)
                            {
                                _danmakuList[_lastIndex].IsRealtime = false;
                                skip = true;
                            }

                            if (!skip && _isRenderEnabled)
                            {
                                uint layerId;
                                switch (_danmakuList[_lastIndex].Mode)
                                {
                                    case DanmakuMode.Bottom:
                                        {
                                            layerId = DanmakuDefaultLayerDef.BottomLayerId;
                                            break;
                                        }
                                    case DanmakuMode.Top:
                                        {
                                            layerId = DanmakuDefaultLayerDef.TopLayerId;
                                            break;
                                        }
                                    case DanmakuMode.ReverseRolling:
                                        {
                                            layerId = DanmakuDefaultLayerDef.ReverseRollingLayerId;
                                            break;
                                        }
                                    case DanmakuMode.Advanced:
                                        {
                                            layerId = DanmakuDefaultLayerDef.AdvancedLayerId;
                                            break;
                                        }
                                    case DanmakuMode.Subtitle:
                                        {
                                            subtitleRendered = true;
                                            layerId = DanmakuDefaultLayerDef.SubtitleLayerId;
                                            break;
                                        }
                                    default:
                                        {
                                            layerId = DanmakuDefaultLayerDef.RollingLayerId;
                                            break;
                                        }
                                }
                                _render.RenderDanmakuItem(layerId, _danmakuList[_lastIndex]);
                            }

                            _lastIndex++;
                        }

                        if (_subtitleIndexAfterSeek >= 0 && _subtitleIndexAfterSeek < _danmakuList.Count)
                        {
                            if (!subtitleRendered)
                            {
                                _render.RenderDanmakuItem(DanmakuDefaultLayerDef.SubtitleLayerId, _danmakuList[_subtitleIndexAfterSeek]);
                            }
                            _subtitleIndexAfterSeek = -1;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Log(ex.Message);
            }
            finally
            {
                Logger.Log("Exited");
            }
        }
    }
}
