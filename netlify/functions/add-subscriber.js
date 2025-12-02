const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    // Only allow POST requests
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { email } = JSON.parse(event.body);
        if (!email) {
            return { statusCode: 400, body: "Email required" };
        }

        // --- CONFIGURATION ---
        const REPO = "notrakrima/ansatzero"; 
        const PATH = "mailing_list.txt";
        
        // We will set this secret in the Netlify Dashboard later
        const TOKEN = process.env.GITHUB_TOKEN; 

        if (!TOKEN) {
            console.error("Missing GITHUB_TOKEN environment variable");
            return { statusCode: 500, body: "Server Configuration Error" };
        }

        const url = `https://api.github.com/repos/${REPO}/contents/${PATH}`;

        // 1. Get existing file (to get SHA and content)
        const getRes = await fetch(url, {
            headers: { 
                Authorization: `token ${TOKEN}`, 
                Accept: "application/vnd.github.v3+json" 
            }
        });
        
        let content = "";
        let sha = null;

        if (getRes.status === 200) {
            const data = await getRes.json();
            sha = data.sha;
            content = Buffer.from(data.content, "base64").toString("utf8");
        } else if (getRes.status === 404) {
            // File doesn't exist yet, we will create it
            console.log("File not found, creating new one.");
        } else {
            console.error(`GitHub API Error (Get): ${getRes.status} ${getRes.statusText}`);
            return { statusCode: 500, body: "Error fetching list" };
        }

        // 2. Append new email (simple deduplication)
        // Clean up input and existing content
        const cleanEmail = email.trim().toLowerCase();
        
        // Check if email already exists in the content
        // processing line by line to be safe
        const lines = content.split('\n').map(l => l.trim().toLowerCase());
        
        if (lines.includes(cleanEmail)) {
            return { 
                statusCode: 200, 
                body: JSON.stringify({ message: "Already subscribed" }) 
            };
        }
        
        // Add new email
        const newContent = content + (content && !content.endsWith('\n') ? '\n' : '') + cleanEmail + "\n";
        const encodedContent = Buffer.from(newContent).toString("base64");

        // 3. Update (or Create) the file
        const putRes = await fetch(url, {
            method: "PUT",
            headers: { 
                Authorization: `token ${TOKEN}`, 
                Accept: "application/vnd.github.v3+json" 
            },
            body: JSON.stringify({
                message: `New subscriber: ${cleanEmail}`,
                content: encodedContent,
                sha: sha // Required if updating headers
            })
        });

        if (!putRes.ok) {
            const errText = await putRes.text();
            console.error(`GitHub API Error (Put): ${putRes.status} ${errText}`);
            throw new Error("Failed to update GitHub file");
        }

        return { 
            statusCode: 200, 
            body: JSON.stringify({ message: "Success" }) 
        };

    } catch (error) {
        console.error("Function Handler Error:", error);
        return { statusCode: 500, body: "Internal Server Error" };
    }
};
