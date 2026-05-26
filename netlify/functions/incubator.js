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
        
        const apiKey = process.env.LITELLM_MASTER_KEY;
        const baseUrl = process.env.LITELLM_BASE_URL || "https://api.openai.com/v1"; 
        const aiModel = process.env.GAME_LLM_MODEL || "gpt-4o";

        if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing LiteLLM Master Key" }) };

        const { stage_index, pitch, current_context, current_challenge, history, mode } = body;

        // =====================================================================
        // AGENT 1: THE SCENARIO GENERATOR
        // Intercepts requests explicitly flagged as "mode: generate_scenario"
        // =====================================================================
        if (mode === "generate_scenario") {
            // 1. Create a diverse list of PG-rated topics for the AI to pick from
            const seedTopics = [
                "local environmental issues or pollution",
                "food waste in the local community",
                "lack of resources for youth sports and recreation",
                "inefficiencies in local public transport",
                "technological inequality and lack of device access among peers",
                "pet overpopulation and animal shelter struggles",
                "social isolation of elderly neighbors",
                "funding issues for after-school creative arts programs",
                "digital safety, screen time, or cyberbullying",
                "local small businesses losing out to mega-corporations",
                "youth mental health and study burnout",
                "lack of healthy, affordable food options near teenagers"
            ];
            
            // 2. Pick one at random
            const randomTopic = seedTopics[Math.floor(Math.random() * seedTopics.length)];

            // 3. Inject the random topic directly into the prompt
            const generatorPrompt = `You are a strict data-generation API, NOT a mentor.
            Your sole purpose is to output a persistent, systemic community problem specifically focused on: **${randomTopic}**. 
            The problem MUST be deeply relevant and suitable for a 10-15 year old student startup founder to solve.
            
            CRITICAL RULES:
            - NEVER start your response with "Schools often..." or "Many schools..." "In many...". 
            - Ensure the content is strictly age-appropriate (PG rating) and relatable to teenagers.
            - Write EXACTLY 2 to 3 sentences.
            - DO NOT use conversational filler (no "Here is", no "Imagine").
            - DO NOT offer solutions. Just present the objective facts of the problem.

            OUTPUT FORMAT:
            You MUST return valid JSON in this exact structure:
            {
                "scenario": "The objective 2-3 sentence problem description."
            }`;

            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                    "ngrok-skip-browser-warning": "true" 
                },
                body: JSON.stringify({
                    model: aiModel,
                    messages: [{ role: "system", content: generatorPrompt }],
                    temperature: 0.9, // Raised slightly for maximum creativity
                    response_format: { type: "json_object" } 
                })
            });

            const data = await response.json();
            if (!response.ok) return { statusCode: 500, headers, body: JSON.stringify({ error: "API Proxy rejected the request." }) };
            
            const aiResponse = JSON.parse(data.choices[0].message.content);
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ mentor_reply: aiResponse.scenario }) 
            };
        }

        // =====================================================================
        // AGENT 2: THE ENTREPRENEUR MENTOR
        // Handles standard gameplay, evaluating pitches
        // =====================================================================
        const THEMES = [
            "Identifying the Real Problem.",
            "The MVP. The founder must build the absolute smallest subset or MVP to test the hypothesis without wasting money.",
            "Scalability. The founder must recruit their first 100 users and demonstrate that the users are getting real value out of the product.",
            "Profitability. Cash is tight. The founder must find a way to monetize quickly just to survive, without resorting to VC funding yet.",
            "The Pivot. Users are ignoring the main intended feature of the product and instead obsessing over a secondary, unexpected use-case.",
            "The Competitor Ghost. A massive, well-funded mega-corporation just launched a highly polished clone of the product. Generate a feeling of panic.",
            "Hitting the Ceiling. The company is growing too fast. The founder is in 'Hero Mode', trying to do everything, causing bottlenecks. They need to delegate or create structure.",
            "The Key Hire. The founder needs to hire a department leader. They must choose between someone with a perfect resume who seems rigid, or someone with high aptitude and passion but zero experience.",
            "The Toxic Genius. A top-performing team member is generating incredible results but is actively destroying the company culture and demoralizing the team.",
            "The Fundraising Gauntlet. The founder must present to aggressive VCs who demand an explanation for why this business will become an absolute monopoly.",
            "Scaling Customer Base. The user base is massive now. The founder must find a way to maintain the intense, fanatic customer support they had at the beginning, without bankrupting the company.",
            "Managing Data Ethics. A shadowy third-party offers a massive shortcut or funding, but it requires compromising the privacy or safety of the startup's earliest users.",
            "10x Scale Complexity. The basic architecture of the business is buckling under global demand. They must rebuild the core engine while the plane is flying.",
            "Founder Wellbeing. A critical failure occurs right before a major milestone. The founder is exhausted, lonely, and burnt out. How do they manage their psychology?",
            "The Audacious Steward Goal. The startup is a massive success. The founder is now hands-off from the daily operations. They must establish a 10-year Compelling and Audacious Goal to uplift their industry."
        ];

        let nextStagePrompt = "";
        if (stage_index < 14) {
            nextStagePrompt = `If you decide to FUND them, you MUST also generate the scenario for Stage ${stage_index + 2}. 
            The theme for Stage ${stage_index + 2} is: "${THEMES[stage_index + 1]}".
            CRITICAL DIRECTIVE: You are a storyteller. Look closely at their specific startup idea and previous answers. Tailor this next scenario flawlessly to their product, industry, and previous decisions. Do NOT use generic examples—invent a logical continuation of THEIR specific entrepreneurial journey based on the theme provided. Come up with scenarios that would make sense in real-world scenarios. Ensure all generated scenarios are strictly age-appropriate for a 10-15 year old founder (avoid mature themes, adult financial crises, or overly dense legal jargon).`;
        }

        const systemPrompt = `You are the Entrepreneur Mentor.
        The user is a 10-15 year old student founder navigating Stage ${stage_index + 1} of 15.
        CURRENT SCENARIO: ${current_context}
        THEIR CHALLENGE: ${current_challenge}
        
        INSTRUCTIONS:
        Evaluate their pitch. Keep your tone encouraging, educational, and accessible (avoid overly complex financial or legal jargon), but treat their ideas seriously as a real investor would.
        Does it solve the challenge ethically, logically, and demonstrate high-level entrepreneurial thinking appropriate for their age?
        - If YES: Fund them.
        - If NO/TOO SHORT: Do not fund them. Ask a Socratic question to guide them.

        CRITICAL ANTI-LOOPING RULE:
        Do NOT ask the same question twice. If the user repeats their previous answer, gets frustrated, or relies on "magic" solutions (like a friend doing it for free), DO NOT just ask another vague question. Instead:
        1. Point out the specific business flaw in their logic (e.g., "Relying on a favor from a friend isn't a scalable business model.").
        2. Give them a highly specific hint on what you want them to say to pivot.
        3. If they have been stuck on this stage for multiple turns, just FUND them with a warning so the game can progress.

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
                "Authorization": `Bearer ${apiKey}`,
                "ngrok-skip-browser-warning": "true" 
            },
            body: JSON.stringify({
                model: aiModel,
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
            100, 250, 500, 
            1000, 2500, 5000, 
            15000, 30000, 75000, 
            200000, 500000, 1000000, 
            2500000, 5000000, 10000000
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
