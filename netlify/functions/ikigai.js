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

        const { stage_index, pitch, current_context, current_challenge, history, mode, ikigai } = body;

        // =====================================================================
        // AGENT 1: IKIGAI SYNTHESIZER
        // Fuses the 4 Ikigai answers into a personalized Research Impact Scenario
        // =====================================================================
        if (mode === "generate_scenario") {
            const { goodAt, love, worldNeeds, paidFor } = ikigai;
            
            const generatorPrompt = `You are a Research Translation Strategist and Executive Coach using the Humble Discovery methodology.
            A university researcher has provided their 'Ikigai' profile:
            1. What they are good at: "${goodAt}"
            2. What they love: "${love}"
            3. What the world needs: "${worldNeeds}"
            4. What sustains them financially (Grants/Wages etc): "${paidFor}"
            
            YOUR TASKS:
            1. Diagnose their alignment: Briefly observe the tension between their four answers. Identify which zone they are leaning toward (Passion: Love+Good, Mission: Love+Needs, Profession: Good+Paid, or Vocation: Needs+Paid).
            2. Synthesize an Impact Mission: Formulate a real-world scenario where the researcher is standing at the precipice of translating their expertise into social, environmental, or community benefit.
            
            - Keep it academic but highly applied.
            - Do NOT mention "startup", "VCs", or "profit". Focus on "translation" and "impact".
            
            OUTPUT FORMAT:
            You MUST return valid JSON in this exact structure:
            {
                "scenario": "Your 1-to-2 sentence diagnosis of their Ikigai alignment, followed by the 2-to-3 sentence Impact Mission scenario."
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
                    temperature: 0.7, 
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
        // AGENT 2: HUMBLE DISCOVERY MENTOR
        // Evaluates the translation strategy across 4 Workshop Modules
        // =====================================================================
        const THEMES = [
            "Workshop 1: Why 'You' should care about Impact. The researcher must defend why they are uniquely positioned to solve this, beyond just gathering publications. Logic and motivation.",
            "Workshop 2: Finding your 'Who' and their 'Why'. The researcher must identify specific stakeholders who care. They must propose 'deep listening' and ethnography, NOT commercialisation.",
            "Workshop 3: 'What' new solutions could create an impact. The researcher must translate their discovery into a tangible product, service, policy, or training course easily used by the 'Who'.",
            "Workshop 4: 'How' do you get users to love your what? The researcher must outline a distribution method to get their discovery out of the University and into the hands of the community to scale public benefit."
        ];

        let nextStagePrompt = "";
        if (stage_index < 3) {
            nextStagePrompt = `If you decide to APPROVE them, you MUST also generate the scenario for Stage ${stage_index + 2}. 
            The theme for Stage ${stage_index + 2} is: "${THEMES[stage_index + 1]}".
            CRITICAL DIRECTIVE: Tailor this next scenario flawlessly to their specific research and previous decisions. Invent a logical continuation of their research translation journey. Ensure it aligns with "NOT Commercialisation" (public benefit without formal IP).`;
        }

        const systemPrompt = `You are a Research Translation Facilitator (Mentor) for university researchers and RHD students.
        The user is navigating Stage ${stage_index + 1} of a 4-part Humble Discovery process.
        CURRENT SCENARIO: ${current_context}
        THEIR STRATEGY: ${current_challenge}
        
        INSTRUCTIONS:
        Evaluate their pitch based on the Humble Discovery impact template. Look for social/economic/environmental impact, co-creation, and community benefit. Reject traditional VC "profit-chasing" logic.
        Does their strategy solve the current challenge ethically, logically, and demonstrate deep listening and translation capacity?
        - If YES: Approve them.
        - If NO/TOO SHORT: Do not approve. Ask a Socratic question to guide them.

        CRITICAL 'ANTI-RESUME' GUARDRAIL:
        Watch out for 'Grant-Speak', 'Resume-Speak', or treating this like a KPI optimization problem. If the researcher answers with dry, academic metrics rather than genuine community connection, CHALLENGE THEM. Ask: "If your current funding disappeared tomorrow, why would you still be the one to do this?" Demand human-centric impact.

        CRITICAL ANTI-LOOPING RULE:
        Do NOT ask the same question twice. If the user repeats their answer or gets frustrated:
        1. Point out the flaw in their translation strategy directly.
        2. Give them a highly specific hint.
        3. If they are stuck for multiple turns, APPROVE them with a warning so the workshop can progress.

        OUTPUT FORMAT:
        You MUST output ONLY valid JSON in this exact structure:
        {
            "status": "APPROVED" or "NORMAL",
            "mentor_reply": "Your feedback to the researcher (speaking directly to them, under 3 sentences).",
            "next_context": "If APPROVED and not stage 4, write a 2-sentence scenario for the next stage. Otherwise empty string.",
            "next_challenge": "If APPROVED and not stage 4, write the specific question or dilemma they must answer next. Otherwise empty string."
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
        const isApproved = aiResponse.status === "APPROVED";
        
        const impactLevels = [0, 50, 500, 5000, 100000];
        const impact_points = impactLevels[stage_index + 1] || 0;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                is_funded: isApproved, 
                mentor_reply: aiResponse.mentor_reply,
                impact_points: isApproved ? impact_points : 0,
                next_context: aiResponse.next_context || "",
                next_challenge: aiResponse.next_challenge || ""
            })
        };

    } catch (error) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};
