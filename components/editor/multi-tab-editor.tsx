'use client';

import React, { useState, useEffect, useCallback, useRef, Component, type ReactNode, type ErrorInfo } from 'react';
import MonacoEditor, { useMonaco } from '@monaco-editor/react';
import { VirtualFile, ProjectRuntime, getSpecificMimeType } from '@/lib/vfs/types';
import { vfs } from '@/lib/vfs';
import { X, Code2, Save, FileCode, Image as ImageIcon, Film, AlertCircle } from 'lucide-react';
import { PanelHeader } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { cn, logger } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { useTypescriptIntelliSense } from '@/lib/hooks/use-typescript-intellisense';

/** Error boundary to catch Monaco disposal crashes during panel resize/move. */
class EditorErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.warn('[EditorErrorBoundary] Monaco recovered from error:', error.message);
  }
  componentDidUpdate(_: unknown, prevState: { hasError: boolean }) {
    if (this.state.hasError && !prevState.hasError) {
      // Re-render the editor on the next tick
      requestAnimationFrame(() => this.setState({ hasError: false }));
    }
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

interface MultiTabEditorProps {
  projectId: string;
  runtime?: ProjectRuntime;
  onClose?: () => void;
}

interface OpenFile {
  file: VirtualFile;
  content: string;
  modified: boolean;
}

export function MultiTabEditor({ projectId, runtime, onClose }: MultiTabEditorProps) {
  const [openFiles, setOpenFiles] = useState<Map<string, OpenFile>>(new Map());
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const savingPathsRef = React.useRef<Set<string>>(new Set());

  // TypeScript IntelliSense for React projects
  const monacoInstance = useMonaco();
  const monacoRef = useRef(monacoInstance);
  useEffect(() => { monacoRef.current = monacoInstance; }, [monacoInstance]);
  useTypescriptIntelliSense(projectId, runtime, monacoRef);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleFileOpen = (event: CustomEvent<VirtualFile>) => {
      openFile(event.detail);
    };

    window.addEventListener('openFile', handleFileOpen as EventListener);
    
    return () => {
      window.removeEventListener('openFile', handleFileOpen as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    const handleFilesChanged = async (event: CustomEvent) => {
      if (event.detail?.fromEditor) return;

      // Process updates asynchronously
      const updateFiles = async () => {
        // Capture current state
        setOpenFiles(prev => {
          const processingSnapshot = prev;

          // Run async updates
          (async () => {
            const updatedFiles = new Map<string, OpenFile>();

            for (const [path, openFile] of processingSnapshot.entries()) {
              // If this file is currently being saved, keep it unchanged
              if (savingPathsRef.current.has(path)) {
                updatedFiles.set(path, openFile);
                continue;
              }

              // If file is modified in editor, keep editor content
              if (openFile.modified) {
                try {
                  await vfs.init();
                  const freshFile = await vfs.readFile(projectId, path);
                  updatedFiles.set(path, {
                    file: freshFile,
                    content: openFile.content,
                    modified: true
                  });
                } catch {
                  updatedFiles.set(path, openFile);
                }
                continue;
              }

              // File not modified, update from VFS
              try {
                await vfs.init();
                const freshFile = await vfs.readFile(projectId, path);
                updatedFiles.set(path, {
                  file: freshFile,
                  content: freshFile.content as string,
                  modified: false
                });
              } catch {
                updatedFiles.set(path, openFile);
              }
            }

            // Only apply updates if no files are being saved
            const hasFilesBeingSaved = Array.from(updatedFiles.keys()).some(path =>
              savingPathsRef.current.has(path)
            );

            if (!hasFilesBeingSaved) {
              setOpenFiles(updatedFiles);
            }
          })();

          return prev;
        });
      };

      updateFiles();
    };

    window.addEventListener('filesChanged', handleFilesChanged as unknown as EventListener);

    return () => {
      window.removeEventListener('filesChanged', handleFilesChanged as unknown as EventListener);
    };
  }, [projectId]);

  const openFile = async (file: VirtualFile) => {
    if (openFiles.has(file.path)) {
      setActiveFilePath(file.path);
      return;
    }

    const openFile: OpenFile = {
      file,
      content: file.content as string,
      modified: false
    };

    setOpenFiles(prev => new Map(prev).set(file.path, openFile));
    setActiveFilePath(file.path);
  };

  const closeFile = (path: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }

    const file = openFiles.get(path);
    if (file?.modified) {
      if (!confirm(`Close ${file.file.name} without saving?`)) {
        return;
      }
    }

    setOpenFiles(prev => {
      const next = new Map(prev);
      next.delete(path);
      return next;
    });

    if (activeFilePath === path) {
      const remaining = Array.from(openFiles.keys()).filter(p => p !== path);
      setActiveFilePath(remaining.length > 0 ? remaining[remaining.length - 1] : null);
    }
  };

  const handleContentChange = useCallback((value: string | undefined, path: string) => {
    if (value === undefined) return;

    const fileType = getFileType(path);
    if (fileType.type !== 'text') return;

    setOpenFiles(prev => {
      const next = new Map(prev);
      const file = next.get(path);
      if (file) {
        const isModified = file.content !== value;
        next.set(path, {
          ...file,
          content: value,
          modified: isModified
        });
      }
      return next;
    });
  }, []);

  const saveFile = useCallback(async (path: string) => {
    const openFile = openFiles.get(path);
    if (!openFile || !openFile.modified) return;

    // Mark this path as being saved
    savingPathsRef.current.add(path);

    try {
      await vfs.init();
      const updatedFile = await vfs.updateFile(projectId, path, openFile.content);

      setOpenFiles(prev => {
        const next = new Map(prev);
        next.set(path, {
          file: updatedFile,
          content: openFile.content,
          modified: false
        });
        return next;
      });
    } catch (error) {
      logger.error('Failed to save file:', error);
    } finally {
      // Remove from saving paths after a short delay to ensure all handlers have processed
      setTimeout(() => {
        savingPathsRef.current.delete(path);
      }, 100);
    }
  }, [openFiles, projectId]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (activeFilePath) {
        saveFile(activeFilePath);
      }
    }
  }, [activeFilePath, saveFile]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  const getMediaDataUrl = (file: OpenFile): string => {
    const mime = getSpecificMimeType(file.file.path);
    const content = file.file.content ?? file.content;
    if (content instanceof ArrayBuffer) {
      const bytes = new Uint8Array(content);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return `data:${mime};base64,${btoa(binary)}`;
    }
    // Already a base64 string
    return `data:${mime};base64,${content}`;
  };

  const getFileType = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico'].includes(ext || '')) {
      return { type: 'image', language: 'plaintext' };
    }

    if (['mp4', 'webm', 'ogg'].includes(ext || '')) {
      return { type: 'video', language: 'plaintext' };
    }

    const textExtensions: Record<string, string> = {
      'js': 'javascript',
      'mjs': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'html': 'html',
      'htm': 'html',
      'css': 'css',
      'json': 'json',
      'md': 'markdown',
      'txt': 'plaintext',
      'svg': 'xml',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'py': 'python',
      'lua': 'lua'
    };
    
    if (textExtensions[ext || '']) {
      return { type: 'text', language: textExtensions[ext || ''] };
    }
    
    const binaryExtensions = ['zip', 'tar', 'gz', 'exe', 'bin', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
    if (binaryExtensions.includes(ext || '')) {
      return { type: 'unsupported', language: 'plaintext' };
    }
    
    return { type: 'text', language: 'plaintext' };
  };
  
  const getLanguageFromPath = (path: string): string => {
    return getFileType(path).language;
  };

  const activeFile = activeFilePath ? openFiles.get(activeFilePath) : null;

  return (
    <div className="h-full flex flex-col">
      <PanelHeader
        icon={Code2}
        title="Code Editor"
        color="var(--button-editor-active)"
        onClose={onClose}
        panelKey="editor"
        actions={activeFile?.modified && getFileType(activeFile.file.path).type === 'text' && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 rounded-full border border-border/60 bg-muted/50 px-2.5 gap-1.5 md:h-5 md:px-2 md:border-0 md:bg-transparent md:rounded-md"
            onClick={() => saveFile(activeFilePath!)}
          >
            <Save className="h-2.5 w-2.5 md:h-3 md:w-3" />
            <span className="text-xs">Save</span>
          </Button>
        )}
      />
      
      {openFiles.size === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center space-y-3">
            <FileCode className="h-12 w-12 mx-auto opacity-50" />
            <div className="space-y-1">
              <p className="text-base font-medium">No files open</p>
              <p className="text-sm">Select a file from the explorer to edit</p>
            </div>
          </div>
        </div>
      ) : (
        <>
      <div className="border-b bg-muted/70">
        <div className="flex items-center overflow-x-auto scrollbar-thin">
          {Array.from(openFiles.entries()).map(([path, file]) => (
            <div
              key={path}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 border-r cursor-pointer transition-all relative group',
                activeFilePath === path 
                  ? 'bg-background border-b-2 border-b-primary shadow-sm' 
                  : 'hover:bg-muted/50 border-b-2 border-b-transparent'
              )}
              onClick={() => setActiveFilePath(path)}
            >
              <span className="text-sm">
                {file.file.name}
                {file.modified && <span className="text-orange-500 ml-1">●</span>}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => closeFile(path, e)}
              >
                <X className="h-3 w-3 hover:text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </div>

          {activeFile && (
            <div className="flex-1 border-t">
              {(() => {
                const fileType = getFileType(activeFile.file.path);
                
                if (fileType.type === 'image') {
                  return (
                    <div className="h-full flex items-center justify-center bg-background p-8">
                      <div className="text-center space-y-4 max-w-2xl">
                        <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground" />
                        <div className="space-y-2">
                          <h3 className="text-lg font-medium">Image Preview</h3>
                          <p className="text-sm text-muted-foreground">
                            {activeFile.file.name}
                          </p>
                        </div>
                        <div className="border rounded-lg p-4 bg-muted/30 max-h-96 overflow-auto">
                          <img
                            src={getMediaDataUrl(activeFile)}
                            alt={activeFile.file.name}
                            className="max-w-full h-auto rounded shadow-sm"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              if (!target.parentElement?.querySelector('.error-msg')) {
                                const div = document.createElement('div');
                                div.className = 'error-msg text-sm text-muted-foreground';
                                div.textContent = 'Unable to display image';
                                target.parentElement?.appendChild(div);
                              }
                            }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Image files cannot be edited in the text editor
                        </p>
                      </div>
                    </div>
                  );
                }

                if (fileType.type === 'video') {
                  return (
                    <div className="h-full flex items-center justify-center bg-background p-8">
                      <div className="text-center space-y-4 max-w-2xl w-full">
                        <Film className="h-12 w-12 mx-auto text-muted-foreground" />
                        <div className="space-y-2">
                          <h3 className="text-lg font-medium">Video Preview</h3>
                          <p className="text-sm text-muted-foreground">
                            {activeFile.file.name}
                          </p>
                        </div>
                        <div className="border rounded-lg p-4 bg-muted/30 overflow-auto">
                          <video
                            src={getMediaDataUrl(activeFile)}
                            controls
                            className="max-w-full max-h-96 mx-auto rounded shadow-sm"
                            onError={(e) => {
                              const target = e.target as HTMLVideoElement;
                              target.style.display = 'none';
                              if (!target.parentElement?.querySelector('.error-msg')) {
                                const div = document.createElement('div');
                                div.className = 'error-msg text-sm text-muted-foreground';
                                div.textContent = 'Unable to play video';
                                target.parentElement?.appendChild(div);
                              }
                            }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Video files cannot be edited in the text editor
                        </p>
                      </div>
                    </div>
                  );
                }

                if (fileType.type === 'unsupported') {
                  return (
                    <div className="h-full flex items-center justify-center bg-background p-8">
                      <div className="text-center space-y-4">
                        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground" />
                        <div className="space-y-2">
                          <h3 className="text-lg font-medium">Unsupported File Type</h3>
                          <p className="text-sm text-muted-foreground">
                            {activeFile.file.name}
                          </p>
                          <p className="text-sm text-muted-foreground max-w-md">
                            This file type is not supported for editing in the text editor.
                            Binary files and certain document formats cannot be displayed here.
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                return (
                  <EditorErrorBoundary>
                    <MonacoEditor
                      height="100%"
                      path={activeFile.file.path}
                      language={getLanguageFromPath(activeFile.file.path)}
                      value={activeFile.content ?? ''}
                      onChange={(value) => handleContentChange(value, activeFile.file.path)}
                      theme={mounted ? (resolvedTheme === 'dark' ? 'vs-dark' : 'light') : 'vs-dark'}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        lineNumbers: 'on',
                        roundedSelection: false,
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: 2,
                        wordWrap: 'on',
                        wrappingIndent: 'indent'
                      }}
                    />
                  </EditorErrorBoundary>
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function openFileInEditor(file: VirtualFile) {
  window.dispatchEvent(new CustomEvent('openFile', { detail: file }));
}
