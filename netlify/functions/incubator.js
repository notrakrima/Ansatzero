exports.handler = async function(event, context) {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
    if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "Method Not Allowed" };

    try {
        const body = JSON.parse(event.body);
        
        if (body.passcode !== process.env.GAME_PASSCODE) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized: Incorrect Game Passcode" }) };
        }

        const apiKey = process.env.LITELLM_MASTER_KEY;
        const baseUrl = process.env.LITELLM_BASE_URL || "https://api.openai.com/v1"; 

        if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing LiteLLM Master Key" }) };

        const { stage_index, pitch, current_context, current_challenge, history } = body;

        const THEMES = [
            "Identifying Community Needs",
            "User-Centric Design. The founder discovers the demographic actually using their product is completely different from who they originally targeted. Present a logical but surprising new user base.",
            "Human Authenticity. The founder must pitch their product to a high-level stakeholder, but their prepared materials sound overly robotic and disconnected. They must show authentic passion.",
            "Defeating Digital Distractions. The founder is experiencing severe operational overload and is losing focus to algorithms and busywork while trying to scale. They need a practical boundary.",
            "Managing Data Ethics. A shadowy third-party offers a massive shortcut or funding, but it requires compromising the privacy or safety of the startup's specific users. Present a tough ethical choice.",
            "The Pivot. Users are ignoring the main intended feature of the product and instead obsessing over a secondary, unexpected use-case. What should the founder do?",
            "Unique Value Proposition. A massive, well-funded mega-corporation just launched a highly polished clone of the product. The startup must identify an uncopyable local or niche advantage.",
            "Product Quality over Hype. Funds are running critically low. A choice must be made between fixing a core product flaw or paying for aggressive marketing/hype.",
            "Founder Wellbeing. A critical failure occurs right before a major milestone. The founder is exhausted and frustrated. How do they manage their mindset and the crisis?",
            "The Smart Region Incubator. The startup is a massive success. The founder must now decide how to reinvest their success to permanently uplift their local community or industry."
        ];

        let nextStagePrompt = "";
        if (stage_index < 9) {
            nextStagePrompt = `If you decide to FUND them, you MUST also generate the scenario for Stage ${stage_index + 2}. 
            The theme for Stage ${stage_index + 2} is: "${THEMES[stage_index + 1]}".
            CRITICAL DIRECTIVE: You are a storyteller. Look closely at their specific startup idea and previous answers. Tailor this next scenario flawlessly to their product, industry, and previous decisions. Do NOT use generic examples—invent a logical continuation of THEIR specific entrepreneurial journey.`;
        }

        const systemPrompt = `You are the UNE-SRI Entrepreneur Mentor.
        The user is a founder navigating Stage ${stage_index + 1} of 10.
        CURRENT SCENARIO: ${current_context}
        THEIR CHALLENGE: ${current_challenge}
        
        INSTRUCTIONS:
        Evaluate their pitch. Does it solve the challenge ethically, logically, and demonstrate high-level entrepreneurial thinking?
        - If YES: Fund them.
        - If NO/TOO SHORT: Do not fund them. Ask a Socratic question to guide them.

        OUTPUT FORMAT:
        You MUST output ONLY valid JSON in this exact structure:
        {
            "status": "FUNDED" or "NORMAL",
            "mentor_reply": "Your feedback to the user (constructive, speaking directly to them, under 3 sentences).",
            "next_context": "If FUNDED and not stage 10, write a 2-sentence scenario for the next stage that integrates seamlessly with their specific product/service. Make the world react to what they are building. Otherwise empty string.",
            "next_challenge": "If FUNDED and not stage 10, write the specific question or dilemma they must answer next based on the new context. Otherwise empty string."
        }

        ${nextStagePrompt}`;

        let messages = [
            { role: "system", content: systemPrompt },
            ...(history || []),
            { role: "user", content: pitch }
        ];

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
                response_format: { type: "json_object" } 
            })
        });

        const data = await response.json();
        if (!response.ok) {
            console.error("PROXY ERROR:", JSON.stringify(data, null, 2));
            return { statusCode: 500, headers, body: JSON.stringify({ error: "API Proxy rejected the request. Check terminal logs." }) };
        }

        const aiResponse = JSON.parse(data.choices[0].message.content);
        const isFunded = aiResponse.status === "FUNDED";
        
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
