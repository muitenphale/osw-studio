'use client';

import React from 'react';
import { PublishSettings, AnalyticsConfig } from '@/lib/vfs/types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BarChart3, Shield, Info } from 'lucide-react';

interface AnalyticsTabProps {
  settings: PublishSettings;
  onChange: (settings: PublishSettings) => void;
}

export function AnalyticsTab({ settings, onChange }: AnalyticsTabProps) {
  const handleAnalyticsChange = (
    field: keyof AnalyticsConfig,
    value: any
  ) => {
    onChange({
      ...settings,
      analytics: {
        ...settings.analytics,
        [field]: value,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Analytics Configuration</h3>
          <p className="text-sm text-muted-foreground">
            Track visitors and site usage
          </p>
        </div>
      </div>

      {/* Enable Analytics */}
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="space-y-1">
          <Label htmlFor="analytics-enabled" className="text-base">
            Enable Analytics
          </Label>
          <p className="text-sm text-muted-foreground">
            Track page views and visitor statistics
          </p>
        </div>
        <Switch
          id="analytics-enabled"
          checked={settings.analytics.enabled}
          onCheckedChange={(checked) =>
            handleAnalyticsChange('enabled', checked)
          }
        />
      </div>

      {settings.analytics.enabled && (
        <>
          {/* Provider Selection */}
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-4">Analytics Provider</h4>
            </div>

            <div className="space-y-2">
              <Label htmlFor="analytics-provider">Provider</Label>
              <Select
                value={settings.analytics.provider}
                onValueChange={(value) =>
                  handleAnalyticsChange('provider', value)
                }
              >
                <SelectTrigger id="analytics-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="builtin">
                    Built-in (Privacy-focused)
                  </SelectItem>
                  <SelectItem value="gtm">Google Tag Manager</SelectItem>
                  <SelectItem value="ga4">Google Analytics 4</SelectItem>
                  <SelectItem value="plausible">Plausible Analytics</SelectItem>
                  <SelectItem value="custom">Custom Script</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Built-in Analytics Features */}
            {settings.analytics.provider === 'builtin' && (
              <>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Analytics Features</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Choose which analytics features to enable. Note: Heatmaps and session recording generate more data.
                    </p>
                  </div>

                  {/* Feature Toggles */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-1">
                        <Label htmlFor="feature-basic" className="font-medium">Basic Tracking</Label>
                        <p className="text-xs text-muted-foreground">Pageviews, referrers, device type</p>
                      </div>
                      <Switch
                        id="feature-basic"
                        checked={settings.analytics.features?.basicTracking !== false}
                        onCheckedChange={(checked) =>
                          handleAnalyticsChange('features', {
                            ...settings.analytics.features,
                            basicTracking: checked
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-1">
                        <Label htmlFor="feature-heatmaps" className="font-medium">Heatmaps</Label>
                        <p className="text-xs text-muted-foreground">Click coordinates and scroll tracking</p>
                      </div>
                      <Switch
                        id="feature-heatmaps"
                        checked={settings.analytics.features?.heatmaps === true}
                        onCheckedChange={(checked) =>
                          handleAnalyticsChange('features', {
                            ...settings.analytics.features,
                            heatmaps: checked
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-1">
                        <Label htmlFor="feature-sessions" className="font-medium">Session Recording</Label>
                        <p className="text-xs text-muted-foreground">Journey paths and page flows</p>
                      </div>
                      <Switch
                        id="feature-sessions"
                        checked={settings.analytics.features?.sessionRecording === true}
                        onCheckedChange={(checked) =>
                          handleAnalyticsChange('features', {
                            ...settings.analytics.features,
                            sessionRecording: checked
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-1">
                        <Label htmlFor="feature-performance" className="font-medium">Performance Metrics</Label>
                        <p className="text-xs text-muted-foreground">Core Web Vitals monitoring</p>
                      </div>
                      <Switch
                        id="feature-performance"
                        checked={settings.analytics.features?.performanceMetrics === true}
                        onCheckedChange={(checked) =>
                          handleAnalyticsChange('features', {
                            ...settings.analytics.features,
                            performanceMetrics: checked
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-1">
                        <Label htmlFor="feature-engagement" className="font-medium">Engagement Tracking</Label>
                        <p className="text-xs text-muted-foreground">Time on page, scroll depth</p>
                      </div>
                      <Switch
                        id="feature-engagement"
                        checked={settings.analytics.features?.engagementTracking === true}
                        onCheckedChange={(checked) =>
                          handleAnalyticsChange('features', {
                            ...settings.analytics.features,
                            engagementTracking: checked
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-1">
                        <Label htmlFor="feature-custom" className="font-medium">Custom Events</Label>
                        <p className="text-xs text-muted-foreground">Goal and conversion tracking</p>
                      </div>
                      <Switch
                        id="feature-custom"
                        checked={settings.analytics.features?.customEvents === true}
                        onCheckedChange={(checked) =>
                          handleAnalyticsChange('features', {
                            ...settings.analytics.features,
                            customEvents: checked
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Warning about data volume */}
                  {(settings.analytics.features?.heatmaps || settings.analytics.features?.sessionRecording) && (
                    <div className="p-4 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg">
                      <div className="flex gap-3">
                        <Info className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <h4 className="font-semibold text-orange-900 dark:text-orange-100">
                            High Data Volume Features Enabled
                          </h4>
                          <p className="text-sm text-orange-800 dark:text-orange-200">
                            Heatmaps and session recording generate significantly more data. Consider using shorter retention periods to manage storage costs.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Data Retention */}
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Data Retention</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      How long to keep analytics data (in days)
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="retention-pageviews">Pageviews</Label>
                      <Input
                        id="retention-pageviews"
                        type="number"
                        min="1"
                        max="365"
                        placeholder="90"
                        value={settings.analytics.retention?.pageviews || 90}
                        onChange={(e) =>
                          handleAnalyticsChange('retention', {
                            ...settings.analytics.retention,
                            pageviews: parseInt(e.target.value, 10) || 90
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">Default: 90 days</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="retention-interactions">Interactions</Label>
                      <Input
                        id="retention-interactions"
                        type="number"
                        min="1"
                        max="365"
                        placeholder="30"
                        value={settings.analytics.retention?.interactions || 30}
                        onChange={(e) =>
                          handleAnalyticsChange('retention', {
                            ...settings.analytics.retention,
                            interactions: parseInt(e.target.value, 10) || 30
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">Default: 30 days</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="retention-sessions">Sessions</Label>
                      <Input
                        id="retention-sessions"
                        type="number"
                        min="1"
                        max="365"
                        placeholder="60"
                        value={settings.analytics.retention?.sessions || 60}
                        onChange={(e) =>
                          handleAnalyticsChange('retention', {
                            ...settings.analytics.retention,
                            sessions: parseInt(e.target.value, 10) || 60
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">Default: 60 days</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Tracking ID for external providers */}
            {(settings.analytics.provider === 'gtm' ||
              settings.analytics.provider === 'ga4' ||
              settings.analytics.provider === 'plausible') && (
              <div className="space-y-2">
                <Label htmlFor="tracking-id">
                  {settings.analytics.provider === 'gtm' && 'Container ID'}
                  {settings.analytics.provider === 'ga4' && 'Measurement ID'}
                  {settings.analytics.provider === 'plausible' && 'Domain'}
                </Label>
                <Input
                  id="tracking-id"
                  placeholder={
                    settings.analytics.provider === 'gtm'
                      ? 'GTM-XXXXXXX'
                      : settings.analytics.provider === 'ga4'
                      ? 'G-XXXXXXXXXX'
                      : 'yourdomain.com'
                  }
                  value={settings.analytics.trackingId || ''}
                  onChange={(e) =>
                    handleAnalyticsChange('trackingId', e.target.value)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {settings.analytics.provider === 'gtm' &&
                    'Your Google Tag Manager container ID'}
                  {settings.analytics.provider === 'ga4' &&
                    'Your Google Analytics 4 measurement ID'}
                  {settings.analytics.provider === 'plausible' &&
                    'Your website domain registered in Plausible'}
                </p>
              </div>
            )}

            {/* Custom Script */}
            {settings.analytics.provider === 'custom' && (
              <div className="space-y-2">
                <Label htmlFor="custom-script">Custom Analytics Script</Label>
                <Textarea
                  id="custom-script"
                  placeholder="<script>...</script>"
                  rows={8}
                  value={settings.analytics.customScript || ''}
                  onChange={(e) =>
                    handleAnalyticsChange('customScript', e.target.value)
                  }
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Paste your custom analytics tracking code
                </p>
              </div>
            )}
          </div>

          {/* Privacy Mode */}
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-4">Privacy Settings</h4>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="privacy-mode" className="text-base">
                    Privacy Mode
                  </Label>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Anonymize IPs and disable cookies for GDPR compliance
                </p>
              </div>
              <Switch
                id="privacy-mode"
                checked={settings.analytics.privacyMode}
                onCheckedChange={(checked) =>
                  handleAnalyticsChange('privacyMode', checked)
                }
              />
            </div>

            {settings.analytics.privacyMode && (
              <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex gap-3">
                  <Info className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-semibold text-green-900 dark:text-green-100">
                      Privacy Mode Enabled
                    </h4>
                    <p className="text-sm text-green-800 dark:text-green-200">
                      Analytics will respect user privacy by anonymizing IP addresses and
                      avoiding cookies where possible. This helps with GDPR compliance.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Preview */}
          {settings.analytics.provider !== 'builtin' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-4">Script Preview</h4>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <code className="text-xs">
                  {settings.analytics.provider === 'gtm' && (
                    <>
                      {`<!-- Google Tag Manager -->`}
                      <br />
                      {`<script>(function(w,d,s,l,i){...})(window,document,'script','dataLayer','${
                        settings.analytics.trackingId || 'GTM-XXXXXXX'
                      }');</script>`}
                      <br />
                      {`<!-- End Google Tag Manager -->`}
                    </>
                  )}
                  {settings.analytics.provider === 'ga4' && (
                    <>
                      {`<!-- Google Analytics 4 -->`}
                      <br />
                      {`<script async src="https://www.googletagmanager.com/gtag/js?id=${
                        settings.analytics.trackingId || 'G-XXXXXXXXXX'
                      }"></script>`}
                      <br />
                      {`<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}...</script>`}
                      <br />
                      {`<!-- End Google Analytics 4 -->`}
                    </>
                  )}
                  {settings.analytics.provider === 'plausible' && (
                    <>
                      {`<!-- Plausible Analytics -->`}
                      <br />
                      {`<script defer data-domain="${
                        settings.analytics.trackingId || 'yourdomain.com'
                      }" src="https://plausible.io/js/script.js"></script>`}
                      <br />
                      {`<!-- End Plausible Analytics -->`}
                    </>
                  )}
                  {settings.analytics.provider === 'custom' &&
                    (settings.analytics.customScript || 'No custom script provided')}
                </code>
              </div>
              <p className="text-xs text-muted-foreground">
                This script will be injected into the &lt;head&gt; section of your deployment
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
