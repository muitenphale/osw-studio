'use client';

import React, { useState, useEffect } from 'react';
import { configManager, CostSettings } from '@/lib/config/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { CostCalculator } from '@/lib/llm/cost-calculator';

export function CostTrackingPane() {
  const [costSettings, setCostSettings] = useState<CostSettings>({});

  useEffect(() => {
    setCostSettings(configManager.getCostSettings());
  }, []);

  return (
    <div className="space-y-5">
      {/* Show Costs */}
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="show-costs">Display Costs</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Show cost information in messages
          </p>
        </div>
        <Switch
          id="show-costs"
          checked={costSettings.showCosts !== false}
          onCheckedChange={(checked) => {
            const newCostSettings = { ...costSettings, showCosts: checked };
            configManager.setCostSettings(newCostSettings);
            setCostSettings(newCostSettings);
          }}
        />
      </div>

      {/* Daily + Project Limits */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="daily-limit" className="text-xs">Daily Limit (USD)</Label>
          <Input
            id="daily-limit"
            type="number"
            min="0"
            step="0.01"
            placeholder="No limit"
            className="mt-1.5"
            value={costSettings.dailyLimit || ''}
            onChange={(e) => {
              const value = e.target.value ? parseFloat(e.target.value) : undefined;
              const newCostSettings = { ...costSettings, dailyLimit: value };
              configManager.setCostSettings(newCostSettings);
              setCostSettings(newCostSettings);
            }}
          />
        </div>
        <div>
          <Label htmlFor="project-limit" className="text-xs">Project Limit (USD)</Label>
          <Input
            id="project-limit"
            type="number"
            min="0"
            step="0.01"
            placeholder="No limit"
            className="mt-1.5"
            value={costSettings.projectLimit || ''}
            onChange={(e) => {
              const value = e.target.value ? parseFloat(e.target.value) : undefined;
              const newCostSettings = { ...costSettings, projectLimit: value };
              configManager.setCostSettings(newCostSettings);
              setCostSettings(newCostSettings);
            }}
          />
        </div>
      </div>

      {/* Warning Threshold */}
      <div>
        <Label htmlFor="warning-threshold" className="text-xs">Warning Threshold</Label>
        <div className="flex items-center gap-3 mt-1.5">
          <Input
            id="warning-threshold"
            type="number"
            min="50"
            max="100"
            step="5"
            className="flex-1"
            value={costSettings.warningThreshold || 80}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              if (isNaN(value)) return;
              const newCostSettings = { ...costSettings, warningThreshold: value };
              configManager.setCostSettings(newCostSettings);
              setCostSettings(newCostSettings);
            }}
          />
          <span className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap font-mono">
            <AlertTriangle className="h-3 w-3" />
            Warn at {costSettings.warningThreshold || 80}%
          </span>
        </div>
      </div>

      {/* Lifetime Costs */}
      <div className="flex items-center justify-between bg-muted/30 border rounded-lg p-3">
        <div>
          <div className="text-xs text-muted-foreground font-medium">Lifetime Total</div>
          <div className="text-lg font-bold font-mono tracking-tight mt-0.5">
            {CostCalculator.formatCost(configManager.getLifetimeCosts().total)}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (confirm('Reset lifetime cost tracking? This cannot be undone.')) {
              configManager.resetLifetimeCosts();
              toast.success('Lifetime costs reset');
            }
          }}
        >
          Reset Stats
        </Button>
      </div>
    </div>
  );
}
