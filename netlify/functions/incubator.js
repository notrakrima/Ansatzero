const LEVELS = [
    { title: "Stage 1: Identifying Community Needs", context: "The local park is covered in litter and the playground equipment is broken. Most people are just complaining about it.", challenge: "As an Enturperur, what action can you take to turn this problem into an opportunity?", funding: 1000 },
    { title: "Stage 2: Building a Team", context: "You want to start a robotics club, but you are the only one who knows how to code.", challenge: "How do you convince others to join your team?", funding: 2500 }
];

exports.handler = async function(event, context) {
    // 1. Setup CORS First (Must happen before parsing anything)
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
    if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "Method Not Allowed" };

    try {
        // 2. Safely parse the body
        const body = JSON.parse(event.body);
        
        // 3. SECURE PASSCODE CHECK
        if (body.passcode !== process.env.GAME_PASSCODE) {
            return {
                statusCode: 401,
                headers, // <-- Make sure headers return even on failure
                body: JSON.stringify({ error: "Unauthorized: Incorrect Game Passcode" })
            };
        }

        // 4. Connect to LiteLLM Proxy
        const apiKey = process.env.LITELLM_MASTER_KEY;
        const baseUrl = process.env.LITELLM_BASE_URL || "https://api.openai.com/v1"; 

        if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing LiteLLM Master Key" }) };

        const { stage_index, pitch } = body;
        const level = LEVELS[stage_index] || LEVELS[0];

        const systemPrompt = `You are an Angel Investor and Innovation Mentor at the UNE Smart Region Incubator.
        You are evaluating a young 'Enturperur' for a Seed Funding round of $${level.funding.toLocaleString()}.
        CONTEXT: ${level.context}
        CHALLENGE: ${level.challenge}
        CRITICAL INSTRUCTIONS:
        1. If the user's answer is logically sound, ethical, and shows entrepreneurial critical thinking, you MUST output the exact tag [STATUS: FUNDED] before your response.
        2. SOCRATIC RULE: If the user gives a correct but overly short answer, do NOT fund them yet. Output [STATUS: NORMAL] and ask *why* that is the right choice.
        3. If they are wrong or unethical, output [STATUS: NORMAL] and offer a mentor's guidance.
        4. Keep language supportive, constructive, and under 3 sentences.`;

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: pitch }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error("PROXY ERROR:", JSON.stringify(data, null, 2));
            return { statusCode: 500, headers, body: JSON.stringify({ error: "API Proxy rejected the request. Check terminal logs." }) };
        }

        const raw_reply = data.choices[0].message.content;
        const isFunded = raw_reply.includes("[STATUS: FUNDED]");
        const clean_text = raw_reply.replace(/\[STATUS:\s*[^\]]+\]/g, "").trim();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                is_funded: isFunded,
                mentor_reply: clean_text,
                funding_amount: level.funding
            })
        };

    } catch (error) {
        console.error("CODE ERROR:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};
