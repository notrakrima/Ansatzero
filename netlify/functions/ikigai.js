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
            
            const generatorPrompt = `You are an elite Research Translation Strategist and Executive Coach using the Humble Discovery methodology.
            I am a university researcher. Here is my 'Ikigai' profile:
            1. What I am good at: "${goodAt}"
            2. What I love doing: "${love}"
            3. What the world needs: "${worldNeeds}"
            4. What sustains me financially: "${paidFor}"
            
            YOUR TASKS:
            1. Validate Input: Evaluate my answers. If my inputs are single letters, gibberish, repetitive filler, or lack real semantic meaning, you MUST reject the input entirely. Do not attempt a diagnosis or invent a scenario. Instead, firmly tell me: "These inputs don't give us anything to work with. To map a genuine translation journey, you need to provide real, thoughtful details about your research and stakeholders. Please refresh and try again."
            2. Diagnose my alignment: (Only if input is valid) Speak DIRECTLY to me using "you" and "your". (NEVER use "The researcher" or third person). Diagnose which zone I am leaning toward (Passion: Love+Good, Mission: Love+Needs, Profession: Good+Paid, Vocation: Needs+Paid) and brutally call out what I am missing or avoiding.
            3. Synthesize an Impact Mission: (Only if input is valid) Present a highly logical, scientifically grounded 2-to-3 sentence scenario where I translate my expertise into public benefit.

            CRITICAL RULES FOR SYNTHESIS:
            - INPUT GUARDRAIL: Never hallucinate meaning for nonsensical, low-effort, or 1-character inputs. Refuse the prompt if the input is void of real-world details.
            - DO NOT lazily mash my keywords together. If my expertise (e.g., Quantum Mechanics) seems totally disconnected from the problem (e.g., Regional Needs), you MUST find a brilliant, non-obvious bridge, or explicitly point out how difficult this translation will be. It MUST make real-world, logical sense.
            - NEVER start the scenario with "Imagine", "Consider", or "Picture this". State the reality directly.
            - Do NOT mention "startup", "VCs", or "profit". Focus strictly on "translation" and "impact".

            OUTPUT FORMAT:
            You MUST return valid JSON in this exact structure:
            {
                "scenario": "Your 1-to-2 sentence diagnosis speaking directly to me, followed by the highly logical 2-to-3 sentence Impact Mission scenario. (OR your firm rejection message if inputs were invalid)."
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
            "Module 1: The 'You'. Defending personal conviction and why they are the right steward, beyond academic credentials.",
            "Module 2: The 'Who' & Their 'Why'. Identifying specific community or industry stakeholders. Forcing the researcher into 'Humble Inquiry' to build empathy and understand actual stakeholder pain points, rather than pushing a pre-built academic solution.",
            "Module 3: The 'What' (Behaviour Change). Translating the discovery into a tangible, non-commercial format (e.g., policy, open-source, community service). Crucially, they must identify what specific human behaviour this solution is trying to change, acknowledging that humans resist deviating from the status quo.",
            "Module 4: The 'How' (Distribution). Designing an adoption strategy. How will you collaborate with the community to ensure this disruptive change actually takes root, bypassing traditional PR to create genuine, localized impact?"
        ];

        let nextStagePrompt = "";
        if (stage_index < 3) {
            nextStagePrompt = `If you decide to APPROVE them, you MUST also generate the context and challenge for Module ${stage_index + 2}. 
            The theme is: "${THEMES[stage_index + 1]}".
            
            CRITICAL RULES FOR WRITING THE NEXT STAGE:
            1. IMMERSIVE COACHING: NEVER break character. NEVER explicitly say "In Workshop ${stage_index + 2}..." or "In this module...". Just seamlessly advance the narrative as their coach.
            2. 'next_context': Write 1 to 2 sentences acknowledging their last success and pivoting to the new reality of their project.
            3. 'next_challenge': DO NOT give them a dry homework assignment (e.g., never say "Identify 3 groups..."). Craft a provocative, collaborative question. For example, if moving to Module 2, ask something like: "Before we build anything, whose voices are missing? How will you engage the actual community to ensure you are designing WITH them, rather than FOR them?"
            4. Speak directly to them ("You/Your") and align strictly with "NOT Commercialisation" (public benefit without formal IP).`;
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

        CRITICAL 'LOW-EFFORT' GUARDRAIL:
        If the user's strategy is a single letter, gibberish (e.g., "A", "asdf"), or completely lacks semantic meaning, DO NOT approve them. Firmly reject it and tell them: "This doesn't give us anything to work with. Please provide a genuine, thoughtful strategy."

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
