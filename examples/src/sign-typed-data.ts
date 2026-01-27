import { OneAuthClient, createOneAuthProvider } from '@rhinestone/1auth';

// Configuration
// -------------
// clientId: Must be registered on the passkey server. In development mode (localhost),
//           apps are auto-created. In production, you must register your app first.
// providerUrl: The passkey authentication server URL.
//              - Local dev: http://localhost:3001 (auto-creates unregistered apps)
//              - Production: https://passkey.1auth.box (requires registered clientId)
const client = new OneAuthClient({
  clientId: 'example-app'
});

const provider = createOneAuthProvider({ client });

// Example EIP-712 typed data
const typedData = {
  domain: {
    name: 'Example App',
    version: '1',
    chainId: 84532,
    verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC' as const,
  },
  types: {
    Person: [
      { name: 'name', type: 'string' },
      { name: 'wallet', type: 'address' },
    ],
  },
  primaryType: 'Person' as const,
  message: {
    name: 'Alice',
    wallet: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
  },
};

let connectedAddress: string | null = null;

// DOM elements
const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement;
const disconnectBtn = document.getElementById('disconnect-btn') as HTMLButtonElement;
const connectSection = document.getElementById('connect-section') as HTMLDivElement;
const connectedSection = document.getElementById('connected-section') as HTMLDivElement;
const addressSpan = document.getElementById('address') as HTMLSpanElement;
const connectStatus = document.getElementById('connect-status') as HTMLParagraphElement;
const signSection = document.getElementById('sign-section') as HTMLDivElement;
const typedDataPreview = document.getElementById('typed-data-preview') as HTMLDivElement;
const signBtn = document.getElementById('sign-btn') as HTMLButtonElement;
const signStatus = document.getElementById('sign-status') as HTMLParagraphElement;
const signatureResult = document.getElementById('signature-result') as HTMLDivElement;
const signatureSpan = document.getElementById('signature') as HTMLDivElement;

// Show typed data preview
typedDataPreview.textContent = JSON.stringify(typedData, null, 2);

function updateUI() {
  if (connectedAddress) {
    connectSection.style.display = 'none';
    connectedSection.style.display = 'block';
    signSection.style.display = 'block';
    addressSpan.textContent = connectedAddress;
  } else {
    connectSection.style.display = 'block';
    connectedSection.style.display = 'none';
    signSection.style.display = 'none';
  }
  signatureResult.style.display = 'none';
  signStatus.textContent = '';
}

async function connect() {
  connectBtn.disabled = true;
  connectStatus.textContent = 'Connecting...';

  try {
    const accounts = await provider.request({ method: 'wallet_connect' }) as string[];
    connectedAddress = accounts[0];
    updateUI();
  } catch (error) {
    connectStatus.textContent = `Error: ${(error as Error).message}`;
  } finally {
    connectBtn.disabled = false;
  }
}

async function disconnect() {
  await provider.disconnect();
  connectedAddress = null;
  updateUI();
}

async function signTypedData() {
  signBtn.disabled = true;
  signStatus.textContent = 'Signing...';
  signatureResult.style.display = 'none';

  try {
    const signature = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [connectedAddress, typedData],
    });

    signatureSpan.textContent = signature as string;
    signatureResult.style.display = 'block';
    signStatus.textContent = '';
  } catch (error) {
    signStatus.textContent = `Error: ${(error as Error).message}`;
  } finally {
    signBtn.disabled = false;
  }
}

// Event listeners
connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);
signBtn.addEventListener('click', signTypedData);

// Check for existing connection on load
(async () => {
  const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
  if (accounts.length > 0) {
    connectedAddress = accounts[0];
  }
  updateUI();
})();
