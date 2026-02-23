'use client';

import React, { useState } from 'react';
import { Project } from '@/lib/vfs/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CreateDeploymentModalProps {
  projects: Project[];
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { projectId: string; name: string; slug?: string }) => Promise<void>;
}

export function CreateDeploymentModal({
  projects,
  isOpen,
  onClose,
  onCreate,
}: CreateDeploymentModalProps) {
  const [projectId, setProjectId] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!projectId || !name) {
      setError('Project and deployment name are required');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      await onCreate({
        projectId,
        name,
        slug: slug || undefined,
      });

      // Reset form
      setProjectId('');
      setName('');
      setSlug('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create deployment');
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      setProjectId('');
      setName('');
      setSlug('');
      setError('');
      onClose();
    }
  };

  // Auto-generate deployment name from selected project
  const handleProjectChange = (value: string) => {
    setProjectId(value);
    if (!name) {
      const project = projects.find(p => p.id === value);
      if (project) {
        setName(project.name);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Deployment</DialogTitle>
          <DialogDescription>
            Create a new deployment to publish a project. Deployments let you manage publish settings
            independently from your project workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Project Selection */}
          <div className="grid gap-2">
            <Label htmlFor="project">Project</Label>
            <Select value={projectId} onValueChange={handleProjectChange}>
              <SelectTrigger id="project">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose which project to publish
            </p>
          </div>

          {/* Deployment Name */}
          <div className="grid gap-2">
            <Label htmlFor="name">Deployment Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Deployment"
            />
            <p className="text-xs text-muted-foreground">
              Display name for this published deployment
            </p>
          </div>

          {/* Slug (Optional) */}
          <div className="grid gap-2">
            <Label htmlFor="slug">Slug (Optional)</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-awesome-deployment"
            />
            <p className="text-xs text-muted-foreground">
              URL-friendly identifier for this deployment
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !projectId || !name}>
            {isCreating ? 'Creating...' : 'Create Deployment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
