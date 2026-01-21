import { useState, useCallback, useRef, memo } from 'react';
import { useToast } from './Toast';

interface UploadedFile {
  name: string;
  size: number;
  url: string;
  viewerUrl: string;
  uploadedAt: Date;
  sessionId?: string;
}

interface FileUploadProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
}

// ASCII-style terminal progress bar
const AsciiProgressBar = memo(({ percent, width = 20, label }: { percent: number; width?: number; label?: string }) => {
  const filled = Math.round((Math.min(100, percent) / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  return (
    <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      {label && (
        <span style={{
          color: 'var(--foreground2)',
          minWidth: '120px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      )}
      <span style={{ color: '#F25D94' }}>[</span>
      <span style={{ color: '#F25D94' }}>{bar.slice(0, filled)}</span>
      <span style={{ color: 'var(--background2)' }}>{bar.slice(filled)}</span>
      <span style={{ color: '#F25D94' }}>]</span>
      <span style={{ color: 'var(--foreground0)', minWidth: '40px', textAlign: 'right' }}>
        {Math.round(percent)}%
      </span>
    </div>
  );
});

AsciiProgressBar.displayName = 'AsciiProgressBar';

// Generate a random session ID for grouping files
const generateSessionId = () => {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
};

export const ShareTab = memo(() => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<FileUploadProgress[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const uploadFile = async (file: File, sessionId: string, onProgress: (percent: number) => void): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionId', sessionId);

      const xhr = new XMLHttpRequest();
      let settled = false;

      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };

      // Track upload progress - cap at 99% until server responds
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        settle(() => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              const viewerUrl = data.viewerUrl
                ? `${window.location.origin}${data.viewerUrl}`
                : data.url;
              resolve({
                name: file.name,
                size: file.size,
                url: data.url,
                viewerUrl,
                uploadedAt: new Date(),
                sessionId,
              });
            } catch {
              reject(new Error('Invalid response from server'));
            }
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText);
              reject(new Error(errorData.error || `Upload failed (${xhr.status})`));
            } catch {
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          }
        });
      };

      xhr.onerror = () => {
        settle(() => reject(new Error('Network error - check your connection')));
      };

      xhr.ontimeout = () => {
        settle(() => reject(new Error('Upload timed out')));
      };

      xhr.onabort = () => {
        settle(() => reject(new Error('Upload was cancelled')));
      };

      // 10 minute timeout for large files on mobile
      xhr.timeout = 10 * 60 * 1000;

      xhr.open('POST', '/api/share/upload');
      xhr.send(formData);
    });
  };

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setError(null);
    setIsUploading(true);

    // Generate a new session ID for this batch
    const sessionId = generateSessionId();
    setCurrentSessionId(sessionId);

    // Initialize upload queue with all files
    const initialQueue: FileUploadProgress[] = Array.from(files).map(file => ({
      file,
      progress: 0,
      status: 'pending' as const,
    }));

    // Filter out files that are too large
    const validQueue = initialQueue.filter(item => {
      if (item.file.size > 2 * 1024 * 1024 * 1024) {
        showToast({
          type: 'error',
          message: `${item.file.name} is too large (max 2GB)`
        });
        return false;
      }
      return true;
    });

    if (validQueue.length === 0) {
      setIsUploading(false);
      return;
    }

    setUploadQueue(validQueue);

    const newFiles: UploadedFile[] = [];

    try {
      // Upload files sequentially with individual progress tracking
      for (let i = 0; i < validQueue.length; i++) {
        const item = validQueue[i];

        // Update status to uploading
        setUploadQueue(prev => prev.map((q, idx) =>
          idx === i ? { ...q, status: 'uploading' } : q
        ));

        try {
          const uploaded = await uploadFile(item.file, sessionId, (percent) => {
            setUploadQueue(prev => prev.map((q, idx) =>
              idx === i ? { ...q, progress: percent } : q
            ));
          });

          // Mark as complete with 100%
          setUploadQueue(prev => prev.map((q, idx) =>
            idx === i ? { ...q, progress: 100, status: 'complete' } : q
          ));

          newFiles.push(uploaded);
          showToast({ type: 'success', message: `Uploaded ${item.file.name}` });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          setUploadQueue(prev => prev.map((q, idx) =>
            idx === i ? { ...q, status: 'error', error: errorMsg } : q
          ));
          showToast({
            type: 'error',
            message: `Failed: ${item.file.name}`
          });
        }
      }

      if (newFiles.length > 0) {
        setUploadedFiles(prev => [...newFiles, ...prev]);
      }

      // Brief delay before resetting to show completed state
      await new Promise(r => setTimeout(r, 800));
    } finally {
      // Always reset uploading state
      setIsUploading(false);
      setUploadQueue([]);
    }
  }, [showToast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFiles]);

  const copyToClipboard = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showToast({ type: 'success', message: 'URL copied to clipboard!' });
    } catch {
      showToast({ type: 'error', message: 'Failed to copy URL' });
    }
  }, [showToast]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <column gap-="2" style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <column gap-="1" style={{ textAlign: 'center', padding: '1rem 0' }}>
        <h2 style={{
          margin: 0,
          background: 'linear-gradient(135deg, var(--pink) 0%, var(--purple) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          Shelby Share
        </h2>
        <p style={{ color: 'var(--foreground2)', margin: 0, fontSize: '0.9rem' }}>
          Upload files to decentralized storage. No wallet needed.
        </p>
      </column>

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          position: 'relative',
          border: `2px dashed ${isDragging ? 'var(--pink)' : 'var(--background2)'}`,
          borderRadius: '16px',
          padding: '3rem 2rem',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          background: isDragging
            ? 'linear-gradient(135deg, rgba(242, 93, 148, 0.1) 0%, rgba(125, 86, 244, 0.1) 100%)'
            : 'var(--background0)',
          transform: isDragging ? 'scale(1.02)' : 'scale(1)',
        }}
      >
        {/* Upload Button - TUI styled */}
        <button
          is-="button"
          variant-="accent"
          style={{
            position: 'relative',
            margin: '0 auto 1.5rem',
            padding: '1rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '1rem',
            zIndex: 1,
            transform: isDragging ? 'scale(1.05)' : 'scale(1)',
            transition: 'transform 0.2s ease',
          }}
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload
        </button>

        {isUploading && uploadQueue.length > 0 ? (
          <column gap-="0.5" style={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}>
            <span style={{
              color: 'var(--foreground0)',
              fontSize: '0.9rem',
              textAlign: 'center',
              fontFamily: 'monospace',
              marginBottom: '0.5rem',
            }}>
              ▶ Uploading {uploadQueue.length} file{uploadQueue.length !== 1 ? 's' : ''}...
            </span>
            {/* Individual file progress bars */}
            <div style={{
              background: 'var(--background1)',
              border: '1px solid var(--background2)',
              borderRadius: '8px',
              padding: '0.75rem',
            }}>
              {uploadQueue.map((item, idx) => (
                <div key={idx} style={{ marginBottom: idx < uploadQueue.length - 1 ? '0.5rem' : 0 }}>
                  <AsciiProgressBar
                    percent={item.progress}
                    width={16}
                    label={item.file.name.length > 15 ? item.file.name.slice(0, 12) + '...' : item.file.name}
                  />
                  {item.status === 'error' && (
                    <span style={{ color: 'var(--pink)', fontSize: '0.75rem', fontFamily: 'monospace', marginLeft: '120px' }}>
                      ✗ {item.error}
                    </span>
                  )}
                  {item.status === 'complete' && (
                    <span style={{ color: 'var(--green)', fontSize: '0.75rem', fontFamily: 'monospace', marginLeft: '120px' }}>
                      ✓ Complete
                    </span>
                  )}
                </div>
              ))}
            </div>
          </column>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, border: 'none' }}>
            <span style={{
              color: 'var(--foreground0)',
              fontSize: '1.1rem',
              fontWeight: 500,
            }}>
              {isDragging ? 'Drop to upload' : 'Drop files here'}
            </span>
            <span style={{ color: 'var(--foreground2)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              or click to browse
            </span>
            <span style={{ color: 'var(--foreground2)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
              Images, Videos, PDFs (max 2GB)
            </span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,.svg,.pdf,application/pdf"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          padding: '0.75rem 1rem',
          background: 'rgba(242, 93, 148, 0.1)',
          border: '1px solid var(--pink)',
          borderRadius: '8px',
          color: 'var(--pink)',
          fontSize: '0.85rem',
        }}>
          {error}
        </div>
      )}

      {/* Shareable Folder Link */}
      {currentSessionId && uploadedFiles.filter(f => f.sessionId === currentSessionId).length > 0 && (
        <div style={{
          background: 'var(--background1)',
          border: '1px solid var(--background2)',
          borderRadius: '8px',
          padding: '1rem',
        }}>
          <row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <row gap-="0.5" style={{ alignItems: 'center' }}>
              <span style={{ fontFamily: 'monospace', color: '#F25D94', fontSize: '1.1rem' }}>📁</span>
              <span style={{ color: 'var(--foreground0)', fontWeight: 500, fontFamily: 'monospace' }}>
                Session Folder
              </span>
            </row>
            <span is-="badge" variant-="pink">
              {uploadedFiles.filter(f => f.sessionId === currentSessionId).length} files
            </span>
          </row>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'var(--background0)',
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            border: '1px solid var(--background2)',
          }}>
            <span style={{
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              color: 'var(--foreground2)',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {`${window.location.origin}/api/share/folder/${currentSessionId}`}
            </span>
            <button
              is-="button"
              variant-="accent"
              size-="half"
              onClick={() => copyToClipboard(`${window.location.origin}/api/share/folder/${currentSessionId}`)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy Link
            </button>
          </div>
        </div>
      )}

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <column gap-="1">
          <row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--foreground0)', fontWeight: 500, fontFamily: 'monospace' }}>
              ▸ Uploaded Files
            </span>
            <span is-="badge" variant-="background2">
              {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''}
            </span>
          </row>

          <column gap-="1">
            {uploadedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                style={{
                  background: 'var(--background0)',
                  border: '1px solid var(--background2)',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                }}
              >
                <row style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <column gap-="0" style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      color: 'var(--foreground0)',
                      fontSize: '0.9rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {file.name}
                    </span>
                    <span style={{ color: 'var(--foreground2)', fontSize: '0.75rem' }}>
                      {formatFileSize(file.size)}
                    </span>
                  </column>
                  <row gap-="0.5" style={{ flexShrink: 0 }}>
                    <a
                      href={file.viewerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      is-="button"
                      variant-="accent"
                      size-="half"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        textDecoration: 'none',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                      View
                    </a>
                    <button
                      is-="button"
                      variant-="background2"
                      size-="half"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(file.viewerUrl);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy
                    </button>
                  </row>
                </row>
                <div style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem',
                  background: 'var(--background1)',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  fontFamily: 'monospace',
                  color: 'var(--foreground2)',
                  wordBreak: 'break-all',
                  userSelect: 'all',
                }}>
                  {file.viewerUrl}
                </div>
              </div>
            ))}
          </column>
        </column>
      )}

    </column>
  );
});

ShareTab.displayName = 'ShareTab';
