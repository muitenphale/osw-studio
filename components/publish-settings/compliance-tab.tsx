'use client';

import React from 'react';
import { PublishSettings, ComplianceConfig } from '@/lib/vfs/types';
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
import { Shield, Info, Cookie } from 'lucide-react';

interface ComplianceTabProps {
  settings: PublishSettings;
  onChange: (settings: PublishSettings) => void;
}

export function ComplianceTab({ settings, onChange }: ComplianceTabProps) {
  const handleComplianceChange = (
    field: keyof ComplianceConfig,
    value: any
  ) => {
    onChange({
      ...settings,
      compliance: {
        ...settings.compliance,
        [field]: value,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Compliance & Consent</h3>
          <p className="text-sm text-muted-foreground">
            Cookie consent banner and privacy compliance
          </p>
        </div>
      </div>

      {/* Enable Compliance Banner */}
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="space-y-1">
          <Label htmlFor="compliance-enabled" className="text-base">
            Enable Consent Banner
          </Label>
          <p className="text-sm text-muted-foreground">
            Show a cookie consent banner to visitors
          </p>
        </div>
        <Switch
          id="compliance-enabled"
          checked={settings.compliance.enabled}
          onCheckedChange={(checked) =>
            handleComplianceChange('enabled', checked)
          }
        />
      </div>

      {settings.compliance.enabled && (
        <>
          {/* Banner Configuration */}
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-4">Banner Configuration</h4>
            </div>

            {/* Banner Position */}
            <div className="space-y-2">
              <Label htmlFor="banner-position">Banner Position</Label>
              <Select
                value={settings.compliance.bannerPosition}
                onValueChange={(value) =>
                  handleComplianceChange('bannerPosition', value)
                }
              >
                <SelectTrigger id="banner-position">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="top">Top</SelectItem>
                  <SelectItem value="bottom">Bottom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Banner Style */}
            <div className="space-y-2">
              <Label htmlFor="banner-style">Banner Style</Label>
              <Select
                value={settings.compliance.bannerStyle}
                onValueChange={(value) =>
                  handleComplianceChange('bannerStyle', value)
                }
              >
                <SelectTrigger id="banner-style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">Full-width Bar</SelectItem>
                  <SelectItem value="modal">Centered Modal</SelectItem>
                  <SelectItem value="corner">Bottom-right Corner</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Banner Message */}
            <div className="space-y-2">
              <Label htmlFor="banner-message">Banner Message</Label>
              <Textarea
                id="banner-message"
                placeholder="We use cookies to improve your experience..."
                rows={3}
                value={settings.compliance.message}
                onChange={(e) =>
                  handleComplianceChange('message', e.target.value)
                }
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {settings.compliance.message.length}/500 characters
              </p>
            </div>

            {/* Button Texts */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="accept-text">Accept Button Text</Label>
                <Input
                  id="accept-text"
                  placeholder="Accept"
                  value={settings.compliance.acceptButtonText}
                  onChange={(e) =>
                    handleComplianceChange('acceptButtonText', e.target.value)
                  }
                  maxLength={50}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="decline-text">Decline Button Text</Label>
                <Input
                  id="decline-text"
                  placeholder="Decline"
                  value={settings.compliance.declineButtonText}
                  onChange={(e) =>
                    handleComplianceChange('declineButtonText', e.target.value)
                  }
                  maxLength={50}
                />
              </div>
            </div>

            {/* Policy Links */}
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Policy Links (Optional)</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Add links to your privacy and cookie policies
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="privacy-policy-url">Privacy Policy URL</Label>
                <Input
                  id="privacy-policy-url"
                  type="url"
                  placeholder="https://example.com/privacy"
                  value={settings.compliance.privacyPolicyUrl || ''}
                  onChange={(e) =>
                    handleComplianceChange('privacyPolicyUrl', e.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cookie-policy-url">Cookie Policy URL</Label>
                <Input
                  id="cookie-policy-url"
                  type="url"
                  placeholder="https://example.com/cookies"
                  value={settings.compliance.cookiePolicyUrl || ''}
                  onChange={(e) =>
                    handleComplianceChange('cookiePolicyUrl', e.target.value)
                  }
                />
              </div>
            </div>
          </div>

          {/* Compliance Mode */}
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-4">Compliance Mode</h4>
            </div>

            <div className="space-y-2">
              <Label htmlFor="compliance-mode">Mode</Label>
              <Select
                value={settings.compliance.mode}
                onValueChange={(value) =>
                  handleComplianceChange('mode', value)
                }
              >
                <SelectTrigger id="compliance-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="opt-in">Opt-in (GDPR)</SelectItem>
                  <SelectItem value="opt-out">Opt-out</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {settings.compliance.mode === 'opt-in'
                  ? 'Blocks analytics until user accepts (required for GDPR)'
                  : 'Allows analytics by default, user can decline'}
              </p>
            </div>

            {/* Block Analytics Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="block-analytics" className="text-base">
                    Block Analytics Until Consent
                  </Label>
                  <Cookie className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Prevent analytics tracking until user accepts
                </p>
              </div>
              <Switch
                id="block-analytics"
                checked={settings.compliance.blockAnalytics}
                onCheckedChange={(checked) =>
                  handleComplianceChange('blockAnalytics', checked)
                }
              />
            </div>

            {settings.compliance.mode === 'opt-in' && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex gap-3">
                  <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                      GDPR Compliance Mode
                    </h4>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      In opt-in mode, cookies and tracking are blocked by default until
                      the user explicitly accepts. This is required for GDPR compliance.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Preview Info */}
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-4">Preview</h4>
            </div>

            <div className="p-4 bg-muted rounded-lg border">
              <div className="flex gap-3">
                <Info className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Live Preview</p>
                  <p className="text-sm text-muted-foreground">
                    The consent banner will appear on your published deployment based on the
                    configuration above. Visitors' choices are stored in their browser's
                    localStorage.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
