import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AptosWalletAdapterProvider } from '@aptos-labs/wallet-adapter-react'
import { Network } from '@aptos-labs/ts-sdk'
import App from './App'
import './styles/global.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 10000, // Auto-refetch every 10 seconds
      refetchIntervalInBackground: true,
      staleTime: 5000,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AptosWalletAdapterProvider
        autoConnect={true}
        dappConfig={{
          network: Network.CUSTOM,
          aptosApiKey: undefined,
        }}
        onError={(error) => {
          console.error('Wallet error:', error)
        }}
      >
        <App />
      </AptosWalletAdapterProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
