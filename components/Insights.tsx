import {
  Bookmark,
  Folder,
  Globe,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Copy,
  FolderX,
  RefreshCw,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { getBookmarkTree } from '@/services/bookmarks';
import { calculateInsights } from '@/services/insights';
import type { InsightsData } from '@/types';

interface InsightsProps {
  onNavigateToDoctor?: () => void;
  onNavigateToCopilot?: () => void;
  onNavigateToExplorer?: (query: string) => void;
}

export const Insights: React.FC<InsightsProps> = ({
  onNavigateToDoctor,
  onNavigateToCopilot: _onNavigateToCopilot,
  onNavigateToExplorer,
}) => {
  const { t } = useI18n();
  const [data, setData] = useState<InsightsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
          {/* Health Score Hero Card */}
          <div className="border-border/60 bg-card space-y-3 rounded-xl border p-4 shadow-2xs">
            <div className="flex items-center justify-between gap-4">
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
                className={`flex size-16 shrink-0 items-center justify-center rounded-full border-4 font-mono text-lg font-bold ${getScoreColor(
                  data.healthScore
                )}`}
              >
                {data.healthScore}%
              </div>
            </div>

            {/* Quick recommendation nudge */}
            {(data.duplicateCount > 0 || data.emptyFolderCount > 0) && (
              <div className="border-border/30 flex items-center justify-between border-t pt-2 text-xs">
                <span className="text-muted-foreground text-[11px]">
                  💡{' '}
                  {t('optimizeSuggestion') ||
                    'Resolve detected duplicates and empty folders in Doctor.'}
                </span>
                {onNavigateToDoctor && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onNavigateToDoctor}
                    className="text-primary hover:text-primary h-6 px-2 text-[11px] active:scale-[0.97]"
                  >
                    {t('openDoctorBtn') || 'Open Doctor'}
                    <ArrowRight className="ml-1 size-3" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* 4 Key Metric Cards */}
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

          {/* Clutter Breakdown Cards */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="border-border/50 bg-card space-y-1 rounded-lg border p-3">
              <div className="text-muted-foreground flex items-center gap-1.5">
                <Copy className="size-3 text-amber-500" />
                <span className="text-xs font-medium">{t('duplicatesMetric') || 'Duplicates'}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-foreground font-mono text-base font-bold">
                  {data.duplicateCount}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  {t('redundantLinks') || 'redundant links'}
                </span>
              </div>
            </div>

            <div className="border-border/50 bg-card space-y-1 rounded-lg border p-3">
              <div className="text-muted-foreground flex items-center gap-1.5">
                <FolderX className="size-3 text-blue-500" />
                <span className="text-xs font-medium">
                  {t('emptyFoldersMetric') || 'Empty Folders'}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-foreground font-mono text-base font-bold">
                  {data.emptyFolderCount}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  {t('unusedFolders') || 'unused'}
                </span>
              </div>
            </div>
          </div>

          {/* Top Domains Distribution */}
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
                        className="bg-primary/70 h-full rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${Math.min(100, Math.max(4, item.percentage))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
