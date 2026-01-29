/**
 * Package installation verification script.
 * Tests that the package can be imported correctly after installation.
 */

const errors = [];

// Test main export
try {
  const main = await import("@rhinestone/1auth");

  // Verify key exports exist
  const expectedExports = [
    "OneAuthClient",
    "createOneAuthProvider",
    "createPasskeyProvider",
    "createPasskeyAccount",
    "createPasskeyWalletClient",
    "getSupportedChainIds",
    "getSupportedChains",
    "hashMessage",
  ];

  for (const name of expectedExports) {
    if (!(name in main)) {
      errors.push(`Missing export "${name}" from main entry`);
    }
  }

  console.log("✓ Main export (@rhinestone/1auth) - OK");
} catch (e) {
  errors.push(`Failed to import main entry: ${e.message}`);
}

// Test server export
try {
  const server = await import("@rhinestone/1auth/server");

  const expectedExports = ["signIntent", "createSignIntentHandler"];

  for (const name of expectedExports) {
    if (!(name in server)) {
      errors.push(`Missing export "${name}" from server entry`);
    }
  }

  console.log("✓ Server export (@rhinestone/1auth/server) - OK");
} catch (e) {
  errors.push(`Failed to import server entry: ${e.message}`);
}

// Test wagmi export
try {
  const wagmi = await import("@rhinestone/1auth/wagmi");

  if (!("oneAuth" in wagmi)) {
    errors.push('Missing export "oneAuth" from wagmi entry');
  }

  console.log("✓ Wagmi export (@rhinestone/1auth/wagmi) - OK");
} catch (e) {
  errors.push(`Failed to import wagmi entry: ${e.message}`);
}

// Test react export
try {
  const react = await import("@rhinestone/1auth/react");

  if (!("PayButton" in react)) {
    errors.push('Missing export "PayButton" from react entry');
  }

  console.log("✓ React export (@rhinestone/1auth/react) - OK");
} catch (e) {
  errors.push(`Failed to import react entry: ${e.message}`);
}

// Summary
console.log("");
if (errors.length > 0) {
  console.error("Package verification failed:");
  for (const error of errors) {
    console.error(`  ✗ ${error}`);
  }
  process.exit(1);
} else {
  console.log("All package exports verified successfully!");
  process.exit(0);
}
