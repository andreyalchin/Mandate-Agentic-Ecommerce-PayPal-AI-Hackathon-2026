// AG Studio theme from Mandate's design tokens (web/src/styles.css), so the console reads as
// part of the app: paper canvas, warm white cards, ink text, deep green accent.
import { studioTheme } from "ag-studio";

const v = (n: string) => `var(--${n})`;
const line = (c: string) => ({ width: 1, color: v(c) });
const CHART = ["#1d4f3f", "#c9873a", "#b42318", "#6f8f7f", "#3f6f8f", "#b9a37e", "#7a5c8f", "#8f3f5c", "#5a6b2f", "#2f5a6b"];
const palette = Object.fromEntries(CHART.flatMap((c, i) => [[`chartPaletteFills${i + 1}Color`, c], [`chartPaletteStrokes${i + 1}Color`, c]]));

export const mandateTheme = studioTheme.withParams({
  fontFamily: v("font-body"), textColor: v("ink"), foregroundColor: v("ink"), subtleTextColor: v("muted"),
  backgroundColor: v("surface"), borderColor: v("line"), accentColor: v("accent"), iconColor: v("ink"), rowHoverColor: v("surface-2"), headerBackgroundColor: v("surface"), headerFontWeight: 600, headerTextColor: v("muted"), headerFontSize: 12, rowBorder: line("line"), wrapperBorder: false, cellHorizontalPadding: 14, fontSize: 13.5,
  studioWrapperBorder: false, studioWrapperBorderRadius: 0, studioWrapperSpacing: 0, studioWrapperBackgroundColor: v("paper"),
  studioCanvasBorder: false, studioCanvasBorderRadius: 0, studioCanvasShadow: false, studioCanvasBackgroundColor: v("paper"), studioCanvasPadding: 0, studioCanvasRowHeight: 18, studioCanvasFontFamily: v("font-body"),
  studioWidgetBackgroundColor: v("surface"), studioWidgetBorder: line("line"), studioWidgetBorderRadius: 16, studioWidgetPadding: 8,
  studioWidgetTitleFontFamily: v("font-body"), studioWidgetTitleFontSize: 15, studioWidgetTitleFontWeight: 650, studioWidgetTitleTextColor: v("ink"),
  studioWidgetSubtitleFontFamily: v("font-body"), studioWidgetSubtitleFontSize: 12.5, studioWidgetSubtitleTextColor: v("muted"),
  studioWidgetCaptionFontFamily: v("font-body"), studioWidgetCaptionFontSize: 12, studioWidgetCaptionTextColor: v("muted"), studioWidgetResizeBorderColor: v("accent"),
  studioPanelContainerBackgroundColor: v("surface"), studioPanelContainerBorder: line("line"), studioPanelContainerBorderRadius: 0, studioPanelDividerColor: v("line"), studioPanelDividerActiveColor: v("accent"),
  studioPanelSectionBorderColor: v("line"), studioPanelHeaderFontFamily: v("font-body"), studioPanelHeaderFontWeight: 600,
  studioToggleButtonActiveBackgroundColor: v("surface-2"), studioToggleButtonActiveBorderColor: v("accent"), studioToggleButtonActiveColor: v("accent"),
  ...palette,
} as any);
