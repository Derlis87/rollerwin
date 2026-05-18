---
Task ID: 1
Agent: main
Task: Add PeakLevelCharts (histograma de picos) back to DashboardLive.tsx

Work Log:
- Investigated user complaint: "y el histograma de picos? porque sacaste"
- Found that PeakLevelCharts component exists in Dashboard.tsx but was never added to DashboardLive.tsx
- Added import for PeakLevelCharts from './charts/PeakLevelCharts'
- Added PeakLevelCharts component to DashboardLive render, showing after prediction card when signalPeakHistory has data
- Passes signalPeakHistory (V6.0 signal-only peaks), signalPeak (current signal peak), and betTypeLabel
- Fixed pre-existing JSX structure bug: missing closing `)}` for signalPeakHistory conditional
- Improved counter labels: added "Aciertos" to the header stats to distinguish from "Señales" (total signal rounds vs completed peaks)
- Removed redundant "Aciertos" from quick stats row (now in header)
- Build passes successfully

Stage Summary:
- PeakLevelCharts histogram is now visible in DashboardLive when signal peaks exist
- Shows: Indicador de Picos (bar chart), Historial Completo de Picos (scrollable recharts), per-level expandable histograms
- Counter labels are now clearer: "Señales" = total signal rounds, "Aciertos" = completed peak wins, "Skips" = skipped rounds, "Prom" = average peak height
