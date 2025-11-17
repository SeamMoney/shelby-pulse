import type { Blob } from '../api/shelby'

interface Props {
  blobs: Blob[]
}

export default function RecentBlobs({ blobs }: Props) {
  // Generate some mock data for visual interest
  const mockBlobs: Blob[] = [
    {
      owner: '0x7730...46ef1',
      name: 'nft_metadata_8234.json',
      encoding: 'clay',
      expires: '2025-12-15',
      size: '2.4 KB',
      id: '1',
    },
    {
      owner: '0x9a23...1bc4e',
      name: 'profile_image.png',
      encoding: 'clay',
      expires: '2025-11-28',
      size: '156 KB',
      id: '2',
    },
    {
      owner: '0x4f12...8a7d2',
      name: 'game_state_backup.dat',
      encoding: 'clay',
      expires: '2026-01-10',
      size: '1.2 MB',
      id: '3',
    },
    {
      owner: '0xb2a5...e9a05',
      name: 'contract_abi.json',
      encoding: 'clay',
      expires: '2025-12-01',
      size: '8.9 KB',
      id: '4',
    },
  ]

  const displayBlobs = blobs.length > 0 ? blobs : mockBlobs

  return (
    <column
      box-="round"
      shear-="top"
      pad-="2 1"
      gap-="1"
      style={{
        background: 'var(--background1)',
        maxHeight: '40lh'
      }}
    >
      <row align-="center between" style={{ flexWrap: 'wrap' }}>
        <h3 style={{ color: 'var(--purple)', fontSize: '1.2em', margin: 0 }}>
          ╭──────────────────────╮<br/>
          │  RECENT UPLOADS     │<br/>
          ╰──────────────────────╯
        </h3>
        <button is-="button" variant-="secondary" size-="small">
          [ → View All ]
        </button>
      </row>

      <column gap-="1" style={{ overflow: 'auto' }}>
        {displayBlobs.map((blob) => (
          <column
            key={blob.id}
            box-="square"
            pad-="1 1.5"
            gap-="0"
            style={{
              background: 'var(--background0)',
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
            onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
              e.currentTarget.style.background = 'var(--pink-10)'
              e.currentTarget.style.setProperty('--box-border-color', 'var(--pink)')
            }}
            onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
              e.currentTarget.style.background = 'var(--background0)'
              e.currentTarget.style.removeProperty('--box-border-color')
            }}
          >
            <row align-="start between" gap-="1" style={{ marginBottom: '0.5lh' }}>
              <span className="mono" style={{
                fontSize: '1em',
                fontWeight: 600,
                color: 'var(--foreground0)',
                wordBreak: 'break-all',
                flex: 1
              }}>
                ▸ {blob.name}
              </span>
              <span is-="badge" variant-="purple" style={{ fontSize: '0.8em' }}>
                [{blob.size}]
              </span>
            </row>

            <row align-="center between" gap-="1" style={{ flexWrap: 'wrap' }}>
              <span className="mono" style={{
                fontSize: '0.9em',
                color: 'var(--foreground2)'
              }}>
                👤 {blob.owner}
              </span>
              <span className="mono" style={{
                fontSize: '0.8em',
                color: 'var(--foreground2)'
              }}>
                ⏱ Exp: {new Date(blob.expires).toLocaleDateString()}
              </span>
            </row>
          </column>
        ))}
      </column>
    </column>
  )
}
