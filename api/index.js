const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const openai = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1',
});

app.post('/api/chat', async (req, res) => {
    const { messages, reasoning = false } = req.body;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    try {
        const actualModel = reasoning ? 'deepseek-reasoner' : 'deepseek-chat';
        const stream = await openai.chat.completions.create({
            model: actualModel,
            messages: messages,
            stream: true,
        });

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;
            if (delta.reasoning_content) {
                res.write(`data: ${JSON.stringify({ type: 'reasoning', content: delta.reasoning_content })}\n\n`);
            }
            if (delta.content) {
                res.write(`data: ${JSON.stringify({ type: 'content', content: delta.content })}\n\n`);
            }
        }
        res.write('data: [DONE]\n\n');
        res.end();
    } catch (error) {
        res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
        res.end();
    }
});

module.exports = app;
