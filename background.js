import { HfInferenceEndpoint } from './inference.js';

const conversations = {};
async function askAI(question, senderTabId) {
  const hf = new HfInferenceEndpoint('https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-8B-Instruct', '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');

  const { pageText, role, history } = conversations[senderTabId];
  history.push(`User: ${question}`);

  let combinedInputs = `Role: ${role}\n\nContext: ${pageText}\n\n`;
  if (history.length > 1) {
    const conversationHistory = history.join('\n');
    combinedInputs += `Conversation:\n${conversationHistory}\nSystem:`;
  } else {
    combinedInputs += `User: ${question}. \nSystem:`;
  }

  console.log("Inputs: ", combinedInputs);
  try {
    const stream = hf.textGenerationStream({
      inputs: combinedInputs,
      parameters: { max_new_tokens: 500 }
    });

    let response = '';
    for await (const r of stream) {
      response += r.token.text;
      chrome.tabs.sendMessage(senderTabId, { action: 'partialResponse', text: r.token.text });
    }
    history.push(`System: ${response}`);

    chrome.tabs.sendMessage(senderTabId, { action: 'streamEnd' });

  } catch (error) {
    console.error('Error asking AI:', error);
    chrome.tabs.sendMessage(senderTabId, { action: 'error', text: 'Error asking AI. Please try again later.' });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'askAI') {
    const senderTabId = sender.tab.id;

    if (!conversations[senderTabId]) {
      conversations[senderTabId] = {
        pageText: message.pageText,
        role: "You are a helpful AI assistant. Respond to the latest question only as a System, Don't simulate a User. Do not use the context if it is not needed.",
        history: []
      };
    }
    askAI(message.question, senderTabId);
    return true;
  }
});