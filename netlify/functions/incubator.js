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
            "Identifying the Real Problem.",
            "The Minimum Kernel. The founder must build the absolute smallest subset or MVP to test the hypothesis without wasting money.",
            "Doing Things That Don't Scale. The founder must recruit their first 100 users manually, face-to-face, instead of relying on a big press launch.",
            "Ramen Profitability. Cash is tight. The founder must find a way to monetize quickly just to survive, without resorting to VC funding yet.",
            "The Pivot. Users are ignoring the main intended feature of the product and instead obsessing over a secondary, unexpected use-case.",
            "The Competitor Ghost. A massive, well-funded mega-corporation just launched a highly polished clone of the product. Generate a feeling of panic.",
            "Hitting the Ceiling. The company is growing too fast. The founder is in 'Hero Mode', trying to do everything, causing bottlenecks. They need to delegate or create structure.",
            "The Key Hire. The founder needs to hire a department leader. They must choose between someone with a perfect resume who seems rigid, or someone with high aptitude and passion but zero experience.",
            "The Toxic Genius. A top-performing team member is generating incredible results but is actively destroying the company culture and demoralizing the team.",
            "The Fundraising Gauntlet. The founder must present to aggressive VCs who demand an explanation for why this business will become an absolute monopoly.",
            "Scaling Customer Love. The user base is massive now. The founder must find a way to maintain the intense, fanatic customer love and support they had at the beginning, without bankrupting the company.",
            "Managing Data Ethics. A shadowy third-party offers a massive shortcut or funding, but it requires compromising the privacy or safety of the startup's earliest users.",
            "10x Scale Complexity. The basic architecture of the business is buckling under global demand. They must rebuild the core engine while the plane is flying.",
            "Founder Wellbeing. A critical failure occurs right before a major milestone. The founder is exhausted, lonely, and burnt out. How do they manage their psychology?",
            "The Audacious Steward Goal. The startup is a massive success. The founder is now hands-off from the daily operations. They must establish a 10-year Compelling and Audacious Goal to uplift their industry."
        ];

        let nextStagePrompt = "";
        if (stage_index < 14) {
            nextStagePrompt = `If you decide to FUND them, you MUST also generate the scenario for Stage ${stage_index + 2}. 
            The theme for Stage ${stage_index + 2} is: "${THEMES[stage_index + 1]}".
            CRITICAL DIRECTIVE: You are a storyteller. Look closely at their specific startup idea and previous answers. Tailor this next scenario flawlessly to their product, industry, and previous decisions. Do NOT use generic examples—invent a logical continuation of THEIR specific entrepreneurial journey based on the theme provided.`;
        }

        const systemPrompt = `You are the UNE-SRI Entrepreneur Mentor.
        The user is a founder navigating Stage ${stage_index + 1} of 15.
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
            "next_context": "If FUNDED and not stage 15, write a 2-sentence scenario for the next stage that integrates seamlessly with their specific product/service. Make the world react to what they are building. Otherwise empty string.",
            "next_challenge": "If FUNDED and not stage 15, write the specific question or dilemma they must answer next based on the new context. Otherwise empty string."
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
            return { statusCode: 500, headers, body: JSON.stringify({ error: "API Proxy rejected the request." }) };
        }

        const aiResponse = JSON.parse(data.choices[0].message.content);
        const isFunded = aiResponse.status === "FUNDED";
        
        const levelFunding = [
            1000, 2500, 5000, 
            10000, 25000, 50000, 
            150000, 300000, 750000, 
            2000000, 5000000, 10000000, 
            25000000, 50000000, 100000000
        ];
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
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};
