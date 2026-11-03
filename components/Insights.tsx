import {
  Bookmark,
  Folder,
  Globe,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Copy,
  RefreshCw,
  Sparkles,
  ExternalLink,
  Layers,
  CalendarDays,
  FileSpreadsheet,
  FileCode,
  Share2,
  Check,
  CheckCircle2,
  AlertTriangle,
  FolderTree,
  Clock,
  Radio,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { getBookmarkTree, flattenBookmarks } from '@/services/bookmarks';
import { calculateInsights } from '@/services/insights';
import type { InsightsData } from '@/types';

interface InsightsProps {
  onNavigateToDoctor?: (
    subTab?: 'duplicates' | 'similar' | 'trackers' | 'insecure' | '404' | 'empty'
  ) => void;
  onNavigateToCopilot?: () => void;
  onNavigateToExplorer?: (query: string) => void;
}

export const Insights: React.FC<InsightsProps> = React.memo(function Insights({
  onNavigateToDoctor,
  onNavigateToCopilot: _onNavigateToCopilot,
  onNavigateToExplorer,
}) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<InsightsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const loadMetrics = async () => {
    setIsLoading(true);
    try {
      const tree = await getBookmarkTree();
      const insights = calculateInsights(tree);
      setData(insights);
    } catch (err) {
      console.error('Failed to load insights:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10';
    if (score >= 75) return 'text-teal-500 border-teal-500/30 bg-teal-500/10';
    if (score >= 50) return 'text-amber-500 border-amber-500/30 bg-amber-500/10';
    return 'text-rose-500 border-rose-500/30 bg-rose-500/10';
  };

  const getRatingLabel = (rating: InsightsData['rating']) => {
    switch (rating) {
      case 'excellent':
        return t('healthExcellent') || 'Excellent Health';
      case 'good':
        return t('healthGood') || 'Good Health';
      case 'warning':
        return t('healthWarning') || 'Needs Attention';
      case 'critical':
        return t('healthCritical') || 'Critical Issues';
    }
  };

  // 1. Export Domains CSV
  const handleExportDomainsCsv = () => {
    if (!data) return;
    const rows = [
      ['Domain', 'Bookmarks Count', 'Percentage'],
      ...data.topDomains.map((d) => [d.domain, String(d.count), `${d.percentage}%`]),
    ];
    const csvContent = rows
      .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookmark-domains-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 2. Export Full JSON Data
  const handleExportFullJson = async () => {
    try {
      const tree = await getBookmarkTree();
      const all = flattenBookmarks(tree);
      const jsonContent = JSON.stringify(
        all.map((b) => ({
          title: b.title,
          url: b.url,
          domain: b.domain,
          path: b.path,
          dateAdded: b.dateAdded ? new Date(b.dateAdded).toISOString() : undefined,
        })),
        null,
        2
      );
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bookmark-otter-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export JSON:', err);
    }
  };

  // 3. Copy Summary Card Text
  const handleCopySummary = async () => {
    if (!data) return;
    const oldestStr = data.oldestBookmark
      ? `• Oldest Bookmark: ${data.oldestBookmark.title} (${new Date(
          data.oldestBookmark.dateAdded
        ).getFullYear()})`
      : '';
    const busiestStr = data.busiestMonth
      ? `• Busiest Month: ${new Date(
          data.busiestMonth.year,
          data.busiestMonth.month
        ).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', {
          month: 'long',
          year: 'numeric',
        })} (${data.busiestMonth.count} bookmarks)`
      : '';

    const text = [
      `🦦 Bookmark Otter — Library Report`,
      `• Health Score: ${data.healthScore}/100 (${getRatingLabel(data.rating)})`,
      `• Total Bookmarks: ${data.totalBookmarks} across ${data.totalFolders} folders`,
      `• Unique Domains: ${data.uniqueDomains} (${data.httpsRatio}% HTTPS)`,
      `• Duplicates: ${data.duplicateCount} | Empty Folders: ${data.emptyFolderCount}`,
      oldestStr,
      busiestStr,
    ]
      .filter(Boolean)
      .join('\n');

    await navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col space-y-4 p-4">
      {/* Header */}
      <div className="border-border/40 flex items-center justify-between gap-2 border-b pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-foreground text-sm font-semibold tracking-tight">
              {t('insightsTitle') || 'Bookmark Insights & Health'}
            </h2>
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium">
              {t('liveAnalytics') || 'Live Analytics'}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {t('insightsDesc') ||
              'Real-time library health score, domain distribution, and security metrics.'}
          </p>
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={loadMetrics}
          disabled={isLoading}
          className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs active:scale-[0.97]"
        >
          <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isLoading || !data ? (
        <div className="text-muted-foreground flex flex-col items-center justify-center space-y-2 py-20">
          <div className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent duration-500" />
          <p className="text-xs">{t('calculatingInsights') || 'Calculating insights...'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ==================== 1. HEALTH SCORE HERO CARD ==================== */}
          <div className="border-border/60 bg-card space-y-3 rounded-xl border p-4 shadow-2xs">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
                  {t('overallHealth') || 'Overall Health Score'}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-foreground font-mono text-3xl font-bold tracking-tight">
                    {data.healthScore}
                  </span>
                  <span className="text-muted-foreground text-xs font-medium">/ 100</span>
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <Badge
                    variant="outline"
                    className={`px-2 py-0.5 text-[10px] font-semibold ${getScoreColor(
                      data.healthScore
                    )}`}
                  >
                    {getRatingLabel(data.rating)}
                  </Badge>
                  <span className="text-muted-foreground text-[11px]">
                    {data.duplicateCount === 0 && data.emptyFolderCount === 0
                      ? t('healthCleanMsg') || 'No clutter detected'
                      : t('healthIssuesMsg', {
                          count: data.duplicateCount + data.emptyFolderCount,
                        }) || `${data.duplicateCount + data.emptyFolderCount} items to optimize`}
                  </span>
                </div>
              </div>

              {/* Visual Ring / Badge Representation */}
              <div
                className={`flex size-16 shrink-0 items-center justify-center rounded-full border-4 font-mono text-lg font-bold shadow-xs ${getScoreColor(
                  data.healthScore
                )}`}
              >
                {data.healthScore}%
              </div>
            </div>

            {/* Score Deductions Breakdown */}
            {(data.penalties.duplicates > 0 ||
              data.penalties.emptyFolders > 0 ||
              data.penalties.insecureHttp > 0 ||
              data.penalties.brokenLinks > 0) && (
              <div className="border-border/40 bg-muted/20 space-y-1.5 rounded-lg border p-2.5 text-xs">
                <div className="text-muted-foreground flex items-center justify-between text-[10px] font-semibold tracking-wider uppercase">
                  <span>{t('scoreBreakdown') || 'Score Deductions'}</span>
                  <span className="font-mono">-{100 - data.healthScore} pts</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {data.penalties.duplicates > 0 && (
                    <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                      <span>• {t('deductDuplicates') || 'Duplicates'}</span>
                      <span className="font-mono font-medium">-{data.penalties.duplicates}</span>
                    </div>
                  )}
                  {data.penalties.emptyFolders > 0 && (
                    <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
                      <span>• {t('deductEmpty') || 'Empty folders'}</span>
                      <span className="font-mono font-medium">-{data.penalties.emptyFolders}</span>
                    </div>
                  )}
                  {data.penalties.insecureHttp > 0 && (
                    <div
                      onClick={() => onNavigateToDoctor?.('insecure')}
                      className="text-muted-foreground flex cursor-pointer items-center justify-between transition-colors hover:text-amber-500"
                      title={t('openDoctor') || 'Open in Doctor'}
                    >
                      <span>• {t('deductHttp') || 'Insecure HTTP'}</span>
                      <span className="font-mono font-medium">-{data.penalties.insecureHttp}</span>
                    </div>
                  )}
                  {data.penalties.brokenLinks > 0 && (
                    <div className="flex items-center justify-between text-rose-600 dark:text-rose-400">
                      <span>• {t('deductBroken') || 'Broken/404'}</span>
                      <span className="font-mono font-medium">-{data.penalties.brokenLinks}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ==================== 2. DIAGNOSTIC ACTION CHIPS (DOCTOR QUICK ACCESS) ==================== */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {/* Chip 1: Duplicates */}
            <div
              onClick={() => onNavigateToDoctor?.('duplicates')}
              className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 transition-all duration-120 active:scale-[0.98] ${
                data.duplicateCount > 0
                  ? 'border-amber-500/30 bg-amber-500/5'
                  : 'border-border/50 bg-card'
              }`}
              title={t('openDoctor') || 'Open in Doctor'}
            >
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-[10.5px] font-medium">
                  {t('duplicatesMetric') || 'Duplicates'}
                </span>
                {data.duplicateCount > 0 ? (
                  <ArrowRight className="size-3 text-amber-500" />
                ) : (
                  <CheckCircle2 className="size-3 text-emerald-500" />
                )}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-base font-bold">{data.duplicateCount}</span>
                <span className="text-muted-foreground text-[9.5px]">
                  {data.duplicateCount === 0
                    ? t('allClear') || 'All clear'
                    : t('openDoctor') || 'Open Doctor'}
                </span>
              </div>
            </div>

            {/* Chip 2: Similar Bookmarks */}
            <div
              onClick={() => onNavigateToDoctor?.('similar')}
              className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 transition-all duration-120 active:scale-[0.98] ${
                (data.similarCount || 0) > 0
                  ? 'border-cyan-500/30 bg-cyan-500/5'
                  : 'border-border/50 bg-card'
              }`}
              title={t('openDoctor') || 'Open in Doctor'}
            >
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-[10.5px] font-medium">
                  {t('tabSimilar') || 'Similar'}
                </span>
                {(data.similarCount || 0) > 0 ? (
                  <ArrowRight className="size-3 text-cyan-500" />
                ) : (
                  <CheckCircle2 className="size-3 text-emerald-500" />
                )}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-base font-bold">{data.similarCount || 0}</span>
                <span className="text-muted-foreground text-[9.5px]">
                  {(data.similarCount || 0) === 0
                    ? t('allClear') || 'All clear'
                    : t('openDoctor') || 'Open Doctor'}
                </span>
              </div>
            </div>

            {/* Chip 3: Tracking Params */}
            <div
              onClick={() => onNavigateToDoctor?.('trackers')}
              className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 transition-all duration-120 active:scale-[0.98] ${
                (data.trackingCount || 0) > 0
                  ? 'border-teal-500/30 bg-teal-500/5'
                  : 'border-border/50 bg-card'
              }`}
              title={t('openDoctor') || 'Open in Doctor'}
            >
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-[10.5px] font-medium">
                  {t('tabTrackers') || 'Trackers'}
                </span>
                {(data.trackingCount || 0) > 0 ? (
                  <ArrowRight className="size-3 text-teal-500" />
                ) : (
                  <CheckCircle2 className="size-3 text-emerald-500" />
                )}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-base font-bold">{data.trackingCount || 0}</span>
                <span className="text-muted-foreground text-[9.5px]">
                  {(data.trackingCount || 0) === 0
                    ? t('allClear') || 'All clear'
                    : t('openDoctor') || 'Open Doctor'}
                </span>
              </div>
            </div>

            {/* Chip 4: Insecure HTTP */}
            <div
              onClick={() => onNavigateToDoctor?.('insecure')}
              className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 transition-all duration-120 active:scale-[0.98] ${
                data.httpCount > 0
                  ? 'border-amber-500/30 bg-amber-500/5'
                  : 'border-border/50 bg-card'
              }`}
              title={t('openDoctor') || 'Open in Doctor'}
            >
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-[10.5px] font-medium">
                  {t('tabInsecure') || 'HTTP'}
                </span>
                {data.httpCount > 0 ? (
                  <ArrowRight className="size-3 text-amber-500" />
                ) : (
                  <CheckCircle2 className="size-3 text-emerald-500" />
                )}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-base font-bold">{data.httpCount}</span>
                <span className="text-muted-foreground text-[9.5px]">
                  {data.httpCount === 0
                    ? t('allClear') || 'All clear'
                    : t('upgradeSingleBtn') || 'Upgrade'}
                </span>
              </div>
            </div>

            {/* Chip 5: Dead Links (404) */}
            <div
              onClick={() => onNavigateToDoctor?.('404')}
              className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 transition-all duration-120 active:scale-[0.98] ${
                (data.brokenCount || 0) > 0
                  ? 'border-rose-500/30 bg-rose-500/5'
                  : 'border-border/50 bg-card'
              }`}
              title={t('openDoctor') || 'Open in Doctor'}
            >
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-[10.5px] font-medium">404 Links</span>
                {(data.brokenCount || 0) > 0 ? (
                  <AlertTriangle className="size-3 text-rose-500" />
                ) : (
                  <Radio className="text-muted-foreground/60 size-3" />
                )}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-base font-bold">{data.brokenCount || 0}</span>
                <span className="text-muted-foreground text-[9.5px]">
                  {(data.brokenCount || 0) === 0 ? 'Run scan' : 'View dead'}
                </span>
              </div>
            </div>

            {/* Chip 5: Empty Folders */}
            <div
              onClick={() => onNavigateToDoctor?.('empty')}
              className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 transition-all duration-120 active:scale-[0.98] ${
                data.emptyFolderCount > 0
                  ? 'border-blue-500/30 bg-blue-500/5'
                  : 'border-border/50 bg-card'
              }`}
              title={t('openDoctor') || 'Open in Doctor'}
            >
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-[10.5px] font-medium">
                  {t('emptyFoldersMetric') || 'Empty Folders'}
                </span>
                {data.emptyFolderCount > 0 ? (
                  <ArrowRight className="size-3 text-blue-500" />
                ) : (
                  <CheckCircle2 className="size-3 text-emerald-500" />
                )}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-base font-bold">{data.emptyFolderCount}</span>
                <span className="text-muted-foreground text-[9.5px]">
                  {data.emptyFolderCount === 0
                    ? t('allClear') || 'All clear'
                    : t('openDoctor') || 'Open Doctor'}
                </span>
              </div>
            </div>
          </div>

          {/* ==================== 3. 4 KEY METRIC CARDS ==================== */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="border-border/50 bg-muted/15 space-y-1 rounded-lg border p-3">
              <div className="text-muted-foreground flex items-center justify-between">
                <span className="text-[11px] font-medium">{t('totalLinks') || 'Links'}</span>
                <Bookmark className="size-3.5" />
              </div>
              <p className="text-foreground font-mono text-lg font-bold">{data.totalBookmarks}</p>
            </div>

            <div className="border-border/50 bg-muted/15 space-y-1 rounded-lg border p-3">
              <div className="text-muted-foreground flex items-center justify-between">
                <span className="text-[11px] font-medium">{t('totalFolders') || 'Folders'}</span>
                <Folder className="size-3.5" />
              </div>
              <p className="text-foreground font-mono text-lg font-bold">{data.totalFolders}</p>
            </div>

            <div className="border-border/50 bg-muted/15 space-y-1 rounded-lg border p-3">
              <div className="text-muted-foreground flex items-center justify-between">
                <span className="text-[11px] font-medium">{t('uniqueDomains') || 'Domains'}</span>
                <Globe className="size-3.5" />
              </div>
              <p className="text-foreground font-mono text-lg font-bold">{data.uniqueDomains}</p>
            </div>

            <div className="border-border/50 bg-muted/15 space-y-1 rounded-lg border p-3">
              <div className="text-muted-foreground flex items-center justify-between">
                <span className="text-[11px] font-medium">{t('httpsRatio') || 'HTTPS'}</span>
                {data.httpsRatio >= 90 ? (
                  <ShieldCheck className="size-3.5 text-emerald-500" />
                ) : (
                  <ShieldAlert className="size-3.5 text-amber-500" />
                )}
              </div>
              <p className="text-foreground font-mono text-lg font-bold">{data.httpsRatio}%</p>
            </div>
          </div>

          {/* ==================== 4. LIBRARY FACTS & TRIVIA (STAR FEATURE ⭐) ==================== */}
          <div className="border-border/60 bg-card space-y-3 rounded-xl border p-4 shadow-2xs">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-amber-500" />
              <h3 className="text-foreground text-xs font-semibold tracking-tight">
                {t('libraryFactsTitle') || 'Library Facts'}
              </h3>
            </div>

            <div className="divide-border/30 divide-y text-xs">
              {/* Oldest Bookmark */}
              {data.oldestBookmark && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Clock className="size-3 text-blue-500" />
                    {t('oldestBookmark') || 'Oldest Bookmark'}
                  </span>
                  <a
                    href={data.oldestBookmark.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary flex max-w-[200px] items-center gap-1 truncate text-[11px] font-medium hover:underline"
                    title={`${data.oldestBookmark.title} (${new Date(
                      data.oldestBookmark.dateAdded
                    ).toLocaleDateString()})`}
                  >
                    <span className="truncate">{data.oldestBookmark.title}</span>
                    <span className="text-muted-foreground font-mono text-[10px]">
                      ({new Date(data.oldestBookmark.dateAdded).getFullYear()})
                    </span>
                    <ExternalLink className="size-2.5 shrink-0 opacity-60" />
                  </a>
                </div>
              )}

              {/* Busiest Month */}
              {data.busiestMonth && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <CalendarDays className="size-3 text-emerald-500" />
                    {t('busiestMonth') || 'Busiest Month'}
                  </span>
                  <span className="font-mono text-[11px] font-medium">
                    {new Date(data.busiestMonth.year, data.busiestMonth.month).toLocaleString(
                      lang === 'tr' ? 'tr-TR' : 'en-US',
                      { month: 'short', year: 'numeric' }
                    )}{' '}
                    <span className="text-muted-foreground font-normal">
                      ({data.busiestMonth.count} added)
                    </span>
                  </span>
                </div>
              )}

              {/* Deepest Nesting */}
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Layers className="size-3 text-purple-500" />
                  {t('deepestNesting') || 'Deepest Folder Nesting'}
                </span>
                <span
                  className="font-mono text-[11px] font-medium"
                  title={data.deepestFolderPath || undefined}
                >
                  {data.deepestNesting} {t('levels') || 'levels'}
                </span>
              </div>

              {/* Loose Bookmarks (No subfolder) */}
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Bookmark className="size-3 text-amber-500" />
                  {t('looseBookmarks') || 'Loose Bookmarks (No Folder)'}
                </span>
                <button
                  onClick={() => onNavigateToExplorer?.('Bookmarks Bar')}
                  className="text-foreground hover:text-primary cursor-pointer font-mono text-[11px] font-medium"
                  title="Filter in Explorer"
                >
                  {data.looseBookmarksCount}
                </button>
              </div>

              {/* Average Bookmarks per Folder */}
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <FolderTree className="size-3 text-sky-500" />
                  {t('avgBookmarksPerFolder') || 'Avg. Bookmarks / Folder'}
                </span>
                <span className="font-mono text-[11px] font-medium">
                  {data.avgBookmarksPerFolder}
                </span>
              </div>

              {/* Domains Saved Only Once */}
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Globe className="size-3 text-indigo-500" />
                  {t('singleUseDomains') || 'Domains Saved Only Once'}
                </span>
                <span className="font-mono text-[11px] font-medium">
                  {data.singleUseDomainsCount}
                </span>
              </div>
            </div>
          </div>

          {/* ==================== 5. BOOKMARK AGE DISTRIBUTION ==================== */}
          <div className="border-border/60 bg-card space-y-3 rounded-xl border p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="text-foreground text-xs font-semibold tracking-tight">
                {t('bookmarkAgeTitle') || 'Bookmark Age Distribution'}
              </h3>
              <span className="text-muted-foreground text-[10.5px]">
                {data.totalBookmarks} total
              </span>
            </div>

            {/* Segmented Progress Bar */}
            <div className="bg-muted/40 flex h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-emerald-500 transition-[width] duration-300"
                style={{ width: `${data.ageDistribution.under6Months.percentage}%` }}
                title={`< 6m: ${data.ageDistribution.under6Months.count}`}
              />
              <div
                className="bg-sky-500 transition-[width] duration-300"
                style={{ width: `${data.ageDistribution.sixTo12Months.percentage}%` }}
                title={`6-12m: ${data.ageDistribution.sixTo12Months.count}`}
              />
              <div
                className="bg-amber-500 transition-[width] duration-300"
                style={{ width: `${data.ageDistribution.oneTo3Years.percentage}%` }}
                title={`1-3y: ${data.ageDistribution.oneTo3Years.count}`}
              />
              <div
                className="bg-purple-500 transition-[width] duration-300"
                style={{ width: `${data.ageDistribution.over3Years.percentage}%` }}
                title={`3y+: ${data.ageDistribution.over3Years.count}`}
              />
            </div>

            {/* 4 Age Pills */}
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="border-border/40 bg-muted/15 space-y-0.5 rounded-md border p-2">
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  <span>{t('under6mo') || '< 6 months'}</span>
                </div>
                <div className="flex items-baseline gap-1 font-mono text-[11px] font-semibold">
                  <span>{data.ageDistribution.under6Months.percentage}%</span>
                  <span className="text-muted-foreground text-[9.5px] font-normal">
                    ({data.ageDistribution.under6Months.count})
                  </span>
                </div>
              </div>

              <div className="border-border/40 bg-muted/15 space-y-0.5 rounded-md border p-2">
                <div className="flex items-center gap-1.5 text-[10px] text-sky-600 dark:text-sky-400">
                  <span className="size-1.5 rounded-full bg-sky-500" />
                  <span>{t('sixTo12mo') || '6 - 12 months'}</span>
                </div>
                <div className="flex items-baseline gap-1 font-mono text-[11px] font-semibold">
                  <span>{data.ageDistribution.sixTo12Months.percentage}%</span>
                  <span className="text-muted-foreground text-[9.5px] font-normal">
                    ({data.ageDistribution.sixTo12Months.count})
                  </span>
                </div>
              </div>

              <div className="border-border/40 bg-muted/15 space-y-0.5 rounded-md border p-2">
                <div className="flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  <span>{t('oneTo3yr') || '1 - 3 years'}</span>
                </div>
                <div className="flex items-baseline gap-1 font-mono text-[11px] font-semibold">
                  <span>{data.ageDistribution.oneTo3Years.percentage}%</span>
                  <span className="text-muted-foreground text-[9.5px] font-normal">
                    ({data.ageDistribution.oneTo3Years.count})
                  </span>
                </div>
              </div>

              <div className="border-border/40 bg-muted/15 space-y-0.5 rounded-md border p-2">
                <div className="flex items-center gap-1.5 text-[10px] text-purple-600 dark:text-purple-400">
                  <span className="size-1.5 rounded-full bg-purple-500" />
                  <span>{t('over3yr') || '3+ years'}</span>
                </div>
                <div className="flex items-baseline gap-1 font-mono text-[11px] font-semibold">
                  <span>{data.ageDistribution.over3Years.percentage}%</span>
                  <span className="text-muted-foreground text-[9.5px] font-normal">
                    ({data.ageDistribution.over3Years.count})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ==================== 6. LARGEST FOLDERS ==================== */}
          {data.topFolders.length > 0 && (
            <div className="border-border/60 bg-card space-y-3 rounded-xl border p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <h3 className="text-foreground text-xs font-semibold tracking-tight">
                  {t('largestFoldersTitle') || 'Largest Folders'}
                </h3>
                <span className="text-muted-foreground text-[10px]">
                  {data.totalFolders} total folders
                </span>
              </div>

              <div className="space-y-2">
                {data.topFolders.map((folder) => (
                  <div
                    key={folder.id}
                    onClick={() => onNavigateToExplorer?.(folder.title)}
                    className="hover:bg-muted/40 group cursor-pointer space-y-1 rounded-md p-1.5 transition-colors"
                    title={`Click to filter Explorer by folder "${folder.title}"`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Folder className="size-3.5 shrink-0 text-amber-500" />
                        <span className="text-foreground group-hover:text-primary truncate text-[11px] font-medium transition-colors">
                          {folder.title}
                        </span>
                        <span className="text-muted-foreground/60 hidden truncate text-[9.5px] sm:inline">
                          ({folder.path})
                        </span>
                      </div>
                      <span className="text-muted-foreground group-hover:text-foreground shrink-0 font-mono text-[10.5px]">
                        {folder.count} links ({folder.percentage}%)
                      </span>
                    </div>

                    <div className="bg-muted/40 h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full bg-amber-500/70 transition-[width] duration-300 ease-out"
                        style={{ width: `${Math.min(100, Math.max(4, folder.percentage))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ==================== 7. TOP DOMAINS DISTRIBUTION ==================== */}
          <div className="border-border/60 bg-card space-y-3 rounded-xl border p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="text-foreground text-xs font-semibold tracking-tight">
                {t('topDomainsTitle') || 'Top Bookmarked Domains'}
              </h3>
              <span className="text-muted-foreground text-[10px]">
                {data.uniqueDomains} {t('totalUnique') || 'total unique'}
              </span>
            </div>

            {data.topDomains.length === 0 ? (
              <p className="text-muted-foreground py-2 text-xs">
                {t('noDomainsYet') || 'No domains bookmarked yet.'}
              </p>
            ) : (
              <div className="space-y-1.5">
                {data.topDomains.map((item) => (
                  <div
                    key={item.domain}
                    onClick={() => onNavigateToExplorer?.(item.domain)}
                    className="hover:bg-muted/40 group cursor-pointer space-y-1 rounded-md p-1 transition-colors"
                    title={`Click to filter Explorer by ${item.domain}`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <img
                          src={`https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(
                            `https://${item.domain}`
                          )}&sz=32`}
                          alt=""
                          className="size-3.5 shrink-0 rounded-xs"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <span className="text-foreground group-hover:text-primary truncate text-[11px] font-medium transition-colors">
                          {item.domain}
                        </span>
                      </div>
                      <span className="text-muted-foreground group-hover:text-foreground shrink-0 font-mono text-[10.5px]">
                        {item.count} ({item.percentage}%)
                      </span>
                    </div>

                    <div className="bg-muted/40 h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className="bg-primary/70 h-full rounded-full transition-[width] duration-300 ease-out"
                        style={{ width: `${Math.min(100, Math.max(4, item.percentage))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ==================== 8. SHARE & EXPORT BAR ==================== */}
          <div className="border-border/60 bg-muted/20 flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
            <div className="flex items-center gap-1.5 text-xs">
              <Share2 className="text-muted-foreground size-3.5" />
              <span className="text-foreground text-[11px] font-medium">
                {t('exportShareTitle') || 'Share & Export'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="xs"
                variant="outline"
                onClick={handleExportDomainsCsv}
                className="h-6 cursor-pointer gap-1 px-2 text-[10px] active:scale-[0.97]"
                title="Download domains as CSV"
              >
                <FileSpreadsheet className="size-3 text-emerald-500" />
                <span>{t('exportDomainsCsv') || 'Domains (CSV)'}</span>
              </Button>

              <Button
                size="xs"
                variant="outline"
                onClick={handleExportFullJson}
                className="h-6 cursor-pointer gap-1 px-2 text-[10px] active:scale-[0.97]"
                title="Download full library backup as JSON"
              >
                <FileCode className="size-3 text-sky-500" />
                <span>{t('exportJson') || 'Full Data (JSON)'}</span>
              </Button>

              <Button
                size="xs"
                variant="secondary"
                onClick={handleCopySummary}
                className="h-6 cursor-pointer gap-1 px-2 text-[10px] active:scale-[0.97]"
                title="Copy text summary to clipboard"
              >
                {copiedSummary ? (
                  <>
                    <Check className="size-3 text-emerald-500" />
                    <span>{t('summaryCopied') || 'Copied!'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    <span>{t('copySummary') || 'Copy Summary'}</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
