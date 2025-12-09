import { useState, useRef, useEffect, memo } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';

const WalletButtonComponent = () => {
  const { connected, account, connect, disconnect, wallets } = useWallet();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const shortenAddress = (address: string) => {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const installedWallets = wallets?.filter(w => w.readyState === 'Installed') || [];

  if (connected && account?.address) {
    return (
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          style={{
            padding: '0.4rem 0.75rem',
            background: 'linear-gradient(135deg, #FF1493, #FF69B4)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontFamily: 'monospace',
          }}
        >
          <span style={{ color: '#00FF88', fontSize: '0.6rem' }}>●</span>
          {shortenAddress(account.address.toString())}
        </button>

        {showDropdown && (
          <div style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '0.5rem',
            background: 'var(--background)',
            border: '1px solid var(--background2)',
            borderRadius: '8px',
            padding: '0.5rem',
            minWidth: '180px',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            <div style={{
              padding: '0.5rem',
              borderBottom: '1px solid var(--background2)',
              marginBottom: '0.5rem',
            }}>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.65rem' }}>Connected</small>
              <div style={{
                fontFamily: 'monospace',
                fontSize: '0.7rem',
                wordBreak: 'break-all',
                color: 'var(--foreground)',
              }}>
                {account.address.toString()}
              </div>
            </div>
            <button
              onClick={() => {
                disconnect();
                setShowDropdown(false);
              }}
              style={{
                width: '100%',
                padding: '0.5rem',
                background: 'transparent',
                color: '#FF4444',
                border: '1px solid #FF4444',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        style={{
          padding: '0.4rem 0.75rem',
          background: 'linear-gradient(135deg, #FF1493, #FF69B4)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
        }}
      >
        Connect
      </button>

      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '0.5rem',
          background: 'var(--background)',
          border: '1px solid var(--background2)',
          borderRadius: '8px',
          padding: '0.75rem',
          minWidth: '200px',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          <small style={{
            color: 'var(--foreground2)',
            fontSize: '0.7rem',
            display: 'block',
            marginBottom: '0.5rem',
          }}>
            Connect Wallet
          </small>

          {installedWallets.length > 0 ? (
            <column gap-="0.5">
              {installedWallets.map((wallet) => (
                <button
                  key={wallet.name}
                  onClick={() => {
                    connect(wallet.name);
                    setShowDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    background: 'var(--background2)',
                    color: 'var(--foreground)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    textAlign: 'left',
                  }}
                >
                  {wallet.icon && (
                    <img
                      src={wallet.icon}
                      alt=""
                      style={{ width: 20, height: 20, borderRadius: '4px' }}
                    />
                  )}
                  {wallet.name}
                </button>
              ))}
            </column>
          ) : (
            <div style={{
              padding: '0.75rem',
              background: 'var(--background2)',
              borderRadius: '6px',
              fontSize: '0.75rem',
              color: 'var(--foreground2)',
              textAlign: 'center',
            }}>
              No Aptos wallet found.
              <br />
              <a
                href="https://petra.app"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent)', textDecoration: 'underline' }}
              >
                Install Petra
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const WalletButton = memo(WalletButtonComponent);
