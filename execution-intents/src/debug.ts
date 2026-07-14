async function main() {
    const BASE_URL = "https://api.1claw.xyz";
    const res = await fetch(`${BASE_URL}/v1/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "enterprise-test@1claw.xyz", password: "Demo1claw!seed" }),
    });
    const { access_token } = await res.json() as { access_token: string };

    // Create agent with execution_intents_enabled
    const agentRes = await fetch(`${BASE_URL}/v1/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${access_token}` },
        body: JSON.stringify({ name: `exec-debug-${Date.now()}`, execution_intents_enabled: true }),
    });
    const agentJson = await agentRes.json() as { agent: { id: string; execution_intents_enabled: boolean }; api_key: string };
    console.log("execution_intents_enabled:", agentJson.agent.execution_intents_enabled);
    console.log("agent_id:", agentJson.agent.id);

    // If not enabled, try to update
    if (!agentJson.agent.execution_intents_enabled) {
        console.log("Trying PATCH to enable...");
        const patchRes = await fetch(`${BASE_URL}/v1/agents/${agentJson.agent.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${access_token}` },
            body: JSON.stringify({ execution_intents_enabled: true }),
        });
        const patched = await patchRes.json() as { execution_intents_enabled: boolean };
        console.log("After PATCH:", JSON.stringify(patched).slice(0, 200));
    }

    // Cleanup
    await fetch(`${BASE_URL}/v1/agents/${agentJson.agent.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${access_token}` },
    });
}
main().catch(e => console.error(e));
