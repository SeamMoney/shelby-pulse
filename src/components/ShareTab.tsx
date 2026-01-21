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

      // Track upload progress - cap at 90% since server processing takes additional time
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          // Cap at 90% - the remaining 10% is for server-side processing
          const percent = Math.round((event.loaded / event.total) * 90);
          onProgress(percent);
        }
      };

      // When upload to server completes, show 95% while processing
      xhr.upload.onload = () => {
        onProgress(95);
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
        setUploadStatus(`Uploading ${file.name}...`);
        const uploaded = await uploadFile(file, (percent) => {
          // For multiple files, show progress as: completed files + current file progress
          const baseProgress = (i / totalFiles) * 100;
          const fileProgress = (percent / totalFiles);
          setUploadProgress(Math.round(baseProgress + fileProgress));

          // When upload to our server completes (95%), show processing status
          if (percent >= 95) {
            setUploadStatus(`Processing on Shelby Protocol...`);
          }
        });
        newFiles.push(uploaded);
        // Only show 100% after server responds successfully
        setUploadProgress(((i + 1) / totalFiles) * 100);
        showToast({ type: 'success', message: `Uploaded ${file.name}` });
      } catch (err) {
        showToast({
          type: 'error',
          message: `Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`
        });
      }
    }

    setUploadedFiles(prev => [...newFiles, ...prev]);
    setIsUploading(false);
    setUploadProgress(0);
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
        {/* Animated rings - AirDrop style */}
        {isDragging && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: `${80 + i * 40}px`,
                  height: `${80 + i * 40}px`,
                  border: '1px solid var(--pink)',
                  borderRadius: '50%',
                  transform: 'translate(-50%, -50%)',
                  opacity: 0.6 - i * 0.15,
                  animation: `pulse ${1 + i * 0.3}s ease-in-out infinite`,
                  background: 'transparent',
                }}
              />
            ))}
          </div>
        )}

        {/* Upload Icon */}
        <div style={{
          position: 'relative',
          width: '80px',
          height: '80px',
          margin: '0 auto 1.5rem',
          background: 'linear-gradient(135deg, #F25D94 0%, #7D56F4 100%)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isDragging
            ? '0 0 40px rgba(242, 93, 148, 0.5)'
            : '0 4px 20px rgba(0, 0, 0, 0.3)',
          transition: 'all 0.3s ease',
          zIndex: 1,
        }}>
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: isDragging ? 'translateY(-4px)' : 'translateY(0)',
              transition: 'transform 0.3s ease',
            }}
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>

        {isUploading ? (
          <column gap-="1">
            <span style={{ color: 'var(--foreground0)', fontSize: '1.1rem' }}>
              {uploadStatus}
            </span>
            <div style={{
              width: '200px',
              height: '4px',
              background: 'var(--background2)',
              borderRadius: '2px',
              margin: '0.5rem auto',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${uploadProgress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, var(--pink) 0%, var(--purple) 100%)',
                borderRadius: '2px',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <span style={{ color: 'var(--foreground2)', fontSize: '0.85rem' }}>
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
                <row style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
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
                  <button
                    is-="button"
                    variant-="accent"
                    size-="half"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(file.viewerUrl);
                    }}
                    style={{
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy Link
                  </button>
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

      {/* Info Box */}
      <div style={{
        background: 'var(--background0)',
        border: '1px solid var(--background2)',
        borderRadius: '8px',
        padding: '1rem',
        marginTop: '0.5rem',
      }}>
        <row gap-="1" style={{ alignItems: 'flex-start' }}>
          <span style={{ color: 'var(--purple)', fontSize: '1.2rem' }}>i</span>
          <column gap-="0">
            <span style={{ color: 'var(--foreground0)', fontSize: '0.85rem' }}>
              Files are stored on Shelby Protocol
            </span>
            <span style={{ color: 'var(--foreground2)', fontSize: '0.75rem' }}>
              Decentralized storage on Shelbynet. URLs are permanent and can be used anywhere.
            </span>
          </column>
        </row>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.4;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.1);
            opacity: 0.2;
          }
        }
      `}</style>
    </column>
  );
});

ShareTab.displayName = 'ShareTab';
