const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const DEFAULT_SYSTEM_PROMPT = `You are NetVault's friendly AI assistant. NetVault is a SaaS platform for digital agencies to manage domains, hosting, clients, billing, uptime monitoring, and credential security.

Pricing Plans:
- Starter: Rs 999/month — 1 user, 50 domains
- Growth: Rs 2499/month — 5 users, 200 domains, client portal
- Agency Pro: Rs 5999/month — unlimited users and domains, white-label
- 14-day free trial, no credit card required

IMPORTANT: Always respond in English only. Be friendly, concise, and use emojis occasionally.`;

router.post('/', async (req, res) => {
    try {
        const { messages, systemPrompt } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ success: false, message: 'Messages array required' });
        }

        const response = await client.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            max_tokens: 1024,
            messages: [
                { role: 'system', content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
                ...messages.map(m => ({ role: m.role, content: m.content }))
            ],
        });

        const reply = response.choices?.[0]?.message?.content || 'Sorry, something went wrong. Please try again!';
        res.json({ success: true, reply });

    } catch (err) {
        console.error('Chat API error:', err.message);
        res.status(500).json({ success: false, reply: 'Server error. Please try again!' });
    }
});

module.exports = router;