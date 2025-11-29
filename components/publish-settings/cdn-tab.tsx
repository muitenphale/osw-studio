'use client';

import React, { useState } from 'react';
import { PublishSettings, CdnConfig } from '@/lib/vfs/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Edit, Trash2, Link2 } from 'lucide-react';

interface CdnTabProps {
  settings: PublishSettings;
  onChange: (settings: PublishSettings) => void;
}

export function CdnTab({ settings, onChange }: CdnTabProps) {
  const [editingCdn, setEditingCdn] = useState<CdnConfig | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleAddCdn = () => {
    const newCdn: CdnConfig = {
      id: `cdn-${Date.now()}`,
      name: '',
      url: '',
      type: 'css',
      enabled: true,
    };
    setEditingCdn(newCdn);
    setIsDialogOpen(true);
  };

  const handleEditCdn = (cdn: CdnConfig) => {
    setEditingCdn(cdn);
    setIsDialogOpen(true);
  };

  const handleDeleteCdn = (cdnId: string) => {
    if (!confirm('Are you sure you want to remove this CDN resource?')) return;

    onChange({
      ...settings,
      cdnLinks: settings.cdnLinks.filter(c => c.id !== cdnId),
    });
  };

  const handleToggleCdn = (cdnId: string) => {
    onChange({
      ...settings,
      cdnLinks: settings.cdnLinks.map(c =>
        c.id === cdnId ? { ...c, enabled: !c.enabled } : c
      ),
    });
  };

  const handleSaveCdn = () => {
    if (!editingCdn || !editingCdn.name.trim() || !editingCdn.url.trim()) {
      alert('Please provide both a name and URL for the CDN resource');
      return;
    }

    // Basic URL validation
    try {
      new URL(editingCdn.url);
    } catch {
      alert('Please provide a valid URL');
      return;
    }

    const existingIndex = settings.cdnLinks.findIndex(c => c.id === editingCdn.id);
    let updatedCdnLinks;

    if (existingIndex >= 0) {
      // Update existing
      updatedCdnLinks = [...settings.cdnLinks];
      updatedCdnLinks[existingIndex] = editingCdn;
    } else {
      // Add new
      updatedCdnLinks = [...settings.cdnLinks, editingCdn];
    }

    onChange({
      ...settings,
      cdnLinks: updatedCdnLinks,
    });

    setIsDialogOpen(false);
    setEditingCdn(null);
  };

  // Auto-detect type from URL
  const autoDetectType = (url: string): 'css' | 'js' => {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.endsWith('.css')) return 'css';
    if (lowerUrl.endsWith('.js')) return 'js';
    return 'css';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">CDN Resources</h3>
          <p className="text-sm text-muted-foreground">
            Add external CSS and JavaScript libraries
          </p>
        </div>
        <Button onClick={handleAddCdn} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add CDN Resource
        </Button>
      </div>

      {settings.cdnLinks.length === 0 ? (
        <div className="text-center p-8 border-2 border-dashed rounded-lg">
          <Link2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-semibold mb-2">No CDN Resources</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add libraries like Bootstrap, Tailwind, or custom stylesheets
          </p>
          <Button onClick={handleAddCdn} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Add Your First Resource
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {settings.cdnLinks.map((cdn) => (
            <div
              key={cdn.id}
              className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-semibold truncate">{cdn.name}</h4>
                  <Badge variant={cdn.type === 'css' ? 'default' : 'secondary'}>
                    {cdn.type.toUpperCase()}
                  </Badge>
                  {cdn.integrity && <Badge variant="outline">SRI</Badge>}
                  {cdn.crossorigin && (
                    <Badge variant="outline">{cdn.crossorigin}</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">{cdn.url}</p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={cdn.enabled}
                  onCheckedChange={() => handleToggleCdn(cdn.id)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEditCdn(cdn)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteCdn(cdn.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CDN Editor Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCdn?.name ? 'Edit CDN Resource' : 'Add CDN Resource'}
            </DialogTitle>
            <DialogDescription>
              Add a CSS or JavaScript library from a CDN
            </DialogDescription>
          </DialogHeader>

          {editingCdn && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cdn-name">Resource Name</Label>
                <Input
                  id="cdn-name"
                  placeholder="e.g., Bootstrap CSS"
                  value={editingCdn.name}
                  onChange={(e) =>
                    setEditingCdn({ ...editingCdn, name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cdn-url">CDN URL</Label>
                <Input
                  id="cdn-url"
                  type="url"
                  placeholder="https://cdn.example.com/library.css"
                  value={editingCdn.url}
                  onChange={(e) => {
                    const url = e.target.value;
                    setEditingCdn({
                      ...editingCdn,
                      url,
                      type: url ? autoDetectType(url) : editingCdn.type,
                    });
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cdn-type">Type</Label>
                <Select
                  value={editingCdn.type}
                  onValueChange={(value: 'css' | 'js') =>
                    setEditingCdn({ ...editingCdn, type: value })
                  }
                >
                  <SelectTrigger id="cdn-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="css">CSS Stylesheet</SelectItem>
                    <SelectItem value="js">JavaScript Library</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cdn-integrity">
                  SRI Integrity Hash (Optional)
                </Label>
                <Input
                  id="cdn-integrity"
                  placeholder="sha384-..."
                  value={editingCdn.integrity || ''}
                  onChange={(e) =>
                    setEditingCdn({
                      ...editingCdn,
                      integrity: e.target.value || undefined,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Subresource Integrity hash for security verification
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cdn-crossorigin">CORS Setting (Optional)</Label>
                <Select
                  value={editingCdn.crossorigin || 'none'}
                  onValueChange={(value) =>
                    setEditingCdn({
                      ...editingCdn,
                      crossorigin:
                        value === 'none'
                          ? undefined
                          : (value as 'anonymous' | 'use-credentials'),
                    })
                  }
                >
                  <SelectTrigger id="cdn-crossorigin">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="anonymous">Anonymous</SelectItem>
                    <SelectItem value="use-credentials">Use Credentials</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCdn}>Save Resource</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
