'use client';

import React, { useState } from 'react';
import { PublishSettings, SeoConfig } from '@/lib/vfs/types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Image as ImageIcon, X } from 'lucide-react';

interface SeoTabProps {
  settings: PublishSettings;
  onChange: (settings: PublishSettings) => void;
}

export function SeoTab({ settings, onChange }: SeoTabProps) {
  const [keywords, setKeywords] = useState('');

  const handleSeoChange = (field: keyof SeoConfig, value: any) => {
    onChange({
      ...settings,
      seo: {
        ...settings.seo,
        [field]: value,
      },
    });
  };

  const handleAddKeyword = () => {
    if (!keywords.trim()) return;

    const currentKeywords = settings.seo.keywords || [];
    const newKeywords = keywords
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k && !currentKeywords.includes(k));

    if (newKeywords.length > 0) {
      handleSeoChange('keywords', [...currentKeywords, ...newKeywords]);
      setKeywords('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    const currentKeywords = settings.seo.keywords || [];
    handleSeoChange(
      'keywords',
      currentKeywords.filter((k) => k !== keyword)
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">SEO Configuration</h3>
        <p className="text-sm text-muted-foreground">
          Optimize your deployment for search engines and social sharing
        </p>
      </div>

      {/* Basic Meta Tags */}
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-4">Basic Meta Tags</h4>
        </div>

        <div className="space-y-2">
          <Label htmlFor="seo-title">Meta Title</Label>
          <Input
            id="seo-title"
            placeholder="Your Deployment Title"
            value={settings.seo.title || ''}
            onChange={(e) => handleSeoChange('title', e.target.value || undefined)}
          />
          <p className="text-xs text-muted-foreground">
            Recommended: 50-60 characters
            {settings.seo.title && (
              <span className="ml-2">
                ({settings.seo.title.length} characters)
              </span>
            )}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="seo-description">Meta Description</Label>
          <Textarea
            id="seo-description"
            placeholder="A brief description of your deployment"
            rows={3}
            value={settings.seo.description || ''}
            onChange={(e) =>
              handleSeoChange('description', e.target.value || undefined)
            }
          />
          <p className="text-xs text-muted-foreground">
            Recommended: 150-160 characters
            {settings.seo.description && (
              <span className="ml-2">
                ({settings.seo.description.length} characters)
              </span>
            )}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="seo-keywords">Keywords</Label>
          <div className="flex gap-2">
            <Input
              id="seo-keywords"
              placeholder="Enter keywords (comma-separated)"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddKeyword();
                }
              }}
            />
            <Button type="button" onClick={handleAddKeyword} variant="outline">
              Add
            </Button>
          </div>
          {settings.seo.keywords && settings.seo.keywords.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {settings.seo.keywords.map((keyword) => (
                <Badge key={keyword} variant="secondary" className="gap-1">
                  {keyword}
                  <button
                    onClick={() => handleRemoveKeyword(keyword)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="seo-canonical">Canonical URL</Label>
          <Input
            id="seo-canonical"
            type="url"
            placeholder="https://example.com/page"
            value={settings.seo.canonical || ''}
            onChange={(e) =>
              handleSeoChange('canonical', e.target.value || undefined)
            }
          />
          <p className="text-xs text-muted-foreground">
            Prevent duplicate content issues by specifying the primary URL
          </p>
        </div>
      </div>

      {/* Open Graph */}
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-4">Open Graph (Facebook, LinkedIn)</h4>
        </div>

        <div className="space-y-2">
          <Label htmlFor="og-title">OG Title</Label>
          <Input
            id="og-title"
            placeholder="Title for social media sharing"
            value={settings.seo.ogTitle || ''}
            onChange={(e) => handleSeoChange('ogTitle', e.target.value || undefined)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="og-description">OG Description</Label>
          <Textarea
            id="og-description"
            placeholder="Description for social media sharing"
            rows={2}
            value={settings.seo.ogDescription || ''}
            onChange={(e) =>
              handleSeoChange('ogDescription', e.target.value || undefined)
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="og-image">OG Image URL</Label>
          <Input
            id="og-image"
            type="url"
            placeholder="https://example.com/image.jpg"
            value={settings.seo.ogImage || ''}
            onChange={(e) => handleSeoChange('ogImage', e.target.value || undefined)}
          />
          <p className="text-xs text-muted-foreground">
            Recommended: 1200x630px for best results
          </p>
        </div>

        {settings.seo.ogImage && (
          <div className="p-4 border rounded-lg">
            <p className="text-sm font-medium mb-2">Image Preview</p>
            <div className="relative aspect-video bg-muted rounded flex items-center justify-center overflow-hidden">
              <img
                src={settings.seo.ogImage}
                alt="OG Image preview"
                className="object-cover w-full h-full"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement!.innerHTML =
                    '<div class="flex items-center gap-2 text-muted-foreground"><svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg><span>Unable to load image</span></div>';
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Twitter Card */}
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-4">Twitter Card</h4>
        </div>

        <div className="space-y-2">
          <Label htmlFor="twitter-card">Card Type</Label>
          <Select
            value={settings.seo.twitterCard || 'summary'}
            onValueChange={(value: 'summary' | 'summary_large_image') =>
              handleSeoChange('twitterCard', value)
            }
          >
            <SelectTrigger id="twitter-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="summary">Summary</SelectItem>
              <SelectItem value="summary_large_image">
                Summary Large Image
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            How your deployment appears when shared on Twitter/X
          </p>
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold mb-4">Search Result Preview</h4>
        </div>

        <div className="p-4 border rounded-lg bg-muted/50">
          <div className="flex gap-2 mb-2">
            <Search className="h-5 w-5 text-blue-600" />
            <div className="flex-1">
              <div className="text-sm text-blue-600 mb-1">
                https://your-domain.com
              </div>
              <h3 className="text-lg text-blue-800 dark:text-blue-400 font-medium mb-1">
                {settings.seo.title || settings.seo.ogTitle || 'Your Deployment Title'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {settings.seo.description ||
                  settings.seo.ogDescription ||
                  'Your deployment description will appear here in search results.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Social Share Preview */}
      {(settings.seo.ogTitle || settings.seo.ogImage) && (
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-4">Social Share Preview</h4>
          </div>

          <div className="p-4 border rounded-lg bg-muted/50">
            <div className="space-y-2">
              {settings.seo.ogImage && (
                <div className="aspect-video bg-muted rounded overflow-hidden">
                  <img
                    src={settings.seo.ogImage}
                    alt="Social preview"
                    className="object-cover w-full h-full"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  your-domain.com
                </div>
                <h4 className="font-semibold">
                  {settings.seo.ogTitle || settings.seo.title || 'Your Deployment Title'}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {settings.seo.ogDescription ||
                    settings.seo.description ||
                    'Your deployment description'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
