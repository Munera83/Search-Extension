import { HfInferenceEndpoint } from './inference.js';

async function askAI(question, pageText, senderTabId) {
  const hf = new HfInferenceEndpoint('https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-8B-Instruct', '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');

  try {
    const stream = hf.textGenerationStream({ 
        inputs: `${pageText}\n\nQuestion: ${question}`, 
        parameters: { max_new_tokens: 500} 
    });

    for await (const r of stream) {
    console.log('Token received:', r.token.text);
    chrome.tabs.sendMessage(senderTabId, { action: 'partialResponse', text: r.token.text });
    }

    chrome.tabs.sendMessage(senderTabId, { action: 'streamEnd' });

  } catch (error) {
    console.error('Error asking AI:', error);
    chrome.tabs.sendMessage(senderTabId, { action: 'error', text: 'Error asking AI. Please try again later.' });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'askAI') {
    askAI(message.question, message.pageText, sender.tab.id);
    return true;
  }
});