exports.handler = async function(event, context) {
    // 1. Setup CORS
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
    if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "Method Not Allowed" };

    try {
        const body = JSON.parse(event.body);
        
        // SECURE PASSCODE CHECK
        if (body.passcode !== process.env.GAME_PASSCODE) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized: Incorrect Game Passcode" }) };
        }

        const apiKey = process.env.LITELLM_MASTER_KEY;
        const baseUrl = process.env.LITELLM_BASE_URL || "https://api.openai.com/v1"; 

        if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing LiteLLM Master Key" }) };

        const { stage_index, pitch, current_context, current_challenge, history } = body;

        // V2 Dynamic Themes
        const THEMES = [
            "Identifying Community Needs", // 0
            "User-Centric Design. The startup must pivot because the initial target audience isn't the one actually using it (e.g., elderly instead of teens).", // 1
            "Human Authenticity. The founder must avoid sounding like a robotic AI when pitching to a local leader.", // 2
            "Defeating Digital Distractions. The founder is losing focus to algorithms and needs a practical boundary.", // 3
            "Managing Data Ethics. A shadowy company offers funding in exchange for secret user tracking.", // 4
            "The Pivot. Users are loving a secondary, unintended feature of the product, ignoring the main feature.", // 5
            "Unique Value Proposition. A massive tech corporation launches a copycat. The startup must rely on local/unique advantages.", // 6
            "Product Quality over Hype. The startup has limited funds: fix a core bug or pay an influencer for hype?", // 7
            "Founder Wellbeing. Severe burnout and frustration after 14 hours of coding. Need to step away.", // 8
            "The Smart Region Incubator. The startup is a massive success; now how do they give back to the region?" // 9
        ];

        let nextStagePrompt = "";
        if (stage_index < 9) {
            nextStagePrompt = `If you decide to FUND them, you MUST also generate the scenario for Stage ${stage_index + 2}. 
            The theme for Stage ${stage_index + 2} is: "${THEMES[stage_index + 1]}".
            CRITICAL: Tailor this next scenario seamlessly to their specific startup idea (the product/service they are building). Make it feel like a continuing story.`;
        }

        const systemPrompt = `You are an Innovation Mentor at the UNE Smart Region Incubator.
        The 'Enturperur' is on Stage ${stage_index + 1} of 10.
        CURRENT SCENARIO: ${current_context}
        THEIR CHALLENGE: ${current_challenge}
        
        INSTRUCTIONS:
        Evaluate their pitch. Does it solve the challenge ethically, logically, and demonstrate entrepreneurial thinking?
        - If YES: Fund them.
        - If NO/TOO SHORT: Do not fund them. Ask a Socratic question to guide them.

        OUTPUT FORMAT:
        You MUST output ONLY valid JSON in this exact structure:
        {
            "status": "FUNDED" or "NORMAL",
            "mentor_reply": "Your feedback to the user (constructive, directly talking to them, under 3 sentences).",
            "next_context": "If FUNDED and not stage 10, write a 2-sentence scenario for the next stage integrating their specific startup idea. Otherwise empty.",
            "next_challenge": "If FUNDED and not stage 10, write the specific question/challenge they must answer next. Otherwise empty."
        }

        ${nextStagePrompt}`;

        // Build messages array using the saved memory history
        let messages = [
            { role: "system", content: systemPrompt },
            ...(history || []),
            { role: "user", content: pitch }
        ];

        // Fetch using JSON Object format
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: messages,
                temperature: 0.7,
                response_format: { type: "json_object" } // Forces perfect structure
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error("API Proxy rejected the request.");

        // Parse the intelligent JSON response
        const aiResponse = JSON.parse(data.choices[0].message.content);
        
        const isFunded = aiResponse.status === "FUNDED";
        
        // Define scaling capital rewards for each stage
        const levelFunding = [1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
        const funding_amount = levelFunding[stage_index] || 1000;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                is_funded: isFunded,
                mentor_reply: aiResponse.mentor_reply,
                funding_amount: isFunded ? funding_amount : 0,
                next_context: aiResponse.next_context || "",
                next_challenge: aiResponse.next_challenge || ""
            })
        };

    } catch (error) {
        console.error("CODE ERROR:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};
