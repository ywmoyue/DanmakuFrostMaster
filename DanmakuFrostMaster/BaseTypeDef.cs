﻿using Windows.UI;

namespace Atelier39
{
    public enum DanmakuMode
    {
        Unknown = 0,
        Rolling = 1,
        Bottom = 4,
        Top = 5,
        ReverseRolling = 6,
        Advanced = 7,
        //Code = 8,
        Subtitle = 9
    }

    public enum DanmakuPool
    {
        Normal = 0,
        Subtitle = 1,
        Special = 2
    }

    public enum DanmakuFontSize
    {
        Smallest = 1,
        Smaller = 2,
        Normal = 3,
        Larger = 4,
        Largest = 5
    }

    public enum DanmakuAlignmentMode
    {
        Default = 0,
        LowerLeft = 1,
        LowerCenter = 2,
        LowerRight = 3,
        MiddleLeft = 4,
        MiddleCenter = 5,
        MiddleRight = 6,
        UpperLeft = 7,
        UpperCenter = 8,
        UpperRight = 9
    }

    public class DanmakuItem
    {
        public static float DefaultBaseFontSize = 22;

        /// <summary>
        /// Used to sort danmaku with the same StartMs
        /// </summary>
        public ulong Id;
        public uint StartMs;
        public bool HasBorder;
        public bool HasOutline = true;
        public bool AllowDensityControl = true;
        public bool IsRealtime;
        public float BaseFontSize;
        public float OutlineSize = 2f;
        public string FontFamilyName;
        public string Text;
        public bool? IsBold;
        public DanmakuMode Mode;
        public Color TextColor = Colors.White;
        public Color OutlineColor = Colors.Black;

        public int Weight;
        public string MidHash;

        #region For Advanced mode

        public float StartX;
        public float StartY;
        public float EndX;
        public float EndY;

        public int MarginLeft;
        public int MarginRight;
        public int MarginBottom;
        public DanmakuAlignmentMode AlignmentMode = DanmakuAlignmentMode.Default;
        public DanmakuAlignmentMode AnchorMode = DanmakuAlignmentMode.UpperLeft;

        public byte StartAlpha;
        public byte EndAlpha;

        public ulong DurationMs;
        public ulong TranslationDurationMs;
        public ulong TranslationDelayMs;
        public ulong AlphaDurationMs;
        public ulong AlphaDelayMs;

        /// <summary>
        /// Degree
        /// </summary>
        public float RotateZ;
        /// <summary>
        /// Degree
        /// </summary>
        public float RotateY;

        public bool KeepDefinedFontSize;

        #endregion
    }

    public static class DanmakuDefaultLayerDef
    {
        public const uint DefaultLayerId = 0;
        public const uint RollingLayerId = 0;
        public const uint ReverseRollingLayerId = 1;
        public const uint TopLayerId = 2;
        public const uint BottomLayerId = 3;
        public const uint AdvancedLayerId = 4;
        public const uint SubtitleLayerId = 5;
        public const uint DefaultLayerCount = 6;
    }
}
