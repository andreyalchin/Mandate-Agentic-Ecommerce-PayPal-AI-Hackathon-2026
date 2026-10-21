// AG Studio theme from Mandate's design tokens (web/src/styles.css), so the console reads as
// part of the app: paper canvas, warm white cards, ink text, deep green accent.
import { studioTheme } from "ag-studio";

const v = (n: string) => `var(--${n})`;
const line = (c: string) => ({ width: 1, color: v(c) });
const CHART = ["#1f4d3f", "#c9873a", "#a3241c", "#6f8f7f", "#3f6f8f", "#b9a37e", "#7a5c8f", "#8f3f5c", "#5a6b2f", "#2f5a6b"];
const palette = Object.fromEntries(CHART.flatMap((c, i) => [[`chartPaletteFills${i + 1}Color`, c], [`chartPaletteStrokes${i + 1}Color`, c]]));

export const mandateTheme = studioTheme.withParams({
  fontFamily: v("font-body"), fontSize: 14, textColor: v("ink"), foregroundColor: v("ink"), subtleTextColor: v("muted"),
  backgroundColor: v("surface"), borderColor: v("line"), accentColor: v("accent"), iconColor: v("ink"), rowHoverColor: v("surface-2"),
  studioWrapperBorder: false, studioWrapperBorderRadius: 0, studioWrapperSpacing: 0, studioWrapperBackgroundColor: v("paper"),
  studioCanvasBorder: false, studioCanvasBorderRadius: 0, studioCanvasShadow: false, studioCanvasBackgroundColor: v("paper"), studioCanvasPadding: 16, studioCanvasRowHeight: 18, studioCanvasFontFamily: v("font-body"),
  studioWidgetBackgroundColor: v("surface"), studioWidgetBorder: line("line"), studioWidgetBorderRadius: 14, studioWidgetPadding: 12,
  studioWidgetTitleFontFamily: v("font-body"), studioWidgetTitleFontSize: 14, studioWidgetTitleFontWeight: 600, studioWidgetTitleTextColor: v("ink"),
  studioWidgetSubtitleFontFamily: v("font-body"), studioWidgetSubtitleFontSize: 12, studioWidgetSubtitleTextColor: v("muted"),
  studioWidgetCaptionFontFamily: v("font-body"), studioWidgetCaptionFontSize: 12, studioWidgetCaptionTextColor: v("muted"), studioWidgetResizeBorderColor: v("accent"),
  studioPanelContainerBackgroundColor: v("surface"), studioPanelContainerBorder: line("line"), studioPanelContainerBorderRadius: 0, studioPanelDividerColor: v("line"), studioPanelDividerActiveColor: v("accent"),
  studioPanelSectionBorderColor: v("line"), studioPanelHeaderFontFamily: v("font-body"), studioPanelHeaderFontWeight: 600,
  studioToggleButtonActiveBackgroundColor: v("surface-2"), studioToggleButtonActiveBorderColor: v("accent"), studioToggleButtonActiveColor: v("accent"),
  ...palette,
} as any);
