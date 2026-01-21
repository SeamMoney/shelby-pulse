import { useState, useCallback, useRef, memo } from 'react';
import { useToast } from './Toast';

interface UploadedFile {
  name: string;
  size: number;
  url: string;
  viewerUrl: string;
  uploadedAt: Date;
}

export const ShareTab = memo(() => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>('Uploading...');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
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

  const uploadFile = async (file: File, onProgress: (percent: number) => void): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();

      // Track upload progress - cap at 99% until server responds
      // This ensures toast appears exactly when we hit 100%
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          // Cap at 99% - we'll set 100% when server confirms
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            // viewerUrl is relative, make it absolute using current origin
            const viewerUrl = data.viewerUrl
              ? `${window.location.origin}${data.viewerUrl}`
              : data.url;
            resolve({
              name: file.name,
              size: file.size,
              url: data.url,
              viewerUrl,
              uploadedAt: new Date(),
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
      };

      xhr.onerror = () => {
        reject(new Error('Network error - check your connection'));
      };

      xhr.ontimeout = () => {
        reject(new Error('Upload timed out'));
      };

      // 5 minute timeout
      xhr.timeout = 5 * 60 * 1000;

      xhr.open('POST', '/api/share/upload');
      xhr.send(formData);
    });
  };

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setError(null);
    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus('Uploading...');

    const newFiles: UploadedFile[] = [];
    const totalFiles = files.length;

    for (let i = 0; i < totalFiles; i++) {
      const file = files[i];

      // Check file size (max 2GB)
      if (file.size > 2 * 1024 * 1024 * 1024) {
        showToast({
          type: 'error',
          message: `${file.name} is too large (max 2GB)`
        });
        continue;
      }

      // Warn for large files that may timeout
      if (file.size > 50 * 1024 * 1024) {
        showToast({
          type: 'info',
          message: `Large file - upload may take a while...`
        });
      }

      try {
        setUploadStatus(`Uploading...`);

        const uploaded = await uploadFile(file, (percent) => {
          // For multiple files, show progress as: completed files + current file progress
          const baseProgress = (i / totalFiles) * 100;
          const fileProgress = (percent / totalFiles);
          setUploadProgress(Math.round(baseProgress + fileProgress));
        });

        newFiles.push(uploaded);

        // Show 100% and toast at the exact same moment
        setUploadProgress(100);
        showToast({ type: 'success', message: `Uploaded ${file.name}` });
      } catch (err) {
        showToast({
          type: 'error',
          message: `Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`
        });
      }
    }

    setUploadedFiles(prev => [...newFiles, ...prev]);

    // Brief delay before resetting to show 100% state
    await new Promise(r => setTimeout(r, 600));
    setIsUploading(false);
    setUploadProgress(0);
    setUploadStatus('Uploading...');
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

        {isUploading ? (
          <column gap-="1" style={{ width: '100%', maxWidth: '300px', margin: '0 auto' }}>
            <span style={{ color: 'var(--foreground0)', fontSize: '0.9rem', textAlign: 'center' }}>
              {uploadStatus}
            </span>
            {/* Progress bar */}
            <div style={{
              width: '100%',
              height: '12px',
              background: 'var(--background2)',
              borderRadius: '6px',
              overflow: 'hidden',
              margin: '0.5rem 0',
              border: '1px solid var(--background2)',
            }}>
              <div style={{
                width: `${uploadProgress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #F25D94 0%, #7D56F4 100%)',
                borderRadius: '6px',
                transition: 'width 0.2s ease-out',
              }} />
            </div>
            <span style={{ color: 'var(--foreground2)', fontSize: '0.85rem', textAlign: 'center' }}>
              {Math.round(uploadProgress)}%
            </span>
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

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <column gap-="1">
          <row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--foreground0)', fontWeight: 500 }}>
              Uploaded Files
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
