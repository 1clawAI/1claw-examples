import { createClient } from "@1claw/sdk";

const API_URL = process.env.ONECLAW_BASE_URL || "https://api.1claw.xyz";
const PLATFORM_KEY = process.env.ONECLAW_PLATFORM_KEY;

if (!PLATFORM_KEY) {
  console.error("Set ONECLAW_PLATFORM_KEY to your plt_ API key");
  process.exit(1);
}

const client = createClient({
  baseUrl: API_URL,
  apiKey: PLATFORM_KEY,
});

async function main() {
  console.log("--- 1Claw Platform Connect Example ---\n");

  // 1. List existing platform apps
  console.log("1. Listing platform apps...");
  const apps = await client.platform.listApps();
  const appList = apps.data?.apps ?? [];
  console.log(`   Found ${appList.length} app(s)\n`);

  // 2. Create a bootstrap template (if we have an app)
  if (appList.length > 0) {
    const appId = appList[0].id;
    console.log(`2. Creating template for app ${appId}...`);

    const template = await client.platform.createTemplate(appId, {
      name: `demo-${Date.now()}`,
      spec: {
        vault: { name: "demo-vault", description: "Demo vault from Platform API" },
        agents: [
          {
            name: "demo-agent",
            shroud_enabled: true,
            shroud_config: {
              pii_policy: "redact",
              injection_threshold: 0.7,
            },
          },
        ],
        policies: [
          {
            principal_ref: "agents.primary",
            vault_ref: "vault",
            paths: ["api-keys/*", "tokens/*"],
            permissions: ["read", "write"],
          },
        ],
      },
    });
    console.log(`   Template created: ${template.data?.id}\n`);

    // 3. Provision a user
    console.log("3. Provisioning a user...");
    const user = await client.platform.upsertUser({
      email: `demo-user-${Date.now()}@example.com`,
      display_name: "Demo User",
    });
    console.log(`   User: ${user.data?.user_handle} (new: ${user.data?.is_new})`);
    console.log(`   Connection: ${user.data?.connection_id}\n`);

    // 4. Bootstrap resources
    if (user.data?.connection_id && template.data?.id) {
      console.log("4. Bootstrapping resources...");
      const bootstrap = await client.platform.bootstrapUser(
        user.data.connection_id,
        { template_id: template.data.id }
      );
      console.log(`   Claim URL: ${bootstrap.data?.claim_url}`);
      console.log(`   Vault: ${bootstrap.data?.summary?.vault_id}`);
      console.log(`   Agent: ${bootstrap.data?.summary?.agent_id}`);
      console.log(`   Policies: ${bootstrap.data?.summary?.policy_ids?.join(", ")}\n`);
    }

    // 5. List connected users
    console.log("5. Listing connected users...");
    const users = await client.platform.listUsers(appId);
    const userList = users.data?.users ?? [];
    console.log(`   ${userList.length} connected user(s)\n`);
  }

  console.log("--- Done ---");
}

main().catch(console.error);
